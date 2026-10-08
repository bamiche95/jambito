import { randomUUID } from "node:crypto";
import clientPromise from "@/lib/mongodb";

/**
 * Payments ledger.
 *
 * Every grant of access has to be traceable to a payment — whether it came in
 * through the Paystack webhook, a bank transfer the admin activated by hand, or
 * a reconciliation of a charge that succeeded at Paystack but never reached us.
 *
 * The unique `reference` index is what makes granting idempotent: the webhook
 * can be delivered more than once (Paystack retries), and an admin can paste a
 * reference that was already applied. Both must not grant twice.
 */

export const PAYMENT_SOURCES = ["paystack", "manual"];
export const PAYMENT_STATUSES = ["success", "pending", "failed"];

let indexesReady = null;

export async function getPaymentsCollection() {
  const client = await clientPromise;
  return client.db("jambito").collection("payments");
}

/**
 * Ensured once per server process, not only by `scripts/ensure-indexes.mjs`:
 * a deployment that never ran the script must still not double-grant. Failure
 * is logged and retried on the next call rather than breaking a payment.
 */
async function ensureIndexes() {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    const payments = await getPaymentsCollection();
    await payments.createIndex(
      { reference: 1 },
      { unique: true, name: "reference_unique" }
    );
    await payments.createIndex({ createdAt: -1 }, { name: "createdAt_desc" });
    await payments.createIndex({ uid: 1, createdAt: -1 }, { name: "uid_createdAt" });
  })().catch((error) => {
    console.error("[paymentsStore] could not ensure indexes:", error);
    indexesReady = null;
    return undefined;
  });
  return indexesReady;
}

/** Traceable reference for a payment we did not get from Paystack. */
export function newManualReference() {
  return `MANUAL-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export async function findPayment(reference) {
  if (!reference) return null;
  const payments = await getPaymentsCollection();
  return payments.findOne({ reference });
}

/** Escapes a user-supplied string before it is used inside a `$regex`. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Records a payment. Idempotent by `reference`: a second call returns the
 * existing row with `created: false` so the caller can treat a webhook replay
 * as a no-op and refuse a duplicate manual entry.
 */
export async function recordPayment({
  reference,
  uid,
  email = null,
  amountKobo = 0,
  plan = null,
  source = "paystack",
  status = "success",
  channel = null,
  note = null,
  bankReference = null,
  createdBy = null,
}) {
  await ensureIndexes();
  const payments = await getPaymentsCollection();
  const ref = reference || newManualReference();
  const now = new Date();

  const existing = await payments.findOne({ reference: ref });
  if (existing) return { payment: existing, created: false };

  const doc = {
    reference: ref,
    uid: uid ?? null,
    email: email ? String(email).toLowerCase().trim() : null,
    amountKobo: Number(amountKobo) || 0,
    plan,
    source: PAYMENT_SOURCES.includes(source) ? source : "manual",
    status: PAYMENT_STATUSES.includes(status) ? status : "pending",
    channel,
    note,
    bankReference,
    createdBy,
    granted: false,
    grantedDays: null,
    grantedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await payments.insertOne(doc);
    return { payment: doc, created: true };
  } catch (error) {
    // Duplicate key: a concurrent request inserted the same reference first.
    if (error?.code === 11000) {
      const raced = await payments.findOne({ reference: ref });
      if (raced) return { payment: raced, created: false };
    }
    throw error;
  }
}

/** Flags the ledger row as the one that produced the access window. */
export async function markPaymentGranted(reference, { grantedDays, grantedBy }) {
  const payments = await getPaymentsCollection();
  const now = new Date();
  await payments.updateOne(
    { reference },
    {
      $set: {
        granted: true,
        grantedDays: grantedDays ?? null,
        grantedAt: now,
        grantedBy: grantedBy ?? null,
        updatedAt: now,
      },
    }
  );
}

/** Applies arbitrary field updates to a ledger row (status, notes, ...). */
export async function updatePayment(reference, fields) {
  const payments = await getPaymentsCollection();
  await payments.updateOne(
    { reference },
    { $set: { ...fields, updatedAt: new Date() } }
  );
}

/** Links a ledger row to a user once that user is known (reconcile flow). */
export async function attachPaymentToUser(reference, { uid, email }) {
  const payments = await getPaymentsCollection();
  await payments.updateOne(
    { reference },
    {
      $set: {
        uid,
        email: email ? String(email).toLowerCase().trim() : null,
        updatedAt: new Date(),
      },
    }
  );
}

export async function listPayments({
  uid,
  email,
  reference,
  source,
  status,
  page,
  limit,
} = {}) {
  const payments = await getPaymentsCollection();
  const { page: p, limit: l, skip } = parsePaging({ page, limit });

  const query = {};
  if (uid) query.uid = uid;
  if (reference) query.reference = reference;
  if (source && PAYMENT_SOURCES.includes(source)) query.source = source;
  if (status && PAYMENT_STATUSES.includes(status)) query.status = status;
  if (email) query.email = { $regex: escapeRegex(String(email).trim()), $options: "i" };

  const [rows, total] = await Promise.all([
    payments.find(query).sort({ createdAt: -1 }).skip(skip).limit(l).toArray(),
    payments.countDocuments(query),
  ]);

  return {
    payments: rows,
    total,
    page: p,
    limit: l,
    hasMore: skip + rows.length < total,
  };
}

export async function listPaymentsForUser(uid, limit = 10) {
  if (!uid) return [];
  const payments = await getPaymentsCollection();
  return payments.find({ uid }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function getPaymentStats() {
  const payments = await getPaymentsCollection();
  const [total, granted, failed] = await Promise.all([
    payments.countDocuments({}),
    payments.countDocuments({ status: "success", granted: true }),
    payments.countDocuments({ status: "failed" }),
  ]);
  return { total, granted, failed };
}

/** Only the fields the dashboard is allowed to see. */
export function serializePayment(doc) {
  if (!doc) return null;
  return {
    id: doc._id ? String(doc._id) : null,
    reference: doc.reference,
    uid: doc.uid ?? null,
    email: doc.email ?? null,
    amountKobo: Number(doc.amountKobo) || 0,
    amountNaira: (Number(doc.amountKobo) || 0) / 100,
    plan: doc.plan ?? null,
    source: doc.source ?? null,
    status: doc.status ?? null,
    channel: doc.channel ?? null,
    note: doc.note ?? null,
    bankReference: doc.bankReference ?? null,
    createdBy: doc.createdBy ?? null,
    granted: Boolean(doc.granted),
    grantedDays: doc.grantedDays ?? null,
    grantedAt: toISO(doc.grantedAt),
    createdAt: toISO(doc.createdAt),
    updatedAt: toISO(doc.updatedAt),
  };
}

function toISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normalises `?page=` / `?limit=` query params for the admin dashboard. */
export function parsePaging({ page, limit, defaultLimit = 20, maxLimit = 100 } = {}) {
  const parsedPage = Math.max(1, Math.floor(Number(page)) || 1);
  const parsedLimit = Math.min(
    maxLimit,
    Math.max(1, Math.floor(Number(limit)) || defaultLimit)
  );
  return { page: parsedPage, limit: parsedLimit, skip: (parsedPage - 1) * parsedLimit };
}

import { getMongoClient } from "@/lib/mongodb";
import { TRIAL_LIMIT, PLAN_ID, planExpiryFrom } from "@/lib/plans";

/**
 * Server-side user / trial / subscription logic.
 *
 * Every user (guest or signed-in) is keyed by their Firebase `uid`. Trial usage
 * is a SINGLE global counter (`trialCount`) stored here in MongoDB — never in
 * the browser — so it can't be reset by clearing IndexedDB/localStorage or by
 * switching exam/subject/year.
 */

export async function getUsersCollection() {
  const client = await getMongoClient();
  return client.db("jambito").collection("users");
}

export async function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(email) {
  return email ? String(email).toLowerCase().trim() : null;
}

/** Ensures a user document exists and keeps the admin role in sync. */
export async function ensureUser(decoded) {
  const users = await getUsersCollection();
  const uid = decoded.uid;
  const email = normalizeEmail(decoded.email);
  const adminEmails = await getAdminEmails();
  const isAdmin = Boolean(email && adminEmails.includes(email));
  const now = new Date();

  const existing = await users.findOne({ _id: uid });
  if (!existing) {
    const doc = {
      _id: uid,
      uid,
      email,
      role: isAdmin ? "admin" : "user",
      status: "active",
      isSubscribed: false,
      trialCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(doc).catch(() => undefined);
    return doc;
  }

  // Soft-deleted accounts are tombstones: they must never be resurrected, and
  // re-applying the token's email here would silently restore the PII the
  // delete scrubbed.
  if (existing.status === "deleted") return existing;

  // One-time migration: legacy per-exam `trialUsage` -> global `trialCount`.
  if (existing.trialCount === undefined) {
    const usage = existing.trialUsage ?? {};
    const sum = Object.values(usage).reduce(
      (acc, n) => acc + (Number(n) || 0),
      0
    );
    await users.updateOne(
      { _id: uid },
      { $set: { trialCount: sum }, $unset: { trialUsage: "" } }
    );
    existing.trialCount = sum;
    delete existing.trialUsage;
  }

  const updates = {};
  if (email && existing.email !== email) updates.email = email;
  if (isAdmin && existing.role !== "admin") updates.role = "admin";
  if (Object.keys(updates).length) {
    await users.updateOne({ _id: uid }, { $set: updates });
    return { ...existing, ...updates };
  }
  return existing;
}

export async function getUserByUid(uid) {
  const users = await getUsersCollection();
  return users.findOne({ _id: uid });
}

export function isSubscribed(user) {
  if (!user?.isSubscribed) return false;
  if (!user.subscriptionExpiry) return true;
  const expiry = new Date(user.subscriptionExpiry).getTime();
  if (Number.isNaN(expiry)) return Boolean(user.isSubscribed);
  return expiry > Date.now();
}

/** Remaining free trial questions (global). */
export function getRemaining(user) {
  const used = user?.trialCount ?? 0;
  return Math.max(0, TRIAL_LIMIT - used);
}

/**
 * Atomically consumes one global trial question. Uses a conditional
 * `findOneAndUpdate` so concurrent answers can't exceed the limit.
 */
export async function consumeTrial({ uid, email }) {
  const users = await getUsersCollection();
  const user = await ensureUser({ uid, email });

  if (isSubscribed(user)) {
    return {
      allowed: true,
      subscribed: true,
      used: user?.trialCount ?? 0,
      remaining: null,
    };
  }

  const result = await users.findOneAndUpdate(
    { _id: uid, trialCount: { $lt: TRIAL_LIMIT } },
    { $inc: { trialCount: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) {
    const fresh = await users.findOne({ _id: uid });
    const used = fresh?.trialCount ?? TRIAL_LIMIT;
    return { allowed: false, subscribed: false, used, remaining: 0 };
  }

  const used = result.trialCount ?? 0;
  if (used >= TRIAL_LIMIT) {
    // Recorded once, so the "free questions finished" email can wait a day
    // instead of firing the moment the 40th answer is submitted. A conditional
    // update keeps a concurrent answer from moving the original timestamp.
    await users
      .updateOne(
        { _id: uid, trialExhaustedAt: { $exists: false } },
        { $set: { trialExhaustedAt: new Date() } }
      )
      .catch((error) =>
        console.error("could not record trialExhaustedAt:", error?.message ?? error)
      );
  }
  return {
    allowed: true,
    subscribed: false,
    used,
    remaining: Math.max(0, TRIAL_LIMIT - used),
  };
}

/**
 * Grants access, STACKING any unexpired time instead of discarding it.
 *
 * The window is calendar-based: a payment on 12 March 2026 runs to 12 March
 * 2027 (see `planExpiryFrom`), because that is what "12 months" means to the
 * person paying. Stacking still matters here even though the app no longer
 * offers an early renewal: a Paystack charge can settle after a delay, and an
 * admin reconciling an old payment must not wipe the window the student is
 * currently on. The webhook additionally skips references already recorded in
 * the payments ledger, which makes a replay a no-op.
 *
 * Returns the resulting window so callers (webhook, admin dashboard) can show
 * exactly what was granted.
 */
export async function upsertSubscription({
  uid,
  email,
  plan,
  reference,
  amount,
  days,
  channel,
}) {
  const users = await getUsersCollection();
  const now = new Date();
  const existing = await users.findOne({ _id: uid });
  const currentExpiry = existing?.subscriptionExpiry
    ? new Date(existing.subscriptionExpiry).getTime()
    : 0;
  const stacked = Number.isFinite(currentExpiry) && currentExpiry > now.getTime();
  const base = stacked ? currentExpiry : now.getTime();
  const { expiry, durationDays } = planExpiryFrom({ base, planId: plan, days });

  await users.updateOne(
    { _id: uid },
    {
      $set: {
        uid,
        email: normalizeEmail(email) ?? existing?.email ?? null,
        isSubscribed: true,
        subscriptionExpiry: expiry,
        plan: plan ?? existing?.plan ?? PLAN_ID,
        ...(reference ? { reference } : {}),
        ...(channel ? { channel } : {}),
        amount: amount ?? 0,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: uid,
        role: "user",
        status: "active",
        trialCount: 0,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return {
    expiry,
    durationDays,
    stackedFrom: stacked ? new Date(base) : null,
  };
}

export async function getSubscription(uid) {
  const users = await getUsersCollection();
  return users.findOne({ _id: uid });
}

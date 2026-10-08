import {
  getAdminEmails,
  getUsersCollection,
  isSubscribed,
} from "@/lib/users";
import { ACCOUNT_STATUSES, getAccountStatus } from "@/lib/accountStatus";
import { TRIAL_LIMIT, PLAN_ID, planById, planExpiryFrom } from "@/lib/plans";
import { escapeRegex, parsePaging } from "@/lib/paymentsStore";
import {
  setFirebaseUserDisabled,
} from "@/lib/firebaseAdmin";
import clientPromise from "@/lib/mongodb";

/**
 * Admin-side user management: listing, status changes, role changes, trial
 * resets, subscription grants/revocations, soft delete, plus the audit trail
 * that every one of those actions writes.
 *
 * All mutations funnel through this module so the dashboard, the admin API and
 * the audit log can never drift apart.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export async function getAuditCollection() {
  const client = await clientPromise;
  return client.db("jambito").collection("adminAudit");
}

/** True for a value the dashboard may hand back as a `status`. */
export function isValidStatus(value) {
  return ACCOUNT_STATUSES.includes(value);
}

/** Only the fields the dashboard/audit log are allowed to see. */
export function serializeUser(doc) {
  if (!doc) return null;
  const expiry = doc.subscriptionExpiry
    ? new Date(doc.subscriptionExpiry)
    : null;
  return {
    uid: doc._id ?? doc.uid ?? null,
    email: doc.email ?? null,
    role: doc.role === "admin" ? "admin" : "user",
    status: getAccountStatus(doc),
    isSubscribed: isSubscribed(doc),
    subscriptionExpiry:
      expiry && !Number.isNaN(expiry.getTime()) ? expiry.toISOString() : null,
    plan: doc.plan ?? null,
    trialCount: Number(doc.trialCount) || 0,
    trialRemaining: Math.max(0, TRIAL_LIMIT - (Number(doc.trialCount) || 0)),
    reference: doc.reference ?? null,
    amount: Number(doc.amount) || 0,
    createdAt: toISO(doc.createdAt),
    updatedAt: toISO(doc.updatedAt),
  };
}

function toISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The subset of a user document recorded in the audit trail. */
function auditSnapshot(user) {
  if (!user) return null;
  return {
    status: getAccountStatus(user),
    role: user.role === "admin" ? "admin" : "user",
    isSubscribed: isSubscribed(user),
    subscriptionExpiry: toISO(user.subscriptionExpiry),
    plan: user.plan ?? null,
    trialCount: Number(user.trialCount) || 0,
  };
}

/**
 * Append-only record of every admin mutation. Written after the change lands,
 * so a failed action never leaves an audit entry claiming success.
 */
export async function writeAudit({
  actor,
  action,
  targetUid = null,
  targetEmail = null,
  before = null,
  after = null,
  details = null,
  firebase = null,
}) {
  try {
    const audits = await getAuditCollection();
    const doc = {
      actorUid: actor?.uid ?? null,
      actorEmail: actor?.email ?? null,
      action,
      targetUid,
      targetEmail,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      details: details ?? null,
      firebase: firebase ?? null,
      createdAt: new Date(),
    };
    await audits.insertOne(doc);
    return doc;
  } catch (error) {
    // The mutation already succeeded; losing the trail must not fail the call.
    console.error("[adminUsers] could not write audit entry:", error);
    return null;
  }
}

export async function listAudit({ targetUid, action, page, limit } = {}) {
  const audits = await getAuditCollection();
  const { page: p, limit: l, skip } = parsePaging({ page, limit, defaultLimit: 30 });

  const query = {};
  if (targetUid) query.targetUid = targetUid;
  if (action) query.action = action;

  const [entries, total] = await Promise.all([
    audits.find(query).sort({ createdAt: -1 }).skip(skip).limit(l).toArray(),
    audits.countDocuments(query),
  ]);

  return {
    entries: entries.map((entry) => ({
      id: String(entry._id),
      actorUid: entry.actorUid ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetUid: entry.targetUid ?? null,
      targetEmail: entry.targetEmail ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      details: entry.details ?? null,
      firebase: entry.firebase ?? null,
      createdAt: toISO(entry.createdAt),
    })),
    total,
    page: p,
    limit: l,
    hasMore: skip + entries.length < total,
  };
}

/**
 * Paginated user search for the dashboard.
 *
 * `search` matches uid or email (substring, case-insensitive); `status` filters
 * on the account state, with `all` meaning "no filter".
 */
export async function listUsers({ search, status, page, limit } = {}) {
  const users = await getUsersCollection();
  const { page: p, limit: l, skip } = parsePaging({
    page,
    limit,
    defaultLimit: DEFAULT_PAGE_SIZE,
    maxLimit: MAX_PAGE_SIZE,
  });

  const query = {};
  if (status && status !== "all") {
    if (!isValidStatus(status)) {
      throw new Error(`Invalid status filter: ${status}`);
    }
    query.status = status;
  }
  const term = String(search ?? "").trim();
  if (term) {
    const regex = { $regex: escapeRegex(term), $options: "i" };
    query.$or = [{ _id: regex }, { uid: regex }, { email: regex }];
  }

  const [rows, total] = await Promise.all([
    users.find(query).sort({ createdAt: -1 }).skip(skip).limit(l).toArray(),
    users.countDocuments(query),
  ]);

  return {
    users: rows.map(serializeUser),
    total,
    page: p,
    limit: l,
    hasMore: skip + rows.length < total,
  };
}

export async function getUserStats() {
  const users = await getUsersCollection();
  // Documents written before the status field existed have no `status` key at
  // all. In MongoDB `{ status: null }` matches both null and missing, so those
  // legacy accounts count as active — exactly how the API gate treats them.
  const activeQuery = { $or: [{ status: "active" }, { status: null }] };
  const [total, active, deactivated, blocked, deleted, admins, subscribed, trialExhausted] =
    await Promise.all([
      users.countDocuments({}),
      users.countDocuments(activeQuery),
      users.countDocuments({ status: "deactivated" }),
      users.countDocuments({ status: "blocked" }),
      users.countDocuments({ status: "deleted" }),
      users.countDocuments({ role: "admin" }),
      users.countDocuments({
        isSubscribed: true,
        subscriptionExpiry: { $gt: new Date() },
      }),
      users.countDocuments({ trialCount: { $gte: TRIAL_LIMIT } }),
    ]);

  return {
    total,
    active,
    deactivated,
    blocked,
    deleted,
    admins,
    subscribed,
    trialExhausted,
  };
}

export async function getAdminUser(uid) {
  if (!uid) return null;
  const users = await getUsersCollection();
  return users.findOne({ _id: uid });
}

/**
 * Moves an account between lifecycle states.
 *
 * `deactivated` deliberately does NOT touch the Firebase account: the user must
 * still be able to sign in, read the banner and pay their way back in.
 * `blocked` does — best effort, see lib/firebaseAdmin.ts — and every other
 * state re-enables it.
 */
export async function setUserStatus(uid, nextStatus, actor, note = null) {
  if (!isValidStatus(nextStatus)) {
    return { ok: false, code: "invalid_status", message: `Unknown status: ${nextStatus}` };
  }
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }

  const previous = getAccountStatus(before);
  const now = new Date();
  const $set = {
    status: nextStatus,
    statusChangedAt: now,
    statusChangedBy: actor?.email ?? actor?.uid ?? null,
    updatedAt: now,
  };
  if (note) $set.statusNote = String(note);
  await users.updateOne({ _id: uid }, { $set });

  // Firebase sign-in state: disabled while blocked, re-enabled otherwise.
  const shouldDisable = nextStatus === "blocked";
  const firebase =
    nextStatus === "deleted"
      ? null
      : await setFirebaseUserDisabled(uid, shouldDisable);

  const after = await users.findOne({ _id: uid });
  return { ok: true, before, after, previous, firebase, unchanged: previous === nextStatus };
}

/**
 * Soft delete.
 *
 * The Mongo document becomes a tombstone (`status: "deleted"`, PII scrubbed)
 * and stays behind so `ensureUser()` cannot recreate the account and hand out a
 * fresh 40-question trial if a stale token reappears. The Firebase account is
 * disabled rather than deleted for the same reason: deleting it would free the
 * email to register again as a brand-new uid.
 */
export async function softDeleteUser(uid, actor) {
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }
  if (getAccountStatus(before) === "deleted") {
    return { ok: true, before, after: before, unchanged: true, firebase: null };
  }

  const now = new Date();
  await users.updateOne(
    { _id: uid },
    {
      $set: {
        status: "deleted",
        statusChangedAt: now,
        statusChangedBy: actor?.email ?? actor?.uid ?? null,
        isSubscribed: false,
        subscriptionExpiry: null,
        deletedAt: now,
        updatedAt: now,
      },
      // PII scrub: keep the tombstones only what is needed to block the account.
      $unset: { email: "", reference: "", amount: "", statusNote: "" },
    }
  );

  const firebase = await setFirebaseUserDisabled(uid, true);
  const after = await users.findOne({ _id: uid });
  return { ok: true, before, after, firebase };
}

/**
 * Changes the dashboard role.
 *
 * Refuses to demote an address listed in `ADMIN_EMAILS`: `ensureUser()`
 * re-promotes those on the next request, so the change would look successful
 * and then silently undo itself.
 */
export async function setUserRole(uid, role, actor) {
  const nextRole = role === "admin" ? "admin" : "user";
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }

  if (nextRole === "user") {
    const adminEmails = await getAdminEmails();
    const email = before.email ? String(before.email).toLowerCase().trim() : null;
    if (email && adminEmails.includes(email)) {
      return {
        ok: false,
        code: "managed_by_env",
        message: `${email} is listed in ADMIN_EMAILS and is re-promoted on every request — remove it from the env var first.`,
      };
    }
  }

  const now = new Date();
  await users.updateOne(
    { _id: uid },
    {
      $set: {
        role: nextRole,
        updatedAt: now,
        updatedBy: actor?.email ?? actor?.uid ?? null,
      },
    }
  );
  const after = await users.findOne({ _id: uid });
  return { ok: true, before, after, previous: before.role ?? "user" };
}

/** Puts the account back on the full free trial. */
export async function resetUserTrial(uid, actor) {
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }
  await users.updateOne(
    { _id: uid },
    {
      $set: {
        trialCount: 0,
        updatedAt: new Date(),
        updatedBy: actor?.email ?? actor?.uid ?? null,
      },
    }
  );
  const after = await users.findOne({ _id: uid });
  return { ok: true, before, after };
}

/**
 * Grants access by hand — the bank-transfer path.
 *
 * The window is always calendar-based (`planExpiryFrom`), so the blanket "12
 * months" the student was promised is what they get. `days` is an explicit
 * override for corrections. `mode: "extend"` (default) stacks on top of an
 * unexpired window, matching how a Paystack payment is applied; `mode: "set"`
 * rebuilds the window from now.
 */
export async function grantSubscription({
  uid,
  plan,
  days,
  mode = "extend",
  reference = null,
  channel = null,
}) {
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }

  const chosenPlan =
    planById(plan)?.id ?? (planById(before.plan)?.id ?? PLAN_ID);

  const now = new Date();
  const currentExpiry = before.subscriptionExpiry
    ? new Date(before.subscriptionExpiry).getTime()
    : 0;
  const canStack =
    mode !== "set" && Number.isFinite(currentExpiry) && currentExpiry > now.getTime();
  const base = canStack ? currentExpiry : now.getTime();
  const { expiry, durationDays } = planExpiryFrom({
    base,
    planId: chosenPlan,
    days,
  });

  const $set = {
    isSubscribed: true,
    subscriptionExpiry: expiry,
    plan: chosenPlan,
    updatedAt: now,
  };
  if (reference) $set.reference = reference;
  if (channel) $set.channel = channel;
  await users.updateOne({ _id: uid }, { $set });

  const after = await users.findOne({ _id: uid });
  return {
    ok: true,
    before,
    after,
    granted: {
      plan: chosenPlan,
      durationDays,
      mode: canStack ? "extend" : "set",
      expiry,
      stackedFrom: canStack ? new Date(base) : null,
    },
  };
}

/** Ends a subscription now. The account itself stays active. */
export async function revokeSubscription(uid, actor) {
  const users = await getUsersCollection();
  const before = await users.findOne({ _id: uid });
  if (!before) {
    return { ok: false, code: "not_found", message: "User not found." };
  }
  await users.updateOne(
    { _id: uid },
    {
      $set: {
        isSubscribed: false,
        subscriptionExpiry: null,
        updatedAt: new Date(),
        updatedBy: actor?.email ?? actor?.uid ?? null,
      },
    }
  );
  const after = await users.findOne({ _id: uid });
  return { ok: true, before, after };
}

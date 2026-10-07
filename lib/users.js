import clientPromise from "@/lib/mongodb";
import { TRIAL_LIMIT, planDurationDays } from "@/lib/plans";

/**
 * Server-side user / trial / subscription logic.
 *
 * Every user (guest or signed-in) is keyed by their Firebase `uid`. Trial usage
 * is a SINGLE global counter (`trialCount`) stored here in MongoDB — never in
 * the browser — so it can't be reset by clearing IndexedDB/localStorage or by
 * switching exam/subject/year.
 */

export async function getUsersCollection() {
  const client = await clientPromise;
  return client.db("jambito").collection("users");
}

async function getAdminEmails() {
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
      isSubscribed: false,
      trialCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(doc).catch(() => undefined);
    return doc;
  }

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
  return {
    allowed: true,
    subscribed: false,
    used,
    remaining: Math.max(0, TRIAL_LIMIT - used),
  };
}

export async function upsertSubscription({
  uid,
  email,
  plan,
  reference,
  amount,
}) {
  const users = await getUsersCollection();
  const now = new Date();
  const durationDays = planDurationDays(plan);
  const expiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return users.updateOne(
    { _id: uid },
    {
      $set: {
        uid,
        email: normalizeEmail(email) ?? email,
        isSubscribed: true,
        subscriptionExpiry: expiry,
        plan,
        reference,
        amount: amount ?? 0,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: uid,
        role: "user",
        trialCount: 0,
        createdAt: now,
      },
    },
    { upsert: true }
  );
}

export async function getSubscription(uid) {
  const users = await getUsersCollection();
  return users.findOne({ _id: uid });
}

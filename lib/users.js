import clientPromise from "@/lib/mongodb";
import { TRIAL_LIMIT_PER_EXAM, planDurationDays } from "@/lib/plans";
import { EXAMS } from "@/lib/catalog";

/**
 * Server-side user / trial / subscription logic.
 *
 * Every user (anonymous guest or signed-in) is keyed by their Firebase `uid`.
 * Trial usage is stored here in MongoDB — never in the browser — so clearing
 * IndexedDB/localStorage does not reset the quota.
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
      trialUsage: {},
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(doc).catch(() => undefined);
    return doc;
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

/** Remaining free trial questions per exam (40 per exam by default). */
export function getRemaining(user) {
  const usage = user?.trialUsage ?? {};
  const remaining = {};
  for (const exam of EXAMS) {
    remaining[exam] = Math.max(0, TRIAL_LIMIT_PER_EXAM - (usage[exam] ?? 0));
  }
  return remaining;
}

export async function consumeTrial({ uid, email, exam }) {
  const users = await getUsersCollection();
  const key = String(exam).toUpperCase();
  const user = await ensureUser({ uid, email });

  if (isSubscribed(user)) {
    return {
      allowed: true,
      subscribed: true,
      used: user?.trialUsage?.[key] ?? 0,
      remaining: null,
    };
  }

  const used = user?.trialUsage?.[key] ?? 0;
  if (used >= TRIAL_LIMIT_PER_EXAM) {
    return { allowed: false, subscribed: false, used, remaining: 0 };
  }

  const next = used + 1;
  await users.updateOne(
    { _id: uid },
    { $set: { [`trialUsage.${key}`]: next, updatedAt: new Date() } }
  );

  return {
    allowed: true,
    subscribed: false,
    used: next,
    remaining: Math.max(0, TRIAL_LIMIT_PER_EXAM - next),
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
        trialUsage: {},
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

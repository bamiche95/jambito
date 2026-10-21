import clientPromise from "@/lib/mongodb";
import { EMAIL_CAMPAIGN_IDS } from "@/lib/emailCampaigns";

/**
 * MongoDB persistence for the automated email campaigns.
 *
 *   settings        `_id: "emailSettings"` — the global pause switch, the daily
 *                   cap, and the summary of the last run (shown in the admin
 *                   panel and by the cron response).
 *   emailCampaigns  `_id: <campaignId>` — the admin's copy overrides. A missing
 *                   document means "use the defaults in lib/emailCampaigns.js",
 *                   so deleting a row is the rollback path.
 *   emailLog        one document per message, with a UNIQUE index on
 *                   `{ campaignId, dedupeKey }`. Inserting the claim before
 *                   sending is what makes a run idempotent.
 *
 * Nothing here reads or writes an answer map: `users.practice` is the only
 * practice data the engine touches.
 */

const DB_NAME = "jambito";
const SETTINGS_COLLECTION = "settings";
const SETTINGS_ID = "emailSettings";
const CAMPAIGNS_COLLECTION = "emailCampaigns";
const LOG_COLLECTION = "emailLog";

export const EMAIL_DEFAULT_DAILY_CAP = 200;
export const EMAIL_MAX_DAILY_CAP = 1000;
const STALE_CLAIM_MS = 30 * 60 * 1000;
const MAX_SEND_ATTEMPTS = 3;

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getEmailCampaignsCollection() {
  return (await getDb()).collection(CAMPAIGNS_COLLECTION);
}

export async function getEmailLogCollection() {
  return (await getDb()).collection(LOG_COLLECTION);
}

/** The same `settings` collection the pricing override uses, different `_id`. */
export async function getEmailSettingsCollection() {
  return (await getDb()).collection(SETTINGS_COLLECTION);
}

let indexPromise = null;

/**
 * Creates the indexes the engine and `scripts/ensure-indexes.mjs` rely on.
 * Runs once per process; failures are logged rather than thrown, because a
 * missing (non-unique) index must not stop a campaign from being previewed.
 */
export async function ensureEmailIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [log, settings, campaigns] = await Promise.all([
        getEmailLogCollection(),
        getEmailSettingsCollection(),
        getEmailCampaignsCollection(),
      ]);
      await Promise.allSettled([
        log.createIndex(
          { campaignId: 1, dedupeKey: 1 },
          { name: "campaign_dedupe_unique", unique: true }
        ),
        log.createIndex({ campaignId: 1, sentAt: -1 }, { name: "campaign_sentAt" }),
        log.createIndex({ sentAt: -1 }, { name: "sentAt_desc" }),
        log.createIndex({ uid: 1, sentAt: -1 }, { name: "uid_sentAt" }),
        settings.createIndex({ updatedAt: -1 }, { name: "updatedAt_desc" }),
        campaigns.createIndex({ updatedAt: -1 }, { name: "updatedAt_desc" }),
      ]);
    })().catch((error) => {
      console.error("[emailStore] could not create indexes:", error);
    });
  }
  return indexPromise;
}

function clampCap(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return EMAIL_DEFAULT_DAILY_CAP;
  return Math.min(
    Math.max(Math.round(number), 1),
    EMAIL_MAX_DAILY_CAP
  );
}

/** Global settings, with defaults applied. */
export async function getEmailSettings() {
  let doc = null;
  try {
    const settings = await getEmailSettingsCollection();
    doc = await settings.findOne({ _id: SETTINGS_ID });
  } catch (error) {
    console.error("[emailStore] could not read email settings:", error);
  }
  return {
    paused: doc?.paused === true,
    dailyCap: clampCap(doc?.dailyCap),
    lastRunAt: doc?.lastRunAt ?? null,
    lastRunSummary: doc?.lastRunSummary ?? null,
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
}

export async function saveEmailSettings({ paused, dailyCap, actor = null } = {}) {
  const settings = await getEmailSettingsCollection();
  const $set = { updatedAt: new Date(), updatedBy: actor };
  if (typeof paused === "boolean") $set.paused = paused;
  if (dailyCap !== undefined) $set.dailyCap = clampCap(dailyCap);
  await settings.updateOne({ _id: SETTINGS_ID }, { $set }, { upsert: true });
  return getEmailSettings();
}

/** Stores the outcome of a run so the dashboard can show what happened. */
export async function recordEmailRun(summary) {
  try {
    const settings = await getEmailSettingsCollection();
    await settings.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          lastRunAt: new Date(),
          lastRunSummary: summary,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error("[emailStore] could not record the run summary:", error);
  }
}

/** Stored overrides, keyed by campaign id. */
export async function getEmailCampaignDocs() {
  const campaigns = await getEmailCampaignsCollection();
  const docs = await campaigns.find({}).toArray();
  return new Map(docs.map((doc) => [doc._id, doc]));
}

export async function saveEmailCampaignDoc(id, content, actor = null) {
  if (!EMAIL_CAMPAIGN_IDS.includes(id)) {
    return { ok: false, message: "Unknown campaign." };
  }
  const campaigns = await getEmailCampaignsCollection();
  const now = new Date();
  await campaigns.updateOne(
    { _id: id },
    {
      $set: {
        ...content,
        updatedAt: now,
        updatedBy: actor
          ? { uid: actor.uid ?? null, email: actor.email ?? null }
          : null,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return { ok: true, doc: await campaigns.findOne({ _id: id }) };
}

/**
 * Claims the right to send one message.
 *
 * The insert is the lock: the unique `{campaignId, dedupeKey}` index means only
 * one caller (cron, admin "run now", a retry) can win. A send that failed is
 * retried at most twice more; a claim left behind by a crashed run is treated
 * as abandoned after 30 minutes.
 */
export async function claimEmailSend({
  campaignId,
  dedupeKey,
  uid,
  email,
  now = new Date(),
}) {
  if (!EMAIL_CAMPAIGN_IDS.includes(campaignId) || !dedupeKey || !uid || !email) {
    return { ok: false, reason: "invalid_claim" };
  }

  await ensureEmailIndexes();
  const log = await getEmailLogCollection();

  try {
    const result = await log.insertOne({
      campaignId,
      dedupeKey,
      uid,
      email,
      status: "sending",
      attempts: 1,
      claimedAt: now,
      createdAt: now,
    });
    return { ok: true, id: result.insertedId };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const stale = new Date(now.getTime() - STALE_CLAIM_MS);
  const retried = await log.findOneAndUpdate(
    {
      campaignId,
      dedupeKey,
      $or: [
        { status: "failed", attempts: { $lt: MAX_SEND_ATTEMPTS } },
        { status: "sending", claimedAt: { $lt: stale } },
      ],
    },
    {
      $set: { status: "sending", claimedAt: now, email },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after" }
  );

  if (!retried) return { ok: false, reason: "already_sent" };
  return { ok: true, id: retried._id };
}

export async function markEmailSent({
  id,
  userId,
  campaignId,
  dedupeKey,
  messageId = null,
  now = new Date(),
}) {
  const log = await getEmailLogCollection();
  await log.updateOne(
    { _id: id },
    { $set: { status: "sent", sentAt: now, messageId, error: null } }
  );

  // Denormalised on the user so the next run's audience query can exclude this
  // campaign without scanning the log. The unique claim stays authoritative.
  const users = (await getDb()).collection("users");
  const $set = { emailLastSentAt: now };
  if (EMAIL_CAMPAIGN_IDS.includes(campaignId)) {
    $set[`emailState.${campaignId}`] = { key: dedupeKey, at: now };
  }
  await users.updateOne({ _id: userId }, { $set });
}

export async function markEmailFailed({ id, error, now = new Date() }) {
  const message = String(error?.message ?? error ?? "unknown").slice(0, 500);
  const log = await getEmailLogCollection();
  await log.updateOne(
    { _id: id },
    { $set: { status: "failed", failedAt: now, error: message } }
  );
}

/** Sent / failed / in-flight counts for every campaign, in one aggregation. */
export async function getEmailCampaignStats() {
  const log = await getEmailLogCollection();
  const rows = await log
    .aggregate([
      {
        $group: {
          _id: { campaignId: "$campaignId", status: "$status" },
          count: { $sum: 1 },
          last: { $max: "$sentAt" },
        },
      },
    ])
    .toArray();

  const stats = new Map();
  for (const row of rows) {
    const id = row._id.campaignId;
    const current = stats.get(id) ?? {
      sent: 0,
      failed: 0,
      sending: 0,
      lastSentAt: null,
    };
    if (row._id.status === "sent") current.sent += row.count;
    else if (row._id.status === "failed") current.failed += row.count;
    else current.sending += row.count;
    if (row.last && (!current.lastSentAt || row.last > current.lastSentAt)) {
      current.lastSentAt = row.last;
    }
    stats.set(id, current);
  }
  return stats;
}

export async function listRecentEmailSends(limit = 25) {
  const log = await getEmailLogCollection();
  const rows = await log
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 25, 1), 100))
    .project({
      campaignId: 1,
      email: 1,
      status: 1,
      sentAt: 1,
      createdAt: 1,
      error: 1,
    })
    .toArray();

  return rows.map((row) => ({
    id: String(row._id),
    campaignId: row.campaignId,
    email: row.email,
    status: row.status,
    sentAt: row.sentAt ?? null,
    createdAt: row.createdAt ?? null,
    error: row.error ?? null,
  }));
}

/** Messages actually delivered since a point in time — the daily cap counter. */
export async function countSentSince(date) {
  const log = await getEmailLogCollection();
  return log.countDocuments({ status: "sent", sentAt: { $gte: date } });
}

export async function countUnsubscribedUsers() {
  const users = (await getDb()).collection("users");
  return users.countDocuments({ emailUnsubscribedAt: { $exists: true } });
}

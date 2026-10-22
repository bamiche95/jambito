import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getAccountStatus } from "@/lib/accountStatus";
import { EMAIL_CAMPAIGN_IDS } from "@/lib/emailCampaigns";
import { escapeRegex, parsePaging } from "@/lib/paymentsStore";
import { isSubscribed } from "@/lib/users";

/**
 * MongoDB persistence for the automated email campaigns and one-off broadcasts.
 *
 *   settings         `_id: "emailSettings"` — the global pause switch, the daily
 *                    cap, and the summary of the last run (shown in the admin
 *                    panel and by the cron response).
 *   emailCampaigns   `_id: <campaignId>` — the admin's copy overrides. A missing
 *                    document means "use the defaults in lib/emailCampaigns.js",
 *                    so deleting a row is the rollback path.
 *   emailLog         one document per message, with a UNIQUE index on
 *                    `{ campaignId, dedupeKey }`. Inserting the claim before
 *                    sending is what makes a run idempotent. Broadcasts share
 *                    the collection under the id `broadcast:<broadcastId>`, so a
 *                    retry can never mail the same person twice.
 *   emailTemplates   the admin's saved, reusable broadcast copy (capped).
 *   emailBroadcasts  one document per one-off send, with a per-recipient
 *                    delivery state so a long list can continue in a later batch.
 *
 * Nothing here reads or writes an answer map: `users.practice` is the only
 * practice data the engine touches.
 */

const DB_NAME = "jambito";
const SETTINGS_COLLECTION = "settings";
const SETTINGS_ID = "emailSettings";
const CAMPAIGNS_COLLECTION = "emailCampaigns";
const LOG_COLLECTION = "emailLog";
const TEMPLATES_COLLECTION = "emailTemplates";
const BROADCASTS_COLLECTION = "emailBroadcasts";

export const EMAIL_DEFAULT_DAILY_CAP = 200;
export const EMAIL_MAX_DAILY_CAP = 1000;
/** How many saved templates the dashboard keeps; the API refuses number 51. */
export const EMAIL_TEMPLATE_LIMIT = 50;
/** One broadcast batch never aims at more than this many inboxes. */
export const EMAIL_BROADCAST_MAX_RECIPIENTS = 100;
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

export async function getEmailTemplatesCollection() {
  return (await getDb()).collection(TEMPLATES_COLLECTION);
}

export async function getEmailBroadcastsCollection() {
  return (await getDb()).collection(BROADCASTS_COLLECTION);
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
      const [log, settings, campaigns, templates, broadcasts] = await Promise.all([
        getEmailLogCollection(),
        getEmailSettingsCollection(),
        getEmailCampaignsCollection(),
        getEmailTemplatesCollection(),
        getEmailBroadcastsCollection(),
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
        templates.createIndex({ updatedAt: -1 }, { name: "updatedAt_desc" }),
        broadcasts.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
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
 * `campaignId` is either an automated campaign (`EMAIL_CAMPAIGN_IDS`) or a
 * one-off broadcast (`broadcast:<broadcastId>`), which is why only the shape is
 * checked here — `markEmailSent` is the place that knows campaign ids.
 */
export async function claimEmailSend({
  campaignId,
  dedupeKey,
  uid,
  email,
  now = new Date(),
}) {
  if (!campaignId || !dedupeKey || !uid || !email) {
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

// ---------------------------------------------------------------------------
// Saved templates
// ---------------------------------------------------------------------------

/** Mongo ids travel as strings through the API; anything else is a bad id. */
function toObjectId(value) {
  const id = String(value ?? "");
  return id.length === 24 && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** The only columns a broadcast or a template carries. */
function templateFields(content) {
  return {
    subject: String(content?.subject ?? ""),
    heading: String(content?.heading ?? ""),
    body: String(content?.body ?? ""),
    ctaLabel: String(content?.ctaLabel ?? ""),
    ctaPath: String(content?.ctaPath ?? ""),
  };
}

function actorFields(actor) {
  return actor ? { uid: actor.uid ?? null, email: actor.email ?? null } : null;
}

function serializeTemplate(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name ?? "",
    subject: doc.subject ?? "",
    heading: doc.heading ?? "",
    body: doc.body ?? "",
    ctaLabel: doc.ctaLabel ?? "",
    ctaPath: doc.ctaPath ?? "",
    updatedAt: doc.updatedAt ?? null,
    updatedBy: doc.updatedBy ?? null,
  };
}

/** Newest first, capped at the same ceiling the save path enforces. */
export async function listEmailTemplates() {
  try {
    const templates = await getEmailTemplatesCollection();
    const rows = await templates
      .find({})
      .sort({ updatedAt: -1 })
      .limit(EMAIL_TEMPLATE_LIMIT)
      .toArray();
    return rows.map(serializeTemplate);
  } catch (error) {
    console.error("[emailStore] could not list templates:", error);
    return [];
  }
}

/**
 * Creates or updates a template. Copy is validated by
 * `validateCampaignContent` before it gets here; a template can never be saved
 * without a name.
 */
export async function saveEmailTemplate({
  id = null,
  name,
  content,
  actor = null,
  now = new Date(),
}) {
  const templates = await getEmailTemplatesCollection();
  const $set = {
    name,
    ...templateFields(content),
    updatedAt: now,
    updatedBy: actorFields(actor),
  };

  if (id) {
    const _id = toObjectId(id);
    if (!_id) {
      return { ok: false, code: "unknown_template", message: "Unknown template." };
    }
    const result = await templates.updateOne({ _id }, { $set });
    if (!result.matchedCount) {
      return {
        ok: false,
        code: "unknown_template",
        message: "That template no longer exists.",
      };
    }
    return { ok: true, template: serializeTemplate(await templates.findOne({ _id })) };
  }

  const count = await templates.countDocuments({});
  if (count >= EMAIL_TEMPLATE_LIMIT) {
    return {
      ok: false,
      code: "template_limit",
      message: `You already have ${EMAIL_TEMPLATE_LIMIT} templates. Delete one before saving another.`,
    };
  }

  const doc = { ...$set, createdAt: now };
  const result = await templates.insertOne(doc);
  return { ok: true, template: serializeTemplate({ _id: result.insertedId, ...doc }) };
}

export async function deleteEmailTemplate(id) {
  const _id = toObjectId(id);
  if (!_id) {
    return { ok: false, code: "unknown_template", message: "Unknown template." };
  }

  const templates = await getEmailTemplatesCollection();
  const doc = await templates.findOne({ _id }, { projection: { name: 1 } });
  if (!doc) {
    return {
      ok: false,
      code: "unknown_template",
      message: "That template no longer exists.",
    };
  }
  await templates.deleteOne({ _id });
  return { ok: true, name: doc.name ?? "Template" };
}

// ---------------------------------------------------------------------------
// Broadcasts (one-off sends to hand-picked accounts)
// ---------------------------------------------------------------------------

/**
 * Per-recipient state:
 *   pending  will be attempted by the next batch
 *   sent     delivered (the emailLog claim is what guarantees "once")
 *   failed   the SMTP call failed; "Send remaining" retries it
 *   skipped  never attempted on purpose (no address, or opted out)
 */
function summarizeRecipients(recipients = []) {
  const counts = { total: recipients.length, sent: 0, failed: 0, skipped: 0, pending: 0 };
  for (const recipient of recipients) {
    if (recipient.status === "sent") counts.sent += 1;
    else if (recipient.status === "failed") counts.failed += 1;
    else if (recipient.status === "skipped") counts.skipped += 1;
    else counts.pending += 1;
  }
  return counts;
}

function serializeBroadcast(doc) {
  if (!doc) return null;
  const counts = doc.counts ?? summarizeRecipients(doc.recipients ?? []);
  return {
    id: String(doc._id),
    subject: doc.subject ?? "",
    status: doc.status ?? "sending",
    recipients: counts.total ?? 0,
    sent: counts.sent ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
    pending: counts.pending ?? 0,
    createdAt: doc.createdAt ?? null,
    finishedAt: doc.finishedAt ?? null,
    createdBy: doc.createdBy ?? null,
  };
}

/**
 * Freezes the copy and the recipient list as one document.
 *
 * The copy lives on the broadcast itself rather than referencing the template,
 * so editing (or deleting) a template later cannot change what a half-finished
 * send is still mailing out.
 */
export async function createEmailBroadcast({
  content,
  recipients,
  actor = null,
  now = new Date(),
}) {
  const broadcasts = await getEmailBroadcastsCollection();
  const rows = recipients.map((recipient) => ({
    uid: String(recipient.uid),
    email: recipient.email ? String(recipient.email) : null,
    status: recipient.status === "skipped" ? "skipped" : "pending",
    error: recipient.error ?? null,
    sentAt: null,
  }));
  const doc = {
    ...templateFields(content),
    status: "sending",
    recipients: rows,
    counts: summarizeRecipients(rows),
    createdBy: actorFields(actor),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  const result = await broadcasts.insertOne(doc);
  return { ok: true, id: String(result.insertedId), doc: { _id: result.insertedId, ...doc } };
}

export async function getEmailBroadcast(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const broadcasts = await getEmailBroadcastsCollection();
  return broadcasts.findOne({ _id });
}

/** Updates one recipient row; the uid is unique inside a broadcast. */
export async function markBroadcastRecipient(broadcastId, uid, patch = {}) {
  const _id = toObjectId(broadcastId);
  const fields = ["status", "error", "sentAt"].filter((key) => key in patch);
  if (!_id || !fields.length) return;

  const broadcasts = await getEmailBroadcastsCollection();
  const $set = { updatedAt: new Date() };
  for (const key of fields) $set[`recipients.$[row].${key}`] = patch[key];
  await broadcasts.updateOne({ _id }, { $set }, { arrayFilters: [{ "row.uid": String(uid) }] });
}

/**
 * Recomputes the aggregate counts and settles the status: `sending` while
 * anything is left (including retryable failures), `partial` when the run
 * finished with failures, `sent` when everyone was delivered.
 */
export async function finalizeEmailBroadcast(broadcastId, now = new Date()) {
  const _id = toObjectId(broadcastId);
  if (!_id) return null;

  const broadcasts = await getEmailBroadcastsCollection();
  const doc = await broadcasts.findOne({ _id });
  if (!doc) return null;

  const counts = summarizeRecipients(doc.recipients ?? []);
  const done = counts.pending === 0;
  const status = !done ? "sending" : counts.failed > 0 ? "partial" : "sent";
  const $set = { counts, status, updatedAt: now };
  if (done) $set.finishedAt = doc.finishedAt ?? now;

  await broadcasts.updateOne({ _id }, { $set });
  return { ...doc, ...$set };
}

/** Recent broadcasts, without their (possibly 100-row) recipient arrays. */
export async function listEmailBroadcasts(limit = 10) {
  const size = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 50);
  try {
    const broadcasts = await getEmailBroadcastsCollection();
    const rows = await broadcasts
      .find({})
      .sort({ createdAt: -1 })
      .limit(size)
      .project({ recipients: 0 })
      .toArray();
    return rows.map(serializeBroadcast);
  } catch (error) {
    console.error("[emailStore] could not list broadcasts:", error);
    return [];
  }
}

/**
 * The composer's recipient picker: email-bearing accounts, newest first, with
 * `deleted` tombstones excluded. Opted-out accounts are returned (flagged) so
 * the admin can see them, but the send path refuses to mail them.
 */
export async function listEmailRecipients({ search, page, limit } = {}) {
  const users = (await getDb()).collection("users");
  const paging = parsePaging({ page, limit, defaultLimit: 25, maxLimit: 100 });

  const query = {
    email: { $type: "string", $ne: "" },
    status: { $ne: "deleted" },
  };
  const term = String(search ?? "").trim();
  if (term) {
    const pattern = { $regex: escapeRegex(term), $options: "i" };
    query.$or = [{ _id: pattern }, { email: pattern }];
  }

  const [rows, total] = await Promise.all([
    users
      .find(query)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .project({
        email: 1,
        status: 1,
        isSubscribed: 1,
        subscriptionExpiry: 1,
        emailUnsubscribedAt: 1,
      })
      .toArray(),
    users.countDocuments(query),
  ]);

  return {
    recipients: rows.map((row) => ({
      uid: String(row._id),
      email: String(row.email),
      status: getAccountStatus(row),
      isSubscribed: isSubscribed(row),
      unsubscribed: Boolean(row.emailUnsubscribedAt),
    })),
    total,
    page: paging.page,
    limit: paging.limit,
    hasMore: paging.skip + rows.length < total,
  };
}

/**
 * Loads the accounts behind a set of uids, in the order the admin picked them.
 *
 * Every requested uid comes back as a recipient row: an account that was
 * deleted or has no address is recorded as `skipped`, so the history explains a
 * short delivery instead of silently dropping the row.
 */
export async function resolveBroadcastRecipients(uids) {
  const requested = [
    ...new Set((uids ?? []).map((uid) => String(uid ?? "")).filter(Boolean)),
  ];
  if (!requested.length) return [];

  const users = (await getDb()).collection("users");
  const rows = await users
    .find({ _id: { $in: requested } })
    .project({ email: 1, status: 1, emailUnsubscribedAt: 1 })
    .toArray();
  const byId = new Map(rows.map((row) => [String(row._id), row]));

  return requested.map((uid) => {
    const row = byId.get(uid);
    if (!row || getAccountStatus(row) === "deleted") {
      return { uid, email: null, status: "skipped", error: "account_unavailable" };
    }
    if (!row.email) {
      return { uid, email: null, status: "skipped", error: "no_email" };
    }
    if (row.emailUnsubscribedAt) {
      return { uid, email: row.email, status: "skipped", error: "unsubscribed" };
    }
    return { uid, email: String(row.email), status: "pending", error: null };
  });
}

import { getMongoClient } from "@/lib/mongodb";
import { hashValue } from "@/lib/contactGuard";

/**
 * MongoDB persistence for Web Push.
 *
 *   pushSubscriptions  one document per browser/device that granted permission.
 *                      `_id` is `hashValue(endpoint)` — the endpoint is a long
 *                      URL (Chrome ~200 chars, Apple longer) and a hashed key
 *                      keeps documents small and predictable. The endpoint
 *                      itself is stored because it is what we actually POST to.
 *                      `revokedAt` retires a row instead of deleting it, so the
 *                      dashboard can still explain a shrinking audience.
 *   pushLog            one row per attempt (campaign id, outcome, error). The
 *                      same ledger idea as emailLog; Phase 2 adds the unique
 *                      claim index that makes a campaign run idempotent.
 *   users.notificationPrefs
 *                      per-campaign opt-ins, written by /api/profile PATCH.
 *
 * Nothing here reads practice data. The trial-reminder audience query (Phase 2)
 * lives beside the email engine's, not here.
 */

const DB_NAME = process.env.MONGODB_DB ?? "jambito";
const SUBSCRIPTIONS_COLLECTION = "pushSubscriptions";
const LOG_COLLECTION = "pushLog";

/** A browser profile only ever has one endpoint; this bounds a single account. */
export const PUSH_MAX_DEVICES_PER_USER = 20;

/**
 * The campaigns a student can switch off. Anything not listed here is not
 * sendable, which keeps an admin typo from inventing a notification.
 */
export const PUSH_CAMPAIGN_IDS = ["practice_reminder", "trial_progress", "product_updates"];

export const NOTIFICATION_PREF_DEFAULTS = Object.freeze({
  // The retention lever, and the only campaign that ships in Phase 1.
  dailyReminder: true,
  // Free-trial nudge: "12 of 40 free questions used".
  trialProgress: true,
  // Announcements. Off by default: this is the one people mute you for.
  productUpdates: false,
});

async function getDb() {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}

export async function getPushSubscriptionsCollection() {
  return (await getDb()).collection(SUBSCRIPTIONS_COLLECTION);
}

export async function getPushLogCollection() {
  return (await getDb()).collection(LOG_COLLECTION);
}

let indexPromise = null;

/**
 * Runs once per process; failures are logged rather than thrown, matching
 * lib/emailStore.js. Also mirrored in scripts/ensure-indexes.mjs, which is what
 * actually gets run on a fresh deployment.
 */
export async function ensurePushIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [subscriptions, log] = await Promise.all([
        getPushSubscriptionsCollection(),
        getPushLogCollection(),
      ]);
      await Promise.allSettled([
        subscriptions.createIndex({ uid: 1, revokedAt: 1 }, { name: "uid_revoked" }),
        subscriptions.createIndex({ revokedAt: 1, platform: 1 }, { name: "revoked_platform" }),
        subscriptions.createIndex({ lastSeenAt: -1 }, { name: "lastSeenAt_desc" }),
        log.createIndex({ campaignId: 1, sentAt: -1 }, { name: "campaign_sentAt" }),
        log.createIndex({ uid: 1, sentAt: -1 }, { name: "uid_sentAt" }),
        log.createIndex({ sentAt: -1 }, { name: "sentAt_desc" }),
      ]);
    })().catch((error) => {
      console.error("[pushStore] could not create indexes:", error);
    });
  }
  return indexPromise;
}

/** Defaults for an account that has never touched the toggles. */
export function getNotificationPrefs(user) {
  const stored = user?.notificationPrefs ?? {};
  const prefs = { ...NOTIFICATION_PREF_DEFAULTS };
  for (const key of Object.keys(NOTIFICATION_PREF_DEFAULTS)) {
    if (typeof stored[key] === "boolean") prefs[key] = stored[key];
  }
  return { ...prefs, updatedAt: stored.updatedAt ?? null };
}

function narrow(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * A device label for the profile page and the dashboard. Kept coarse on
 * purpose: the user agent is stored for support, but only this is shown.
 */
export function describePlatform(userAgent) {
  const ua = String(userAgent ?? "");
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}


/**
 * Stores (or refreshes) one device subscription.
 *
 * Upsert keyed on the endpoint hash, so a browser that re-subscribes — which
 * happens on every permission re-grant and after `pushsubscriptionchange` —
 * updates its existing row instead of piling up duplicates. `revokedAt` is
 * cleared, which is how a device that came back stops looking dead.
 */
export async function savePushSubscription({
  uid,
  subscription,
  deviceId = null,
  userAgent = null,
  platform = null,
  now = new Date(),
}) {
  const endpoint = String(subscription?.endpoint ?? "").trim();
  const p256dh = String(subscription?.keys?.p256dh ?? "");
  const auth = String(subscription?.keys?.auth ?? "");

  if (!uid || !endpoint || !p256dh || !auth) {
    return { ok: false, reason: "invalid_subscription" };
  }
  if (endpoint.length > 2048) {
    return { ok: false, reason: "endpoint_too_long" };
  }

  await ensurePushIndexes();
  const subscriptions = await getPushSubscriptionsCollection();
  const id = hashValue(endpoint);

  const result = await subscriptions.updateOne(
    { _id: id },
    {
      $set: {
        uid,
        endpoint,
        keys: { p256dh, auth },
        deviceId: narrow(deviceId, 100) || null,
        userAgent: narrow(userAgent, 300) || null,
        platform: narrow(platform, 24) || describePlatform(userAgent),
        lastSeenAt: now,
        updatedAt: now,
        revokedAt: null,
        revokedReason: null,
      },
      $setOnInsert: { createdAt: now, failureCount: 0, lastOkAt: null, lastError: null },
    },
    { upsert: true }
  );

  // A single browser profile has one endpoint, but the same account can sign in
  // on many devices. Cap the list so a bot cannot grow one account for ever;
  // the oldest rows beyond the cap are retired rather than deleted.
  const surplus = await subscriptions
    .find({ uid, revokedAt: null })
    .sort({ lastSeenAt: -1 })
    .project({ _id: 1 })
    .skip(PUSH_MAX_DEVICES_PER_USER)
    .toArray();
  if (surplus.length) {
    await subscriptions.updateMany(
      { _id: { $in: surplus.map((row) => row._id) } },
      { $set: { revokedAt: now, revokedReason: "device_limit", updatedAt: now } }
    );
  }

  return { ok: true, id, created: result.upsertedCount === 1 };
}

/**
 * Retires one device. Matched on uid as well as endpoint: an endpoint hash is
 * not a capability, so a signed-in account may only retire its own rows.
 */
export async function revokePushSubscription({
  uid,
  endpoint,
  reason = "unsubscribed",
  now = new Date(),
}) {
  const value = String(endpoint ?? "").trim();
  if (!uid || !value) return { ok: false, reason: "invalid_request" };

  const subscriptions = await getPushSubscriptionsCollection();
  const result = await subscriptions.updateOne(
    { _id: hashValue(value), uid, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: reason, updatedAt: now } }
  );
  return { ok: true, revoked: result.modifiedCount > 0 };
}

/** "Turn off on this device" is the common case; this is the nuclear one. */
export async function revokeAllPushSubscriptions(
  uid,
  { reason = "unsubscribed_all", now = new Date() } = {}
) {
  if (!uid) return { ok: false, reason: "invalid_request" };
  const subscriptions = await getPushSubscriptionsCollection();
  const result = await subscriptions.updateMany(
    { uid, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: reason, updatedAt: now } }
  );
  return { ok: true, revoked: result.modifiedCount };
}

/** Used by the send path for 404/410: the push service says it is gone. */
export async function retirePushSubscription(id, reason = "gone", now = new Date()) {
  try {
    const subscriptions = await getPushSubscriptionsCollection();
    await subscriptions.updateOne(
      { _id: id },
      { $set: { revokedAt: now, revokedReason: reason, updatedAt: now } }
    );
  } catch (error) {
    console.error("[pushStore] could not retire a subscription:", error);
  }
}

/** Records the outcome of a send attempt, so a failure is visible afterwards. */
export async function recordPushResult(id, result, now = new Date()) {
  try {
    const subscriptions = await getPushSubscriptionsCollection();
    if (result?.ok) {
      await subscriptions.updateOne(
        { _id: id },
        { $set: { lastOkAt: now, lastError: null } }
      );
      return;
    }
    await subscriptions.updateOne(
      { _id: id },
      {
        $set: {
          lastError: `${result?.code ?? "push_error"}: ${result?.message ?? ""}`.slice(0, 300),
        },
        $inc: { failureCount: 1 },
      }
    );
  } catch (error) {
    console.error("[pushStore] could not record a push result:", error);
  }
}

/** The device list on the profile page: active rows only, newest first. */
export async function listUserPushSubscriptions(uid) {
  if (!uid) return [];
  try {
    const subscriptions = await getPushSubscriptionsCollection();
    const rows = await subscriptions
      .find({ uid, revokedAt: null })
      .sort({ lastSeenAt: -1 })
      .limit(PUSH_MAX_DEVICES_PER_USER)
      .toArray();
    return rows.map((row) => ({
      id: String(row._id),
      platform: row.platform ?? "Unknown",
      deviceId: row.deviceId ?? null,
      lastSeenAt: row.lastSeenAt ?? null,
      lastOkAt: row.lastOkAt ?? null,
      lastError: row.lastError ?? null,
      failureCount: row.failureCount ?? 0,
    }));
  } catch (error) {
    console.error("[pushStore] could not list subscriptions:", error);
    return [];
  }
}

/**
 * Full send targets for one account: endpoint and keys included.
 *
 * Server-internal — `listUserPushSubscriptions` is the sanitised version that
 * the profile page receives, and the two are separate so a key can never leak
 * through a route that only meant to render a device list.
 */
export async function getUserPushTargets(uid) {
  if (!uid) return [];
  try {
    const subscriptions = await getPushSubscriptionsCollection();
    const rows = await subscriptions
      .find({ uid, revokedAt: null })
      .sort({ lastSeenAt: -1 })
      .limit(PUSH_MAX_DEVICES_PER_USER)
      .toArray();
    return rows.map((row) => ({
      id: String(row._id),
      endpoint: row.endpoint,
      keys: row.keys,
      platform: row.platform ?? "Unknown",
    }));
  } catch (error) {
    console.error("[pushStore] could not read send targets:", error);
    return [];
  }
}

/**
 * Everyone who granted permission on at least one live device for these
 * accounts. Phase 2's campaign runner is the caller: the email engine decides
 * the audience, this only resolves the devices.
 */
export async function listSubscriptionsForUids(uids) {
  const ids = [...new Set((uids ?? []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const subscriptions = await getPushSubscriptionsCollection();
  return subscriptions.find({ uid: { $in: ids }, revokedAt: null }).toArray();
}

/** What the dashboard and /api/health report. Cheap aggregates, no payloads. */
export async function getPushStats() {
  try {
    const [subscriptions, log] = await Promise.all([
      getPushSubscriptionsCollection(),
      getPushLogCollection(),
    ]);

    const [active, revoked, byPlatform, uids, recent, lastSend] = await Promise.all([
      subscriptions.countDocuments({ revokedAt: null }),
      subscriptions.countDocuments({ revokedAt: { $ne: null } }),
      subscriptions
        .aggregate([
          { $match: { revokedAt: null } },
          { $group: { _id: "$platform", total: { $sum: 1 } } },
          { $sort: { total: -1 } },
        ])
        .toArray(),
      subscriptions.distinct("uid", { revokedAt: null }),
      subscriptions
        .find({})
        .sort({ lastSeenAt: -1 })
        .limit(10)
        .project({ endpoint: 0, keys: 0, userAgent: 0 })
        .toArray(),
      log.find({}).sort({ sentAt: -1 }).limit(1).next(),
    ]);

    return {
      devices: active,
      revoked,
      accounts: uids.length,
      byPlatform: byPlatform.map((row) => ({
        platform: row._id ?? "Unknown",
        total: row.total ?? 0,
      })),
      lastSendAt: lastSend?.sentAt ?? null,
      recentDevices: recent.map((row) => ({
        uid: row.uid,
        platform: row.platform ?? "Unknown",
        lastSeenAt: row.lastSeenAt ?? null,
        lastOkAt: row.lastOkAt ?? null,
        failureCount: row.failureCount ?? 0,
        lastError: row.lastError ?? null,
      })),
    };
  } catch (error) {
    console.error("[pushStore] could not read push stats:", error);
    return {
      devices: 0,
      revoked: 0,
      accounts: 0,
      byPlatform: [],
      lastSendAt: null,
      recentDevices: [],
      error: "unavailable",
    };
  }
}

/**
 * Writes the per-campaign opt-ins. Only known keys and only booleans: the API
 * body is user-controlled, and Mongo would happily store anything at a dotted
 * path if it were let through.
 */
export async function saveNotificationPrefs(uid, patch, now = new Date()) {
  if (!uid || !patch || typeof patch !== "object") {
    return { ok: false, reason: "invalid_request" };
  }

  const $set = { "notificationPrefs.updatedAt": now };
  let changed = 0;
  for (const key of Object.keys(NOTIFICATION_PREF_DEFAULTS)) {
    if (typeof patch[key] === "boolean") {
      $set[`notificationPrefs.${key}`] = patch[key];
      changed += 1;
    }
  }
  if (!changed) return { ok: false, reason: "no_known_preferences" };

  try {
    const users = (await getDb()).collection("users");
    await users.updateOne({ _id: uid }, { $set });
    return { ok: true, changed };
  } catch (error) {
    console.error("[pushStore] could not save notification prefs:", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** One row per attempt. Best effort: a failed ledger write must not fail a send. */
export async function recordPushLog({
  uid,
  campaignId,
  id = null,
  status,
  code = null,
  message = null,
  platform = null,
  now = new Date(),
}) {
  try {
    const log = await getPushLogCollection();
    await log.insertOne({
      uid: uid ?? null,
      campaignId: campaignId ?? "manual",
      subscriptionId: id ? String(id) : null,
      status,
      code,
      message: message ? String(message).slice(0, 300) : null,
      platform,
      sentAt: now,
    });
  } catch (error) {
    console.error("[pushStore] could not write the push log:", error);
  }
}

/** Recent attempts, for the dashboard's "what actually happened" list. */
export async function listRecentPushLog(limit = 20) {
  try {
    const log = await getPushLogCollection();
    const rows = await log.find({}).sort({ sentAt: -1 }).limit(Math.min(limit, 100)).toArray();
    return rows.map((row) => ({
      uid: row.uid ?? null,
      campaignId: row.campaignId ?? "manual",
      status: row.status ?? "unknown",
      code: row.code ?? null,
      message: row.message ?? null,
      platform: row.platform ?? null,
      sentAt: row.sentAt ?? null,
    }));
  } catch (error) {
    console.error("[pushStore] could not list the push log:", error);
    return [];
  }
}


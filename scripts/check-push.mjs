#!/usr/bin/env node
/**
 * Checks the Web Push setup: the VAPID keypair, and who is reachable.
 *
 * The questions, in the order they actually break a deployment:
 *
 *   1. Are PUSH_VAPID_PUBLIC / PUSH_VAPID_PRIVATE present AND usable? A key
 *      with a stray newline or a truncated paste is accepted by the environment
 *      and then rejected by `web-push` (or, worse, by the push services with a
 *      403 that reads like a subscription problem).
 *   2. Does Mongo hold any live subscription, and on which platforms?
 *   3. Optionally: can one account actually receive a notification?
 *
 * This deliberately talks to Mongo and `web-push` directly instead of importing
 * lib/pushStore.js, because that module resolves `@/lib/...` aliases that plain
 * `node` cannot follow — the same reason scripts/ensure-indexes.mjs owns its own
 * MongoDB client.
 *
 * Usage:
 *   npm run check:push
 *   npm run check:push -- --uid <firebase-uid>      (send a live test)
 *
 * Exit codes: 0 = ready (WARN lines still exit 0), 1 = push cannot work.
 */

import { MongoClient } from "mongodb";
import { getPushConfig, sendPush } from "../lib/push.js";

const DB_NAME = process.env.MONGODB_DB ?? "jambito";

const config = getPushConfig();
const publicKey = process.env.PUSH_VAPID_PUBLIC ?? "";
const privateKey = process.env.PUSH_VAPID_PRIVATE ?? "";

console.log("Web Push (resolved from .env.local)");
console.log(`  public key   ${publicKey ? `${publicKey.length} chars` : "MISSING"}`);
console.log(`  private key  ${privateKey ? `${privateKey.length} chars` : "MISSING"}`);
console.log(`  subject      ${config.subject}`);

if (!config.configured) {
  console.error(
    `\nFAIL  ${config.problem ?? "VAPID keys are not configured."}\n` +
      "      Generate a pair (once, reused by every environment):\n" +
      "        npx web-push generate-vapid-keys\n" +
      "      Then set PUSH_VAPID_PUBLIC, PUSH_VAPID_PRIVATE and PUSH_SUBJECT in\n" +
      "      .env.local and in Vercel (Production AND Preview).\n" +
      "      Until then GET /api/push reports configured:false and the reminder\n" +
      "      card does not render — the rest of the app is unaffected."
  );
  process.exit(1);
}

console.log("\nPASS  VAPID keypair is usable");
// The URL-safe base64 of an uncompressed P-256 point is 87-88 chars. Anything
// noticeably shorter is a truncated paste that `setVapidDetails` still accepts.
if (publicKey.length < 80 || publicKey.length > 100) {
  console.log(
    `WARN  the public key is ${publicKey.length} chars; an uncompressed P-256 key is 87-88.` +
      "\n      Check it was copied whole."
  );
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log(
    "\nWARN  MONGODB_URI is not set, so the subscriber list cannot be read.\n" +
      "      Run with the local env file: npm run check:push"
  );
  process.exit(0);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
await client.connect();
const db = client.db(DB_NAME);
const subscriptions = db.collection("pushSubscriptions");

const [active, revoked, byPlatform] = await Promise.all([
  subscriptions.countDocuments({ revokedAt: null }),
  subscriptions.countDocuments({ revokedAt: { $ne: null } }),
  subscriptions
    .aggregate([
      { $match: { revokedAt: null } },
      { $group: { _id: "$platform", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray(),
]);

console.log(`\nSubscribers in ${DB_NAME}`);
console.log(`  live devices   ${active}`);
console.log(`  retired        ${revoked}`);
if (!active) {
  console.log(
    "\n  none yet — install the PWA on a phone, sign in, finish a set and tap" +
      '\n  "Turn on reminders" on the result card (or use /profile -> Reminders).'
  );
}
for (const row of byPlatform) {
  console.log(`  ${String(row._id ?? "Unknown").padEnd(10)} ${row.total}`);
}

// Optional live test. Kept behind a flag because it puts a real notification on
// someone's phone.
const uidIndex = process.argv.indexOf("--uid");
if (uidIndex !== -1) {
  const uid = process.argv[uidIndex + 1];
  if (!uid) {
    console.error("\nFAIL  --uid needs a Firebase uid.");
    process.exit(1);
  }

  const targets = await subscriptions.find({ uid, revokedAt: null }).toArray();
  if (!targets.length) {
    console.error(`\nFAIL  ${uid} has no live device.`);
    process.exit(1);
  }

  console.log(`\nSending a test to ${targets.length} device(s) of ${uid}`);
  let sent = 0;
  for (const target of targets) {
    const result = await sendPush(
      { endpoint: target.endpoint, keys: target.keys },
      {
        title: "CBT-Practice push check",
        body: "If you can read this, reminders can reach this phone.",
        url: "/profile",
        tag: "push-check",
      }
    );
    if (result.ok) {
      sent += 1;
      console.log(`  PASS  ${target.platform ?? "Unknown"}`);
    } else {
      console.log(
        `  FAIL  ${target.platform ?? "Unknown"}  ${result.code}` +
          `${result.status ? ` (${result.status})` : ""}` +
          `${result.message ? ` — ${result.message}` : ""}`
      );
    }
  }
  if (!sent) {
    await client.close();
    console.error(
      "\nFAIL  no device accepted the notification." +
        "\n      A 404/410 means the browser dropped the subscription; turn" +
        "\n      reminders off and on again on that phone. A 403 is the VAPID" +
        "\n      keypair not matching the one the subscription was made with."
    );
    process.exit(1);
  }
}

await client.close();
console.log("\nReady: notifications can be delivered.");

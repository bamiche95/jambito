#!/usr/bin/env node
/**
 * Creates the indexes the admin dashboard, the trial gate and the payment
 * ledger rely on. Idempotent — safe to re-run (and safe on every deploy).
 *
 * The unique index on `payments.reference` is the important one: it is what
 * makes granting access idempotent, so a replayed Paystack webhook or a double
 * click on "record payment" can never grant the same payment twice.
 *
 * Usage:
 *   node --env-file=.env.local scripts/ensure-indexes.mjs
 *   node --env-file=.env.local scripts/ensure-indexes.mjs --dry-run
 */

import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB ?? "jambito";
const dryRun = process.argv.includes("--dry-run");

/**
 * name -> collection / keys / options
 *
 * Names must stay in sync with the lazy `ensureIndexes()` in
 * lib/paymentsStore.js: that path runs on the first payment in a deployment
 * that never ran this script, and MongoDB refuses to create a second index with
 * the same keys under a different name.
 */
const INDEXES = [
  {
    collection: "users",
    keys: { createdAt: -1 },
    options: { name: "createdAt_desc" },
  },
  {
    collection: "users",
    keys: { status: 1, createdAt: -1 },
    options: { name: "status_createdAt_desc" },
  },
  // The dashboard's trial funnel (lib/adminUsers.js#segmentQuery): "trial
  // completed", "in progress" and the join-date windows all filter on
  // trialCount / createdAt together, and the list is always newest first.
  {
    collection: "users",
    keys: { trialCount: 1, createdAt: -1 },
    options: { name: "trialCount_createdAt_desc" },
  },
  {
    collection: "users",
    keys: { email: 1 },
    options: { name: "email" },
  },
  {
    collection: "payments",
    keys: { reference: 1 },
    options: { name: "reference_unique", unique: true },
  },
  {
    collection: "payments",
    keys: { createdAt: -1 },
    options: { name: "createdAt_desc" },
  },
  {
    collection: "payments",
    keys: { uid: 1, createdAt: -1 },
    options: { name: "uid_createdAt" },
  },
  {
    collection: "payments",
    keys: { status: 1, granted: 1 },
    options: { name: "status_granted" },
  },
  {
    collection: "adminAudit",
    keys: { createdAt: -1 },
    options: { name: "createdAt_desc" },
  },
  {
    collection: "adminAudit",
    keys: { targetUid: 1, createdAt: -1 },
    options: { name: "targetUid_createdAt_desc" },
  },
  {
    collection: "adminAudit",
    keys: { action: 1, createdAt: -1 },
    options: { name: "action_createdAt_desc" },
  },
  // Practice records (lib/practice.js). The deterministic `_id` already makes
  // writes idempotent; these indexes are for the list queries, and
  // `uid_date_desc` is what History and the email audience read.
  {
    collection: "practiceAttempts",
    keys: { uid: 1, date: -1 },
    options: { name: "uid_date_desc" },
  },
  {
    collection: "practiceAttempts",
    keys: { uid: 1, key: 1 },
    options: { name: "uid_key" },
  },
  {
    collection: "practiceSessions",
    keys: { uid: 1, updatedAt: -1 },
    options: { name: "uid_updatedAt_desc" },
  },
  // Email campaigns (lib/emailStore.js). `campaign_dedupe_unique` is the one
  // that matters: the insert of a claim is what prevents a retried cron run from
  // delivering the same email twice.
  {
    collection: "emailLog",
    keys: { campaignId: 1, dedupeKey: 1 },
    options: { name: "campaign_dedupe_unique", unique: true },
  },
  {
    collection: "emailLog",
    keys: { campaignId: 1, sentAt: -1 },
    options: { name: "campaign_sentAt" },
  },
  {
    collection: "emailLog",
    keys: { sentAt: -1 },
    options: { name: "sentAt_desc" },
  },
  {
    collection: "emailLog",
    keys: { uid: 1, sentAt: -1 },
    options: { name: "uid_sentAt" },
  },
  {
    collection: "emailCampaigns",
    keys: { updatedAt: -1 },
    options: { name: "updatedAt_desc" },
  },
  // One-off broadcasts and saved templates (lib/emailStore.js).
  {
    collection: "emailTemplates",
    keys: { updatedAt: -1 },
    options: { name: "updatedAt_desc" },
  },
  {
    collection: "emailBroadcasts",
    keys: { createdAt: -1 },
    options: { name: "createdAt_desc" },
  },
  // Contact-form rate limits (lib/contactGuard.js). The lazy `ensureIndexes()`
  // there creates the same two indexes on the first submission; `at_ttl` is what
  // keeps the collection from growing forever. A capped collection would be
  // wrong here: TTL also has to expire entries that are no longer counted.
  {
    collection: "contactThrottle",
    keys: { key: 1, at: -1 },
    options: { name: "key_at" },
  },
  {
    collection: "contactThrottle",
    keys: { at: 1 },
    options: { name: "at_ttl", expireAfterSeconds: 24 * 60 * 60 },
  },
  // Web Push (lib/pushStore.js). No unique index: `_id` is already the hash of
  // the endpoint, so a re-subscribing browser upserts its own row. These are the
  // two audience reads — "this account's live devices" and "every live device by
  // platform" — plus the dashboard's ledger.
  {
    collection: "pushSubscriptions",
    keys: { uid: 1, revokedAt: 1 },
    options: { name: "uid_revoked" },
  },
  {
    collection: "pushSubscriptions",
    keys: { revokedAt: 1, platform: 1 },
    options: { name: "revoked_platform" },
  },
  {
    collection: "pushSubscriptions",
    keys: { lastSeenAt: -1 },
    options: { name: "lastSeenAt_desc" },
  },
  {
    collection: "pushLog",
    keys: { campaignId: 1, sentAt: -1 },
    options: { name: "campaign_sentAt" },
  },
  {
    collection: "pushLog",
    keys: { uid: 1, sentAt: -1 },
    options: { name: "uid_sentAt" },
  },
  {
    collection: "pushLog",
    keys: { sentAt: -1 },
    options: { name: "sentAt_desc" },
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set.\n" +
        "Run with the local env file:  node --env-file=.env.local scripts/ensure-indexes.mjs"
    );
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`Connected to ${DB_NAME}${dryRun ? " (dry run)" : ""}\n`);

  let failures = 0;
  for (const { collection, keys, options } of INDEXES) {
    const label = `${collection}.${options.name}`;
    if (dryRun) {
      console.log(`WOULD CREATE  ${label}  ${JSON.stringify(keys)}`);
      continue;
    }
    try {
      const name = await db.collection(collection).createIndex(keys, options);
      console.log(`OK            ${collection}.${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAILED        ${label}  ${error.message}`);
    }
  }

  if (!dryRun) {
    console.log("\nIndexes per collection:");
    for (const collection of [
      "users",
      "payments",
      "adminAudit",
      "contactThrottle",
      "practiceAttempts",
      "practiceSessions",
      "emailLog",
      "emailCampaigns",
      "emailTemplates",
      "emailBroadcasts",
      "pushSubscriptions",
      "pushLog",
    ]) {
      const names = (await db.collection(collection).indexes())
        .map((i) => i.name)
        .filter((n) => n !== "_id_");
      console.log(`  ${collection}: ${names.length ? names.join(", ") : "(none)"}`);
    }
  }

  await client.close();
  if (failures) {
    console.error(`\n${failures} index(es) failed.`);
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

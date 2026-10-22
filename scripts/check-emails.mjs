#!/usr/bin/env node
/**
 * Read-only status report for the automated progress emails.
 *
 * Deliberately talks to MongoDB directly instead of importing lib/emailStore.js:
 * those modules use the `@/` path alias, which plain Node cannot resolve. This
 * script only reports what is stored — it never sends, claims or changes
 * anything, so it is safe to run against production.
 *
 * Usage:
 *   npm run check:emails
 *   node --env-file=.env.local scripts/check-emails.mjs
 */

import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB ?? "jambito";
const CAMPAIGN_IDS = [
  "never_started",
  "trial_complete",
  "unfinished_set",
  "subscriber_thanks",
];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set.\n" +
      "Run with the local env file:  npm run check:emails"
  );
  process.exit(1);
}

function flag(value) {
  return value ? "set" : "MISSING";
}

function when(value) {
  return value ? new Date(value).toISOString() : "never";
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
await client.connect();
const db = client.db(DB_NAME);

const [settings, campaigns, stats, unsubscribed, recent, indexes, templates, broadcasts] =
  await Promise.all([
    db.collection("settings").findOne({ _id: "emailSettings" }),
    db.collection("emailCampaigns").find({}).toArray(),
    db
      .collection("emailLog")
      .aggregate([
        {
          $group: {
            _id: { campaignId: "$campaignId", status: "$status" },
            count: { $sum: 1 },
            last: { $max: "$sentAt" },
          },
        },
      ])
      .toArray(),
    db.collection("users").countDocuments({ emailUnsubscribedAt: { $exists: true } }),
    db.collection("emailLog").find({}).sort({ createdAt: -1 }).limit(5).toArray(),
    db.collection("emailLog").indexes(),
    db.collection("emailTemplates").countDocuments({}),
    db
      .collection("emailBroadcasts")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ subject: 1, status: 1, counts: 1, createdAt: 1 })
      .toArray(),
  ]);

const unsubscribeSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;

console.log(`Database: ${DB_NAME}`);
console.log("");
console.log("Configuration");
console.log(`  SMTP_PASSWORD            ${flag(process.env.SMTP_PASSWORD)}`);
console.log(`  CRON_SECRET              ${flag(process.env.CRON_SECRET)}`);
console.log(`  EMAIL_UNSUBSCRIBE_SECRET ${flag(process.env.EMAIL_UNSUBSCRIBE_SECRET)}`);
console.log(`  unsubscribe signing key  ${flag(unsubscribeSecret)}`);

const claimIndex = indexes.find((index) => index.name === "campaign_dedupe_unique");
console.log(
  `  dedupe index             ${claimIndex ? "ok (unique)" : "MISSING — run scripts/ensure-indexes.mjs"}`
);

console.log("");
console.log("Settings");
console.log(`  paused                   ${settings?.paused === true ? "YES (nothing sends)" : "no"}`);
console.log(`  daily cap                ${settings?.dailyCap ?? 200}`);
console.log(`  last run                 ${when(settings?.lastRunAt)}`);
if (settings?.lastRunSummary) {
  const last = settings.lastRunSummary;
  console.log(
    `  last result              ${last.sent} sent, ${last.failed} failed, ${last.skipped} skipped` +
      (last.stoppedReason ? ` (stopped: ${last.stoppedReason})` : "") +
      (last.dryRun ? " — dry run" : "")
  );
}

console.log("");
console.log("Campaigns");
for (const id of CAMPAIGN_IDS) {
  const doc = campaigns.find((campaign) => campaign._id === id);
  const sent = stats
    .filter((row) => row._id.campaignId === id && row._id.status === "sent")
    .reduce((total, row) => total + row.count, 0);
  const failed = stats
    .filter((row) => row._id.campaignId === id && row._id.status === "failed")
    .reduce((total, row) => total + row.count, 0);
  const lastSent = stats
    .filter((row) => row._id.campaignId === id && row.last)
    .reduce((latest, row) => (!latest || row.last > latest ? row.last : latest), null);

  console.log(
    `  ${id.padEnd(20)} ${doc?.enabled === true ? "enabled " : "disabled"}  ` +
      `${sent} sent, ${failed} failed, last ${when(lastSent)}`
  );
  if (doc?.updatedAt) {
    console.log(`  ${"".padEnd(20)} copy edited ${when(doc.updatedAt)}`);
  }
}
console.log("  (a campaign with no document uses the defaults in lib/emailCampaigns.js)");

console.log("");
console.log(`Unsubscribed accounts: ${unsubscribed}`);

console.log("");
console.log("One-off emails");
console.log(`  saved templates          ${templates}`);
if (broadcasts.length === 0) {
  console.log("  (no broadcasts yet)");
} else {
  for (const broadcast of broadcasts) {
    const counts = broadcast.counts ?? {};
    console.log(
      `  ${when(broadcast.createdAt)}  ${String(broadcast.status).padEnd(7)}  ` +
        `${counts.sent ?? 0}/${counts.total ?? 0} delivered` +
        (broadcast.subject ? `  ${broadcast.subject}` : "")
    );
  }
}

console.log("");
console.log("Last 5 log entries");
if (recent.length === 0) {
  console.log("  (none)");
} else {
  for (const entry of recent) {
    console.log(
      `  ${when(entry.createdAt)}  ${String(entry.status).padEnd(7)}  ` +
        `${String(entry.campaignId).padEnd(18)} ${entry.email}` +
        (entry.error ? `  — ${entry.error}` : "")
    );
  }
}

await client.close();

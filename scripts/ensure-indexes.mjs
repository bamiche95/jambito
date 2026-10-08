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
    for (const collection of ["users", "payments", "adminAudit"]) {
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

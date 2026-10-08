#!/usr/bin/env node
/**
 * Bootstraps (or removes) an admin, because the admin API is itself admin-only:
 * a deployment whose only account is a plain user has no way in.
 *
 * Two ways to get the first admin, both supported:
 *
 *   1. Add the address to ADMIN_EMAILS and sign in once — `ensureUser()` then
 *      re-promotes it on every request, so it can never be locked out.
 *   2. Promote it right here, for an account that already signed in once.
 *
 * Usage:
 *   node --env-file=.env.local scripts/promote-admin.mjs you@example.com
 *   node --env-file=.env.local scripts/promote-admin.mjs you@example.com --demote
 *   node --env-file=.env.local scripts/promote-admin.mjs --list
 */

import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB ?? "jambito";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set.\n" +
        "Run with the local env file:  node --env-file=.env.local scripts/promote-admin.mjs you@example.com"
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const demote = args.includes("--demote");
  const email = args.find((a) => !a.startsWith("--"));

  if (!list && !email) {
    console.error(
      "Pass the account email, or --list to show the current admins.\n" +
        "  node --env-file=.env.local scripts/promote-admin.mjs you@example.com"
    );
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const users = client.db(DB_NAME).collection("users");

  if (list) {
    const admins = await users
      .find({ role: "admin" }, { projection: { email: 1, status: 1, createdAt: 1 } })
      .sort({ createdAt: 1 })
      .toArray();
    console.log(`Admins in ${DB_NAME}.users: ${admins.length}`);
    for (const admin of admins) {
      console.log(
        `  ${admin.email ?? "(no email)"}  status=${admin.status ?? "active"}  uid=${admin._id}`
      );
    }
    const envAdmins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    console.log(
      `ADMIN_EMAILS: ${envAdmins.length ? envAdmins.join(", ") : "(empty — no auto-promoted admin)"}`
    );
    await client.close();
    return;
  }

  const normalized = String(email).toLowerCase().trim();
  // `ensureUser()` always stores the address lower-cased, so one lookup is enough.
  const target = await users.findOne({ email: normalized });
  if (!target) {
    console.error(
      `No account with email ${normalized}.\n` +
        "The user must sign in once (so `ensureUser()` creates the document) before it can be promoted."
    );
    await client.close();
    process.exit(1);
  }

  const role = demote ? "user" : "admin";
  const now = new Date();
  await users.updateOne(
    { _id: target._id },
    { $set: { role, updatedAt: now, status: target.status ?? "active" } }
  );

  console.log(
    `${demote ? "Demoted" : "Promoted"} ${target.email} to role="${role}" (uid ${target._id}).`
  );

  const envAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!demote && !envAdmins.includes(normalized)) {
    console.log(
      "\nNote: this role lives only in MongoDB. `ADMIN_EMAILS` is the lasting\n" +
        "safety net (it re-promotes on every sign-in and survives a bad migration),\n" +
        `so consider adding ${normalized} to it in the deployment environment.`
    );
  }

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

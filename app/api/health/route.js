import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY deployment diagnostic. DELETE once the production 500s on the
 * firebase-admin routes are resolved (it discloses the runtime version and
 * which secrets are present).
 *
 * Context: every route importing `@/lib/firebaseAdmin` returns an EMPTY 500 on
 * production, while `/api/questions` (which does not import it) returns 200. An
 * unauthenticated request never reaches the Admin SDK - `requireUser()` finds no
 * bearer token and would answer 401 - so an empty 500 on a token-less request
 * can only mean the route module failed to LOAD. Static imports are hoisted and
 * therefore uncatchable, so each module is pulled in with `await import()` here
 * and any error is returned in the response body instead of an opaque 500.
 */
async function check(label, load) {
  try {
    await load();
    return [label, "ok"];
  } catch (error) {
    return [label, `FAILED: ${error?.message || error}`];
  }
}

/** Pings MongoDB through the shared cached client. */
async function checkMongo() {
  try {
    const { getMongoClient } = await import("@/lib/mongodb");
    await (await getMongoClient()).db().command({ ping: 1 });
    return "ok";
  } catch (error) {
    return `FAILED: ${error?.message || error}`;
  }
}

/**
 * Well-formed but unsigned JWT with a bogus `kid`, used to drive the real
 * verifier one step past decoding. A malformed string would fail at decode and
 * hide whether the Admin SDK actually has credentials + a project ID, which is
 * what `verifyIdToken()` needs even before it checks a signature.
 */
const PROBE_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "RS256", kid: "health-probe", typ: "JWT" })).toString(
    "base64url"
  ),
  Buffer.from(
    JSON.stringify({
      iss: "https://securetoken.google.com/health-probe",
      aud: "health-probe",
      sub: "probe",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url"),
  "AAAA",
].join(".");

/**
 * Reports the verifier's own error. Healthy production looks like an
 * invalid-token/audience complaint; a credential problem instead reports
 * "Must initialize app with a cert credential or set your Firebase project ID".
 */
async function checkTokenVerification() {
  try {
    const { getAdminApp } = await import("@/lib/firebaseAdmin");
    const auth = await import("firebase-admin/auth");
    await auth.getAuth(getAdminApp()).verifyIdToken(PROBE_TOKEN);
    return "unexpected: probe token verified";
  } catch (error) {
    return `${error?.code || error?.name || "error"}: ${error?.message || error}`;
  }
}

/**
 * NOTE: no separate jwks-rsa/jose probe is needed here — loading
 * `firebase-admin/auth` already executes jwks-rsa's top-level `require("jose")`,
 * so an "ok" for that entry proves jose resolves to a CommonJS build in the
 * deployed function (jose is pinned to 4.15.9 via `overrides` in package.json;
 * jose 5/6 are ESM-only and fail with ERR_REQUIRE_ESM under such loaders).
 */

/**
 * Non-secret mail settings, so a deployment can be checked from outside
 * without sending a message or exposing the password. Deliberately does NOT
 * gate `ok` below: sign-in, practice and payments all work with mail
 * unconfigured, and a health check that fails for that would be misleading.
 */
async function checkMail() {
  try {
    const { getMailConfig } = await import("@/lib/mailer");
    const config = getMailConfig();
    return {
      configured: config.configured,
      host: config.host,
      port: config.port,
      secure: config.secure,
      from: config.fromEmail,
      contactInbox: process.env.CONTACT_TO_EMAIL || config.fromEmail,
      // Progress emails need both a working mailbox and an unsubscribe secret;
      // without them the campaign runner refuses to send anything.
      campaigns: {
        cronSecret: Boolean(process.env.CRON_SECRET),
        unsubscribeSecret: Boolean(
          process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
        ),
      },
    };
  } catch (error) {
    return { configured: false, error: error?.message || String(error) };
  }
}

export async function GET() {
  const info = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    // false => the runtime cannot `require()` ESM at all, which is why the
    // CJS-only jose@4 pin below is required (jose@6 is ESM-only).
    requireEsm: process.features?.require_module ?? null,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    // Raw env-var presence. What the Admin SDK actually resolved is reported
    // separately as `credential` below: a present-but-invalid service account,
    // or a path that only exists on a workstation, must not look healthy here.
    envPresence: {
      FIREBASE_SERVICE_ACCOUNT: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
      GOOGLE_APPLICATION_CREDENTIALS: Boolean(
        process.env.GOOGLE_APPLICATION_CREDENTIALS
      ),
    },
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    // Which (public) source supplies the project ID when no service account is
    // available - see lib/firebaseAdmin.ts.
    projectIdSources: {
      FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
      GOOGLE_CLOUD_PROJECT: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
      GCLOUD_PROJECT: Boolean(process.env.GCLOUD_PROJECT),
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ),
    },
  };

  // What the Admin SDK actually resolved — a present-but-unusable service
  // account, or a credential path that only exists on a workstation, is
  // visible here instead of only in the function logs.
  let credential;
  try {
    const { getCredentialStatus } = await import("@/lib/firebaseAdmin");
    credential = getCredentialStatus();
  } catch (error) {
    credential = {
      source: "unavailable",
      hasServiceAccount: false,
      projectId: null,
      serverless: Boolean(process.env.VERCEL),
      error: error?.message || String(error),
    };
  }

  const imports = Object.fromEntries([
    await check("firebase-admin/app", () => import("firebase-admin/app")),
    await check("firebase-admin/auth", () => import("firebase-admin/auth")),
    await check("@/lib/firebaseAdmin", () => import("@/lib/firebaseAdmin")),
    await check("@/lib/users", () => import("@/lib/users")),
  ]);

  // Credential smoke test through the app's own initialiser (not a bare
  // initializeApp()), so this measures what the API routes really use.
  let adminInit = "FAILED: import error";
  try {
    const app = await import("firebase-admin/app");
    const auth = await import("firebase-admin/auth");
    const { getAdminApp } = await import("@/lib/firebaseAdmin");
    auth.getAuth(getAdminApp());
    adminInit = `ok (apps: ${app.getApps().length})`;
  } catch (error) {
    adminInit = `FAILED: ${error?.message || error}`;
  }

  const mongo = await checkMongo();
  const tokenVerify = await checkTokenVerification();
  const mail = await checkMail();

  // A healthy verifier complains about the probe token itself; only a
  // credential/config problem means the trial gate cannot work at all, so
  // those fail the health check.
  const credentialsOk = !/project ID|cert credential|default credentials/i.test(
    tokenVerify
  );

  const ok =
    Object.values(imports).every((value) => value === "ok") &&
    adminInit.startsWith("ok") &&
    mongo === "ok" &&
    credentialsOk;

  return NextResponse.json(
    { ok, imports, adminInit, credential, mongo, tokenVerify, mail, ...info },
    { status: ok ? 200 : 500 }
  );
}

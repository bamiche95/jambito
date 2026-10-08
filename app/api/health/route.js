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
    const client = (await import("@/lib/mongodb")).default;
    await (await client).db().command({ ping: 1 });
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
    const app = await import("firebase-admin/app");
    const auth = await import("firebase-admin/auth");
    const adminApp = app.getApps().length ? app.getApp() : app.initializeApp();
    await auth.getAuth(adminApp).verifyIdToken(PROBE_TOKEN);
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

export async function GET() {
  const info = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    // false => the runtime cannot `require()` ESM at all, which is why the
    // CJS-only jose@4 pin below is required (jose@6 is ESM-only).
    requireEsm: process.features?.require_module ?? null,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    hasServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    hasGoogleCredPath: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
  };

  const imports = Object.fromEntries([
    await check("firebase-admin/app", () => import("firebase-admin/app")),
    await check("firebase-admin/auth", () => import("firebase-admin/auth")),
    await check("@/lib/firebaseAdmin", () => import("@/lib/firebaseAdmin")),
    await check("@/lib/users", () => import("@/lib/users")),
  ]);

  // Credential smoke test: can the Admin SDK initialise with what is configured?
  let adminInit = "FAILED: import error";
  try {
    const app = await import("firebase-admin/app");
    const auth = await import("firebase-admin/auth");
    const adminApp = app.getApps().length ? app.getApp() : app.initializeApp();
    auth.getAuth(adminApp);
    adminInit = "ok";
  } catch (error) {
    adminInit = `FAILED: ${error?.message || error}`;
  }

  const mongo = await checkMongo();
  const tokenVerify = await checkTokenVerification();

  // A healthy verifier complains about the probe token itself; only a
  // credential/config problem means the trial gate cannot work at all, so
  // those fail the health check.
  const credentialsOk = !/project ID|cert credential|default credentials/i.test(
    tokenVerify
  );

  const ok =
    Object.values(imports).every((value) => value === "ok") &&
    adminInit === "ok" &&
    mongo === "ok" &&
    credentialsOk;

  return NextResponse.json(
    { ok, imports, adminInit, mongo, tokenVerify, ...info },
    { status: ok ? 200 : 500 }
  );
}

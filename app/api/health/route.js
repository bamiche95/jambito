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

  const ok =
    Object.values(imports).every((value) => value === "ok") &&
    adminInit === "ok" &&
    mongo === "ok";

  return NextResponse.json(
    { ok, imports, adminInit, mongo, ...info },
    { status: ok ? 200 : 500 }
  );
}

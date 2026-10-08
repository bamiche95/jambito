import {
  initializeApp,
  cert,
  getApps,
  getApp,
  type App,
  type Credential,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Server-side Firebase Admin SDK. Used to verify client ID tokens so that
 * trial usage and subscriptions are enforced server-side (not in the browser).
 *
 * Credentials (either/or):
 *   - FIREBASE_SERVICE_ACCOUNT   -> full service-account JSON string (Vercel)
 *   - GOOGLE_APPLICATION_CREDENTIALS -> path to the downloaded JSON key file (local dev)
 *
 * If neither is usable the app is initialised with the project ID alone.
 * `verifyIdToken()` only needs the project ID (to validate `aud`/`iss`) plus
 * Google's public certificates, which are fetched anonymously, so ID-token
 * verification keeps working without a secret in the environment. Any other
 * Admin API (Firestore, user management, custom claims) would still require the
 * service account.
 *
 * This fallback matters because GOOGLE_APPLICATION_CREDENTIALS points at a
 * gitignored JSON key, so deployed builds never contain it: without the
 * fallback every authenticated route answered 401 and the trial gate, the
 * profile and the payment flow were dead in production.
 */

function readServiceAccountFile(credPath: string): ServiceAccount | null {
  const resolved = path.isAbsolute(credPath)
    ? credPath
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), credPath);
  try {
    return JSON.parse(readFileSync(resolved, "utf8")) as ServiceAccount;
  } catch (error) {
    console.error(
      `[firebaseAdmin] Could not read the service account file at ${resolved}:`,
      error
    );
    return null;
  }
}

function buildCredential(): Credential | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount);
    } catch (error) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON:", error);
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const serviceAccount = readServiceAccountFile(credPath);
    if (serviceAccount) return cert(serviceAccount);
    console.error(
      "[firebaseAdmin] GOOGLE_APPLICATION_CREDENTIALS is set but unreadable — it points at a " +
        "gitignored local file, so deployed builds do not contain it. Falling back to " +
        "project-ID-only initialisation; set FIREBASE_SERVICE_ACCOUNT for full Admin access."
    );
  }

  return undefined;
}

/** Project ID (public information) used to validate a token's `aud`/`iss`. */
function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    undefined
  );
}

let adminApp: App | null = null;
/** Memoised so the (potentially costly, file-reading) lookup runs once. */
let credentialResolved = false;
let cachedCredential: Credential | undefined;

/** Resolves the service-account credential once per server process. */
export function resolveCredential(): Credential | undefined {
  if (!credentialResolved) {
    cachedCredential = buildCredential();
    credentialResolved = true;
  }
  return cachedCredential;
}

/**
 * True when a real service account is available. ID-token verification works
 * without one (see the file header), but user management — disabling a blocked
 * account, revoking its refresh tokens or deleting it outright — does not, so
 * callers must know whether their action was actually applied at Firebase.
 */
export function hasServiceAccount(): boolean {
  return Boolean(resolveCredential());
}

export function getAdminApp(): App {
  if (!adminApp) {
    adminApp = getApps().length
      ? getApp()
      : initializeApp(buildOptions(resolveCredential()));
  }
  return adminApp;
}

function buildOptions(credential: Credential | undefined) {
  if (credential) return { credential };
  const projectId = resolveProjectId();
  return projectId ? { projectId } : {};
}

/** Verifies a Firebase ID token. Returns the decoded token or null on failure. */
export async function verifyIdToken(
  token: string | null | undefined
): Promise<DecodedIdToken | null> {
  if (!token) return null;
  try {
    return await getAuth(getAdminApp()).verifyIdToken(token);
  } catch (error) {
    // Never fail silently: a missing/misconfigured credential turns the whole
    // server-side trial gate into a no-op while callers only ever see
    // "unauthorized", which is invisible in production.
    console.error("[firebaseAdmin] verifyIdToken failed:", error);
    return null;
  }
}

/** Outcome of a best-effort Firebase-side account change. */
export interface FirebaseUserActionResult {
  /** True when the change was applied at Firebase. */
  ok: boolean;
  /** True when it was intentionally skipped (no service account configured). */
  skipped: boolean;
  /** Human-readable detail for the admin dashboard / audit log. */
  message: string;
}

function skipped(reason: string): FirebaseUserActionResult {
  return {
    ok: false,
    skipped: true,
    message: `Not applied at Firebase: ${reason}`,
  };
}

function failed(error: unknown): FirebaseUserActionResult {
  const code = (error as { code?: string })?.code ?? "error";
  const message = (error as { message?: string })?.message ?? String(error);
  return { ok: false, skipped: false, message: `${code}: ${message}` };
}

/**
 * Disables (or re-enables) the Firebase account and, when disabling, revokes its
 * refresh tokens so existing sessions cannot outlive the block.
 *
 * Best effort by design: MongoDB holds the authorising `status` check, so a
 * deployment without FIREBASE_SERVICE_ACCOUNT still enforces the lockout on
 * every API call — but the admin is told the sign-in level was not applied
 * instead of being shown a lockout that does not exist.
 */
export async function setFirebaseUserDisabled(
  uid: string,
  disabled: boolean
): Promise<FirebaseUserActionResult> {
  if (!hasServiceAccount()) {
    return skipped("FIREBASE_SERVICE_ACCOUNT is not configured");
  }
  try {
    const auth = getAuth(getAdminApp());
    await auth.updateUser(uid, { disabled });
    if (disabled) {
      // A disabled account keeps any already-issued ID token valid for up to an
      // hour; revoking refresh tokens stops it being renewed.
      await auth.revokeRefreshTokens(uid).catch(() => undefined);
    }
    return {
      ok: true,
      skipped: false,
      message: disabled
        ? "Firebase account disabled and refresh tokens revoked."
        : "Firebase account re-enabled.",
    };
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/user-not-found") {
      // No Firebase account left to disable: the Mongo status still gates access.
      return { ok: false, skipped: true, message: "No Firebase account for this uid." };
    }
    return failed(error);
  }
}


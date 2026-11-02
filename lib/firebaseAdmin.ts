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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Server-side Firebase Admin SDK. Used to verify client ID tokens so that
 * trial usage and subscriptions are enforced server-side (not in the browser).
 *
 * Credentials, by where the code runs:
 *   - FIREBASE_SERVICE_ACCOUNT        -> the service-account JSON itself.
 *                                        The only source that works when
 *                                        deployed (Vercel).
 *   - GOOGLE_APPLICATION_CREDENTIALS  -> PATH to the downloaded JSON key file.
 *                                        Local development only: the key is
 *                                        gitignored, so a deployment can never
 *                                        contain it.
 *
 * If neither is usable the app is initialised with the project ID alone.
 * `verifyIdToken()` only needs the project ID (to validate `aud`/`iss`) plus
 * Google's public certificates, which are fetched anonymously, so ID-token
 * verification keeps working without a secret in the environment. Any other
 * Admin API (Firestore, user management, custom claims) would still require the
 * service account.
 *
 * The project-ID fallback matters because a deployed build has no key file:
 * without it every authenticated route answered 401 and the trial gate, the
 * profile and the payment flow were dead in production. What it does NOT cover
 * is mirroring an account lockout to Firebase — see `setFirebaseUserDisabled()`
 * and `getCredentialStatus()`.
 */

/**
 * Deployed functions (Vercel, Lambda) are immutable snapshots of the committed
 * repository, so a gitignored key file can never be part of one. Detected
 * explicitly so a deployed build can skip the filesystem entirely instead of
 * logging an ENOENT on every cold start.
 */
const IS_SERVERLESS =
  Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Which source produced the Admin credential (see `getCredentialStatus`). */
export type CredentialSource =
  | "FIREBASE_SERVICE_ACCOUNT"
  | "GOOGLE_APPLICATION_CREDENTIALS"
  | "project-id-only";

let credentialSource: CredentialSource = "project-id-only";
/** Why no full service account was obtained, when one was expected. */
let credentialError: string | null = null;

/**
 * The service-account JSON as downloaded from the Firebase console, i.e. with
 * snake_case keys. `cert()` maps those onto its camelCase `ServiceAccount`
 * fields internally (`new ServiceAccount(json)` in
 * firebase-admin/lib/app/credential-internal.js), which is why the raw shape is
 * what both the env var and the key file must provide.
 */
interface RawServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

/**
 * Parses service-account JSON from an environment variable or a key file.
 *
 * Tolerates the usual dashboard-paste damage: a key pasted through an env-var
 * UI or a shell often arrives double-escaped, so `private_key` holds a literal
 * `\n` instead of real newlines. `cert()` would then fail deep inside Google's
 * signer with an opaque error, so the escapes are repaired here.
 */
function parseServiceAccount(raw: string, origin: string): ServiceAccount | null {
  try {
    const json = JSON.parse(raw) as RawServiceAccount;
    if (!json?.project_id || !json?.client_email || !json?.private_key) {
      throw new Error("missing project_id, client_email or private_key");
    }
    if (!json.private_key.includes("\n") && json.private_key.includes("\\n")) {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    // Cast because the exported type is camelCase while `cert()` reads the raw
    // snake_case keys — the same object the downloaded key file contains.
    return json as unknown as ServiceAccount;
  } catch (error) {
    credentialError = `${origin} is not a usable service account: ${
      (error as Error)?.message ?? String(error)
    }`;
    console.error(`[firebaseAdmin] ${credentialError}`);
    return null;
  }
}

function readServiceAccountFile(credPath: string): ServiceAccount | null {
  const resolved = path.isAbsolute(credPath)
    ? credPath
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), credPath);
  if (!existsSync(resolved)) {
    credentialError = `GOOGLE_APPLICATION_CREDENTIALS points at a file that does not exist: ${resolved}`;
    console.warn(`[firebaseAdmin] ${credentialError}`);
    return null;
  }
  let text: string;
  try {
    text = readFileSync(resolved, "utf8");
  } catch (error) {
    credentialError = `Could not read the service account file at ${resolved}`;
    console.error(`[firebaseAdmin] ${credentialError}:`, error);
    return null;
  }
  return parseServiceAccount(text, `The service account file at ${resolved}`);
}

function buildCredential(): Credential | undefined {
  credentialError = null;
  credentialSource = "project-id-only";

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (serviceAccountJson) {
    const serviceAccount = parseServiceAccount(
      serviceAccountJson,
      "FIREBASE_SERVICE_ACCOUNT"
    );
    if (serviceAccount) {
      credentialSource = "FIREBASE_SERVICE_ACCOUNT";
      return cert(serviceAccount);
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credPath) return undefined;

  // The path form only ever works from a workstation (see IS_SERVERLESS).
  // Reading it on a deployed build produced an ENOENT plus the misleading
  // "unreadable" error on every cold start, so skip it and state the actual
  // remedy once instead — buildCredential() runs once per server process.
  if (IS_SERVERLESS) {
    credentialError =
      "GOOGLE_APPLICATION_CREDENTIALS is a local file path and is ignored here: " +
      "the key is gitignored, so it is not part of a deployment.";
    console.warn(
      `[firebaseAdmin] ${credentialError} Remove it from the Vercel environment ` +
        "variables and set FIREBASE_SERVICE_ACCOUNT (the JSON itself) for full " +
        "Admin access. ID-token verification keeps working from the public " +
        "project ID alone, so sign-in is unaffected."
    );
    return undefined;
  }

  const serviceAccount = readServiceAccountFile(credPath);
  if (serviceAccount) {
    credentialSource = "GOOGLE_APPLICATION_CREDENTIALS";
    return cert(serviceAccount);
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

/** Everything `/api/health` needs to explain the Admin SDK's state. */
export interface CredentialStatus {
  /** Which env var (or fallback) supplied the credential. */
  source: CredentialSource;
  /** True when a real service account is in use, not the project-ID fallback. */
  hasServiceAccount: boolean;
  /** Project ID used for `aud`/`iss` validation, when one could be resolved. */
  projectId: string | null;
  /** True on Vercel/Lambda, where a key file can never be part of the build. */
  serverless: boolean;
  /** Why no service account was obtained, when one was expected but unusable. */
  error: string | null;
}

/**
 * Resolved credential state, for diagnostics.
 *
 * Deliberately reports what the SDK actually got rather than which env vars
 * exist: a present-but-invalid FIREBASE_SERVICE_ACCOUNT, or a
 * GOOGLE_APPLICATION_CREDENTIALS path that only exists on a workstation, used
 * to look healthy while every Firebase-side admin action was silently skipped.
 */
export function getCredentialStatus(): CredentialStatus {
  // Resolve FIRST: it is what sets credentialSource / credentialError (they are
  // populated lazily inside buildCredential, on this first call).
  const hasServiceAccount = Boolean(resolveCredential());
  return {
    source: credentialSource,
    hasServiceAccount,
    projectId: resolveProjectId() ?? null,
    serverless: IS_SERVERLESS,
    error: credentialError,
  };
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


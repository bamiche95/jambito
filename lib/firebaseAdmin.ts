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

export function getAdminApp(): App {
  if (!adminApp) {
    const credential = buildCredential();
    adminApp = getApps().length ? getApp() : initializeApp(buildOptions(credential));
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


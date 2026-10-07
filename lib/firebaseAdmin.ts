import {
  initializeApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import path from "node:path";

/**
 * Server-side Firebase Admin SDK. Used to verify client ID tokens so that
 * trial usage and subscriptions are enforced server-side (not in the browser).
 *
 * Credentials (either/or):
 *   - FIREBASE_SERVICE_ACCOUNT   -> full service-account JSON string (Vercel)
 *   - GOOGLE_APPLICATION_CREDENTIALS -> path to the downloaded JSON key file
 */

function buildCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (error) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON:", error);
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const resolved = path.isAbsolute(credPath)
      ? credPath
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), credPath);
    return cert(resolved);
  }

  return undefined;
}

let adminApp: App | null = null;

export function getAdminApp(): App {
  if (!adminApp) {
    const credential = buildCredential();
    adminApp = credential ? initializeApp({ credential }) : initializeApp();
  }
  return adminApp;
}

/** Verifies a Firebase ID token. Returns the decoded token or null on failure. */
export async function verifyIdToken(
  token: string | null | undefined
): Promise<DecodedIdToken | null> {
  if (!token) return null;
  try {
    return await getAuth(getAdminApp()).verifyIdToken(token);
  } catch {
    return null;
  }
}

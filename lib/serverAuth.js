import { verifyIdToken } from "@/lib/firebaseAdmin";
import { ensureUser } from "@/lib/users";

/**
 * Shared auth helpers for API route handlers. All protected endpoints verify
 * the Firebase ID token and resolve the corresponding MongoDB user doc.
 */

export async function getBearerToken(request) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export async function getDecodedUser(request) {
  const token = await getBearerToken(request);
  if (!token) return null;
  return verifyIdToken(token);
}

/** Returns `{ decoded, user }` or `null` if the token is missing/invalid. */
export async function requireUser(request) {
  const decoded = await getDecodedUser(request);
  if (!decoded) return null;
  const user = await ensureUser(decoded);
  return { decoded, user };
}

/** Returns `{ decoded, user }` only if the caller is an admin, else `null`. */
export async function requireAdmin(request) {
  const auth = await requireUser(request);
  if (!auth || auth.user?.role !== "admin") return null;
  return auth;
}

/**
 * Route-handler friendly wrap around `requireUser` that also distinguishes
 * "no valid token" from "the Admin SDK / database is unavailable", so callers
 * can answer 401 or 503 instead of an opaque 500. Returning 503 keeps the
 * failure loud: a broken Admin SDK must never look like a billing decision.
 */
export async function requireApiUser(request) {
  try {
    const auth = await requireUser(request);
    if (!auth) {
      return {
        ok: false,
        status: 401,
        code: "unauthorized",
        message: "Unauthorized",
      };
    }
    return { ok: true, decoded: auth.decoded, user: auth.user };
  } catch (error) {
    console.error("requireApiUser failed:", error);
    return {
      ok: false,
      status: 503,
      code: "auth_unavailable",
      message: "Unable to verify your account right now. Please retry.",
    };
  }
}

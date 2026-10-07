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

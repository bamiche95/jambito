import { verifyIdToken } from "@/lib/firebaseAdmin";
import { ensureUser } from "@/lib/users";
import {
  accountStatusError,
  canStartPayment,
  canUseProduct,
  canViewProfile,
  getAccountStatus,
} from "@/lib/accountStatus";

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

/**
 * Returns `{ decoded, user }` or `null` if the token is missing/invalid.
 *
 * Deliberately status-agnostic: this is what the admin dashboard uses, so a
 * blocked admin can always reach the dashboard. Product endpoints must use one
 * of the status-checking wrappers below instead.
 */
export async function requireUser(request) {
  const decoded = await getDecodedUser(request);
  if (!decoded) return null;
  const user = await ensureUser(decoded);
  return { decoded, user };
}

/**
 * The single choke point for account-state enforcement.
 *
 * `allowed` decides whether the caller's `status` may use this endpoint. The
 * status lives in MongoDB (not Firebase), so the lockout holds even on a
 * deployment without a service account - where the Firebase-side disable can
 * only ever be best effort.
 */
async function requireAccount(request, allowed) {
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
    const status = getAccountStatus(auth.user);
    if (!allowed(status)) {
      return { ok: false, ...accountStatusError(status) };
    }
    return { ok: true, decoded: auth.decoded, user: auth.user, status };
  } catch (error) {
    console.error("requireAccount failed:", error);
    return {
      ok: false,
      status: 503,
      code: "auth_unavailable",
      message: "Unable to verify your account right now. Please retry.",
    };
  }
}

/**
 * Route-handler friendly wrap around `requireUser` that also distinguishes
 * "no valid token" from "the Admin SDK / database is unavailable", so callers
 * can answer 401 or 503 instead of an opaque 500. Returning 503 keeps the
 * failure loud: a broken Admin SDK must never look like a billing decision.
 *
 * Active accounts only: blocked, deactivated and deleted accounts get a 403
 * carrying an `account_*` code. Used by the question and trial endpoints.
 */
export async function requireApiUser(request) {
  return requireAccount(request, canUseProduct);
}

/**
 * Payment initialization. A deactivated account may still pay because that is
 * the documented way back in; blocked/deleted accounts never reach checkout.
 */
export async function requirePaymentUser(request) {
  return requireAccount(request, canStartPayment);
}

/**
 * The signed-in user's own profile. Blocked accounts can still read theirs so
 * the UI can explain the lockout; deleted tombstones cannot.
 */
export async function requireProfileUser(request) {
  return requireAccount(request, canViewProfile);
}

/**
 * Returns `{ decoded, user }` only if the caller is an admin, else `null`.
 *
 * Role-only on purpose (account status is ignored): admin endpoints must stay
 * reachable so a mistake can always be reversed - blocking the last admin would
 * otherwise make the dashboard permanently unreachable.
 */
export async function requireAdmin(request) {
  const auth = await requireUser(request);
  if (!auth || auth.user?.role !== "admin") return null;
  return auth;
}


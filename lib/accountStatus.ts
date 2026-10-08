/**
 * Account lifecycle states, shared by the server-side gate (lib/serverAuth.js),
 * the admin dashboard and the client UI.
 *
 * Kept dependency-free — same reason as lib/plans.ts — so `.js` route handlers
 * and `.tsx` client components can both import it.
 *
 *  active       normal account.
 *  deactivated  access paused by an admin; the subscription dates are preserved
 *               so the user can reactivate by subscribing again.
 *  blocked      punitive lockout: no product access, payment refused, and the
 *               Firebase account is disabled when a service account is available.
 *  deleted      soft-delete tombstone: PII scrubbed, the document is kept so
 *               `ensureUser()` can never resurrect the account (and hand out a
 *               fresh free trial) if a stale token shows up again.
 */

export type AccountStatus = "active" | "deactivated" | "blocked" | "deleted";

export const ACCOUNT_STATUSES: AccountStatus[] = [
  "active",
  "deactivated",
  "blocked",
  "deleted",
];

export const DEFAULT_ACCOUNT_STATUS: AccountStatus = "active";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  deactivated: "Deactivated",
  blocked: "Blocked",
  deleted: "Deleted",
};

/** API `code` returned for each refusing state — also the client's key. */
export const ACCOUNT_STATUS_CODES: Record<AccountStatus, string | null> = {
  active: null,
  deactivated: "account_deactivated",
  blocked: "account_blocked",
  deleted: "account_deleted",
};

export function normalizeAccountStatus(value: unknown): AccountStatus {
  return ACCOUNT_STATUSES.includes(value as AccountStatus)
    ? (value as AccountStatus)
    : DEFAULT_ACCOUNT_STATUS;
}

/**
 * Status of a user document. Missing/unknown values mean `active` so documents
 * written before this feature existed keep working untouched.
 */
export function getAccountStatus(
  user?: { status?: unknown } | null
): AccountStatus {
  return normalizeAccountStatus(user?.status);
}

export function isAccountActive(user?: { status?: unknown } | null): boolean {
  return getAccountStatus(user) === "active";
}

/** Question sets and the trial quota: active accounts only. */
export function canUseProduct(status: AccountStatus): boolean {
  return status === "active";
}

/**
 * Payment initialization: a deactivated account may still pay — that is the
 * documented self-reactivation path. Blocked/deleted accounts never can.
 */
export function canStartPayment(status: AccountStatus): boolean {
  return status === "active" || status === "deactivated";
}

/**
 * Reading your own profile stays possible while blocked so the UI can explain
 * why nothing works; a deleted tombstone has no profile to show.
 */
export function canViewProfile(status: AccountStatus): boolean {
  return status !== "deleted";
}

export function accountStatusMessage(status: AccountStatus): string {
  switch (status) {
    case "blocked":
      return "This account has been blocked. Contact support if you believe this is a mistake.";
    case "deactivated":
      return "This account has been deactivated. Subscribe again to restore access.";
    case "deleted":
      return "This account no longer exists.";
    default:
      return "";
  }
}

/** `{ status, code, message }` for the 403 body of a refusing endpoint. */
export function accountStatusError(status: AccountStatus): {
  status: number;
  code: string;
  message: string;
} {
  return {
    status: 403,
    code: ACCOUNT_STATUS_CODES[status] ?? "account_unavailable",
    message: accountStatusMessage(status),
  };
}

/** Maps an API error `code` back to the state, for the client context. */
export function accountStatusFromCode(code: unknown): AccountStatus | null {
  const entry = ACCOUNT_STATUSES.find(
    (status) => ACCOUNT_STATUS_CODES[status] === code
  );
  return entry ?? null;
}

import type {
  AdminActionPayload,
  AdminPricingPayload,
  AdminUsersPayload,
  AuditPayload,
  PaymentRecord,
  PaymentsPayload,
  PricingPayload,
  ReconcilePayload,
} from "./types";

/**
 * Typed client for the admin endpoints.
 *
 * No dependency is added for this: every call is a plain `fetch` with the
 * caller's Firebase ID token, `cache: "no-store"`, and a result object that
 * always carries something displayable — the dashboard must never show a
 * blank failure.
 */

export interface AdminApiResult<T> {
  /** True only when the request succeeded AND the API said `success: true`. */
  ok: boolean;
  status: number;
  data: T | null;
  message: string;
  /** API error code, e.g. `already_granted`, `managed_by_env`. */
  code?: string;
}

async function adminRequest<T>(
  path: string,
  token: string | null,
  init: RequestInit = {}
): Promise<AdminApiResult<T>> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: null,
      message: "Your session expired. Sign in again.",
    };
  }

  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let data: (T & { success?: boolean; message?: string; code?: string }) | null =
      null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    const ok = res.ok && data?.success !== false;
    return {
      ok,
      status: res.status,
      data: data as T | null,
      code: data?.code,
      message:
        data?.message ??
        (res.status === 403
          ? "Admin access required."
          : ok
            ? ""
            : `Request failed (${res.status}).`),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      message: "Network error — check your connection and try again.",
    };
  }
}

export function adminGet<T>(path: string, token: string | null) {
  return adminRequest<T>(path, token, { method: "GET" });
}

export function adminPost<T>(
  path: string,
  token: string | null,
  body: Record<string, unknown> = {}
) {
  return adminRequest<T>(path, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Query-string builder that drops empty values. */
export function adminQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function formatNaira(amount: number): string {
  return `₦${Number(amount || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

/** "in 12 days" / "expired 3 days ago" for subscription windows. */
export function formatRelativeDays(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "—";
  const days = Math.round((date - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
}

export type {
  AdminActionPayload,
  AdminPricingPayload,
  AdminUsersPayload,
  AuditPayload,
  PaymentRecord,
  PaymentsPayload,
  PricingPayload,
  ReconcilePayload,
};

"use client";

import type {
  NotificationPrefs,
  PushState,
  PushTestResult,
} from "@/lib/types";

/**
 * The browser half of Web Push.
 *
 * Three rules this file exists to keep:
 *
 * 1. Permission is asked for exactly once per browser, and a "block" is
 *    permanent until the user digs into site settings. So `enablePush` is only
 *    ever called from a tap, never on mount, and `getPushPermission()` reports
 *    "denied" so the UI can explain the fix instead of showing a dead button.
 * 2. The VAPID public key comes from the server (`GET /api/push`) instead of a
 *    `NEXT_PUBLIC_*` value, so it can be rotated without a rebuild.
 * 3. The subscription belongs to the account that requested it. Enrolling and
 *    re-enrolling always POST with the Firebase ID token.
 */

const DEVICE_ID_KEY = "jambito:device-id";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

/** `unsupported` covers iOS Safari in a tab, which has no PushManager at all. */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** A stable per-browser id, so the same phone is recognisable between visits. */
export function getDeviceId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Private mode: an unidentifiable device is still a usable device.
    return "unknown-device";
  }
}

export function platformLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

/**
 * The VAPID key arrives base64url; `applicationServerKey` wants raw bytes.
 * Backed by an explicit ArrayBuffer so the type is a `BufferSource` on every
 * TypeScript version rather than a possibly-shared `Uint8Array`.
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Server-side state for this account: config, prefs, registered devices. */
export async function fetchPushState(token: string): Promise<PushState | null> {
  try {
    const response = await fetch("/api/push", { headers: authHeaders(token) });
    if (!response.ok) return null;
    const json = (await response.json()) as PushState;
    return json?.success ? json : null;
  } catch {
    return null;
  }
}

export interface PushActionResult {
  ok: boolean;
  code?: string;
  message?: string;
  /** True when this browser is now registered, false after a disable. */
  subscribed?: boolean;
}

/**
 * Asks for permission (if never asked), subscribes, and stores the result.
 * MUST be called from a user gesture on iOS — a programmatic request is
 * silently ignored there.
 */
export async function enablePush(token: string): Promise<PushActionResult> {
  if (!isPushSupported()) {
    return {
      ok: false,
      code: "unsupported",
      message:
        "This browser cannot show notifications. On iPhone, install the app to your home screen first.",
    };
  }

  const state = await fetchPushState(token);
  if (!state?.configured || !state.publicKey) {
    return {
      ok: false,
      code: "push_unconfigured",
      message: "Notifications are not available on this deployment yet.",
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      code: permission === "denied" ? "permission_denied" : "permission_dismissed",
      message:
        permission === "denied"
          ? "Notifications are blocked for this site. Open your browser's site settings to allow them."
          : "No problem — you can turn reminders on any time from your profile.",
    };
  }

  const registration = await getRegistration();
  if (!registration) {
    return {
      ok: false,
      code: "no_service_worker",
      message: "The app is still starting up. Try again in a moment.",
    };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.publicKey),
      });
    } catch (error) {
      return {
        ok: false,
        code: "subscribe_failed",
        message: `The browser refused to subscribe: ${(error as Error)?.message ?? "unknown error"}`,
      };
    }
  }

  try {
    const response = await fetch("/api/push", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        deviceId: getDeviceId(),
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.success) {
      return {
        ok: false,
        code: json?.code ?? "store_failed",
        message: json?.message ?? "The subscription could not be saved.",
      };
    }
    return { ok: true, subscribed: true };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not reach the server. Check your connection and retry.",
    };
  }
}

/**
 * Undo: drop the browser subscription and retire the row server-side.
 *
 * Both halves matter. Unsubscribing in the browser alone leaves a row the
 * campaign runner would keep trying; retiring the row alone leaves the browser
 * subscribed, so the next `syncPushSubscription` (or a silent push) revives it.
 * The server call goes first because it is the one that can fail.
 */
export async function disablePush(token: string): Promise<PushActionResult> {
  const registration = isPushSupported() ? await getRegistration() : null;
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;

  try {
    const response = await fetch(
      endpoint ? `/api/push?endpoint=${encodeURIComponent(endpoint)}` : "/api/push?all=1",
      { method: "DELETE", headers: authHeaders(token) }
    );
    if (!response.ok) {
      return {
        ok: false,
        code: "revoke_failed",
        message: "Could not turn reminders off. Please retry.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not reach the server. Check your connection and retry.",
    };
  }

  await subscription?.unsubscribe().catch(() => undefined);
  return { ok: true, subscribed: false };
}

/**
 * Called on every app start once permission is already granted.
 *
 * Two jobs: make sure the browser still holds a subscription (Chrome drops it
 * silently when site data is cleared) and make sure the server knows about it
 * (this may be the first visit for the signed-in account). Failures are
 * ignored — a missing reminder is not worth a visible error on the home page.
 */
export async function syncPushSubscription(token: string): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const registration = await getRegistration();
  if (!registration) return;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    // Cheap idempotent upsert: refreshes `lastSeenAt` and un-revokes a row that
    // was retired by a 410 while this browser still believes it is subscribed.
    await fetch("/api/push", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ subscription: existing.toJSON(), deviceId: getDeviceId() }),
    }).catch(() => undefined);
    return;
  }

  await enablePush(token);
}

/** Sends one notification to this account's devices (the "did it work?" button). */
export async function sendTestPush(token: string): Promise<PushTestResult> {
  try {
    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({}),
    });
    const json = (await response.json().catch(() => ({}))) as PushTestResult;
    return { ...json, success: Boolean(json?.success) };
  } catch {
    return {
      success: false,
      code: "network",
      message: "Could not reach the server. Check your connection and retry.",
    };
  }
}

/** Per-campaign opt-ins. A failure is returned, never thrown. */
export async function saveNotificationPrefs(
  token: string,
  patch: Partial<NotificationPrefs>
): Promise<{ ok: boolean; prefs?: NotificationPrefs; message?: string }> {
  try {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ notificationPrefs: patch }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.success) {
      return { ok: false, message: json?.message ?? "Could not save that setting." };
    }
    return { ok: true, prefs: json.notificationPrefs as NotificationPrefs };
  } catch {
    return { ok: false, message: "Could not reach the server. Please retry." };
  }
}

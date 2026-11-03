"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { enablePush, isPushSupported, syncPushSubscription } from "@/lib/pushClient";

/**
 * Keeps this browser's push subscription in step with the signed-in account.
 *
 * Mounted inside AuthProvider (it needs the ID token) and renders nothing. Two
 * things happen here, both silently:
 *
 *   1. On sign-in / app start, `syncPushSubscription` re-asserts a subscription
 *      that already has permission. Chrome clears subscriptions when site data
 *      is cleared, and a device can be signed in for the first time, so the
 *      server-side row has to be refreshed either way.
 *   2. The worker cannot re-subscribe by itself when Chrome rotates an
 *      endpoint (it has no Firebase token), so `pushsubscriptionchange` asks
 *      any open page to do it — that is the message handled below.
 *
 * Neither path can show a permission prompt: both bail out unless permission is
 * already "granted". The prompt belongs to the tap on PushOptInCard.
 */
export default function PushSync() {
  const { user, getIdToken } = useAuth();

  useEffect(() => {
    if (!user || !isPushSupported()) return;
    let cancelled = false;

    getIdToken()
      .then((token) => {
        if (cancelled || !token) return undefined;
        return syncPushSubscription(token);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [getIdToken, user]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type !== "push:subscription-changed") return;
      // Permission is already granted on this path, so `enablePush` skips the
      // prompt and only re-registers + upserts the row.
      void getIdToken().then((token) => (token ? enablePush(token) : undefined));
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [getIdToken]);

  return null;
}

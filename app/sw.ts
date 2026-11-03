/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { Serwist, NetworkFirst, NetworkOnly, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Responses that must never be served from a cache.
//
// The private ones: the default `apis` rule is NetworkFirst with a 24h
// expiration, so a stale (or, on a shared device, another account's)
// trial/subscription payload would be replayed whenever the network fails or is
// slow.
//
// /api/pricing is public but is in the same list for a different reason: a
// cached price is a promise the checkout cannot keep. The server charges
// whatever is in the database at the moment a payment starts, so an offline or
// slow-network read that fell back to a 24h-old figure would quote the student
// one amount and charge them another.
//
// /api/contact is here because its GET is not a resource at all — it mints a
// signed, short-lived timing token (see lib/contactGuard.js). The default
// `apis` rule would happily replay a 24h-old token, which is both expired and
// the exact opposite of what the anti-bot check needs.
//
// /api/practice and /api/cron are here for the same "never from a cache" reason:
// practice holds one account's scores and answers, and a cron trigger replayed
// from a cache would report a run that never happened.
//
// /api/push is the subscription and preference state for one account. A cached
// "you have 2 devices" answer would make the profile page claim notifications
// are on after they were revoked on another device.
const privateApiNetworkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/(?:trial|profile|payments|pricing|admin|contact|welcome|practice|cron|push)(?:\/|$)/.test(
        url.pathname
      ),
    method: "GET",
    handler: new NetworkOnly(),
  },
];

// Pixels and other third-party beacons must never come from a cache.
//
// The default `cross-origin` rule is NetworkFirst with a 1h expiration, and it
// matches every cross-origin GET — which includes both halves of the Meta Pixel:
// `connect.facebook.net/en_US/fbevents.js` and the `/tr/` event beacons. Caching
// them is wrong twice over. `fbevents.js` is updated in place by Meta without
// the URL changing, so a cached copy can go stale and silently stop sending
// events; and the beacons are one-shot URLs whose responses mean nothing, so a
// cache replay would fill the cache with dead entries while the event never
// actually reached Meta.
const thirdPartyBeaconNetworkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url }) =>
      url.hostname === "connect.facebook.net" ||
      url.hostname.endsWith(".facebook.com"),
    method: "GET",
    handler: new NetworkOnly(),
  },
];

// Network-first for the question API (true offline access is handled client-side
// via IndexedDB — see lib/offlineStore.ts).
const questionApiCache: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname === "/api/questions",
    method: "GET",
    handler: new NetworkFirst({
      cacheName: "questions-api",
      networkTimeoutSeconds: 8,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...thirdPartyBeaconNetworkOnly,
    ...privateApiNetworkOnly,
    ...questionApiCache,
    ...defaultCache,
  ],
});

serwist.addEventListeners();

/* --------------------------------------------------------------------------
 * Web Push
 *
 * There is no push library in the worker on purpose: the Fetch API and
 * `showNotification` are all a notification needs, and anything extra would be
 * another bundle in a 1 MB offline install.
 *
 * The `push` handler below is REQUIRED to call showNotification. Chrome on
 * Android replaces the notification with a generic "This site has been updated
 * in the background" notice when a push arrives and no notification is shown,
 * which looks like a bug and cannot be tapped through to the app.
 * ----------------------------------------------------------------------- */

/** What POST /api/push/test and the campaign runner send. Flat, and under 4 KB. */
interface PushPayload {
  title?: string;
  body?: string;
  /** Same-origin path the tap should open. */
  url?: string;
  /** Replaces a previous notification with the same tag instead of stacking. */
  tag?: string;
}

const DEFAULT_ICON = "/icons/icon-192.png";

function readPushPayload(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? (parsed as PushPayload) : {};
  } catch {
    // A plain-text push (handy from `npx web-push` while setting up) still
    // deserves a notification rather than a silent drop.
    return { body: event.data.text().slice(0, 200) };
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = readPushPayload(event);
  const title = payload.title?.trim() || "CBT-Practice";
  const body =
    payload.body?.trim() ||
    "Time to practise — a 20-question set now beats cramming later.";
  const tag = payload.tag?.trim() || "cbtpractice";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: DEFAULT_ICON,
      badge: DEFAULT_ICON,
      tag,
      // `renotify` is only honoured with a tag, and we always set one: two
      // reminders must not silently collapse into one.
      renotify: true,
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const target = new URL(data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer the tab already showing the destination, then any tab of ours.
      // Opening a second copy of the app is the one thing that feels wrong on
      // a phone with the PWA installed.
      const exact = clients.find((client) => client.url === target);
      if (exact) {
        await exact.focus();
        return;
      }

      const ours = clients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      if (ours) {
        await ours.focus();
        await ours.navigate(target).catch(() => undefined);
        return;
      }

      await self.clients.openWindow(target);
    })()
  );
});

/**
 * Chrome rotates a push subscription on its own schedule (and after a browser
 * update). The worker cannot re-subscribe by itself: it has no Firebase token,
 * and the new subscription must be stored against the right account. So it asks
 * an open page to do it — see `syncPushSubscription` in lib/pushClient.ts.
 * With no page open the old endpoint is simply dead, and the next visit
 * re-registers from scratch.
 *
 * `pushsubscriptionchange` is missing from the TypeScript worker event map, so
 * the listener is registered through a narrow cast rather than a `@ts-expect-error`
 * that would hide a real mistake later.
 */
const subscriptionChangeTarget = self as unknown as {
  addEventListener: (type: string, listener: (event: ExtendableEvent) => void) => void;
};

subscriptionChangeTarget.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "push:subscription-changed" });
      }
    })()
  );
});


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
const privateApiNetworkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      /^\/api\/(?:trial|profile|payments|pricing|admin|contact|welcome)(?:\/|$)/.test(
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

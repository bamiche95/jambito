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

// Private, per-user API responses must never be served from a cache: the
// default `apis` rule is NetworkFirst with a 24h expiration, so a stale (or,
// on a shared device, another account's) trial/subscription payload would be
// replayed whenever the network fails or is slow.
const privateApiNetworkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && /^\/api\/(?:trial|profile|payments|admin)(?:\/|$)/.test(url.pathname),
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
  runtimeCaching: [...privateApiNetworkOnly, ...questionApiCache, ...defaultCache],
});

serwist.addEventListeners();

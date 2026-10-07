import { serwist } from "@serwist/next/config";

/**
 * Serwist "configurator mode" — Turbopack-compatible service worker build.
 *
 * Run via `serwist build` (see package.json scripts) which bundles `app/sw.ts`
 * into `public/sw.js` and injects the precache manifest after Next.js has
 * prerendered all routes.
 */
export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: true,
});

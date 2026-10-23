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
  /*
   * The syllabus tree prerenders ~756 pages (index + exam + 25 subjects + 729
   * topics). Precaching them would add megabytes to `sw.js` and to every
   * install for reference content students read once, so keep them out of the
   * precache. They still hit the network normally and are picked up by the
   * defaultCache NetworkFirst document strategy after the first visit.
   */
  globIgnores: [
    ".next/server/app/syllabus.html",
    ".next/server/app/syllabus/**",
  ],
});

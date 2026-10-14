/* eslint-disable @next/next/no-before-interactive-script-outside-document --
   That rule is about the Pages Router, where `beforeInteractive` only works from
   `pages/_document.js`. This is the App Router: the root layout is the
   equivalent of `_document`, and `beforeInteractive` is exactly how Next's own
   docs add an early third-party script to the document's `<head>`. */
import Script from "next/script";
import { META_PIXEL_ID, metaPixelSnippet } from "@/lib/metaPixel";

/**
 * Meta (Facebook) Pixel — Meta's base code, executed in the document `<head>`
 * before the application starts.
 *
 * There is no HTML file to paste into: the App Router owns `<head>`, and the
 * supported way to add your own script to it is `next/script` with
 * `strategy="beforeInteractive"` from the root layout. What the server sends is a
 * one-line placeholder in the body; the Next runtime turns it into the real
 * inline `<script id="meta-pixel">`, appends that to `<head>`, and runs it before
 * it hydrates anything. So the base code runs before any application code — the
 * earliest a third-party snippet can run here, which is what Meta's "add it to
 * your <head> as high as possible" instruction is really after. The pixel's own
 * loader is still async, so nothing is blocked while `fbevents.js` downloads.
 *
 * Two footnotes:
 *
 * 1. `id` is required for inline scripts (Next uses it to track them), and the
 *    base code runs once per document load — it does not run again on a
 *    client-side navigation. Reporting those navigations is
 *    `MetaPixelPageViews`' job.
 * 2. The `<noscript>` half of Meta's snippet cannot go in `<head>` — an `<img>`
 *    inside `<noscript>` in the head is not valid HTML5 — so it renders here, in
 *    the body, where it is equivalent. It only concerns visitors whose browser
 *    runs no JavaScript at all.
 */
export default function MetaPixel() {
  // Empty NEXT_PUBLIC_META_PIXEL_ID means "switched off" — see lib/metaPixel.ts.
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: metaPixelSnippet(META_PIXEL_ID) }}
      />

      <noscript>
        {/* Meta's tracking image. It is deliberately a raw <img> and not
            next/image: it is the fallback for a browser with JavaScript turned
            off, so the tag has to be plain HTML that needs no JS to render.
            `alt=""` marks it as decorative — it is a 1x1 pixel nobody sees. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

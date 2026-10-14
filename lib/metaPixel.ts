/**
 * Meta (Facebook) Pixel — the single source of truth for the ID and for the
 * event helper, shared by the server component that injects the base code
 * (components/MetaPixel.tsx) and the client island that reports client-side
 * navigations (components/MetaPixelPageViews.tsx).
 *
 * The ID is not a secret: it ships in the page HTML of every visitor. It follows
 * the same pattern as SITE_URL in lib/site.ts — the live value is the fallback so
 * a deploy that forgets the variable still tracks, and NEXT_PUBLIC_* overrides it
 * per environment. Setting NEXT_PUBLIC_META_PIXEL_ID to the empty string turns
 * the pixel off entirely (useful locally, so dev traffic never lands in the
 * production dataset). Remember that NEXT_PUBLIC_* is inlined at BUILD time:
 * change it in Vercel and redeploy, or the old value stays in the bundle.
 */
const DEFAULT_META_PIXEL_ID = "1070001296037676";

export const META_PIXEL_ID =
  typeof process.env.NEXT_PUBLIC_META_PIXEL_ID === "string"
    ? process.env.NEXT_PUBLIC_META_PIXEL_ID
    : DEFAULT_META_PIXEL_ID;

declare global {
  interface Window {
    /**
     * Installed by the pixel base code. Before the snippet runs it is
     * `undefined`, so every call site must guard (see `trackMeta`).
     */
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Meta's base code, verbatim except for the interpolated ID.
 *
 * It defines the `fbq` queue, loads `fbevents.js` asynchronously (so it never
 * blocks rendering), then sends the first PageView. Next.js puts this in the
 * document `<head>` and runs it before any application code (see
 * components/MetaPixel.tsx), so the first PageView lands before React hydrates —
 * which is why the navigation tracker skips its own first render instead of
 * reporting the initial page twice.
 */
export function metaPixelSnippet(id: string) {
  return `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');`;
}

/**
 * Sends a standard Meta event ("Purchase", "InitiateCheckout", …).
 *
 * A no-op when the pixel is disabled or its script has not executed yet, so
 * callers never need to know whether tracking is on.
 */
export function trackMeta(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params);
}

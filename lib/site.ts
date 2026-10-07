/**
 * Canonical public site URL — single source of truth for sitemap, robots,
 * OpenGraph metadata and the Paystack callback URL.
 *
 * Set NEXT_PUBLIC_SITE_URL in the environment (e.g. Vercel project settings)
 * to override. Defaults to the production domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.cbtpractice.ng";

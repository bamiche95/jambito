import { NextResponse } from "next/server";
import { getPricing } from "@/lib/pricingStore";

export const dynamic = "force-dynamic";

/**
 * The live price of the single offer.
 *
 * Public and unauthenticated on purpose: the price is shown to signed-out
 * visitors (the landing page and the paywall both quote it), so requiring a
 * session here would leave exactly those visitors looking at the stale default.
 *
 * `no-store` rather than a CDN `s-maxage`: @serwist/next caches responses in the
 * service worker, and a stale price is a promise the checkout cannot keep —
 * the server charges whatever is stored, regardless of what was displayed.
 *
 * The response is a deliberate subset: the plan's name and duration, plus the
 * cost. The amount that will actually be charged is still decided server-side
 * by /api/payments/initialize, and this value is display-only.
 */
export async function GET() {
  const pricing = await getPricing();

  return NextResponse.json(
    {
      success: true,
      pricing: {
        planId: pricing.planId,
        planName: pricing.planName,
        priceNaira: pricing.priceNaira,
        priceKobo: pricing.priceKobo,
        durationDays: pricing.durationDays,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/serverAuth";
import { writeAudit } from "@/lib/adminUsers";
import { DEFAULT_PLAN } from "@/lib/plans";
import { getPricing, savePricing } from "@/lib/pricingStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The subscription price.
 *
 * This lives outside /api/admin (which is a per-user dispatcher requiring both
 * an `action` and a `uid`) because a price change has no target account: it is
 * a global setting, not something done to a user. The audit entry is still
 * written to the same trail, with the before/after inside `details` — there is
 * no user document to snapshot.
 *
 * GET  /api/admin/pricing  -> the live price, where it came from, and who set it
 * POST /api/admin/pricing  { priceNaira, note? }
 *
 * Only the PRICE is editable. The plan's name, duration and feature list stay
 * in lib/plans.ts and change by deploy, because a price is a commercial
 * decision and a 12-month access window is a product one.
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const pricing = await getPricing();
  return NextResponse.json({ success: true, ...payload(pricing) }, { headers: NO_STORE });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const body = await request.json().catch(() => ({}));
  const actor = {
    uid: auth.decoded.uid,
    email: auth.decoded.email ?? auth.user?.email ?? null,
  };

  try {
    const result = await savePricing({
      priceNaira: body?.priceNaira,
      actor,
      note: body?.note ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          code: result.code,
          message: result.message,
          pricing: result.pricing ?? null,
        },
        { status: 400, headers: NO_STORE }
      );
    }

    // One entry per real change. `details` rather than `before`/`after` because
    // those two are reserved for user snapshots and are ignored for anything
    // else — see auditSnapshot() in lib/adminUsers.js.
    await writeAudit({
      actor,
      action: "setPricing",
      details: {
        fromNaira: result.previous.priceNaira,
        toNaira: result.pricing.priceNaira,
        toKobo: result.pricing.priceKobo,
        previousSource: result.previous.source,
        note: result.note,
      },
    });

    // The landing page is ISR-cached, so without this the new figure would only
    // appear once its revalidate window elapsed.
    revalidatePath("/");

    return NextResponse.json(
      {
        success: true,
        ...payload(result.pricing),
        previous: result.previous,
        message: `Price updated to ₦${result.pricing.priceNaira.toLocaleString()}. Future payments are charged the new amount; payments already made are unaffected.`,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/admin/pricing error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save the price" },
      { status: 500, headers: NO_STORE }
    );
  }
}

/** The shape both verbs return, so the panel needs one type rather than two. */
function payload(pricing) {
  return {
    pricing,
    defaults: {
      priceNaira: DEFAULT_PLAN.priceNaira,
      priceKobo: DEFAULT_PLAN.priceKobo,
    },
  };
}

function forbidden() {
  return NextResponse.json(
    { success: false, message: "Forbidden" },
    { status: 403, headers: NO_STORE }
  );
}

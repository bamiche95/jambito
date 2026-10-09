import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initializePaystackTransaction } from "@/lib/payments";
import { requirePaymentUser } from "@/lib/serverAuth";
import { resolvePlanId } from "@/lib/plans";
import { getPlanPriceKobo } from "@/lib/pricingStore";
import { recordPayment } from "@/lib/paymentsStore";
import { isSubscribed } from "@/lib/users";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Creates a Paystack transaction for the signed-in user.
 * Body: { plan?: "yearly" }
 *
 * There is one offer: one payment for 12 months of access. The amount is read
 * from the admin-editable price at this moment — the request body is never
 * trusted for a figure, only for the plan id. Nothing recurs and nothing is
 * charged to a card automatically, so the only way to pay twice is to press the
 * button twice; this endpoint refuses that while a paid window is still running.
 *
 * Deactivated accounts are allowed through on purpose: paying is how they get
 * back in. Blocked/deleted accounts are refused with an `account_*` code.
 */
export async function POST(request) {
  const auth = await requirePaymentUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  // Already paid up: refuse the charge instead of quietly taking a second
  // payment for time the student already owns. Only active accounts are refused
  // — a deactivated account pays its way back in, which is the documented
  // reactivation path, whichever window it happens to be on.
  if (auth.status === "active" && isSubscribed(auth.user)) {
    const expiry = auth.user?.subscriptionExpiry
      ? new Date(auth.user.subscriptionExpiry)
      : null;
    return NextResponse.json(
      {
        success: false,
        code: "already_subscribed",
        message: expiry
          ? `Your access is already paid for until ${expiry
              .toISOString()
              .slice(0, 10)}. Nothing was charged.`
          : "Your access is already paid for. Nothing was charged.",
        subscriptionExpiry: expiry ? expiry.toISOString() : null,
      },
      { status: 409, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => ({}));
  const plan = resolvePlanId(body?.plan);
  const email = auth.decoded.email || auth.user.email || body?.email;

  if (!plan) {
    return NextResponse.json(
      { success: false, message: "Unknown plan" },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        success: false,
        message:
          "A valid email is required to pay. Please sign in with Google or email first.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  // The current price, re-read on every checkout so an admin edit applies to
  // the next payment rather than the next deploy.
  const amount = await getPlanPriceKobo(plan);
  const reference = `JMB-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    const result = await initializePaystackTransaction({
      email,
      amount,
      reference,
      plan,
      uid: auth.decoded.uid,
    });

    if (result?.status) {
      // Record the attempt BEFORE redirecting to checkout. Paystack only tells
      // us about a payment through the webhook, so without this row a charge
      // whose webhook never arrives would leave no trace to reconcile against.
      await recordPayment({
        reference,
        uid: auth.decoded.uid,
        email,
        amountKobo: amount,
        plan,
        source: "paystack",
        status: "pending",
      }).catch((error) => {
        // A ledger write must not block a paying customer's checkout.
        console.error("Failed to record pending payment:", error);
      });

      return NextResponse.json(
        {
          success: true,
          data: result.data,
          reference,
          amount,
          amountNaira: amount / 100,
        },
        { headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { success: false, message: result?.message || "Failed to initialize payment" },
      { status: 502, headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/payments/initialize error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500, headers: NO_STORE }
    );
  }
}

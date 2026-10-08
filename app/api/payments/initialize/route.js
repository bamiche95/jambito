import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initializePaystackTransaction } from "@/lib/payments";
import { requirePaymentUser } from "@/lib/serverAuth";
import { planById, planPriceKobo } from "@/lib/plans";
import { recordPayment } from "@/lib/paymentsStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Creates a Paystack transaction for the signed-in user.
 * Body: { plan?: "weekly" | "monthly" | "quarterly" | "yearly" }
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

  const body = await request.json().catch(() => ({}));
  const plan = body?.plan ?? "monthly";
  const email = auth.decoded.email || auth.user.email || body?.email;

  if (!planById(plan)) {
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

  const amount = planPriceKobo(plan);
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
        { success: true, data: result.data, reference },
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

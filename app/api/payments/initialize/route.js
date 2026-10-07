import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initializePaystackTransaction } from "@/lib/payments";
import { requireUser } from "@/lib/serverAuth";
import { planPriceKobo } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Creates a Paystack transaction for the signed-in user.
 * Body: { plan?: "weekly" | "monthly" | "quarterly" | "yearly" }
 */
export async function POST(request) {
  const auth = await requireUser(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: "You must be signed in to pay." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const plan = body?.plan ?? "monthly";
  const email = auth.decoded.email || auth.user.email || body?.email;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        success: false,
        message:
          "A valid email is required to pay. Please sign in with Google or email first.",
      },
      { status: 400 }
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
      return NextResponse.json({
        success: true,
        data: result.data,
        reference,
      });
    }

    return NextResponse.json(
      { success: false, message: result?.message || "Failed to initialize payment" },
      { status: 502 }
    );
  } catch (error) {
    console.error("POST /api/payments/initialize error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

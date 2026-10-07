import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  initializePaystackTransaction,
} from "@/lib/payments";
import { planPriceKobo } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Creates a Paystack transaction and returns the checkout authorization URL.
 * Body: { email, plan?: "weekly" | "monthly" | "quarterly" | "yearly" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, plan = "monthly" } = body ?? {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: "A valid email address is required" },
        { status: 400 }
      );
    }

    const amount = planPriceKobo(plan);
    const reference = `JMB-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const result = await initializePaystackTransaction({
      email,
      amount,
      reference,
      plan,
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

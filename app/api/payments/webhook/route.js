import { NextResponse } from "next/server";
import {
  verifyPaystackSignature,
  upsertSubscription,
} from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook receiver.
 *
 * Verifies the request using the `x-paystack-signature` header (HMAC-SHA512 of
 * the raw body with PAYSTACK_SECRET_KEY), then upgrades the user's
 * subscription on a successful `charge.success` event.
 */
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 401 }
    );
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // Only act on successful charges.
  if (event?.event === "charge.success") {
    const data = event.data ?? {};
    const email = data.customer?.email;
    const reference = data.reference;
    const amount = data.amount;
    const plan = data.metadata?.plan ?? "monthly";

    if (email) {
      try {
        await upsertSubscription({ email, plan, reference, amount });
      } catch (error) {
        console.error("Failed to persist subscription:", error);
        return NextResponse.json(
          { success: false, message: "Failed to update subscription" },
          { status: 500 }
        );
      }
    }
  }

  // Always acknowledge receipt so Paystack does not retry indefinitely.
  return NextResponse.json({ success: true, received: true });
}

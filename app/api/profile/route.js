import { NextResponse } from "next/server";
import { getSubscription } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Returns subscription status for a given email. Used by the profile page to
 * reflect the result of a successful payment.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { success: false, message: "Missing email query param" },
      { status: 400 }
    );
  }

  try {
    const user = await getSubscription(email.toLowerCase().trim());
    return NextResponse.json({
      success: true,
      profile: user
        ? {
            email: user.email,
            isSubscribed: user.isSubscribed ?? false,
            subscriptionExpiry: user.subscriptionExpiry ?? null,
            plan: user.plan ?? null,
          }
        : { email, isSubscribed: false, subscriptionExpiry: null, plan: null },
    });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

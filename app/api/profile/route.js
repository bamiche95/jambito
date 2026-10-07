import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import { getRemaining, isSubscribed } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Returns the signed-in user's profile + subscription status + trial usage.
 * Protected by a Firebase ID token.
 */
export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const { decoded, user } = auth;
  return NextResponse.json({
    success: true,
    profile: {
      uid: decoded.uid,
      email: user.email ?? decoded.email ?? null,
      name: user.name ?? decoded.name ?? null,
      role: user.role ?? "user",
      isSubscribed: isSubscribed(user),
      subscriptionExpiry: user.subscriptionExpiry ?? null,
      plan: user.plan ?? null,
      trialCount: user.trialCount ?? 0,
    },
    remaining: getRemaining(user),
  });
}

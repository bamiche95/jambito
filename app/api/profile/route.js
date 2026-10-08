import { NextResponse } from "next/server";
import { requireProfileUser } from "@/lib/serverAuth";
import { getRemaining, isSubscribed } from "@/lib/users";
import { getAccountStatus } from "@/lib/accountStatus";

export const dynamic = "force-dynamic";

/**
 * Returns the signed-in user's profile + subscription status + trial usage.
 * Protected by a Firebase ID token.
 *
 * Unlike the question endpoints this stays reachable with a blocked or
 * deactivated account (403 only for a deleted tombstone), because the profile
 * is where the UI explains why the rest of the app refuses to work.
 */
export async function GET(request) {
  const auth = await requireProfileUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { decoded, user } = auth;
  return NextResponse.json(
    {
      success: true,
      profile: {
        uid: decoded.uid,
        email: user.email ?? decoded.email ?? null,
        name: user.name ?? decoded.name ?? null,
        role: user.role ?? "user",
        status: getAccountStatus(user),
        isSubscribed: isSubscribed(user),
        subscriptionExpiry: user.subscriptionExpiry ?? null,
        plan: user.plan ?? null,
        trialCount: user.trialCount ?? 0,
      },
      remaining: getRemaining(user),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

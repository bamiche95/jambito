import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import { consumeTrial, getRemaining, isSubscribed } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Global server-side trial quota (40 questions across the whole app).
 *
 * GET  /api/trial  -> { subscribed, trialUsed, trialRemaining, role, email }
 * POST /api/trial  -> { allowed, subscribed, used, remaining }
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
    uid: decoded.uid,
    email: user.email ?? decoded.email ?? null,
    role: user.role ?? "user",
    subscribed: isSubscribed(user),
    trialUsed: user.trialCount ?? 0,
    trialRemaining: getRemaining(user),
  });
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await consumeTrial({
    uid: auth.decoded.uid,
    email: auth.decoded.email,
  });

  return NextResponse.json({ success: true, ...result });
}

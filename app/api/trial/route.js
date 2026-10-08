import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/serverAuth";
import { consumeTrial, getRemaining, isSubscribed } from "@/lib/users";
import { getAccountStatus } from "@/lib/accountStatus";

export const dynamic = "force-dynamic";

/** Per-user answers must never be cached — including the 403 gate below. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Global server-side trial quota (40 questions across the whole app).
 *
 * GET  /api/trial  -> { subscribed, trialUsed, trialRemaining, role, email, status }
 * POST /api/trial  -> { allowed, subscribed, used, remaining }
 *
 * The client reads this before deciding whether a set is locked, so an
 * unavailable Admin SDK must answer 503 (retryable, fail closed) rather than
 * 401 or a bare 500 — a broken dependency must never look like a verdict.
 *
 * A blocked/deactivated account answers 403 with an `account_*` code, which is
 * how the client learns to clear its cached questions and show the notice.
 */
export async function GET(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  const { decoded, user } = auth;
  return NextResponse.json(
    {
      success: true,
      uid: decoded.uid,
      email: user.email ?? decoded.email ?? null,
      role: user.role ?? "user",
      status: getAccountStatus(user),
      subscribed: isSubscribed(user),
      trialUsed: user.trialCount ?? 0,
      trialRemaining: getRemaining(user),
    },
    { headers: NO_STORE }
  );
}

export async function POST(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  const result = await consumeTrial({
    uid: auth.decoded.uid,
    email: auth.decoded.email,
  });

  return NextResponse.json(
    { success: true, ...result },
    { headers: NO_STORE }
  );
}

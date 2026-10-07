import { NextResponse } from "next/server";
import { requireUser } from "@/lib/serverAuth";
import {
  consumeTrial,
  getRemaining,
  isSubscribed,
} from "@/lib/users";
import { EXAMS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * Server-side trial quota (40 questions per exam).
 *
 * GET  /api/trial          -> { subscribed, remaining, role, email }
 * POST /api/trial          -> body { exam } -> { allowed, remaining, subscribed, used }
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
    remaining: getRemaining(user),
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

  const body = await request.json().catch(() => ({}));
  const exam = String(body?.exam ?? "").toUpperCase();

  if (!EXAMS.includes(exam)) {
    return NextResponse.json(
      { success: false, message: "Invalid exam" },
      { status: 400 }
    );
  }

  const result = await consumeTrial({
    uid: auth.decoded.uid,
    email: auth.decoded.email,
    exam,
  });

  return NextResponse.json({ success: true, exam, ...result });
}

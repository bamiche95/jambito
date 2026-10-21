import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runEmailCampaigns } from "@/lib/emailEngine";

export const dynamic = "force-dynamic";
// Vercel Hobby caps a function at 60s; the engine stops itself at 45s.
export const maxDuration = 60;

/**
 * The daily campaign trigger.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` when that
 * variable is set. The comparison is length-checked and constant-time, and the
 * route answers 401 (not 403) to anything else — a probe should not learn
 * whether the path exists or which secret is missing.
 *
 * POST is accepted as well so the run can be triggered from a scheduler that
 * only supports POST; both verbs do exactly the same work.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function authorize(request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: "cron_unconfigured",
      message: "CRON_SECRET is not set on this deployment.",
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Unauthorized",
    };
  }
  return { ok: true };
}

async function handle(request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  try {
    const summary = await runEmailCampaigns();
    return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
  } catch (error) {
    console.error("cron /api/cron/emails failed:", error);
    return NextResponse.json(
      { success: false, message: "The email run failed." },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
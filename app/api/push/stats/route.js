import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { getPushConfig } from "@/lib/push";
import { getPushStats, listRecentPushLog } from "@/lib/pushStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/push/stats — admin only.
 *
 * Answers the three questions the dashboard's Push tab asks: is this deployment
 * configured at all, how many devices are live, and what did the last sends
 * actually do. No endpoints or keys are returned: an endpoint URL is a
 * capability, and the panel only ever needs counts.
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, code: "admin_required", message: "Admins only." },
      { status: 403, headers: NO_STORE }
    );
  }

  const [stats, log] = await Promise.all([getPushStats(), listRecentPushLog(25)]);
  const config = getPushConfig();

  return NextResponse.json(
    {
      success: true,
      configured: config.configured,
      subject: config.subject,
      problem: config.problem,
      stats,
      log,
    },
    { headers: NO_STORE }
  );
}

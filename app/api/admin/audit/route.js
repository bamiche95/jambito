import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { listAudit } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";

/**
 * Audit trail for every admin mutation.
 *
 * GET /api/admin/audit?targetUid=&action=&page=&limit=
 *     -> { entries, total, page, limit, hasMore }
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { searchParams } = new URL(request.url);
  try {
    const result = await listAudit({
      targetUid: searchParams.get("targetUid"),
      action: searchParams.get("action"),
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/admin/audit error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load the audit log" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

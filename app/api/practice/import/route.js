import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/serverAuth";
import { importPractice } from "@/lib/practice";

export const dynamic = "force-dynamic";

/**
 * One-time import of the practice history a student already has in IndexedDB.
 *
 * Before this feature existed, History and Stats were device-only. The client
 * uploads that backlog once per account (guarded by a localStorage flag) so the
 * new server-side records do not start empty. The import is idempotent: every
 * attempt keeps the same deterministic id, and a paused session is only
 * replaced when the imported copy is newer.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "invalid_body", message: "Invalid JSON body." },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, code: "invalid_body", message: "Invalid import payload." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const summary = await importPractice(auth.decoded.uid, body);
    return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
  } catch (error) {
    console.error("practice import failed:", error);
    return NextResponse.json(
      {
        success: false,
        code: "practice_unavailable",
        message: "Your local history will be imported the next time you open the app.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}

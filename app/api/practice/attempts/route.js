import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/serverAuth";
import { listAttempts, recordAttempt } from "@/lib/practice";

export const dynamic = "force-dynamic";

/**
 * Completed practice attempts for the signed-in user.
 *
 * The client treats this as a cache refresh: IndexedDB is still read first so
 * History and Stats paint instantly (and still work offline), then this list is
 * merged in. Writes always go through POST, which is idempotent.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function failure(status, message, code) {
  return NextResponse.json(
    { success: false, code, message },
    { status, headers: NO_STORE }
  );
}

export async function GET(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) return failure(auth.status, auth.message, auth.code);

  try {
    const { searchParams } = new URL(request.url);
    const attempts = await listAttempts(auth.decoded.uid, {
      limit: searchParams.get("limit"),
      before: searchParams.get("before"),
    });
    return NextResponse.json(
      { success: true, count: attempts.length, attempts },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("practice attempts GET failed:", error);
    return failure(
      503,
      "Unable to load your practice history right now.",
      "practice_unavailable"
    );
  }
}

export async function POST(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) return failure(auth.status, auth.message, auth.code);

  let body;
  try {
    body = await request.json();
  } catch {
    return failure(400, "Invalid JSON body.", "invalid_body");
  }

  try {
    const result = await recordAttempt(auth.decoded.uid, body);
    if (!result.ok) {
      return failure(400, "That practice result could not be saved.", result.reason);
    }
    return NextResponse.json(
      { success: true, attempt: result.attempt, practice: result.practice },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("practice attempts POST failed:", error);
    return failure(
      503,
      "Your result is saved on this device and will sync automatically.",
      "practice_unavailable"
    );
  }
}

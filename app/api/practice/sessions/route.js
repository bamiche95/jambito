import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/serverAuth";
import {
  deleteSession,
  getSession,
  listSessions,
  upsertSession,
} from "@/lib/practice";

export const dynamic = "force-dynamic";

/**
 * Paused practice sessions (the "Resume" list).
 *
 * `?key=` returns one set, so a second device can restore the answers and timer
 * of a set started elsewhere. Without a key the latest 20 are returned, which is
 * what History needs.
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
    const key = searchParams.get("key");
    if (key) {
      const session = await getSession(auth.decoded.uid, key);
      return NextResponse.json({ success: true, session }, { headers: NO_STORE });
    }
    const sessions = await listSessions(auth.decoded.uid, {
      limit: searchParams.get("limit"),
    });
    return NextResponse.json(
      { success: true, count: sessions.length, sessions },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("practice sessions GET failed:", error);
    return failure(
      503,
      "Unable to load your paused sessions right now.",
      "practice_unavailable"
    );
  }
}

export async function PUT(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) return failure(auth.status, auth.message, auth.code);

  let body;
  try {
    body = await request.json();
  } catch {
    return failure(400, "Invalid JSON body.", "invalid_body");
  }

  try {
    const result = await upsertSession(auth.decoded.uid, body);
    if (!result.ok) {
      return failure(400, "That paused session could not be saved.", result.reason);
    }
    return NextResponse.json(
      { success: true, stale: result.stale },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("practice sessions PUT failed:", error);
    return failure(
      503,
      "Your progress is saved on this device and will sync automatically.",
      "practice_unavailable"
    );
  }
}

export async function DELETE(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) return failure(auth.status, auth.message, auth.code);

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return failure(400, "A session key is required.", "missing_key");
    const result = await deleteSession(auth.decoded.uid, key);
    if (!result.ok) {
      return failure(400, "That session could not be removed.", result.reason);
    }
    return NextResponse.json(
      { success: true, deleted: result.deleted },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("practice sessions DELETE failed:", error);
    return failure(
      503,
      "The session will be removed when your connection returns.",
      "practice_unavailable"
    );
  }
}

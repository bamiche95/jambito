import { NextResponse } from "next/server";
import { getUsersCollection } from "@/lib/users";
import { verifyUnsubscribeToken } from "@/lib/emailTokens";

export const dynamic = "force-dynamic";

/**
 * Opt out of progress emails.
 *
 * The link is stateless: `?u=<uid>&t=<hmac>` (see lib/emailTokens.js). GET only
 * reports whether the link is valid — mailbox scanners and link previews fetch
 * URLs before a human sees them, so an opt-out on GET would unsubscribe people
 * who never clicked. POST (the confirm button) is what writes the change.
 *
 * The route accepts JSON (used by nothing yet, kept for a future in-app toggle)
 * and the form-encoded POST the unsubscribe page submits.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function clean(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readBody(request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = await request.json().catch(() => null);
    return json && typeof json === "object" ? json : {};
  }
  if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};
    const values = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") values[key] = value;
    }
    return values;
  }
  return {};
}

function invalid(request, wantsRedirect) {
  if (wantsRedirect) {
    return NextResponse.redirect(
      new URL("/unsubscribe?invalid=1", request.url),
      303
    );
  }
  return NextResponse.json(
    {
      success: false,
      code: "invalid_token",
      message: "This unsubscribe link is not valid.",
    },
    { status: 400, headers: NO_STORE }
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uid = clean(searchParams.get("u"));
  const token = clean(searchParams.get("t"), 128);
  if (!uid || !token) {
    return NextResponse.json(
      { success: false, valid: false, message: "A uid and token are required." },
      { status: 400, headers: NO_STORE }
    );
  }
  return NextResponse.json(
    { success: true, valid: verifyUnsubscribeToken(uid, token) },
    { headers: NO_STORE }
  );
}

export async function POST(request) {
  const body = await readBody(request);
  const wantsRedirect = clean(body.redirect) === "1";
  const uid = clean(body.u);
  const token = clean(body.t, 128);

  if (!uid || !token || !verifyUnsubscribeToken(uid, token)) {
    return invalid(request, wantsRedirect);
  }

  try {
    const users = await getUsersCollection();
    const now = new Date();
    // Conditional so a second click does not move the original timestamp.
    const result = await users.updateOne(
      { _id: uid, emailUnsubscribedAt: { $exists: false } },
      { $set: { emailUnsubscribedAt: now, updatedAt: now } }
    );

    let already = false;
    if (result.matchedCount === 0) {
      const existing = await users.findOne(
        { _id: uid },
        { projection: { emailUnsubscribedAt: 1 } }
      );
      if (!existing) {
        return NextResponse.json(
          { success: false, code: "not_found", message: "That account no longer exists." },
          { status: 404, headers: NO_STORE }
        );
      }
      already = Boolean(existing.emailUnsubscribedAt);
    }

    if (wantsRedirect) {
      return NextResponse.redirect(new URL("/unsubscribe?done=1", request.url), 303);
    }
    return NextResponse.json(
      { success: true, already, unsubscribed: true },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/unsubscribe failed:", error);
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL("/unsubscribe?error=1", request.url),
        303
      );
    }
    return NextResponse.json(
      { success: false, message: "Could not update your email preferences." },
      { status: 500, headers: NO_STORE }
    );
  }
}
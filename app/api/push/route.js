import { NextResponse } from "next/server";
import { requireApiUser, requireProfileUser } from "@/lib/serverAuth";
import { assertUsableSubscription, getPushConfig } from "@/lib/push";
import {
  getNotificationPrefs,
  listUserPushSubscriptions,
  revokeAllPushSubscriptions,
  revokePushSubscription,
  savePushSubscription,
} from "@/lib/pushStore";

export const dynamic = "force-dynamic";

/** Per-user device data: never cached, by anything. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Web Push subscriptions for the signed-in account.
 *
 * GET    /api/push   -> { configured, publicKey, prefs, devices }
 * POST   /api/push   -> { subscription: { endpoint, keys }, deviceId? }
 * DELETE /api/push?endpoint=<url>   (one device)
 * DELETE /api/push?all=1            (every device on this account)
 *
 * The VAPID public key is served from here rather than inlined as a
 * `NEXT_PUBLIC_*` value, so an unset key turns the feature off cleanly instead
 * of shipping a broken prompt, and rotating it needs no rebuild. A deployment
 * with no keys answers 503 `push_unconfigured` — the client hides the card.
 *
 * `requireApiUser` on purpose: a blocked or deactivated account may not enrol a
 * device, and that is also the moment its existing rows stop being mailed.
 */
export async function GET(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  const config = getPushConfig();
  const devices = await listUserPushSubscriptions(auth.decoded.uid);

  return NextResponse.json(
    {
      success: true,
      configured: config.configured,
      publicKey: config.publicKey,
      prefs: getNotificationPrefs(auth.user),
      devices,
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

  const config = getPushConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        success: false,
        code: "push_unconfigured",
        message: "Notifications are not available right now.",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => ({}));
  const subscription = body?.subscription ?? null;
  const endpoint = String(subscription?.endpoint ?? "").trim();

  // Rejected here, not on the first real send: a malformed key pair would
  // otherwise look like a delivery failure on the student's device.
  const usable = assertUsableSubscription({
    endpoint,
    keys: {
      p256dh: String(subscription?.keys?.p256dh ?? ""),
      auth: String(subscription?.keys?.auth ?? ""),
    },
  });
  if (!usable.ok) {
    return NextResponse.json(
      {
        success: false,
        code: usable.code ?? "push_invalid",
        message: "That subscription could not be used. Try enabling notifications again.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const saved = await savePushSubscription({
      uid: auth.decoded.uid,
      subscription: {
        endpoint,
        keys: {
          p256dh: String(subscription.keys.p256dh),
          auth: String(subscription.keys.auth),
        },
      },
      deviceId: body?.deviceId ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    if (!saved.ok) {
      return NextResponse.json(
        { success: false, code: saved.reason, message: "Subscription was not stored." },
        { status: 400, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { success: true, id: saved.id, created: saved.created === true },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/push error:", error);
    return NextResponse.json(
      { success: false, code: "push_unavailable", message: "Could not save the device." },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function DELETE(request) {
  // Profile-level auth on purpose: a deactivated account must still be able to
  // switch reminders off, and this is the only endpoint that lets it.
  const auth = await requireProfileUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: NO_STORE }
    );
  }

  const { searchParams } = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const all = searchParams.get("all") === "1" || body?.all === true;
  const endpoint = searchParams.get("endpoint") ?? body?.endpoint ?? "";

  try {
    if (all) {
      const result = await revokeAllPushSubscriptions(auth.decoded.uid);
      return NextResponse.json(
        { success: true, revoked: result.revoked ?? 0 },
        { headers: NO_STORE }
      );
    }

    if (!String(endpoint).trim()) {
      return NextResponse.json(
        { success: false, code: "invalid_request", message: "An endpoint is required." },
        { status: 400, headers: NO_STORE }
      );
    }

    const result = await revokePushSubscription({
      uid: auth.decoded.uid,
      endpoint,
    });
    return NextResponse.json(
      { success: true, revoked: result.revoked === true ? 1 : 0 },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("DELETE /api/push error:", error);
    return NextResponse.json(
      { success: false, code: "push_unavailable", message: "Could not update the device." },
      { status: 500, headers: NO_STORE }
    );
  }
}

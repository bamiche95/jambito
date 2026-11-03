import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/serverAuth";
import { getPushConfig, sendPush } from "@/lib/push";
import { sanitizeField } from "@/lib/contactGuard";
import {
  getUserPushTargets,
  recordPushLog,
  recordPushResult,
  retirePushSubscription,
} from "@/lib/pushStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/push/test
 *
 * Sends one notification to the caller's OWN devices. Deliberately not an admin
 * tool: the most common question after wiring push is "did it actually reach
 * my phone?", and the student on that phone is the best person to answer it.
 * An admin panel can call this with their own token to test the same path.
 *
 * Body (all optional): { title?, body?, url? }
 */
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
        message:
          "Push is not configured on this deployment. Set PUSH_VAPID_PUBLIC and PUSH_VAPID_PRIVATE.",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const uid = auth.decoded.uid;
  const devices = await getUserPushTargets(uid);
  if (!devices.length) {
    return NextResponse.json(
      {
        success: false,
        code: "no_devices",
        message: "This account has no subscribed device yet. Turn notifications on first.",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => ({}));
  const payload = {
    title: sanitizeField(body?.title, 80) || "CBT-Practice",
    body:
      sanitizeField(body?.body, 180) ||
      "Notifications are working. We'll remind you when it's time to practise.",
    url: sanitizeField(body?.url, 200) || "/profile",
    tag: "push-test",
  };

  // The send loop below needs the endpoint and keys, which is exactly why it
  // reads `getUserPushTargets` (server-internal) rather than the sanitised
  // device list the profile route returns.
  const summary = { sent: 0, gone: 0, failed: 0, errors: [] };
  for (const device of devices) {
    const result = await sendPush(
      {
        endpoint: device.endpoint,
        keys: device.keys,
      },
      payload
    );

    await recordPushResult(device.id, result);
    await recordPushLog({
      uid,
      campaignId: "test",
      id: device.id,
      status: result.ok ? "sent" : result.gone ? "gone" : "failed",
      code: result.code ?? null,
      message: result.message ?? null,
      platform: device.platform ?? null,
    });

    if (result.ok) summary.sent += 1;
    else if (result.gone) {
      summary.gone += 1;
      await retirePushSubscription(device.id, "gone");
    } else {
      summary.failed += 1;
      summary.errors.push({
        platform: device.platform ?? "Unknown",
        code: result.code ?? "push_rejected",
        message: result.message ?? null,
      });
    }
  }

  return NextResponse.json(
    {
      success: summary.sent > 0,
      devices: devices.length,
      ...summary,
      message:
        summary.sent > 0
          ? `Sent to ${summary.sent} device${summary.sent === 1 ? "" : "s"}.`
          : "No device accepted the notification.",
    },
    { status: summary.sent > 0 ? 200 : 502, headers: NO_STORE }
  );
}

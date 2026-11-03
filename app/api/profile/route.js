import { NextResponse } from "next/server";
import { requireProfileUser } from "@/lib/serverAuth";
import { getRemaining, isSubscribed } from "@/lib/users";
import { getAccountStatus } from "@/lib/accountStatus";
import { getNotificationPrefs, saveNotificationPrefs } from "@/lib/pushStore";

export const dynamic = "force-dynamic";

/**
 * Returns the signed-in user's profile + subscription status + trial usage.
 * Protected by a Firebase ID token.
 *
 * Unlike the question endpoints this stays reachable with a blocked or
 * deactivated account (403 only for a deleted tombstone), because the profile
 * is where the UI explains why the rest of the app refuses to work.
 */
export async function GET(request) {
  const auth = await requireProfileUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { decoded, user } = auth;
  return NextResponse.json(
    {
      success: true,
      profile: {
        uid: decoded.uid,
        email: user.email ?? decoded.email ?? null,
        name: user.name ?? decoded.name ?? null,
        role: user.role ?? "user",
        status: getAccountStatus(user),
        isSubscribed: isSubscribed(user),
        subscriptionExpiry: user.subscriptionExpiry ?? null,
        plan: user.plan ?? null,
        trialCount: user.trialCount ?? 0,
        // Server-side aggregate: shown even when this device's cache is empty,
        // and the figure the progress emails are selected from.
        practice: user.practice
          ? {
              completedSessions: user.practice.completedSessions ?? 0,
              totalQuestions: user.practice.totalQuestions ?? 0,
              totalScore: user.practice.totalScore ?? 0,
              averagePercentage: user.practice.averagePercentage ?? null,
              lastCompletedAt: user.practice.lastCompletedAt ?? null,
              bySubject: (user.practice.bySubject ?? []).slice(0, 20),
              inProgress: (user.practice.inProgress ?? []).slice(0, 5),
              lastActivityAt: user.practice.lastActivityAt ?? null,
            }
          : null,
      },
      remaining: getRemaining(user),
      notificationPrefs: getNotificationPrefs(user),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * PATCH /api/profile — the notification toggles.
 *
 * Body: `{ notificationPrefs: { dailyReminder?, trialProgress?, productUpdates? } }`
 *
 * Only the keys in `NOTIFICATION_PREF_DEFAULTS` are accepted (lib/pushStore.js
 * ignores anything else), so a hand-written body cannot write an arbitrary path
 * into the user document. Turning a campaign off is a preference, not an
 * unsubscribe: the device stays registered so a per-campaign send can skip it.
 */
export async function PATCH(request) {
  const auth = await requireProfileUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const patch = body?.notificationPrefs;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json(
      {
        success: false,
        code: "invalid_request",
        message: "Expected { notificationPrefs: { … } }.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const saved = await saveNotificationPrefs(auth.decoded.uid, patch);
  if (!saved.ok) {
    const status = saved.reason === "unavailable" ? 503 : 400;
    return NextResponse.json(
      {
        success: false,
        code: saved.reason,
        message:
          saved.reason === "unavailable"
            ? "Could not save the preference right now. Please retry."
            : "None of those notification settings are recognised.",
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      success: true,
      notificationPrefs: getNotificationPrefs({
        ...auth.user,
        // The doc in memory is the pre-write copy; the response reflects the
        // values just written rather than a second read.
        notificationPrefs: { ...auth.user?.notificationPrefs, ...patch, updatedAt: new Date() },
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

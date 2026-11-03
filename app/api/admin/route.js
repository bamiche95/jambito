import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { isValidUserSegment } from "@/lib/userSegments";
import {
  getAdminUser,
  getUserStats,
  grantSubscription,
  isValidStatus,
  listUsers,
  resetUserTrial,
  revokeSubscription,
  serializeUser,
  setUserRole,
  setUserStatus,
  softDeleteUser,
  writeAudit,
} from "@/lib/adminUsers";

export const dynamic = "force-dynamic";

/** Admin data is per-request and sensitive: never cached, by anything. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Admin API — protected by a Firebase ID token whose user has role "admin".
 *
 * Deliberately ignores account status (see `requireAdmin`), so an admin can
 * always reach the dashboard and undo a mistake — including their own.
 *
 * GET  /api/admin?search=&status=&segment=&page=&limit=
 *      -> { users, total, page, limit, hasMore, stats }
 *      `segment` is one of USER_SEGMENTS (lib/userSegments.ts): the trial funnel
 *      — never started / in progress / completed / completed-and-unpaid / paid —
 *      plus 7- and 30-day sign-up windows. It composes with `status` and `search`.
 * POST /api/admin
 *      { action: "setStatus", uid, status, note? }
 *      { action: "deleteUser", uid }
 *      { action: "setSubscription", uid, isSubscribed, plan?, days?, mode? }
 *      { action: "resetTrial", uid }
 *      { action: "setRole", uid, role }
 *
 * Every mutation is mirrored into the audit log (lib/adminUsers.js#writeAudit).
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "all";
  if (status !== "all" && !isValidStatus(status)) {
    return badRequest(`Unknown status filter: ${status}`);
  }
  const segment = searchParams.get("segment") ?? "all";
  if (segment !== "all" && !isValidUserSegment(segment)) {
    return badRequest(`Unknown segment filter: ${segment}`);
  }

  try {
    const [list, stats] = await Promise.all([
      listUsers({
        search: searchParams.get("search"),
        status,
        segment,
        page: searchParams.get("page"),
        limit: searchParams.get("limit"),
      }),
      getUserStats(),
    ]);
    return NextResponse.json(
      { success: true, ...list, stats },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("GET /api/admin error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load users" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const body = await request.json().catch(() => ({}));
  const { action, uid } = body ?? {};
  if (!action || !uid) {
    return badRequest("action and uid are required");
  }

  const actor = {
    uid: auth.decoded.uid,
    email: auth.decoded.email ?? auth.user?.email ?? null,
  };
  // Guards: the dashboard must never be able to lock itself out.
  if (action === "deleteUser" && uid === actor.uid) {
    return badRequest("You cannot delete your own account.");
  }
  if (action === "setRole" && uid === actor.uid && body.role !== "admin") {
    return badRequest("You cannot remove your own admin role.");
  }

  try {
    switch (action) {
      case "setStatus":
        return await handleSetStatus({ uid, body, actor });
      case "deleteUser":
        return await handleDelete({ uid, actor });
      case "setSubscription":
        return await handleSetSubscription({ uid, body, actor });
      case "resetTrial":
        return await handleResetTrial({ uid, actor });
      case "setRole":
        return await handleSetRole({ uid, body, actor });
      default:
        return badRequest("Unknown action");
    }
  } catch (error) {
    console.error(`POST /api/admin (${action}) error:`, error);
    return NextResponse.json(
      { success: false, message: "Admin action failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}

async function handleSetStatus({ uid, body, actor }) {
  const result = await setUserStatus(uid, body.status, actor, body.note ?? null);
  if (!result.ok) return failure(result, result.code === "invalid_status" ? 400 : 404);

  await writeAudit({
    actor,
    action: "user.setStatus",
    targetUid: uid,
    targetEmail: result.after?.email ?? result.before?.email ?? null,
    before: result.before,
    after: result.after,
    details: { from: result.previous, to: body.status, note: body.note ?? null },
    firebase: result.firebase?.message ?? null,
  });

  return respond(result, { message: statusMessage(result, body.status) });
}

async function handleDelete({ uid, actor }) {
  const result = await softDeleteUser(uid, actor);
  if (!result.ok) return failure(result, 404);

  await writeAudit({
    actor,
    action: "user.delete",
    targetUid: uid,
    targetEmail: result.before?.email ?? null,
    before: result.before,
    after: result.after,
    details: { softDelete: true },
    firebase: result.firebase?.message ?? null,
  });

  return respond(result, {
    message: result.unchanged
      ? "This account was already deleted."
      : "Account deleted: PII scrubbed and sign-in disabled for good.",
  });
}

async function handleSetSubscription({ uid, body, actor }) {
  if (!body.isSubscribed) {
    const result = await revokeSubscription(uid, actor);
    if (!result.ok) return failure(result, 404);
    await writeAudit({
      actor,
      action: "user.revokeSubscription",
      targetUid: uid,
      targetEmail: result.before?.email ?? null,
      before: result.before,
      after: result.after,
      details: { revokedBy: actor.email },
    });
    return respond(result, { message: "Subscription ended." });
  }

  const result = await grantSubscription({
    uid,
    plan: body.plan,
    days: body.days,
    mode: body.mode === "set" ? "set" : "extend",
    reference: body.reference ?? null,
    channel: body.channel ?? null,
  });
  if (!result.ok) return failure(result, 404);

  await writeAudit({
    actor,
    action: "user.grantSubscription",
    targetUid: uid,
    targetEmail: result.after?.email ?? null,
    before: result.before,
    after: result.after,
    details: { ...result.granted, grantedBy: actor.email },
  });

  const { plan, durationDays, mode } = result.granted;
  return respond(result, {
    message: `${durationDays} days of ${plan} access ${
      mode === "extend"
        ? "added on top of the running subscription"
        : "set from today"
    }.`,
  });
}

async function handleResetTrial({ uid, actor }) {
  const result = await resetUserTrial(uid, actor);
  if (!result.ok) return failure(result, 404);

  await writeAudit({
    actor,
    action: "user.resetTrial",
    targetUid: uid,
    targetEmail: result.after?.email ?? null,
    before: result.before,
    after: result.after,
    details: { previousTrialCount: result.before?.trialCount ?? 0 },
  });

  return respond(result, { message: "Free trial reset to 0 questions used." });
}

async function handleSetRole({ uid, body, actor }) {
  const result = await setUserRole(uid, body.role, actor);
  if (!result.ok) {
    return failure(result, result.code === "managed_by_env" ? 409 : 404);
  }

  await writeAudit({
    actor,
    action: "user.setRole",
    targetUid: uid,
    targetEmail: result.after?.email ?? null,
    before: result.before,
    after: result.after,
    details: { from: result.previous, to: body.role },
  });

  return respond(result, {
    message: body.role === "admin" ? "Admin access granted." : "Admin access removed.",
  });
}

function statusMessage(result, status) {
  if (result.unchanged) return `This account is already ${status}.`;
  const firebase = result.firebase?.message ? ` ${result.firebase.message}` : "";
  return `Status set to ${status}.${firebase}`;
}

/** Re-reads the user so the dashboard always shows persisted truth. */
async function respond(result, extra = {}) {
  const fresh = await getAdminUser(result.after?._id ?? result.before?._id);
  return NextResponse.json(
    {
      success: true,
      user: serializeUser(fresh ?? result.after),
      ...("granted" in result ? { granted: result.granted } : {}),
      firebase: result.firebase ?? null,
      ...extra,
    },
    { headers: NO_STORE }
  );
}

function failure(result, status) {
  return NextResponse.json(
    { success: false, code: result.code ?? "error", message: result.message },
    { status, headers: NO_STORE }
  );
}

function badRequest(message) {
  return NextResponse.json(
    { success: false, message },
    { status: 400, headers: NO_STORE }
  );
}

function forbidden() {
  return NextResponse.json(
    { success: false, message: "Forbidden" },
    { status: 403, headers: NO_STORE }
  );
}


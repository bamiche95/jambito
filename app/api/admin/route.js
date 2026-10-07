import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { getUsersCollection } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Admin API — protected by a Firebase ID token with role === "admin".
 *
 * GET  /api/admin                     -> list users
 * POST /api/admin                     -> perform an action on a user
 *   { action: "setSubscription", uid, isSubscribed, expiryDays }
 *   { action: "resetTrial", uid }
 *   { action: "setRole", uid, role }
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 }
    );
  }

  const users = await getUsersCollection();
  const list = await users
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    success: true,
    users: list.map((u) => ({
      uid: u.uid ?? u._id,
      email: u.email ?? null,
      role: u.role ?? "user",
      isSubscribed: u.isSubscribed ?? false,
      subscriptionExpiry: u.subscriptionExpiry ?? null,
      plan: u.plan ?? null,
      trialUsage: u.trialUsage ?? {},
      createdAt: u.createdAt ?? null,
    })),
  });
}

export async function POST(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { action, uid } = body;
  if (!uid || !action) {
    return NextResponse.json(
      { success: false, message: "action and uid are required" },
      { status: 400 }
    );
  }

  const users = await getUsersCollection();
  const now = new Date();

  switch (action) {
    case "setSubscription": {
      const expiryDays = Number(body.expiryDays ?? 30);
      const isSubscribed = Boolean(body.isSubscribed);
      const subscriptionExpiry = isSubscribed
        ? new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
        : null;
      await users.updateOne(
        { _id: uid },
        {
          $set: {
            isSubscribed,
            subscriptionExpiry,
            plan: body.plan ?? "monthly",
            updatedAt: now,
          },
        }
      );
      break;
    }
    case "resetTrial": {
      await users.updateOne(
        { _id: uid },
        { $set: { trialUsage: {}, updatedAt: now } }
      );
      break;
    }
    case "setRole": {
      const role = body.role === "admin" ? "admin" : "user";
      await users.updateOne({ _id: uid }, { $set: { role, updatedAt: now } });
      break;
    }
    default:
      return NextResponse.json(
        { success: false, message: "Unknown action" },
        { status: 400 }
      );
  }

  return NextResponse.json({ success: true });
}

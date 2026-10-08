import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import {
  findPayment,
  getPaymentStats,
  listPayments,
  markPaymentGranted,
  newManualReference,
  recordPayment,
  serializePayment,
} from "@/lib/paymentsStore";
import {
  getAdminUser,
  grantSubscription,
  serializeUser,
  writeAudit,
} from "@/lib/adminUsers";
import { PLAN_ID, planLabel, resolvePlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Payments ledger API.
 *
 * GET  /api/admin/payments?uid=&email=&reference=&source=&status=&page=&limit=
 *      -> { payments, total, page, limit, hasMore, stats }
 *
 * POST /api/admin/payments  { action: "recordManual", uid, ... }
 *      Records a payment that never went through Paystack — the direct
 *      bank-transfer case — and (optionally) grants the access it paid for.
 *
 * The ledger's unique `reference` is the dedupe key: re-submitting the same
 * reference cannot grant a second time.
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const { searchParams } = new URL(request.url);
  try {
    const [ledger, stats] = await Promise.all([
      listPayments({
        uid: searchParams.get("uid"),
        email: searchParams.get("email"),
        reference: searchParams.get("reference"),
        source: searchParams.get("source"),
        status: searchParams.get("status"),
        page: searchParams.get("page"),
        limit: searchParams.get("limit"),
      }),
      getPaymentStats(),
    ]);

    return NextResponse.json(
      {
        success: true,
        payments: ledger.payments.map(serializePayment),
        total: ledger.total,
        page: ledger.page,
        limit: ledger.limit,
        hasMore: ledger.hasMore,
        stats,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("GET /api/admin/payments error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load payments" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "recordManual") {
    return badRequest("Unknown action");
  }

  const uid = body.uid;
  const user = await getAdminUser(uid);
  if (!user) {
    return NextResponse.json(
      { success: false, code: "not_found", message: "User not found." },
      { status: 404, headers: NO_STORE }
    );
  }

  const actor = {
    uid: auth.decoded.uid,
    email: auth.decoded.email ?? auth.user?.email ?? null,
  };

  // There is one offer, so an unrecognised (or absent) plan id is still stored
  // as it: the ledger is a record of what someone bought, and the dashboard
  // renders planLabel(plan) for every row.
  const plan = resolvePlanId(body.plan) ?? PLAN_ID;
  const requestedDays = Number(body.days);
  const days =
    Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.floor(requestedDays)
      : null;
  const amountNaira = Number(body.amountNaira);
  const amountKobo = Number.isFinite(amountNaira)
    ? Math.round(amountNaira * 100)
    : Number(body.amountKobo) || 0;
  const reference = String(body.reference ?? "").trim() || newManualReference();
  const wantsGrant = body.grant !== false;

  try {
    const { payment, created } = await recordPayment({
      reference,
      uid,
      email: user.email ?? null,
      amountKobo,
      plan,
      source: "manual",
      status: "success",
      channel: body.channel ?? "bank_transfer",
      note: body.note ?? null,
      bankReference: body.bankReference ?? null,
      createdBy: actor.email,
    });

    if (payment.granted) {
      // Same reference, already applied: refuse loudly rather than double-grant.
      return NextResponse.json(
        {
          success: false,
          code: "already_granted",
          message: `Reference ${reference} already granted ${
            payment.grantedDays ?? "?"
          } days of access. It can only be used once.`,
          payment: serializePayment(payment),
        },
        { status: 409, headers: NO_STORE }
      );
    }

    let granted = null;
    if (wantsGrant) {
      const result = await grantSubscription({
        uid,
        plan,
        days,
        mode: body.mode === "set" ? "set" : "extend",
        reference,
        channel: body.channel ?? "bank_transfer",
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, code: result.code, message: result.message },
          { status: 404, headers: NO_STORE }
        );
      }
      granted = result.granted;
      await markPaymentGranted(reference, {
        grantedDays: granted.durationDays,
        grantedBy: actor.email,
      });
    }

    await writeAudit({
      actor,
      action: "payment.recordManual",
      targetUid: uid,
      targetEmail: user.email ?? null,
      after: await getAdminUser(uid),
      details: {
        reference,
        created,
        amountKobo,
        plan,
        days,
        granted: wantsGrant,
        bankReference: body.bankReference ?? null,
        note: body.note ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        payment: serializePayment(await findPayment(reference)),
        user: serializeUser(await getAdminUser(uid)),
        granted,
        message: wantsGrant
          ? `Recorded ₦${(amountKobo / 100).toLocaleString()} and granted ${planLabel(
              plan
            )} — access runs to ${new Date(granted.expiry)
              .toISOString()
              .slice(0, 10)}.`
          : `Recorded ₦${(amountKobo / 100).toLocaleString()} without granting access.`,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/admin/payments error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to record payment" },
      { status: 500, headers: NO_STORE }
    );
  }
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

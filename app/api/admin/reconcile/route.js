import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { verifyPaystackTransaction } from "@/lib/payments";
import {
  findPayment,
  markPaymentGranted,
  recordPayment,
  serializePayment,
  updatePayment,
} from "@/lib/paymentsStore";
import {
  getAdminUser,
  grantSubscription,
  serializeUser,
  writeAudit,
} from "@/lib/adminUsers";
import { getUsersCollection } from "@/lib/users";
import { getAccountStatus } from "@/lib/accountStatus";
import {
  planById,
  planLabel,
  PLAN_ID,
  resolvePlanId,
} from "@/lib/plans";
import { planByAmountKobo } from "@/lib/pricingStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Paystack reconciliation.
 *
 * The failure this exists for: a customer pays, the webhook never lands (or
 * lands while the API is down), the money is in the Paystack account and the
 * customer still sees a paywall. Rather than trusting a screenshot, the admin
 * looks the charge up at Paystack and grants from Paystack's own record.
 *
 * GET  /api/admin/reconcile?reference=XYZ   -> Paystack's view + our ledger row
 * POST /api/admin/reconcile { reference, uid?, plan?, days?, mode? }
 *      -> verifies, records the payment if needed, and grants the access
 *
 * Idempotent like the webhook: the ledger's unique reference is the dedupe key,
 * so reconciling a payment the webhook already applied reports "already
 * granted" instead of extending the subscription twice.
 */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const reference = (new URL(request.url).searchParams.get("reference") ?? "").trim();
  if (!reference) return badRequest("reference is required");

  try {
    const [verify, payment] = await Promise.all([
      verifyPaystackTransaction(reference),
      findPayment(reference),
    ]);
    return NextResponse.json(
      {
        success: true,
        reference,
        paystack: await summarize(verify),
        payment: serializePayment(payment),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("GET /api/admin/reconcile error:", error);
    return NextResponse.json(
      {
        success: false,
        code: "paystack_unavailable",
        message:
          error?.message === "PAYSTACK_SECRET_KEY is not configured"
            ? "PAYSTACK_SECRET_KEY is not configured on this deployment."
            : "Could not reach Paystack.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const body = await request.json().catch(() => ({}));
  const reference = String(body?.reference ?? "").trim();
  if (!reference) return badRequest("reference is required");

  const actor = {
    uid: auth.decoded.uid,
    email: auth.decoded.email ?? auth.user?.email ?? null,
  };

  let verify;
  try {
    verify = await verifyPaystackTransaction(reference);
  } catch (error) {
    console.error("POST /api/admin/reconcile verify error:", error);
    return NextResponse.json(
      {
        success: false,
        code: "paystack_unavailable",
        message:
          error?.message === "PAYSTACK_SECRET_KEY is not configured"
            ? "PAYSTACK_SECRET_KEY is not configured on this deployment."
            : "Could not reach Paystack.",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const paystack = await summarize(verify);
  if (!verify.verified) {
    return NextResponse.json(
      {
        success: false,
        code: "paystack_not_found",
        message: verify.message ?? `Paystack has no transaction ${reference}.`,
        paystack,
      },
      { status: 404, headers: NO_STORE }
    );
  }

  const tx = verify.transaction;
  if (tx.status !== "success") {
    // Verified but not paid (abandoned, failed, reversed): report, never grant.
    return NextResponse.json(
      {
        success: true,
        applied: false,
        message: `Paystack reports status "${tx.status}" for ${reference} — nothing was granted.`,
        paystack,
      },
      { headers: NO_STORE }
    );
  }

  return applyReconciliation({ tx, reference, body, actor, paystack });
}

/**
 * Credits the account that paid. Writes the ledger row first, then the access
 * window, then the audit entry — in that order, so a crash between steps leaves
 * an ungranted payment (visible and re-runnable) rather than silent access.
 */
async function applyReconciliation({ tx, reference, body, actor, paystack }) {
  // Which plan was paid for is a hint, never a gate: there is one offer, so a
  // missing or unrecognised plan id still resolves to it.
  const inferred = await planByAmountKobo(tx.amount);
  const plan =
    planById(tx.metadata?.plan)?.id ??
    planById(body.plan)?.id ??
    inferred?.id ??
    resolvePlanId(body.plan) ??
    PLAN_ID;
  const requestedDays = Number(body.days);
  const days =
    Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.floor(requestedDays)
      : null;

  const resolved = await resolveAccount({ tx, requestedUid: body.uid });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, code: resolved.code, message: resolved.message, paystack },
      { status: resolved.status, headers: NO_STORE }
    );
  }
  const { uid, user } = resolved;

  try {
    const { payment, created } = await recordPayment({
      reference,
      uid,
      email: tx.customer?.email ?? user.email ?? null,
      amountKobo: tx.amount ?? 0,
      plan,
      source: "paystack",
      status: "success",
      channel: tx.channel ?? null,
      note: "reconciled from Paystack by admin",
      createdBy: actor.email,
    });

    if (payment.granted) {
      return NextResponse.json(
        {
          success: true,
          applied: false,
          alreadyGranted: true,
          paystack,
          payment: serializePayment(payment),
          user: serializeUser(user),
          message: `Reference ${reference} was already applied (${
            payment.grantedDays ?? "?"
          } days) — nothing changed.`,
        },
        { headers: NO_STORE }
      );
    }

    if (!created) {
      await updatePayment(reference, {
        status: "success",
        amountKobo: tx.amount ?? 0,
        channel: tx.channel ?? null,
        plan,
      });
    }

    const result = await grantSubscription({
      uid,
      plan,
      days,
      mode: body.mode === "set" ? "set" : "extend",
      reference,
      channel: tx.channel ?? "paystack",
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, code: result.code, message: result.message, paystack },
        { status: 404, headers: NO_STORE }
      );
    }

    await markPaymentGranted(reference, {
      grantedDays: result.granted.durationDays,
      grantedBy: actor.email,
    });
    await writeAudit({
      actor,
      action: "payment.reconcile",
      targetUid: uid,
      targetEmail: user.email ?? tx.customer?.email ?? null,
      before: result.before,
      after: result.after,
      details: {
        reference,
        plan,
        days: result.granted.durationDays,
        amountKobo: tx.amount ?? 0,
        channel: tx.channel ?? null,
        paidAt: tx.paid_at ?? null,
        paystackStatus: tx.status,
      },
    });

    return NextResponse.json(
      {
        success: true,
        applied: true,
        paystack,
        payment: serializePayment(await findPayment(reference)),
        user: serializeUser(await getAdminUser(uid)),
        granted: result.granted,
        message: `Granted ${planLabel(plan)} for ${reference} — access runs to ${new Date(
          result.granted.expiry
        )
          .toISOString()
          .slice(0, 10)}.`,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("POST /api/admin/reconcile error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to apply the reconciled payment" },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * Finds the account a Paystack transaction belongs to, preferring the `uid` in
 * the metadata (written by /api/payments/initialize), then an explicit uid from
 * the dashboard, then a match on the customer email.
 */
async function resolveAccount({ tx, requestedUid }) {
  const uid = tx.metadata?.uid ?? requestedUid ?? null;

  if (uid) {
    const user = await getAdminUser(uid);
    if (!user) {
      return {
        ok: false,
        code: "user_not_found",
        status: 404,
        message: `No account with uid ${uid}.`,
      };
    }
    return grantable(user);
  }

  const email = tx.customer?.email
    ? String(tx.customer.email).toLowerCase().trim()
    : null;
  if (email) {
    const users = await getUsersCollection();
    const user = await users.findOne({ email });
    if (user) return grantable(user);
  }

  return {
    ok: false,
    code: "uid_required",
    status: 400,
    message: `No Firebase uid in the transaction metadata and no account matches ${
      email ?? "this payment"
    }. Enter the uid to credit.`,
  };
}

/** Refuses to credit an account that is not allowed to hold access. */
function grantable(user) {
  const status = getAccountStatus(user);
  if (status === "deleted") {
    return {
      ok: false,
      code: "account_deleted",
      status: 409,
      message: `${user._id} is a deleted account — granting access to it does nothing.`,
    };
  }
  if (status === "blocked") {
    return {
      ok: false,
      code: "account_blocked",
      status: 409,
      message: `${user._id} is blocked. Unblock it first, then reconcile again.`,
    };
  }
  return { ok: true, uid: user._id, user };
}

/**
 * Paystack's answer, trimmed to what the dashboard shows.
 *
 * Async because naming a transaction whose metadata has no plan needs the
 * configured price, and that lives in the database.
 */
async function summarize(verify) {
  const tx = verify.transaction ?? {};
  const metadataPlan = planById(tx.metadata?.plan)?.id ?? null;
  const inferredPlan = metadataPlan
    ? null
    : (await planByAmountKobo(tx.amount))?.id ?? null;
  return {
    httpStatus: verify.httpStatus,
    verified: verify.verified,
    message: verify.message ?? null,
    status: tx.status ?? null,
    amountKobo: tx.amount ?? null,
    amountNaira: tx.amount != null ? tx.amount / 100 : null,
    currency: tx.currency ?? null,
    channel: tx.channel ?? null,
    paidAt: tx.paid_at ?? null,
    email: tx.customer?.email ?? null,
    uid: tx.metadata?.uid ?? null,
    plan: metadataPlan,
    inferredPlan,
    reference: tx.reference ?? null,
    gatewayResponse: tx.gateway_response ?? null,
  };
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

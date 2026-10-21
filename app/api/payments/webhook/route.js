import { after, NextResponse } from "next/server";
import { verifyPaystackSignature } from "@/lib/payments";
import { upsertSubscription } from "@/lib/users";
import {
  markPaymentGranted,
  recordPayment,
  updatePayment,
} from "@/lib/paymentsStore";
import { planById, PLAN_ID } from "@/lib/plans";
import { planByAmountKobo } from "@/lib/pricingStore";
import { sendCampaignToUser } from "@/lib/emailEngine";

export const dynamic = "force-dynamic";
// The thank-you below runs in `after()`, i.e. after Paystack gets its 2xx.
export const maxDuration = 30;

/** Paystack only stops retrying once it reads a 2xx. */
function received(extra = {}) {
  return NextResponse.json({ success: true, received: true, ...extra });
}

/**
 * Paystack webhook receiver.
 *
 * Verifies the request using the `x-paystack-signature` header (HMAC-SHA512 of
 * the raw body with PAYSTACK_SECRET_KEY), then writes the charge into the
 * payments ledger and upgrades the user's subscription on `charge.success`.
 * The user is identified by the Firebase `uid` passed through the transaction
 * metadata (`/api/payments/initialize`).
 *
 * Every grant is keyed on `data.reference` and the ledger's unique index, so
 * Paystack's retries (and a reconcile performed by hand later) can never grant
 * the same payment twice.
 *
 * Note the deliberate asymmetry with /api/payments/initialize: that endpoint
 * refuses to start a second charge while a paid window is running, but this one
 * always credits a `charge.success` that actually happened. Once money has left
 * the customer's account, refusing to honour it would be theft by omission —
 * the reference is the dedupe key, and the window simply extends.
 */
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 401 }
    );
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const data = event?.data ?? {};
  const reference = data.reference ?? null;
  const email = data.customer?.email ?? null;
  const amount = data.amount ?? 0;
  const channel = data.channel ?? null;
  const uid = data.metadata?.uid ?? null;
  // Metadata is what initialize() set; the amount is the only fallback when a
  // payment was created outside the app (dashboard invoice, etc). Both collapse
  // onto the single offer when they don't name it — and the amount is matched
  // against the configured price as well as the built-in default, so a charge
  // made before a price change still names its plan.
  const inferred = await planByAmountKobo(amount);
  const plan = planById(data.metadata?.plan)?.id ?? inferred?.id ?? PLAN_ID;

  try {
    if (event?.event === "charge.success") {
      if (!reference) {
        console.warn("charge.success without a reference — nothing to record");
        return received({ ignored: "missing reference" });
      }

      const { payment, created } = await recordPayment({
        reference,
        uid,
        email,
        amountKobo: amount,
        plan,
        source: "paystack",
        status: "success",
        channel,
      });

      // Replay: this exact payment already granted access.
      if (payment?.granted) {
        return received({ duplicate: true, reference });
      }

      if (!created) {
        // Row created by initialize() as "pending" — settle it now.
        await updatePayment(reference, {
          status: "success",
          amountKobo: amount,
          channel,
          plan,
        });
      }

      if (!uid) {
        // No account to credit. The row stays ungranted so the dashboard's
        // reconcile flow can attach it by email/uid afterwards.
        console.warn(
          `charge.success ${reference} has no uid in metadata — left for reconciliation`
        );
        return received({ needsReconciliation: true, reference });
      }

      const granted = await upsertSubscription({
        uid,
        email,
        plan,
        reference,
        amount,
        channel,
      });
      await markPaymentGranted(reference, {
        grantedDays: granted.durationDays,
        grantedBy: "paystack-webhook",
      });

      // Thank-you email, sent AFTER the 2xx: Paystack must never wait on SMTP,
      // and a mail failure must not turn a verified payment into a 500 (which
      // would make Paystack retry a charge that was already granted).
      const thankYouFor = uid;
      after(async () => {
        try {
          const result = await sendCampaignToUser("subscriber_thanks", thankYouFor);
          if (!result.ok) {
            console.log(
              `subscriber thank-you skipped for ${thankYouFor}: ${result.reason}`
            );
          }
        } catch (error) {
          console.error("subscriber thank-you failed:", error);
        }
      });

      return received({ reference, expiry: granted.expiry, stackedFrom: granted.stackedFrom });
    }

    if (event?.event === "charge.failed" && reference) {
      // Recorded (never granted) so the dashboard shows failed attempts next to
      // the successful ones instead of them vanishing into the logs.
      const { payment } = await recordPayment({
        reference,
        uid,
        email,
        amountKobo: amount,
        plan,
        source: "paystack",
        status: "failed",
        channel,
        note: data.gateway_response ?? null,
      });
      if (payment?.status !== "failed" && !payment?.granted) {
        await updatePayment(reference, {
          status: "failed",
          note: data.gateway_response ?? null,
        });
      }
      return received({ reference, failed: true });
    }
  } catch (error) {
    // Answers 500 on purpose: Paystack retries, and losing a payment must never
    // look like a successful delivery.
    console.error(`Paystack webhook (${event?.event}) failed:`, error);
    return NextResponse.json(
      { success: false, message: "Failed to process webhook" },
      { status: 500 }
    );
  }

  return received({ ignored: event?.event ?? "unknown" });
}

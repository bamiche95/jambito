import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site";

/**
 * Paystack helpers (signature verification + transaction initialization).
 */

export function verifyPaystackSignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;

  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(hash, "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function initializePaystackTransaction({
  email,
  amount,
  reference,
  plan,
  uid,
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      reference,
      metadata: { plan, uid },
      callback_url: `${SITE_URL}/profile`,
    }),
  });

  return res.json();
}

/**
 * Server-side verification of a single Paystack transaction.
 *
 * Used by the admin "reconcile" flow: when a charge succeeded at Paystack but
 * the webhook never landed (or landed while the API was down), the money is in
 * the account while the customer sees no access. Verification is what lets us
 * grant from Paystack's own record instead of trusting a pasted screenshot.
 */
export async function verifyPaystackTransaction(reference) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" }
  );
  const body = await res.json().catch(() => null);

  return {
    httpStatus: res.status,
    /** Paystack's own "did this succeed" flag, not our HTTP status. */
    verified: Boolean(body?.status) && Boolean(body?.data),
    message: body?.message ?? (res.ok ? null : `Paystack returned ${res.status}`),
    transaction: body?.data ?? null,
  };
}


import { createHmac, timingSafeEqual } from "crypto";
import clientPromise from "@/lib/mongodb";
import { planDurationDays } from "@/lib/plans";

/**
 * Server-side payment helpers (Paystack) shared between the initialize and
 * webhook route handlers.
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
      metadata: { plan },
      callback_url: process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/profile`
        : undefined,
    }),
  });

  return res.json();
}

export async function upsertSubscription({ email, plan, reference, amount }) {
  const client = await clientPromise;
  const db = client.db("jambito");
  const users = db.collection("users");

  const now = new Date();
  const durationDays = planDurationDays(plan);
  const expiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return users.updateOne(
    { email },
    {
      $set: {
        isSubscribed: true,
        subscriptionExpiry: expiry,
        plan,
        reference,
        amount: amount ?? 0,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

export async function getSubscription(email) {
  if (!email) return null;
  const client = await clientPromise;
  const db = client.db("jambito");
  return db.collection("users").findOne({ email });
}

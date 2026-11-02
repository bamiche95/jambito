import { getMongoClient } from "@/lib/mongodb";
import {
  DEFAULT_PLAN,
  PLAN_ID,
  PRICE_LIMITS,
  planById,
  planByPriceKobo,
  planWithPrice,
} from "@/lib/plans";

/**
 * Admin-editable pricing.
 *
 * What the single offer costs is the one commercial decision that gets made
 * without a deploy, so it lives in Mongo instead of in lib/plans.ts. It is a
 * single fixed-id document rather than a key/value bag: reading it is an `_id`
 * lookup, so there is no index to create and no query to get wrong, and a
 * second setting later is another document rather than a schema change.
 *
 *   db "jambito", collection "settings"
 *   { _id: "pricing", priceNaira: 2000, priceKobo: 200000, updatedAt, updatedBy }
 *
 * The document is an OVERRIDE, not the source of truth for the catalogue: the
 * plan's name, duration and features still come from lib/plans.ts. Deleting
 * this document therefore reverts the price to the default with no deploy,
 * which is the rollback path.
 */

const SETTINGS_COLLECTION = "settings";
const PRICING_ID = "pricing";

export async function getSettingsCollection() {
  const client = await getMongoClient();
  return client.db("jambito").collection(SETTINGS_COLLECTION);
}

/**
 * Validates a naira amount an admin typed.
 *
 * Returns `{ ok: true, naira, kobo }` or `{ ok: false, message }` — never
 * throws, so callers can report the reason to the admin verbatim. Only whole
 * naira are accepted: the kobo figure is derived here rather than supplied, so
 * the two can never disagree.
 *
 * The `typeof` guard matters: JSON hands us whatever the client sent, and
 * `Number([100])` is `100`, so `Number.isFinite` alone would accept an array as
 * a price.
 */
export function parsePriceNaira(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, message: "Enter a price in naira." };
  }

  const raw = typeof value === "string" ? value.replace(/[\s,₦]/g, "") : value;
  if (raw === "") return { ok: false, message: "Enter a price in naira." };

  const naira = Number(raw);
  if (!Number.isFinite(naira)) {
    return { ok: false, message: "The price must be a number." };
  }
  if (!Number.isInteger(naira)) {
    return {
      ok: false,
      message: "The price must be a whole number of naira (no kobo).",
    };
  }
  if (naira < PRICE_LIMITS.minNaira) {
    return {
      ok: false,
      message: `The price cannot be below ₦${PRICE_LIMITS.minNaira.toLocaleString()}.`,
    };
  }
  if (naira > PRICE_LIMITS.maxNaira) {
    return {
      ok: false,
      message: `The price cannot exceed ₦${PRICE_LIMITS.maxNaira.toLocaleString()}.`,
    };
  }

  return { ok: true, naira, kobo: naira * 100 };
}

/**
 * The stored document, or `null`.
 *
 * A read failure is deliberately NOT fatal. By the time this can throw, the
 * account checks that gate a checkout have already needed Mongo, so no charge
 * is reachable; the paths that are still reachable are the landing page and the
 * public price endpoint, where quoting the default beats answering 500.
 */
async function readPricingDoc() {
  try {
    const settings = await getSettingsCollection();
    return await settings.findOne({ _id: PRICING_ID });
  } catch (error) {
    console.error("[pricingStore] could not read the pricing document:", error);
    return null;
  }
}

/**
 * The live price, merged onto the single plan.
 *
 * `source` says which figure won, so the dashboard can tell an admin whether
 * they are looking at a stored override or the built-in default.
 */
export async function getPricing({ planId = PLAN_ID } = {}) {
  const base = planById(planId) ?? DEFAULT_PLAN;
  const doc = await readPricingDoc();
  const parsed = doc ? parsePriceNaira(doc.priceNaira) : null;
  const shape = {
    planId: base.id,
    planName: base.name,
    durationDays: base.durationDays,
  };

  if (!parsed?.ok) {
    return {
      ...shape,
      priceNaira: base.priceNaira,
      priceKobo: base.priceKobo,
      source: "default",
      updatedAt: null,
      updatedBy: null,
    };
  }

  return {
    ...shape,
    priceNaira: parsed.naira,
    priceKobo: parsed.kobo,
    source: "db",
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    updatedBy: doc.updatedBy ?? null,
  };
}

/** The whole plan with the live price applied — for server-rendered pages. */
export async function getPlan(planId = PLAN_ID) {
  const pricing = await getPricing({ planId });
  const base = planById(pricing.planId) ?? DEFAULT_PLAN;
  return planWithPrice(base, pricing);
}

/**
 * What to charge for a plan. The only figure an admin edit changes.
 *
 * Always re-read on each call rather than cached: a price change must take
 * effect on the next checkout, not the one after a redeploy.
 */
export async function getPlanPriceKobo(planId) {
  const pricing = await getPricing({ planId });
  return pricing.priceKobo;
}

/**
 * Reverse lookup by charge amount, for transactions whose metadata is missing.
 *
 * Checks the configured price first and the static default second, because a
 * payment made before a price change was legitimately for the old amount and
 * must still name its plan when it is reconciled afterwards.
 */
export async function planByAmountKobo(amountKobo) {
  const amount = Number(amountKobo);
  if (!Number.isFinite(amount)) return undefined;

  const staticMatch = planByPriceKobo(amount);
  if (staticMatch) return staticMatch;

  const pricing = await getPricing();
  if (pricing.priceKobo === amount) {
    return planById(pricing.planId) ?? DEFAULT_PLAN;
  }
  return undefined;
}

/**
 * Stores a new price.
 *
 * Rejects a no-op save so the audit trail stays a list of actual changes, and
 * reads the effective value back from the database rather than echoing the
 * input. Callers own the audit entry — see app/api/admin/pricing/route.js.
 *
 * Note what this does NOT touch: payments already made keep the amount that was
 * actually charged, and access windows already granted keep their dates. A
 * price change only affects future checkouts.
 */
export async function savePricing({ priceNaira, actor = null, note = null } = {}) {
  const parsed = parsePriceNaira(priceNaira);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_price", message: parsed.message };
  }

  const before = await getPricing();
  if (before.priceNaira === parsed.naira) {
    return {
      ok: false,
      code: "unchanged",
      message: `The price is already ₦${parsed.naira.toLocaleString()}.`,
      pricing: before,
    };
  }

  const now = new Date();
  const settings = await getSettingsCollection();
  await settings.updateOne(
    { _id: PRICING_ID },
    {
      $set: {
        priceNaira: parsed.naira,
        priceKobo: parsed.kobo,
        updatedAt: now,
        updatedBy: actor
          ? { uid: actor.uid ?? null, email: actor.email ?? null }
          : null,
      },
    },
    { upsert: true }
  );

  const pricing = await getPricing();
  return {
    ok: true,
    pricing,
    previous: {
      priceNaira: before.priceNaira,
      priceKobo: before.priceKobo,
      source: before.source,
    },
    note: typeof note === "string" && note.trim() ? note.trim() : null,
  };
}

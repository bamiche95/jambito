/**
 * Shared plan / pricing / trial definitions.
 *
 * There is exactly ONE offer: a single one-off payment that buys 12 months of
 * unlimited access to every exam board, subject and year. It is NOT a
 * subscription — nothing recurs, nothing is charged automatically, and the
 * student decides again after the year runs out. While a window is still valid
 * the app hides every pay button and the server refuses a second checkout (see
 * lib/subscription.ts and app/api/payments/initialize/route.js).
 *
 * The PRICE is editable from the admin dashboard and stored in Mongo, so the
 * figures below are the DEFAULT/fallback, not the live price. Anything that
 * needs the current price reads it through lib/pricingStore.js (server) or
 * usePricing() (client); the constants here cover the case where the stored
 * document is missing or unreadable, and nothing else.
 *
 * Kept dependency-free so it can be imported from both client components and
 * server-side route handlers without pulling in browser-only modules — which is
 * also why the admin-editable parts live elsewhere.
 */

export const TRIAL_LIMIT = 40;

/**
 * Seconds a trial-exhausted visitor may read a question set before the paywall
 * overlay covers it (see components/cbt/CbtPractice.tsx).
 */
export const TRIAL_PREVIEW_SECONDS = 3;

export type PlanId = "yearly";

/** The only purchasable plan. */
export const PLAN_ID: PlanId = "yearly";

/** Longest manual grant an admin may hand out (~10 years). */
export const MAX_GRANT_DAYS = 3650;

/**
 * Bounds for the admin-editable price.
 *
 * The floor sits above Paystack's own minimum charge, and the ceiling exists so
 * a slipped keystroke (₦1,500 → ₦15,0000, or an extra zero on a bigger price)
 * is rejected instead of being charged to a student. Both are whole naira.
 */
export const PRICE_LIMITS = { minNaira: 100, maxNaira: 100000 } as const;

export interface Plan {
  id: PlanId;
  name: string;
  /** One-off: the charge never repeats on its own. */
  interval: "one-off";
  /** Whole naira, as displayed. Default only — see lib/pricingStore.js. */
  priceNaira: number;
  /** Amount in kobo (Paystack expects the smallest currency unit). */
  priceKobo: number;
  durationDays: number;
  /** Calendar years covered — see planExpiryFrom(). */
  durationYears: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: PLAN_ID,
    name: "Annual Access",
    interval: "one-off",
    // Default only: the live figure is whatever the admin last saved
    // (lib/pricingStore.js). Kept in step with DEFAULT rather than removed so
    // the app can always quote a price, even with Mongo unreachable.
    priceNaira: 1500,
    priceKobo: 150000,
    durationDays: 365,
    durationYears: 1,
    description: "One payment · 12 months of unlimited access",
    popular: true,
    features: [
      "Every exam board — JAMB, WAEC & POST UTME",
      "Every subject, every year",
      "Unlimited past questions",
      "Detailed explanations",
      "Progress analytics & bookmarks",
      "Offline downloads",
    ],
  },
];

/**
 * Fallback for legacy or missing plan ids.
 *
 * Replaces the old `PLANS[1]` (monthly) fallback: the catalogue now holds a
 * single entry, so an index-based fallback would hand every caller `undefined`.
 */
export const DEFAULT_PLAN: Plan = PLANS[0];

/**
 * Display names for plan ids that older records still carry. Anything unknown
 * is echoed back unchanged so the admin dashboard never shows a blank.
 */
const LEGACY_PLAN_LABELS: Record<string, string> = {
  weekly: "Weekly (legacy)",
  monthly: "Monthly (legacy)",
  quarterly: "Quarterly (legacy)",
};

export function planById(id?: string | null): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/**
 * Plan ids the old four-tier catalogue used. Requests (or stored records) still
 * carrying one of these are treated as the single current offer rather than
 * being rejected: the price is the price, and there was never a cheaper rate to
 * honour.
 */
const LEGACY_PLAN_IDS = ["weekly", "monthly", "quarterly", "yearly"];

/**
 * Maps a requested plan id onto the catalogue, or `null` when it is nonsense.
 *
 * An omitted id means "the offer", which is now unambiguous.
 */
export function resolvePlanId(id?: string | null): PlanId | null {
  if (id == null || id === "") return PLAN_ID;
  const known = planById(id);
  if (known) return known.id;
  return LEGACY_PLAN_IDS.includes(String(id)) ? PLAN_ID : null;
}

export function planLabel(planId?: string | null): string {
  if (!planId) return DEFAULT_PLAN.name;
  return planById(planId)?.name ?? LEGACY_PLAN_LABELS[planId] ?? planId;
}

export function planDurationDays(planId?: string | null): number {
  return planById(planId)?.durationDays ?? DEFAULT_PLAN.durationDays;
}

/**
 * The DEFAULT price for a plan id.
 *
 * Server code that decides what to CHARGE must not call this: use
 * `getPlanPriceKobo()` from lib/pricingStore.js, which prefers the
 * admin-editable value. This one exists for the fallback and for the
 * client-side default before the live price has loaded.
 */
export function planPriceKobo(planId?: string | null): number {
  return planById(planId)?.priceKobo ?? DEFAULT_PLAN.priceKobo;
}

/**
 * Overlays a live price onto a plan, or hands the plan back untouched when the
 * price is missing or nonsense.
 *
 * Every caller of this treats the price as display data: the amount that is
 * actually charged is decided server-side, so a bad value degrades to the
 * default rather than needing to throw.
 */
export function planWithPrice(
  plan: Plan,
  pricing?: { priceNaira?: number | null; priceKobo?: number | null } | null
): Plan {
  const priceNaira = Number(pricing?.priceNaira);
  const priceKobo = Number(pricing?.priceKobo);
  const usable =
    Number.isFinite(priceNaira) &&
    Number.isFinite(priceKobo) &&
    priceNaira > 0 &&
    priceKobo > 0;
  return usable ? { ...plan, priceNaira, priceKobo } : plan;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calendar-year arithmetic: the same date next year, not "365 days later".
 *
 * 29 February has no counterpart in a common year, so it clamps to 28 February
 * rather than silently rolling into March.
 */
export function addYears(from: Date | number, years = 1): Date {
  const date = new Date(typeof from === "number" ? from : from.getTime());
  const day = date.getDate();
  date.setFullYear(date.getFullYear() + years);
  // `setFullYear` rolled an impossible date forward (29 Feb -> 1 Mar): step
  // back to the last day of the intended month instead.
  if (date.getDate() !== day) date.setDate(0);
  return date;
}

/**
 * The window a grant produces, from one place so the webhook, the reconcile
 * flow and the admin dashboard can never disagree about when access ends.
 *
 * `base` is the point the new window starts from — the caller resolves whether
 * that is "now" or an unexpired window it is stacking onto. Pass `days` only to
 * override the plan with an exact number of days (admin corrections).
 */
export function planExpiryFrom({
  base,
  planId,
  days,
}: {
  base: Date | number;
  planId?: string | null;
  days?: number | null;
}): { expiry: Date; durationDays: number } {
  const plan = planById(planId) ?? DEFAULT_PLAN;
  const requested = Number(days);
  const baseMs = new Date(base).getTime();

  if (Number.isFinite(requested) && requested > 0) {
    const durationDays = Math.min(MAX_GRANT_DAYS, Math.floor(requested));
    return { expiry: new Date(baseMs + durationDays * MS_PER_DAY), durationDays };
  }

  return {
    expiry: addYears(baseMs, plan.durationYears),
    durationDays: plan.durationDays,
  };
}

/**
 * Reverse lookup by amount against the STATIC catalogue.
 *
 * Kept as-is for the fallback path; the amount a customer was actually charged
 * may also match the admin-editable price, which this cannot know about. Server
 * code should prefer `planByAmountKobo()` from lib/pricingStore.js, which
 * checks both.
 */
export function planByPriceKobo(amountKobo?: number | null): Plan | undefined {
  const amount = Number(amountKobo);
  if (!Number.isFinite(amount)) return undefined;
  return PLANS.find((p) => p.priceKobo === amount);
}

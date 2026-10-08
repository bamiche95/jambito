/**
 * Shared plan / pricing / trial definitions.
 *
 * There is exactly ONE offer: a single one-off payment of ₦1,500 that buys 12
 * months of unlimited access to every exam board, subject and year. It is NOT a
 * subscription — nothing recurs, nothing is charged automatically, and the
 * student decides again after the year runs out. While a window is still valid
 * the app hides every pay button and the server refuses a second checkout (see
 * lib/subscription.ts and app/api/payments/initialize/route.js).
 *
 * Kept dependency-free so it can be imported from both client components and
 * server-side route handlers without pulling in browser-only modules.
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

export interface Plan {
  id: PlanId;
  name: string;
  /** One-off: the charge never repeats on its own. */
  interval: "one-off";
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

export function planPriceKobo(planId?: string | null): number {
  return planById(planId)?.priceKobo ?? DEFAULT_PLAN.priceKobo;
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
 * Reverse lookup by amount, used when reconciling a Paystack transaction whose
 * metadata is missing: the charge amount is the only hint left about which plan
 * the customer paid for.
 */
export function planByPriceKobo(amountKobo?: number | null): Plan | undefined {
  const amount = Number(amountKobo);
  if (!Number.isFinite(amount)) return undefined;
  return PLANS.find((p) => p.priceKobo === amount);
}

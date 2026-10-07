/**
 * Shared plan / pricing / trial definitions.
 *
 * Kept dependency-free so it can be imported from both client components and
 * server-side route handlers without pulling in browser-only modules.
 */

export const FREE_TRIAL_LIMIT = 5;

export interface Plan {
  id: "weekly" | "monthly" | "quarterly" | "yearly";
  name: string;
  interval: "weekly" | "monthly" | "quarterly" | "yearly";
  priceNaira: number;
  /** Amount in kobo (Paystack expects the smallest currency unit). */
  priceKobo: number;
  durationDays: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "weekly",
    name: "Weekly",
    interval: "weekly",
    priceNaira: 500,
    priceKobo: 50000,
    durationDays: 7,
    description: "Full access for 7 days",
    features: [
      "Unlimited past questions",
      "All subjects & years",
      "Detailed explanations",
      "Offline downloads",
    ],
  },
  {
    id: "monthly",
    name: "Monthly",
    interval: "monthly",
    priceNaira: 1500,
    priceKobo: 150000,
    durationDays: 30,
    description: "Best value for serious practice",
    popular: true,
    features: [
      "Everything in Weekly",
      "Progress analytics",
      "Bookmarks & history",
      "Priority support",
    ],
  },
  {
    id: "quarterly",
    name: "Quarterly",
    interval: "quarterly",
    priceNaira: 4000,
    priceKobo: 400000,
    durationDays: 90,
    description: "3 months of uninterrupted access",
    features: [
      "Everything in Monthly",
      "Save 10% vs monthly",
      "Exam performance reports",
    ],
  },
  {
    id: "yearly",
    name: "Yearly",
    interval: "yearly",
    priceNaira: 12000,
    priceKobo: 1200000,
    durationDays: 365,
    description: "A full year of exam preparation",
    features: [
      "Everything in Quarterly",
      "Save 33% vs monthly",
      "Early access to new features",
    ],
  },
];

export function planById(id?: string | null): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function planDurationDays(planId?: string | null): number {
  return planById(planId)?.durationDays ?? PLANS[1].durationDays;
}

export function planPriceKobo(planId?: string | null): number {
  return planById(planId)?.priceKobo ?? PLANS[1].priceKobo;
}

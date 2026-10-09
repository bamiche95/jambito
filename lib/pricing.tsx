"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_PLAN, planWithPrice, type Plan } from "./plans";
import type { Pricing } from "./types";

interface PricingContextValue {
  /**
   * The single offer with the live price applied. Never null — the built-in
   * default stands in until the real figure arrives, so copy that quotes a
   * price is never blank.
   */
  plan: Plan;
  priceNaira: number;
  priceKobo: number;
  /** False while the first read is still in flight. */
  loaded: boolean;
  /** Re-reads the price; called after an admin edits it. */
  refreshPricing: () => Promise<void>;
}

const PricingContext = createContext<PricingContextValue | null>(null);

/**
 * Reads the live price. Resolves to `null` when it cannot be read, which the
 * caller treats as "keep what you have" rather than as an error: nothing on
 * this side decides what is charged, so a stale figure misinforms but can never
 * overcharge — the server re-reads the price when a checkout starts.
 */
async function fetchPricing(): Promise<Pricing | null> {
  try {
    const res = await fetch("/api/pricing", { cache: "no-store" });
    const json = (await res.json()) as
      | { success?: boolean; pricing?: Pricing }
      | null;
    return json?.success && json.pricing ? json.pricing : null;
  } catch {
    // Offline, or the endpoint is down.
    return null;
  }
}

/**
 * Live pricing for the client.
 *
 * The price is the one piece of the plan that changes without a deploy, so
 * every component that quotes it reads it from here rather than importing the
 * constant — otherwise an admin edit would leave the paywall advertising the
 * old figure while the server charged the new one.
 *
 * Fetched from the public /api/pricing rather than /api/trial because the price
 * is shown to signed-out visitors too (the landing page and the paywall both
 * quote it), and a session-gated endpoint would leave exactly those visitors on
 * the stale default.
 */
export function PricingProvider({ children }: { children: ReactNode }) {
  const [pricing, setPricing] = useState<Pricing | null>(null);

  const refreshPricing = useCallback(async () => {
    const next = await fetchPricing();
    if (next) setPricing(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPricing().then((next) => {
      if (!cancelled && next) setPricing(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = planWithPrice(DEFAULT_PLAN, pricing);

  return (
    <PricingContext.Provider
      value={{
        plan,
        priceNaira: plan.priceNaira,
        priceKobo: plan.priceKobo,
        loaded: pricing != null,
        refreshPricing,
      }}
    >
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing(): PricingContextValue {
  const context = useContext(PricingContext);
  if (!context) {
    throw new Error("usePricing must be used within a PricingProvider");
  }
  return context;
}

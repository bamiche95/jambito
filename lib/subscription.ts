import { TRIAL_LIMIT } from "./plans";
import type { Profile } from "./types";

export { TRIAL_LIMIT };

/**
 * Pure subscription helpers (no browser APIs, no server APIs).
 * Trial tracking itself is done server-side — see lib/users.js.
 */

export function isSubscriptionActive(
  profile?: Profile | null
): boolean {
  if (!profile?.isSubscribed) return false;
  if (!profile.subscriptionExpiry) return true;
  const expiry = new Date(profile.subscriptionExpiry).getTime();
  if (Number.isNaN(expiry)) return Boolean(profile.isSubscribed);
  return expiry > Date.now();
}

/**
 * Whether a payment button may be shown at all.
 *
 * `"active"` — the server confirmed access is still running: no price, no
 * checkout, nothing to buy. The window simply runs out and the offer returns.
 * `"loading"` — signed in but the status has not been confirmed yet, so showing
 * a price could invite a second payment; wait instead.
 * `"open"` — nothing says this account is paid up, so the offer is shown.
 *
 * The server is the backstop (a second checkout answers 409), but hiding the
 * button is what keeps the question from arising.
 */
export type PaymentGate = "active" | "loading" | "open";

export function paymentGate({
  signedIn,
  entitlementKnown,
  isSubscribed,
}: {
  signedIn: boolean;
  entitlementKnown: boolean;
  isSubscribed: boolean;
}): PaymentGate {
  if (!signedIn) return "open";
  if (isSubscribed && entitlementKnown) return "active";
  return entitlementKnown ? "open" : "loading";
}

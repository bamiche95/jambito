import { TRIAL_LIMIT_PER_EXAM } from "./plans";
import type { Profile } from "./types";

export { TRIAL_LIMIT_PER_EXAM };

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

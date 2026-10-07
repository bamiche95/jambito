import { FREE_TRIAL_LIMIT } from "./plans";
import {
  getTrialUsed,
  incrementTrial,
  questionKey,
} from "./offlineStore";
import type { Profile } from "./types";

/**
 * Freemium / subscription helpers.
 *
 * Guest trial quota is tracked client-side (IndexedDB), keyed by exam|subject|year.
 * Subscription status (paid) is read from a user profile fetched from the server.
 */

export { FREE_TRIAL_LIMIT };

export function trialKey(
  exam: string,
  subject: string,
  year: string
): string {
  return questionKey(exam, subject, year);
}

export async function getTrialRemaining(key: string): Promise<number> {
  const used = await getTrialUsed(key);
  return Math.max(0, FREE_TRIAL_LIMIT - used);
}

export interface TrialResult {
  allowed: boolean;
  remaining: number;
  used: number;
}

/**
 * Consume a single trial answer for a given subject/year.
 * Returns whether the attempt is allowed and the remaining free quota.
 */
export async function consumeTrial(key: string): Promise<TrialResult> {
  const used = await getTrialUsed(key);
  if (used >= FREE_TRIAL_LIMIT) {
    return { allowed: false, remaining: 0, used };
  }
  const next = await incrementTrial(key);
  return {
    allowed: true,
    remaining: Math.max(0, FREE_TRIAL_LIMIT - next),
    used: next,
  };
}

export function isSubscriptionActive(
  profile?: Profile | null
): boolean {
  if (!profile?.isSubscribed) return false;
  if (!profile.subscriptionExpiry) return true;
  const expiry = new Date(profile.subscriptionExpiry).getTime();
  if (Number.isNaN(expiry)) return Boolean(profile.isSubscribed);
  return expiry > Date.now();
}

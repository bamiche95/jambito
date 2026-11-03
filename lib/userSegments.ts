/**
 * Trial-lifecycle segments for the admin dashboard's user list.
 *
 * Kept dependency-free — same reason as lib/accountStatus.ts — so `.js` route
 * handlers and `.tsx` client components share one vocabulary of ids and labels.
 * Only the *names* live here: the Mongo filters are server-side
 * (lib/adminUsers.js#segmentQuery) and mirror `audienceFilter()` in
 * lib/emailEngine.js, so the dashboard counts exactly the students the progress
 * campaigns select.
 *
 *  never_started   signed up, not a single free question answered.
 *  in_progress     used some of the free questions, not all of them.
 *  trial_exhausted used all TRIAL_LIMIT free questions (subscribed or not).
 *  subscribed      has an active paid window right now.
 *  joined_7d/30d   created in the last 7 / 30 days.
 *
 * Tombstones (`status: "deleted"`) and staff accounts are excluded from every
 * segment: a soft-deleted document keeps its `trialCount`, so counting it would
 * inflate "trial completed", and a dashboard test account would skew the
 * conversion rate.
 */

import { TRIAL_LIMIT } from "./plans";

export type UserSegment =
  | "all"
  | "never_started"
  | "in_progress"
  | "trial_exhausted"
  | "exhausted_unsubscribed"
  | "subscribed"
  | "joined_7d"
  | "joined_30d";

export const USER_SEGMENTS: UserSegment[] = [
  "all",
  "never_started",
  "in_progress",
  "trial_exhausted",
  "exhausted_unsubscribed",
  "subscribed",
  "joined_7d",
  "joined_30d",
];

export const USER_SEGMENT_LABELS: Record<UserSegment, string> = {
  all: "All accounts",
  never_started: "Never started",
  in_progress: "Trial in progress",
  trial_exhausted: "Trial completed",
  exhausted_unsubscribed: "Completed, not subscribed",
  subscribed: "Subscribed",
  joined_7d: "Joined last 7 days",
  joined_30d: "Joined last 30 days",
};

/** What each segment means, in words — shown as the card's tooltip. */
export const USER_SEGMENT_HINTS: Record<UserSegment, string> = {
  all: "Every account, including deleted tombstones and staff.",
  never_started: "Signed up but has not answered a single free question yet.",
  in_progress: `Has used some of the ${TRIAL_LIMIT} free questions, but not all of them.`,
  trial_exhausted: `Has used all ${TRIAL_LIMIT} free questions, whether or not they later subscribed.`,
  exhausted_unsubscribed: `Used all ${TRIAL_LIMIT} free questions and has no active subscription — the win-back list.`,
  subscribed: "Has an active paid subscription right now.",
  joined_7d: "Accounts created in the last 7 days.",
  joined_30d: "Accounts created in the last 30 days.",
};

export function isValidUserSegment(value: unknown): value is UserSegment {
  return USER_SEGMENTS.includes(value as UserSegment);
}

/**
 * Where a single account stands in the free trial — the row badge's state.
 *
 * `trial_exhausted` (a segment id) and `exhausted` (this state) are the same
 * condition; the shorter name keeps the badge vocabulary separate from the
 * filter vocabulary without a second string table.
 */
export type TrialState = "never_started" | "in_progress" | "exhausted";

export const TRIAL_STATE_LABELS: Record<TrialState, string> = {
  never_started: "Never started",
  in_progress: "In progress",
  exhausted: "Trial completed",
};

export function getTrialState(
  user?: { trialCount?: unknown } | null
): TrialState {
  const used = Number(user?.trialCount) || 0;
  if (used <= 0) return "never_started";
  return used >= TRIAL_LIMIT ? "exhausted" : "in_progress";
}

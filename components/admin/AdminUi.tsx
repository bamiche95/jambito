"use client";

import { cn } from "@/lib/utils";
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/accountStatus";
import {
  TRIAL_STATE_LABELS,
  getTrialState,
  type TrialState,
} from "@/lib/userSegments";
import type { AdminUser } from "@/lib/types";

/**
 * Small presentation helpers shared by the admin panels. Plain Tailwind, no
 * new dependency — matching the rest of the app's components.
 */

const STATUS_STYLES: Record<AccountStatus, string> = {
  active: "bg-green-100 text-green-700",
  deactivated: "bg-amber-100 text-amber-800",
  blocked: "bg-red-100 text-red-700",
  deleted: "bg-slate-200 text-slate-600",
};

export function StatusBadge({
  status,
  className,
}: {
  status: AccountStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-semibold",
        STATUS_STYLES[status],
        className
      )}
    >
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}

const TRIAL_STYLES: Record<TrialState, string> = {
  never_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-800",
  exhausted: "bg-orange-100 text-orange-700",
};

/**
 * Where one account sits in the free trial: never started, mid-trial, or out of
 * questions. Status colours stay reserved for StatusBadge, so the two columns
 * never read as the same signal.
 */
export function TrialBadge({
  user,
  className,
}: {
  user: Pick<AdminUser, "trialCount">;
  className?: string;
}) {
  const state = getTrialState(user);
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-semibold",
        TRIAL_STYLES[state],
        className
      )}
    >
      {TRIAL_STATE_LABELS[state]}
    </span>
  );
}

export function RoleBadge({ role }: { role: "user" | "admin" }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-semibold",
        role === "admin"
          ? "bg-purple-100 text-purple-700"
          : "bg-slate-100 text-slate-600"
      )}
    >
      {role}
    </span>
  );
}

export function SubscriptionBadge({
  user,
}: {
  user: Pick<AdminUser, "isSubscribed" | "subscriptionExpiry">;
}) {
  const expiry = user.subscriptionExpiry
    ? new Date(user.subscriptionExpiry)
    : null;
  // `isSubscribed` is computed server-side against the clock, so the badge
  // never has to read the current time during render (which React forbids).
  if (!user.isSubscribed) {
    return (
      <span className="text-slate-400 text-xs">
        {expiry ? `No subscription · ended ${expiry.toLocaleDateString()}` : "No subscription"}
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
      Active{expiry ? ` · ${expiry.toLocaleDateString()}` : ""}
    </span>
  );
}

/** Dismissible inline feedback strip (success or failure) for the panels. */
export function NoticeBar({
  notice,
  onDismiss,
}: {
  notice: { kind: "ok" | "error" | "info"; text: string };
  onDismiss?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        notice.kind === "ok"
          ? "border-green-200 bg-green-50 text-green-800"
          : notice.kind === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-blue-200 bg-blue-50 text-blue-800"
      )}
      role="status"
    >
      <span className="whitespace-pre-wrap">{notice.text}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold underline opacity-70 hover:opacity-100"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

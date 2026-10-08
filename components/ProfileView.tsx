"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Clock,
  Bookmark,
  Target,
  TrendingUp,
  LogOut,
  AlertTriangle,
  ShieldOff,
  PauseCircle,
  UserRound,
  History,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAttempts, getBookmarkIds } from "@/lib/offlineStore";
import { DEFAULT_PLAN, planLabel } from "@/lib/plans";
import { isSubscriptionActive } from "@/lib/subscription";
import {
  ACCOUNT_STATUS_LABELS,
  accountStatusMessage,
  type AccountStatus,
} from "@/lib/accountStatus";
import type { AttemptRecord, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ProfileView() {
  const {
    user,
    getIdToken,
    loading: authLoading,
    signOut,
    accountState,
  } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAttempts().then(setAttempts);
    getBookmarkIds().then((ids) => setBookmarkCount(ids.length));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    getIdToken().then((token) => {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((json) => {
          if (!cancelled && json.success) setProfile(json.profile);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, getIdToken, user?.uid]);

  const active = isSubscriptionActive(profile);
  // The profile endpoint 403s for a deleted tombstone, so the server-confirmed
  // state from /api/trial is the fallback that still explains the lockout.
  const status: AccountStatus = profile?.status ?? accountState;
  const locked = status !== "active";
  const attemptedQuestions = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
  const avg = attemptedQuestions
    ? Math.round(
        (attempts.reduce((sum, attempt) => sum + attempt.score, 0) /
          attemptedQuestions) *
          100
      )
    : 0;

  return (
    <main className="flex-1">
      <section className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:py-9">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-300/20">
              <UserRound className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">
                Your account
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                My profile
              </h1>
              <p className="mt-1 truncate text-sm text-slate-300">
                {user?.email ?? user?.displayName ?? "Account overview"}
              </p>
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 sm:self-auto"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-9">
        <nav aria-label="Study dashboards" className="mb-5 hidden gap-2 md:flex">
          <Link
            href="/history"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-700"
          >
            <History className="h-4 w-4" aria-hidden />
            Practice history
          </Link>
          <Link
            href="/stats"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-700"
          >
            <ChartNoAxesColumnIncreasing className="h-4 w-4" aria-hidden />
            Progress stats
          </Link>
        </nav>

        {locked && (
          <div
            role="status"
            className={cn(
              "mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 sm:p-5",
              status === "blocked" || status === "deleted"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            )}
          >
            {status === "deactivated" ? (
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            ) : (
              <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                Account {ACCOUNT_STATUS_LABELS[status].toLowerCase()}
              </p>
              <p>{accountStatusMessage(status)}</p>
              {status === "deactivated" && (
                <Link
                  href="/cbt"
                  className="inline-flex min-h-10 items-center font-semibold underline underline-offset-4"
                >
                  Pay ₦{DEFAULT_PLAN.priceNaira.toLocaleString()} to restore access
                </Link>
              )}
              {profile?.role === "admin" && (
                <p className="pt-1">
                  Admin access is unaffected —{" "}
                  <Link href="/admin" className="font-semibold underline underline-offset-4">
                    open the dashboard
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-5">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                  Membership
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Your access
                </h2>
              </div>
              {loading ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                  Checking
                </span>
              ) : (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    locked
                      ? "bg-amber-100 text-amber-800"
                      : active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-blue-100 text-blue-800"
                  )}
                >
                  {locked
                    ? ACCOUNT_STATUS_LABELS[status]
                    : active
                      ? "Active"
                      : "Free trial"}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex min-h-24 items-center gap-3 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden />
                Checking your access…
              </div>
            ) : locked ? (
              <div className="flex min-h-24 items-start gap-3 rounded-lg bg-amber-50 p-4 text-amber-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p className="text-sm leading-6">
                  Access is paused. Contact support to resolve it.
                </p>
              </div>
            ) : active ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Current plan</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {planLabel(profile?.plan)}
                  </p>
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <Clock className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <span>
                    Expires{" "}
                    <span className="font-medium text-slate-800">
                      {profile?.subscriptionExpiry
                        ? new Date(profile.subscriptionExpiry).toLocaleDateString()
                        : "—"}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-24 flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <p className="max-w-xs text-sm leading-6 text-slate-600">
                  You&apos;re on the free trial. Unlock every subject and year for
                  12 months.
                </p>
                <Link
                  href="/cbt"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 sm:w-auto"
                >
                  Get 12 months
                </Link>
              </div>
            )}
          </section>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <StatCard
              icon={Target}
              label="Attempts"
              value={String(attempts.length)}
              tone="blue"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg. score"
              value={attempts.length ? `${avg}%` : "—"}
              tone="emerald"
            />
            <StatCard
              icon={Bookmark}
              label="Bookmarks"
              value={String(bookmarkCount)}
              tone="amber"
            />
          </div>
        </div>

        <section className="mt-8 sm:mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                Keep your momentum
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Practice history
              </h2>
            </div>
            {attempts.length > 0 && (
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {attempts.length} {attempts.length === 1 ? "session" : "sessions"}
              </span>
            )}
          </div>

          {attempts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center sm:py-9">
              <Target className="mx-auto h-7 w-7 text-slate-400" aria-hidden />
              <p className="mt-3 font-semibold text-slate-800">No practice sessions yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Your completed sessions and scores will appear here.
              </p>
              <Link
                href="/cbt"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/25"
              >
                Start practicing
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="divide-y divide-slate-100">
                {attempts.map((attempt) => {
                  const scoreTone =
                    attempt.percentage >= 60
                      ? "text-emerald-700 bg-emerald-50"
                      : attempt.percentage >= 40
                        ? "text-amber-700 bg-amber-50"
                        : "text-red-700 bg-red-50";
                  const progressTone =
                    attempt.percentage >= 60
                      ? "bg-emerald-500"
                      : attempt.percentage >= 40
                        ? "bg-amber-500"
                        : "bg-red-500";

                  return (
                    <div
                      key={`${attempt.key}-${attempt.date}`}
                      className="flex min-w-0 items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5"
                    >
                      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 sm:flex">
                        <Target className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {attempt.exam} {attempt.subject} {attempt.year}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(attempt.date).toLocaleString()}
                        </p>
                        <div
                          role="progressbar"
                          aria-label={`Score ${attempt.percentage}%`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.max(0, Math.min(100, attempt.percentage))}
                          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                        >
                          <div
                            className={cn("h-full rounded-full", progressTone)}
                            style={{
                              width: `${Math.max(0, Math.min(100, attempt.percentage))}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-lg px-2 py-1 text-xs font-bold",
                            scoreTone
                          )}
                        >
                          {attempt.percentage}%
                        </span>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {attempt.score}/{attempt.total}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone: "blue" | "emerald" | "amber";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      <span className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className="truncate text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-slate-500 sm:text-sm">
        {label}
      </p>
    </div>
  );
}

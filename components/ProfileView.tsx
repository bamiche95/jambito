"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  BadgeCheck,
  Clock,
  Bookmark,
  Target,
  TrendingUp,
  LogOut,
  AlertTriangle,
  ShieldOff,
  PauseCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAttempts, getBookmarkIds } from "@/lib/offlineStore";
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
  const avg =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length
        )
      : 0;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 w-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
          <p className="text-slate-500 mt-2">
            {user?.email ?? user?.displayName ?? "Account"}
          </p>
        </div>
        {user && (
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        )}
      </div>

      {locked && (
        <div
          className={cn(
            "mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm",
            status === "blocked" || status === "deleted"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          )}
        >
          {status === "deactivated" ? (
            <PauseCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <ShieldOff className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              Account {ACCOUNT_STATUS_LABELS[status].toLowerCase()}
            </p>
            <p>{accountStatusMessage(status)}</p>
            {status === "deactivated" && (
              <Link href="/cbt" className="inline-block font-semibold underline">
                Subscribe to restore access
              </Link>
            )}
            {profile?.role === "admin" && (
              <p className="pt-1">
                Admin access is unaffected —{" "}
                <Link href="/admin" className="font-semibold underline">
                  open the dashboard
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="md:col-span-1 bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Subscription</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking…
            </div>
          ) : locked ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-600 font-semibold">
                <AlertTriangle className="w-5 h-5" />
                {ACCOUNT_STATUS_LABELS[status]}
              </div>
              <p className="text-sm text-slate-500">
                Access is paused. Contact support to resolve it.
              </p>
            </div>
          ) : active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <BadgeCheck className="w-5 h-5" /> Active
              </div>
              <p className="text-sm text-slate-500">
                Plan:{" "}
                <span className="font-medium text-slate-700">
                  {profile?.plan ?? "Monthly"}
                </span>
              </p>
              <p className="text-sm text-slate-500 flex items-center gap-1">
                <Clock className="w-4 h-4" /> Expires{" "}
                {profile?.subscriptionExpiry
                  ? new Date(profile.subscriptionExpiry).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                You&apos;re on the free trial.
              </p>
              <Link
                href="/cbt"
                className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                Upgrade now
              </Link>
            </div>
          )}
        </div>

        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Target}
            label="Attempts"
            value={String(attempts.length)}
          />
          <StatCard
            icon={TrendingUp}
            label="Avg. score"
            value={attempts.length ? `${avg}%` : "—"}
          />
          <StatCard
            icon={Bookmark}
            label="Bookmarks"
            value={String(bookmarkCount)}
          />
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Practice history
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No attempts yet.{" "}
            <Link href="/cbt" className="text-blue-600 hover:underline">
              Start practicing
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {attempts.map((a, i) => (
              <div
                key={`${a.key}-${a.date}`}
                className={cn(
                  "flex items-center justify-between px-5 py-3 text-sm",
                  i % 2 === 0 ? "bg-white" : "bg-slate-50"
                )}
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {a.exam} {a.subject} {a.year}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(a.date).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-bold",
                    a.percentage >= 60
                      ? "text-green-600"
                      : a.percentage >= 40
                        ? "text-amber-600"
                        : "text-red-600"
                  )}
                >
                  {a.score}/{a.total} · {a.percentage}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <Icon className="w-5 h-5 text-blue-600 mb-2" />
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

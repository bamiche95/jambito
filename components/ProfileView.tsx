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
} from "lucide-react";
import { getAttempts, getBookmarkIds } from "@/lib/offlineStore";
import { isSubscriptionActive } from "@/lib/subscription";
import type { AttemptRecord, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ProfileView() {
  const [email] = useState<string | null>(() =>
    typeof localStorage !== "undefined"
      ? localStorage.getItem("jambito_pro_email")
      : null
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(() => Boolean(email));

  useEffect(() => {
    getAttempts().then(setAttempts);
    getBookmarkIds().then((ids) => setBookmarkCount(ids.length));

    if (email) {
      fetch(`/api/profile?email=${encodeURIComponent(email)}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            setProfile(json.profile);
            if (json.profile?.isSubscribed) {
              localStorage.setItem("jambito_subscribed", "1");
            }
          }
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }
  }, [email]);

  const active = isSubscriptionActive(profile);
  const avg =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length
        )
      : 0;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 w-full">
      <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
      <p className="text-slate-500 mt-2">
        Your subscription, practice history and bookmarks.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        {/* Subscription card */}
        <div className="md:col-span-1 bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Subscription</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking…
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
                {email
                  ? `No active subscription for ${email}.`
                  : "You're on the free trial."}
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

        {/* Stats */}
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

      {/* Attempt history */}
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

"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, RotateCcw, CheckCircle2, Ban } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AdminUser {
  uid: string;
  email: string | null;
  role: string;
  isSubscribed: boolean;
  subscriptionExpiry: string | null;
  plan: string | null;
  trialUsage: Record<string, number>;
  createdAt: string | null;
}

async function fetchAdminUsers(token: string): Promise<AdminUser[]> {
  const res = await fetch("/api/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (res.status === 403 || !json.success) {
    throw new Error("no-access");
  }
  return json.users ?? [];
}

export default function AdminDashboard() {
  const { getIdToken, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    getIdToken()
      .then((token) => {
        if (!token) throw new Error("no-token");
        return fetchAdminUsers(token);
      })
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setError("You don't have admin access.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, getIdToken]);

  async function runAction(
    action: string,
    uid: string,
    payload?: Record<string, unknown>
  ) {
    setBusyUid(uid);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, uid, ...payload }),
      });
      const json = await res.json();
      if (json.success && token) {
        const list = await fetchAdminUsers(token);
        setUsers(list);
      }
    } catch {
      // ignore
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Loading users…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-20 text-center">
        <ShieldAlert className="w-10 h-10 mx-auto mb-4 text-red-500" />
        <p className="text-slate-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 w-full">
      <h1 className="text-3xl font-bold text-slate-900">Admin</h1>
      <p className="text-slate-500 mt-2">
        {users.length} user{users.length === 1 ? "" : "s"} registered.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_1.4fr_1.6fr] gap-4 px-5 py-3 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>User</span>
          <span>Role</span>
          <span>Subscription</span>
          <span>Trial used (JAMB / WAEC / POSTUTME)</span>
        </div>

        {users.map((u, i) => (
          <div
            key={u.uid}
            className={cn(
              "grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1.4fr_1.6fr] gap-4 px-5 py-4 text-sm",
              i % 2 === 0 ? "bg-white" : "bg-slate-50"
            )}
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">
                {u.email ?? "—"}
              </p>
              <p className="text-xs text-slate-400 truncate">{u.uid}</p>
            </div>

            <div>
              <span
                className={cn(
                  "inline-block px-2 py-0.5 rounded-full text-xs font-semibold",
                  u.role === "admin"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {u.role}
              </span>
            </div>

            <div>
              {u.isSubscribed ? (
                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Active
                  {u.subscriptionExpiry
                    ? ` · ${new Date(u.subscriptionExpiry).toLocaleDateString()}`
                    : ""}
                </span>
              ) : (
                <span className="text-slate-400">Free trial</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">
                {u.trialUsage?.JAMB ?? 0} / {u.trialUsage?.WAEC ?? 0} /{" "}
                {u.trialUsage?.POSTUTME ?? 0}
              </span>
              <div className="flex gap-1 ml-auto">
                {u.isSubscribed ? (
                  <button
                    onClick={() => runAction("setSubscription", u.uid, { isSubscribed: false })}
                    disabled={busyUid === u.uid}
                    title="Revoke subscription"
                    className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => runAction("setSubscription", u.uid, { isSubscribed: true, expiryDays: 30 })}
                    disabled={busyUid === u.uid}
                    title="Activate 30 days"
                    className="p-1.5 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => runAction("resetTrial", u.uid)}
                  disabled={busyUid === u.uid}
                  title="Reset trial"
                  className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

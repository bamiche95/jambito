"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  ShieldAlert,
  Search,
  RefreshCw,
  Users,
  CreditCard,
  ScrollText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { adminGet, adminQuery } from "@/lib/adminClient";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS } from "@/lib/accountStatus";
import type { AccountStatus } from "@/lib/accountStatus";
import type { AdminStats, AdminUsersPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NoticeBar, RoleBadge, StatusBadge, SubscriptionBadge } from "./AdminUi";
import AdminUserDetail from "./AdminUserDetail";
import AdminPaymentsPanel from "./AdminPaymentsPanel";
import AdminAuditPanel from "./AdminAuditPanel";

const PAGE_LIMIT = 25;

type Tab = "users" | "payments" | "audit";
type Notice = { kind: "ok" | "error" | "info"; text: string };

/**
 * Admin dashboard shell: gate, stats, tab switch and the paginated user list.
 *
 * The gate below is presentation only — every request carries a Firebase ID
 * token and the API re-checks the admin role server-side, so hiding this
 * component is never what protects the data.
 */
export default function AdminDashboard() {
  const { getIdToken, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("users");
  const [data, setData] = useState<AdminUsersPayload | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // One ID token for the dashboard session, re-read on demand. `getIdToken()`
  // forces a refresh, so this can never serve a stale claim set.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    getIdToken().then((t) => {
      if (cancelled) return;
      if (!t) setGateError("You must sign in to view the dashboard.");
      setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, getIdToken]);

  // Debounce the search box so each keystroke doesn't hit the API.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await adminGet<AdminUsersPayload>(
        `/api/admin${adminQuery({
          search,
          status: statusFilter,
          page,
          limit: PAGE_LIMIT,
        })}`,
        token
      );
      if (cancelled) return;
      if (!res.ok || !res.data) {
        if (res.status === 403) setGateError(res.message);
        else setError(res.message);
        setLoading(false);
        return;
      }
      setError(null);
      setData(res.data);
      setStats(res.data.stats);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, search, statusFilter, page, reloadKey]);

  const selectedUser = data?.users.find((u) => u.uid === selectedUid) ?? null;

  function announce(message: string, kind: Notice["kind"] = "ok") {
    setNotice({ kind, text: message });
  }

  function refresh(message?: string, kind: Notice["kind"] = "ok") {
    if (message) announce(message, kind);
    setReloadKey((key) => key + 1);
  }

  if (authLoading || (loading && !data && !gateError)) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-20 flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Loading dashboard…</p>
      </main>
    );
  }

  if (gateError) {
    return (
      <main className="max-w-lg mx-auto px-4 py-20 text-center">
        <ShieldAlert className="w-10 h-10 mx-auto mb-4 text-red-500" />
        <h1 className="text-xl font-bold text-slate-900">Admin access required</h1>
        <p className="text-slate-600 mt-2">{gateError}</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin</h1>
          <p className="text-slate-500 mt-1">
            {stats ? `${stats.total} account${stats.total === 1 ? "" : "s"}` : ""}
            {stats?.subscribed ? ` · ${stats.subscribed} subscribed` : ""}
            {stats?.blocked ? ` · ${stats.blocked} blocked` : ""}
            {stats?.deactivated ? ` · ${stats.deactivated} deactivated` : ""}
          </p>
        </div>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <nav className="flex gap-1 mt-6 border-b border-slate-200">
        {(
          [
            { id: "users", label: "Users", icon: Users },
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "audit", label: "Audit log", icon: ScrollText },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition",
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {notice && (
        <div className="mt-6">
          <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {tab === "users" && (
        <>
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by email or uid…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | AccountStatus);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="all">All statuses</option>
              {ACCOUNT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ACCOUNT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <UserTable
            users={data?.users ?? []}
            loading={loading}
            selectedUid={selectedUid}
            onSelect={(uid) => setSelectedUid(uid === selectedUid ? null : uid)}
          />
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
            <span>
              {data && data.total > 0
                ? `Showing ${(data.page - 1) * data.limit + 1}–${Math.min(
                    data.page * data.limit,
                    data.total
                  )} of ${data.total}`
                : "No accounts match."}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span>Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data?.hasMore || loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedUser && token && (
            <AdminUserDetail
              key={selectedUser.uid}
              token={token}
              user={selectedUser}
              onChanged={refresh}
              onClose={() => setSelectedUid(null)}
            />
          )}
        </>
      )}

      {tab === "payments" && (
        <AdminPaymentsPanel token={token} onNotice={announce} />
      )}

      {tab === "audit" && <AdminAuditPanel token={token} />}
    </main>
  );
}

/**
 * The user list. Rows are click-through: selecting one opens the detail panel
 * with every action (status, subscription, trial, role, delete) inside it.
 */
function UserTable({
  users,
  loading,
  selectedUid,
  onSelect,
}: {
  users: AdminUsersPayload["users"];
  loading: boolean;
  selectedUid: string | null;
  onSelect: (uid: string) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <div className="hidden md:grid grid-cols-[1.6fr_0.8fr_0.6fr_1fr_1.4fr] gap-4 px-5 py-3 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>User</span>
        <span>Status</span>
        <span>Role</span>
        <span>Subscription</span>
        <span>Trial used</span>
      </div>

      {users.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500 text-center">
          {loading ? "Loading…" : "No accounts match this search."}
        </p>
      ) : (
        users.map((u, i) => (
          <button
            key={u.uid}
            onClick={() => onSelect(u.uid)}
            className={cn(
              "w-full text-left grid grid-cols-1 md:grid-cols-[1.6fr_0.8fr_0.6fr_1fr_1.4fr] gap-2 md:gap-4 px-5 py-4 text-sm transition hover:bg-blue-50/60",
              i % 2 === 0 ? "bg-white" : "bg-slate-50",
              selectedUid === u.uid && "ring-2 ring-inset ring-blue-500"
            )}
          >
            <span className="min-w-0">
              <span className="block font-medium text-slate-800 truncate">
                {u.email ?? "—"}
              </span>
              <span className="block text-xs text-slate-400 truncate">
                {u.uid}
              </span>
            </span>
            <span>
              <StatusBadge status={u.status} />
            </span>
            <span>
              <RoleBadge role={u.role} />
            </span>
            <span>
              <SubscriptionBadge user={u} />
            </span>
            <span className="text-xs text-slate-500">
              {u.trialCount} of 40 used ({u.trialRemaining} left)
            </span>
          </button>
        ))
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, RefreshCw, Search } from "lucide-react";
import {
  adminGet,
  adminPost,
  adminQuery,
  formatDateTime,
  formatNaira,
} from "@/lib/adminClient";
import { PLANS, planDurationDays } from "@/lib/plans";
import type {
  AdminActionPayload,
  AdminUser,
  AdminUsersPayload,
  PaymentRecord,
  PaymentsPayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { NoticeBar } from "./AdminUi";

const PAGE_LIMIT = 20;

type Notice = { kind: "ok" | "error" | "info"; text: string };

/**
 * The payments ledger: every grant of access, whatever brought it in.
 *
 * Two jobs live here — seeing what actually happened (failed and pending
 * charges used to vanish) and recording a payment that never went through
 * Paystack (the direct bank transfer that used to be granted by hand with
 * nothing written down).
 */
export default function AdminPaymentsPanel({
  token,
  onNotice,
}: {
  token: string | null;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [reference, setReference] = useState("");
  const [source, setSource] = useState<"all" | "paystack" | "manual">("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [localNotice, setLocalNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await adminGet<PaymentsPayload>(
        `/api/admin/payments${adminQuery({
          reference: reference.trim(),
          source: source === "all" ? "" : source,
          page,
          limit: PAGE_LIMIT,
        })}`,
        token
      );
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !res.data) {
        setLocalNotice({ kind: "error", text: res.message });
        return;
      }
      setPayments(res.data.payments);
      setHasMore(res.data.hasMore);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, reference, source, page, reloadKey]);

  function notify(message: string, kind: Notice["kind"] = "ok") {
    setLocalNotice({ kind, text: message });
    onNotice(message, kind);
  }

  return (
    <section className="mt-6 space-y-6">
      {localNotice && (
        <NoticeBar notice={localNotice} onDismiss={() => setLocalNotice(null)} />
      )}

      <ManualGrantForm
        token={token}
        onDone={(message, kind) => {
          notify(message, kind);
          setReloadKey((k) => k + 1);
        }}
      />

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Ledger</h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setPage(1);
                }}
                placeholder="Reference"
                className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as "all" | "paystack" | "manual");
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="all">All sources</option>
              <option value="paystack">Paystack</option>
              <option value="manual">Manual</option>
            </select>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        <LedgerTable
          payments={payments}
          loading={loading}
          page={page}
          hasMore={hasMore}
          onPage={setPage}
        />
      </div>
    </section>
  );
}

function LedgerTable({
  payments,
  loading,
  page,
  hasMore,
  onPage,
}: {
  payments: PaymentRecord[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  onPage: (updater: (page: number) => number) => void;
}) {
  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_0.8fr_0.9fr_1fr_1.1fr] gap-3 px-4 py-3 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Reference</span>
          <span>Customer</span>
          <span>Amount</span>
          <span>Source</span>
          <span>Status</span>
          <span>Recorded</span>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {loading ? "Loading…" : "No payments recorded yet."}
          </p>
        ) : (
          payments.map((p, i) => (
            <div
              key={p.id ?? p.reference}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.8fr_0.9fr_1fr_1.1fr] gap-1 md:gap-3 px-4 py-3 text-sm",
                i % 2 === 0 ? "bg-white" : "bg-slate-50"
              )}
            >
              <span className="min-w-0">
                <span className="block font-mono text-xs text-slate-700 break-all">
                  {p.reference}
                </span>
                {p.bankReference && (
                  <span className="block text-xs text-slate-400">
                    bank: {p.bankReference}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-slate-700 truncate">
                  {p.email ?? "—"}
                </span>
                <span className="block text-xs text-slate-400 truncate">
                  {p.uid ? `${p.uid.slice(0, 10)}…` : "no account"}
                </span>
              </span>
              <span className="text-slate-800">{formatNaira(p.amountNaira)}</span>
              <span className="text-xs text-slate-600">
                {p.source ?? "—"}
                <span className="block text-slate-400">{p.channel ?? ""}</span>
              </span>
              <span className="text-xs">
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-full font-semibold",
                    p.status === "success"
                      ? "bg-green-100 text-green-700"
                      : p.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                  )}
                >
                  {p.status ?? "unknown"}
                </span>
                <span className="block mt-1 text-slate-500">
                  {p.granted
                    ? `granted ${p.grantedDays ?? "?"}d`
                    : "no access granted"}
                </span>
              </span>
              <span className="text-xs text-slate-500">
                {formatDateTime(p.createdAt)}
                <span className="block text-slate-400 truncate">
                  {p.createdBy ?? p.channel ?? ""}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-3 text-sm text-slate-500">
        <button
          onClick={() => onPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Prev
        </button>
        <span>Page {page}</span>
        <button
          onClick={() => onPage((p) => p + 1)}
          disabled={!hasMore || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </>
  );
}

/**
 * "Someone paid us by bank transfer" — the manual grant.
 *
 * The account is picked by searching the user list rather than by pasting a
 * uid, and the transfer's own reference becomes the ledger key: entering the
 * same reference twice is refused, so one transfer can never buy two periods
 * of access.
 */
function ManualGrantForm({
  token,
  onDone,
}: {
  token: string | null;
  onDone: (message: string, kind: "ok" | "error") => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [plan, setPlan] = useState("monthly");
  const [days, setDays] = useState(String(planDurationDays("monthly")));
  const [mode, setMode] = useState<"extend" | "set">("extend");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [note, setNote] = useState("");
  const [grant, setGrant] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const id = setTimeout(async () => {
      if (!token || term.length < 2 || selected) {
        setMatches([]);
        return;
      }
      setSearching(true);
      const res = await adminGet<AdminUsersPayload>(
        `/api/admin${adminQuery({ search: term, limit: 5 })}`,
        token
      );
      setSearching(false);
      if (res.ok && res.data) setMatches(res.data.users);
    }, 350);
    return () => clearTimeout(id);
  }, [query, token, selected]);

  async function submit() {
    if (!token || !selected) return;
    setBusy(true);
    const res = await adminPost<AdminActionPayload>("/api/admin/payments", token, {
      action: "recordManual",
      uid: selected.uid,
      plan,
      days: Number(days),
      mode,
      amountNaira: amount.trim() === "" ? undefined : Number(amount),
      reference: reference.trim() || undefined,
      bankReference: bankReference.trim() || undefined,
      note: note.trim() || undefined,
      grant,
    });
    setBusy(false);
    onDone(res.message, res.ok ? "ok" : "error");
    if (res.ok) {
      setSelected(null);
      setQuery("");
      setAmount("");
      setReference("");
      setBankReference("");
      setNote("");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Record a manual payment
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          For money that arrived outside Paystack (direct bank transfer).
          Crediting the account is optional — record now, grant when you are sure.
        </p>
      </div>

      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
          <span className="min-w-0">
            <span className="block font-medium text-slate-800 truncate">
              {selected.email ?? "No email on file"}
            </span>
            <span className="block text-xs text-slate-500 truncate">
              {selected.uid}
            </span>
          </span>
          <button
            onClick={() => setSelected(null)}
            className="shrink-0 text-xs font-semibold text-blue-700 underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div>
          <div className="relative">
            {searching ? (
              <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
            ) : (
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find the account by email or uid…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {matches.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => {
                    setSelected(u);
                    if (u.plan) {
                      setPlan(u.plan);
                      setDays(String(planDurationDays(u.plan)));
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="block text-slate-800 truncate">
                    {u.email ?? "No email on file"}
                  </span>
                  <span className="block text-xs text-slate-400 truncate">
                    {u.uid}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Plan
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setDays(String(planDurationDays(e.target.value)));
            }}
            className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Days
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="block mt-1 w-20 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Amount (₦)
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(PLANS.find((p) => p.id === plan)?.priceNaira ?? 0)}
            className="block mt-1 w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Applied as
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "extend" | "set")}
            className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            <option value="extend">Extend current</option>
            <option value="set">Set from today</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ledger reference (unique; blank = generated)"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
        <input
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          placeholder="Bank transfer reference / narration"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note for the audit log"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={grant}
            onChange={(e) => setGrant(e.target.checked)}
          />
          Grant the access now
        </label>
        <button
          disabled={busy || !selected}
          onClick={submit}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 inline animate-spin" />
          ) : (
            <BadgeCheck className="w-4 h-4 inline mr-1" />
          )}
          Record payment
        </button>
      </div>
    </div>
  );
}

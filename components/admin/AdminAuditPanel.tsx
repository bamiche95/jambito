"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import {
  adminGet,
  adminQuery,
  formatDateTime,
  formatNaira,
} from "@/lib/adminClient";
import type { AuditEntry, AuditPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 30;

const ACTION_LABELS: Record<string, string> = {
  "user.setStatus": "Status changed",
  "user.delete": "Account deleted",
  "user.grantSubscription": "Access granted",
  "user.revokeSubscription": "Subscription revoked",
  "user.resetTrial": "Free trial reset",
  "user.setRole": "Role changed",
  "payment.recordManual": "Manual payment recorded",
  "payment.reconcile": "Payment reconciled",
};

/**
 * Read-only view of the audit trail.
 *
 * The trail is written by the mutation endpoints themselves (never by the
 * browser), so this panel only ever reports what the server recorded.
 */
export default function AdminAuditPanel({ token }: { token: string | null }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await adminGet<AuditPayload>(
        `/api/admin/audit${adminQuery({ page, limit: PAGE_LIMIT, action: action || "" })}`,
        token
      );
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !res.data) {
        setError(res.message);
        return;
      }
      setError(null);
      setEntries(res.data.entries);
      setHasMore(res.data.hasMore);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, page, action, reloadKey]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Audit log</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every admin action, newest first. Entries are append-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-slate-200 px-5 py-8 text-center text-sm text-slate-500">
            {loading ? "Loading…" : "Nothing recorded yet."}
          </p>
        ) : (
          entries.map((entry) => (
            <AuditCard key={entry.id} entry={entry} />
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-3 text-sm text-slate-500">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Prev
        </button>
        <span>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

function AuditCard({ entry }: { entry: AuditEntry }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ScrollText className="w-4 h-4 text-slate-400" />
          {ACTION_LABELS[entry.action] ?? entry.action}
        </div>
        <span className="text-xs text-slate-500">
          {formatDateTime(entry.createdAt)}
        </span>
      </div>

      <p className="text-sm text-slate-700 mt-2">{describe(entry)}</p>

      <p className="text-xs text-slate-500 mt-1">
        by {entry.actorEmail ?? entry.actorUid ?? "unknown admin"}
        {entry.targetEmail ? ` · target ${entry.targetEmail}` : ""}
      </p>

      {entry.firebase && (
        <p className="text-xs text-amber-700 mt-1">{entry.firebase}</p>
      )}

      {entry.before && entry.after && (
        <p className="text-xs text-slate-400 mt-1">
          subscription {entry.before.isSubscribed ? "active" : "inactive"} →{" "}
          {entry.after.isSubscribed ? "active" : "inactive"} · trial{" "}
          {entry.before.trialCount} → {entry.after.trialCount}
        </p>
      )}

      {entry.details && (
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer">
            Raw details
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        </details>
      )}
    </article>
  );
}

/** One human sentence per audit entry, derived from its `details`. */
function describe(entry: AuditEntry): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : null);
  const num = (key: string) => (typeof d[key] === "number" ? (d[key] as number) : null);

  switch (entry.action) {
    case "user.setStatus": {
      const note = str("note");
      return `Status ${str("from") ?? entry.before?.status ?? "unknown"} → ${
        str("to") ?? entry.after?.status ?? "unknown"
      }${note ? ` · reason: ${note}` : ""}`;
    }
    case "user.delete":
      return "Account soft-deleted: PII scrubbed, sign-in disabled, tombstone kept.";
    case "user.grantSubscription":
      return `Granted ${num("durationDays") ?? "?"} days of ${str("plan") ?? "?"} (${
        str("mode") === "extend" ? "stacked on the running window" : "from today"
      }).`;
    case "user.revokeSubscription":
      return "Subscription ended immediately.";
    case "user.resetTrial":
      return `Free trial reset (was ${num("previousTrialCount") ?? 0} used).`;
    case "user.setRole":
      return `Role ${str("from") ?? "?"} → ${str("to") ?? "?"}.`;
    case "payment.recordManual":
      return `Recorded ${formatNaira((num("amountKobo") ?? 0) / 100)} for reference ${
        str("reference") ?? "?"
      }${d.granted === false ? " (without granting access)" : ""}.`;
    case "payment.reconcile":
      return `Reconciled ${formatNaira((num("amountKobo") ?? 0) / 100)} at Paystack (status ${
        str("paystackStatus") ?? "?"
      }) and granted ${num("days") ?? "?"} days.`;
    default:
      return entry.action;
  }
}

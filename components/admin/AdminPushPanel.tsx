"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, Loader2, RefreshCw, Send, Smartphone } from "lucide-react";
import type { AdminPushPayload } from "@/lib/types";
import { sendTestPush } from "@/lib/pushClient";
import { NoticeBar } from "./AdminUi";

/**
 * Admin -> Push.
 *
 * Read-only apart from "Send a test", which goes to the admin's own devices.
 * That is deliberate for Phase 1: the panel answers "is this deployment wired
 * up, and is anything getting through", while the sending itself is still the
 * profile card's job. Broadcasts and the daily reminder arrive with Phase 2,
 * behind the same send path.
 *
 * No endpoints or keys are ever returned by the API â€” they are a capability,
 * and the panel only needs counts.
 */

type Notice = { kind: "ok" | "error" | "info"; text: string };

/** The fetch, with no state writes, so it can be awaited inside an effect. */
async function requestStats(
  token: string
): Promise<{ ok: true; data: AdminPushPayload } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/push/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await response.json().catch(() => ({}))) as AdminPushPayload;
    if (!response.ok || !json?.success) {
      return {
        ok: false,
        message:
          response.status === 403
            ? "This account is not an admin."
            : "Could not read the push statistics.",
      };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

export default function AdminPushPanel({
  token,
  onNotice,
}: {
  token: string | null;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const [data, setData] = useState<AdminPushPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Same shape as AdminEmailsPanel: the initial fetch lives inside the effect
  // and every state write happens after an await, never during render.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function loadInitial() {
      const result = await requestStats(token as string);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setData(null);
      } else {
        setError(null);
        setData(result.data);
      }
      setLoading(false);
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const result = await requestStats(token);
    if (!result.ok) {
      setError(result.message);
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [token]);

  const sendTest = useCallback(async () => {
    if (!token) return;
    setSending(true);
    const result = await sendTestPush(token);
    onNotice(
      result.message ?? (result.success ? "Test sent." : "The test was not delivered."),
      result.success ? "ok" : "error"
    );
    setSending(false);
    void reload();
  }, [onNotice, reload, token]);

  if (!token) {
    return <p className="mt-6 text-sm text-slate-500">Sign in to view this panel.</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BellRing className="h-5 w-5 text-blue-600" />
            Web Push
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Devices that granted notification permission, and what the last sends did.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={sending || !data?.configured}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send a test to me
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
        </div>
      </div>

      {error && <NoticeBar notice={{ kind: "error", text: error }} />}

      {data && !data.configured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">This deployment has no VAPID keys.</p>
            <p>
              Generate a pair with{" "}
              <code className="rounded bg-amber-100 px-1">npx web-push generate-vapid-keys</code>{" "}
              and set <code className="rounded bg-amber-100 px-1">PUSH_VAPID_PUBLIC</code>,{" "}
              <code className="rounded bg-amber-100 px-1">PUSH_VAPID_PRIVATE</code> and{" "}
              <code className="rounded bg-amber-100 px-1">PUSH_SUBJECT</code> in Vercel
              (Production and Preview), then redeploy.
            </p>
            {data.problem && <p className="text-xs">{data.problem}</p>}
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Live devices" value={data.stats.devices} />
            <Stat label="Accounts" value={data.stats.accounts} />
            <Stat label="Retired" value={data.stats.revoked} />
            <Stat
              label="Last send"
              value={
                data.stats.lastSendAt
                  ? new Date(data.stats.lastSendAt).toLocaleString()
                  : "never"
              }
              small
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Smartphone className="h-4 w-4 text-slate-400" />
              Devices by platform
            </h3>
            {data.stats.byPlatform.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nobody has turned reminders on yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                {data.stats.byPlatform.map((row) => (
                  <li key={row.platform} className="flex items-center justify-between">
                    <span>{row.platform}</span>
                    <span className="font-semibold text-slate-800">{row.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Recent attempts</h3>
            {data.log.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No notifications have been sent yet. Use â€œSend a test to meâ€ on the
                phone you subscribed with.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {data.log.map((row, index) => (
                  <li
                    key={`${row.sentAt ?? "unknown"}-${index}`}
                    className="flex items-start justify-between gap-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-700">
                        {row.campaignId}
                        {row.platform ? ` Â· ${row.platform}` : ""}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {row.message ?? row.uid ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span
                        className={
                          row.status === "sent"
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-600"
                        }
                      >
                        {row.status}
                      </span>
                      <span className="mt-0.5 block text-slate-400">
                        {row.sentAt ? new Date(row.sentAt).toLocaleString() : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  small = false,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          small
            ? "mt-1 text-sm font-semibold text-slate-900"
            : "mt-1 text-xl font-bold text-slate-900"
        }
      >
        {value}
      </p>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { Loader2, X } from "lucide-react";
import { adminPost, formatDateOnly, formatRelativeDays } from "@/lib/adminClient";
import { TRIAL_LIMIT } from "@/lib/plans";
import type { AdminActionPayload, AdminUser } from "@/lib/types";
import { RoleBadge, StatusBadge, SubscriptionBadge, TrialBadge } from "./AdminUi";
import {
  AccountActions,
  ReconcileBox,
  StatusActions,
  SubscriptionActions,
} from "./AdminUserActions";

/**
 * Detail + action panel for one account.
 *
 * Every mutation goes through `onAction`, which posts to /api/admin and hands
 * the outcome to the dashboard's notice bar, so the panel itself never decides
 * whether something "worked".
 */
export default function AdminUserDetail({
  token,
  user,
  onChanged,
  onClose,
}: {
  token: string;
  user: AdminUser;
  onChanged: (message?: string, kind?: "ok" | "error" | "info") => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setBusy(true);
      const res = await adminPost<AdminActionPayload>("/api/admin", token, {
        action,
        uid: user.uid,
        ...payload,
      });
      setBusy(false);
      // A status change can still succeed while the Firebase-side change was
      // skipped (no service account in this deployment) — always say so.
      const firebaseNote =
        res.data?.firebase && !res.data.firebase.ok
          ? `\n${res.data.firebase.message}`
          : "";
      onChanged(
        `${res.message}${res.ok ? firebaseNote : ""}`,
        res.ok ? "ok" : "error"
      );
      return res.ok;
    },
    [token, user.uid, onChanged]
  );

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 truncate">
            {user.email ?? "No email on file"}
          </h2>
          <p className="text-xs text-slate-400 truncate">{user.uid}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge status={user.status} />
            <RoleBadge role={user.role} />
            <TrialBadge user={user} />
            <SubscriptionBadge user={user} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 py-4 text-sm border-b border-slate-100">
        <Fact label="Plan" value={user.plan ?? "—"} />
        <Fact
          label="Expires"
          value={`${formatDateOnly(user.subscriptionExpiry)} (${formatRelativeDays(
            user.subscriptionExpiry
          )})`}
        />
        <Fact label="Trial" value={`${user.trialCount} of ${TRIAL_LIMIT} used`} />
        <Fact label="Joined" value={formatDateOnly(user.createdAt)} />
      </div>

      <div className="px-5 py-5 space-y-6">
        <StatusActions user={user} disabled={busy} onAction={onAction} />
        <SubscriptionActions user={user} disabled={busy} onAction={onAction} />
        <AccountActions user={user} disabled={busy} onAction={onAction} />
        <ReconcileBox token={token} user={user} onChanged={onChanged} />
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

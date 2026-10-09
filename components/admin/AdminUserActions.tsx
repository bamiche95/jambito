"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Ban, Loader2, Search, Trash2 } from "lucide-react";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  accountStatusMessage,
} from "@/lib/accountStatus";
import type { AccountStatus } from "@/lib/accountStatus";
import { PLANS, PLAN_ID, planDurationDays, planLabel, resolvePlanId } from "@/lib/plans";
import { usePricing } from "@/lib/pricing";
import {
  adminGet,
  adminPost,
  adminQuery,
  formatDateTime,
  formatNaira,
} from "@/lib/adminClient";
import type {
  AdminUser,
  PaystackSummary,
  PaymentRecord,
  ReconcilePayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The actionable half of the user detail panel.
 *
 * Every button funnels into the same `onAction(action, payload)` callback, so
 * there is exactly one place that talks to /api/admin and exactly one place
 * that reports the outcome.
 */

export type ActionRunner = (
  action: string,
  payload?: Record<string, unknown>
) => Promise<boolean>;

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export const BTN =
  "px-3 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-40 disabled:cursor-not-allowed";

export function StatusActions({
  user,
  disabled,
  onAction,
}: {
  user: AdminUser;
  disabled: boolean;
  onAction: ActionRunner;
}) {
  const [note, setNote] = useState("");
  const options = ACCOUNT_STATUSES.filter((s) => s !== "deleted");

  return (
    <Section
      title="Account status"
      hint={
        user.status === "active"
          ? "Active — full access."
          : accountStatusMessage(user.status)
      }
    >
      <div className="flex flex-wrap gap-2">
        {options.map((status: AccountStatus) => {
          const current = user.status === status;
          return (
            <button
              key={status}
              disabled={disabled || current}
              onClick={() =>
                onAction("setStatus", { status, note: note.trim() || undefined })
              }
              className={cn(
                BTN,
                current
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              {ACCOUNT_STATUS_LABELS[status]}
              {current ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional reason (recorded in the audit log)"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
      />
      <p className="text-xs text-slate-500">
        Blocking disables the Firebase sign-in and revokes its refresh tokens
        when a service account is configured; the MongoDB status is what every
        API call checks, so the lockout holds either way.
      </p>
    </Section>
  );
}

export function SubscriptionActions({
  user,
  disabled,
  onAction,
}: {
  user: AdminUser;
  disabled: boolean;
  onAction: ActionRunner;
}) {
  // There is one plan, so this field is really just "how long". `resolvePlanId`
  // maps a legacy id still on an old record onto the current offer so the
  // select always shows a real option instead of a blank.
  const [plan, setPlan] = useState<string>(resolvePlanId(user.plan) ?? PLAN_ID);
  // The live price, which may differ from the constant — an admin can change it.
  const { plan: livePlan } = usePricing();
  const [days, setDays] = useState(
    String(planDurationDays(resolvePlanId(user.plan) ?? PLAN_ID))
  );
  const [mode, setMode] = useState<"extend" | "set">("extend");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <Section
      title="Subscription"
      hint="Paid by direct bank transfer instead of Paystack? Grant it here, then record the reference in the Payments tab so the ledger stays complete."
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Plan
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setDays(String(planDurationDays(e.target.value)));
            }}
            className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white"
          >
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ·{" "}
                {formatNaira(p.id === livePlan.id ? livePlan.priceNaira : p.priceNaira)}
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
            className="block mt-1 w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </label>

        <label className="text-xs text-slate-500">
          Applied as
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "extend" | "set")}
            className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            <option value="extend">Extend current window</option>
            <option value="set">Set from today</option>
          </select>
        </label>

        <button
          disabled={disabled}
          onClick={() =>
            onAction("setSubscription", {
              isSubscribed: true,
              plan,
              days: Number(days),
              mode,
            })
          }
          className={cn(
            BTN,
            "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <BadgeCheck className="w-4 h-4 inline mr-1" />
          Grant access
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {user.isSubscribed &&
          (confirmRevoke ? (
            <>
              <span className="text-sm text-slate-600">
                End the subscription now?
              </span>
              <button
                disabled={disabled}
                onClick={async () => {
                  const ok = await onAction("setSubscription", {
                    isSubscribed: false,
                  });
                  if (ok) setConfirmRevoke(false);
                }}
                className={cn(BTN, "border-red-600 bg-red-600 text-white")}
              >
                Yes, revoke
              </button>
              <button
                onClick={() => setConfirmRevoke(false)}
                className={cn(BTN, "border-slate-200 text-slate-600")}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              disabled={disabled}
              onClick={() => setConfirmRevoke(true)}
              className={cn(BTN, "border-red-200 text-red-600 hover:bg-red-50")}
            >
              <Ban className="w-4 h-4 inline mr-1" />
              Revoke subscription
            </button>
          ))}

        <button
          disabled={disabled || user.trialCount === 0}
          onClick={() => onAction("resetTrial")}
          className={cn(BTN, "border-slate-200 text-slate-700 hover:bg-slate-50")}
        >
          Reset free trial ({user.trialCount} of 40 used)
        </button>
      </div>
    </Section>
  );
}

/** Role changes and the irreversible one: deleting the account. */
export function AccountActions({
  user,
  disabled,
  onAction,
}: {
  user: AdminUser;
  disabled: boolean;
  onAction: ActionRunner;
}) {
  const [typed, setTyped] = useState("");
  const expected = (user.email ?? user.uid).trim().toLowerCase();
  const canDelete =
    user.status !== "deleted" && typed.trim().toLowerCase() === expected;

  return (
    <Section
      title="Role & deletion"
      hint={
        user.role === "admin"
          ? "This account can manage every other account."
          : "Grant admin access only to someone who should see all user data."
      }
    >
      <div className="flex flex-wrap gap-2">
        {user.role === "admin" ? (
          <button
            disabled={disabled}
            onClick={() => onAction("setRole", { role: "user" })}
            className={cn(BTN, "border-slate-200 text-slate-700 hover:bg-slate-50")}
          >
            Remove admin access
          </button>
        ) : (
          <button
            disabled={disabled}
            onClick={() => onAction("setRole", { role: "admin" })}
            className={cn(BTN, "border-purple-200 text-purple-700 hover:bg-purple-50")}
          >
            Make admin
          </button>
        )}
      </div>

      {user.status !== "deleted" && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Delete this account</p>
              <p className="mt-0.5">
                The email is scrubbed, sign-in is disabled and a tombstone is
                kept so the same Firebase uid can never be handed a fresh free
                trial. Payment history and the audit log stay intact.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type ${expected} to confirm`}
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-red-200 bg-white text-sm"
            />
            <button
              disabled={!canDelete || disabled}
              onClick={() => onAction("deleteUser")}
              className={cn(BTN, "border-red-600 bg-red-600 text-white hover:bg-red-700")}
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Delete account
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/**
 * Paystack reconciliation for the account on screen.
 *
 * The case this exists for: a customer pays but the webhook never lands, so the
 * money is in the Paystack account and the customer still sees a paywall.
 * `Check` reads Paystack's own record of the charge; `Apply` records it in the
 * ledger and grants the access. Applying an already-granted reference is a
 * no-op, so a double click can't buy anyone two subscriptions.
 */
export function ReconcileBox({
  token,
  user,
  onChanged,
}: {
  token: string;
  user: AdminUser;
  onChanged: (message?: string, kind?: "ok" | "error" | "info") => void;
}) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<{
    paystack: PaystackSummary | null;
    payment: PaymentRecord | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const trimmed = reference.trim();

  async function check() {
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    const res = await adminGet<ReconcilePayload>(
      `/api/admin/reconcile${adminQuery({ reference: trimmed })}`,
      token
    );
    setBusy(false);
    if (!res.ok || !res.data) {
      setChecked(null);
      setMessage(res.message);
      return;
    }
    setChecked({
      paystack: res.data.paystack ?? null,
      payment: res.data.payment ?? null,
    });
    // A 200 answer can still mean "Paystack has no such charge" — say so,
    // instead of rendering an empty summary the admin has to interpret.
    setMessage(
      res.data.paystack?.verified === false
        ? (res.data.paystack.message ?? "Paystack could not verify that reference.")
        : null
    );
  }

  async function apply() {
    setBusy(true);
    const res = await adminPost<ReconcilePayload>("/api/admin/reconcile", token, {
      reference: trimmed,
      uid: user.uid,
    });
    setBusy(false);
    setMessage(res.message);
    onChanged(
      res.message,
      res.ok ? (res.data?.applied ? "ok" : "info") : "error"
    );
    if (res.ok) setChecked(null);
  }

  const paystack = checked?.paystack ?? null;
  const ledger = checked?.payment ?? null;
  const canApply =
    paystack?.status === "success" && !ledger?.granted && !busy && Boolean(trimmed);

  return (
    <Section
      title="Paystack reconciliation"
      hint="For a charge that succeeded at Paystack but never reached the webhook. Verification uses the server-side secret key, so nothing is granted on trust."
    >
      <div className="flex flex-wrap gap-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Paystack reference (e.g. JMB-…)"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
        <button
          disabled={busy || !trimmed}
          onClick={check}
          className={cn(BTN, "border-slate-200 text-slate-700 hover:bg-slate-50")}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 inline animate-spin" />
          ) : (
            <Search className="w-4 h-4 inline mr-1" />
          )}
          Check
        </button>
      </div>

      {paystack && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1">
          <Row label="Paystack status" value={paystack.status ?? "—"} />
          <Row
            label="Amount"
            value={
              paystack.amountNaira != null
                ? `${formatNaira(paystack.amountNaira)} (${paystack.currency ?? "NGN"})`
                : "—"
            }
          />
          <Row label="Channel" value={paystack.channel ?? "—"} />
          <Row label="Paid at" value={formatDateTime(paystack.paidAt)} />
          <Row label="Customer email" value={paystack.email ?? "—"} />
          <Row
            label="Plan"
            value={
              paystack.plan || paystack.inferredPlan
                ? planLabel(paystack.plan ?? paystack.inferredPlan)
                : "unknown — treated as Annual Access"
            }
          />
          <Row
            label="Ledger row"
            value={
              ledger
                ? `${ledger.source ?? "?"} · ${ledger.status ?? "?"}${
                    ledger.granted ? ` · granted ${ledger.grantedDays ?? "?"} days` : " · not granted"
                  }`
                : "not recorded yet"
            }
          />
          {paystack.uid && paystack.uid !== user.uid && (
            <p className="text-xs text-amber-700 pt-1">
              Paystack&apos;s metadata names a different uid ({paystack.uid}).
              Applying here will credit <strong>{user.uid}</strong> instead —
              open the other account if that is the payer.
            </p>
          )}
          <div className="pt-2 flex items-center gap-3">
            <button
              disabled={!canApply}
              onClick={apply}
              className={cn(
                BTN,
                "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              Apply & grant to this account
            </button>
            {ledger?.granted && (
              <span className="text-xs text-slate-500">
                Already granted — nothing left to apply.
              </span>
            )}
          </div>
        </div>
      )}

      {message && <p className="text-xs text-slate-500 whitespace-pre-wrap">{message}</p>}
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 text-right break-all">{value}</span>
    </div>
  );
}

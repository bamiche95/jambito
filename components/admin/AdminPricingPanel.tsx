"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, RotateCcw, Save, Tags } from "lucide-react";
import {
  adminGet,
  adminPost,
  formatDateTime,
  formatNaira,
} from "@/lib/adminClient";
import type { AdminPricingPayload } from "@/lib/adminClient";
import { PRICE_LIMITS } from "@/lib/plans";
import { usePricing } from "@/lib/pricing";
import { NoticeBar } from "./AdminUi";

type Notice = { kind: "ok" | "error" | "info"; text: string };

/**
 * The one commercial setting: what the single offer costs.
 *
 * Deliberately the only editable field. The plan's name, duration and feature
 * list describe the product and change by deploy; the price is a decision that
 * gets revisited, so it lives in the database and is read by the checkout at the
 * moment of payment.
 *
 * What changing it does NOT do: it never re-prices anything already paid and
 * never shortens a window already granted. It does not touch a payment already
 * in flight either — that amount was fixed when the Paystack transaction was
 * created, and Paystack charges what it was told.
 */
export default function AdminPricingPanel({
  token,
  onNotice,
}: {
  token: string | null;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const { refreshPricing } = usePricing();
  const [data, setData] = useState<AdminPricingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [localNotice, setLocalNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      const res = await adminGet<AdminPricingPayload>(
        "/api/admin/pricing",
        token
      );
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setError(res.message);
        return;
      }
      setError(null);
      setData(res.data);
      setPriceInput(String(res.data.pricing.priceNaira));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    if (!token || !data) return;

    const check = validatePrice(priceInput, data.pricing.priceNaira);
    if (!check.ok) {
      setLocalNotice({ kind: "error", text: check.message });
      return;
    }

    setSaving(true);
    const res = await adminPost<AdminPricingPayload>(
      "/api/admin/pricing",
      token,
      { priceNaira: check.naira, note: note.trim() || null }
    );
    setSaving(false);

    if (!res.ok || !res.data) {
      setLocalNotice({ kind: "error", text: res.message });
      return;
    }

    setData(res.data);
    setPriceInput(String(res.data.pricing.priceNaira));
    setNote("");
    setLocalNotice({ kind: "ok", text: res.message });
    onNotice(res.message, "ok");
    // Every other price on the site comes from this provider, so reloading it
    // is what keeps the landing page and the paywall from disagreeing with the
    // checkout about what a student is about to pay.
    await refreshPricing();
  }

  if (error) {
    return (
      <section className="mt-6">
        <NoticeBar notice={{ kind: "error", text: error }} />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the price…
        </p>
      </section>
    );
  }

  const check = validatePrice(priceInput, data.pricing.priceNaira);
  const previewNaira = check.ok ? check.naira : data.pricing.priceNaira;

  return (
    <section className="mt-6 space-y-6">
      {localNotice && (
        <NoticeBar notice={localNotice} onDismiss={() => setLocalNotice(null)} />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Tags className="w-4 h-4 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">
            Subscription price
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          One payment, 12 months of access. This is the amount Paystack charges
          on the next checkout — it is read fresh from the database every time a
          payment starts, so a change here needs no deploy and no restart.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Current price">
            <span className="text-2xl font-bold text-slate-900">
              {formatNaira(data.pricing.priceNaira)}
            </span>
          </Field>
          <Field label="Charged as">
            <span className="font-mono text-sm text-slate-700">
              {data.pricing.priceKobo.toLocaleString()} kobo
            </span>
          </Field>
          <Field label="Source">
            <span className="inline-flex items-center gap-1.5 text-sm">
              {data.pricing.source === "db" ? (
                <>
                  <BadgeCheck className="w-4 h-4 text-green-600" />
                  Saved in the database
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  Built-in default
                </>
              )}
            </span>
          </Field>
        </dl>

        <p className="mt-3 text-xs text-slate-500">
          {data.pricing.source === "db" && data.pricing.updatedAt
            ? `Last changed ${formatDateTime(data.pricing.updatedAt)}${
                data.pricing.updatedBy?.email
                  ? ` by ${data.pricing.updatedBy.email}`
                  : ""
              }.`
            : `No price has been saved yet, so the built-in figure of ${formatNaira(
                data.defaults.priceNaira
              )} applies. Deleting the stored document reverts to it.`}
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5">
          <label className="text-xs text-slate-500">
            New price (₦)
            <input
              type="number"
              min={PRICE_LIMITS.minNaira}
              max={PRICE_LIMITS.maxNaira}
              step={1}
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setLocalNotice(null);
              }}
              className="block mt-1 w-36 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </label>

          <label className="text-xs text-slate-500 flex-1 min-w-[200px]">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why the price changed"
              className="block mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </label>

          <button
            onClick={save}
            disabled={saving || !check.ok}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save price
          </button>

          <button
            onClick={() => setPriceInput(String(data.defaults.priceNaira))}
            disabled={data.pricing.priceNaira === data.defaults.priceNaira}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Use default
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {check.ok ? (
            <>
              Students will be charged{" "}
              <span className="font-semibold text-slate-700">
                {formatNaira(previewNaira)}
              </span>{" "}
              ({(previewNaira * 100).toLocaleString()} kobo). Whole naira only,
              between {formatNaira(PRICE_LIMITS.minNaira)} and{" "}
              {formatNaira(PRICE_LIMITS.maxNaira)}.
            </>
          ) : check.code === "unchanged" ? (
            <span>
              The price is already {formatNaira(data.pricing.priceNaira)} —
              nothing to save.
            </span>
          ) : (
            <span className="text-red-600">{check.message}</span>
          )}
        </p>
      </div>

      <p className="text-xs text-slate-500">
        Every change is written to the audit log with the old price, the new
        price and your note.
      </p>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/**
 * Mirrors lib/pricingStore.js so the admin sees a bad figure immediately
 * instead of after a round trip. The server validates too: this is feedback,
 * never a gate, and the amount that is charged is never taken from a browser.
 *
 * `unchanged` is separated from `invalid` only so the panel can render a no-op
 * as a neutral hint rather than an error.
 */
function validatePrice(
  input: string,
  current: number
):
  | { ok: true; naira: number }
  | { ok: false; code: "unchanged" | "invalid"; message: string } {
  const raw = input.trim().replace(/[\s,₦]/g, "");
  if (!raw) {
    return { ok: false, code: "invalid", message: "Enter a price in naira." };
  }

  const naira = Number(raw);
  if (!Number.isFinite(naira)) {
    return {
      ok: false,
      code: "invalid",
      message: "The price must be a number.",
    };
  }
  if (!Number.isInteger(naira)) {
    return {
      ok: false,
      code: "invalid",
      message: "Whole naira only — kobo are not accepted.",
    };
  }
  if (naira < PRICE_LIMITS.minNaira) {
    return {
      ok: false,
      code: "invalid",
      message: `The price cannot be below ${formatNaira(PRICE_LIMITS.minNaira)}.`,
    };
  }
  if (naira > PRICE_LIMITS.maxNaira) {
    return {
      ok: false,
      code: "invalid",
      message: `The price cannot exceed ${formatNaira(PRICE_LIMITS.maxNaira)}.`,
    };
  }
  if (naira === current) {
    return { ok: false, code: "unchanged", message: "That is the current price." };
  }
  return { ok: true, naira };
}

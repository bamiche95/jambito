"use client";

import { useState } from "react";
import { Eye, Loader2, RotateCcw, Save, X } from "lucide-react";
import { adminPost } from "@/lib/adminClient";
import type {
  AdminEmailCampaign,
  EmailActionPayload,
  EmailCampaignContent,
  EmailPreview,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Notice = { kind: "ok" | "error" | "info"; text: string };

/**
 * The campaign copy editor.
 *
 * Plain text fields on purpose: the server escapes the body and renders the
 * paragraphs itself, so an admin cannot accidentally paste markup that breaks an
 * inbox (or the preview iframe). "Reset to default" is the rollback path, and
 * "Preview" renders the *unsaved* form so a typo is caught before saving.
 */
export default function AdminEmailEditor({
  token,
  campaign,
  variables,
  onClose,
  onSaved,
  onPreview,
  onNotice,
}: {
  token: string | null;
  campaign: AdminEmailCampaign;
  variables: { token: string; description: string }[];
  onClose: () => void;
  onSaved: (campaign: AdminEmailCampaign | null) => void;
  onPreview: (preview: EmailPreview, name: string) => void;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const [form, setForm] = useState<EmailCampaignContent>({
    subject: campaign.subject,
    heading: campaign.heading,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaPath: campaign.ctaPath,
    enabled: campaign.enabled,
    delayDays: campaign.delayDays,
  });
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EmailCampaignContent>(
    key: K,
    value: EmailCampaignContent[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!token) return;
    setBusy("save");
    setError(null);
    const res = await adminPost<EmailActionPayload>("/api/admin/emails", token, {
      action: "save",
      id: campaign.id,
      content: { ...form, delayDays: Number(form.delayDays) || 0 },
    });
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    onNotice(res.data.message ?? "Campaign saved.", "ok");
    onSaved(res.data.campaign ?? null);
  }

  async function preview() {
    if (!token) return;
    setBusy("preview");
    setError(null);
    const res = await adminPost<EmailActionPayload>("/api/admin/emails", token, {
      action: "preview",
      id: campaign.id,
      content: { ...form, delayDays: Number(form.delayDays) || 0 },
    });
    setBusy(null);
    if (!res.ok || !res.data?.preview) {
      setError(res.message);
      return;
    }
    onPreview(res.data.preview, campaign.name);
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Edit &ldquo;{campaign.name}&rdquo;
            </h2>
            <p className="mt-1 text-sm text-slate-500">{campaign.when}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              Subject line
              <span className="font-normal normal-case text-slate-400">
                {form.subject.length}/140
              </span>
            </span>
            <input
              value={form.subject}
              maxLength={140}
              onChange={(event) => update("subject", event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              Heading
              <span className="font-normal normal-case text-slate-400">
                {form.heading.length}/120
              </span>
            </span>
            <input
              value={form.heading}
              maxLength={120}
              onChange={(event) => update("heading", event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              Body
              <span className="font-normal normal-case text-slate-400">
                {form.body.length}/4000
              </span>
            </span>
            <textarea
              value={form.body}
              maxLength={4000}
              rows={10}
              onChange={(event) => update("body", event.target.value)}
              className={cn(inputClass, "mt-1 resize-y leading-6")}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Plain text. Leave a blank line between paragraphs; every blank line
              becomes a new paragraph in the email.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Button label
              </span>
              <input
                value={form.ctaLabel}
                maxLength={40}
                onChange={(event) => update("ctaLabel", event.target.value)}
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Button link
              </span>
              <input
                value={form.ctaPath}
                maxLength={200}
                onChange={(event) => update("ctaPath", event.target.value)}
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Wait (days)
              </span>
              <input
                type="number"
                min={0}
                max={30}
                value={form.delayDays}
                onChange={(event) =>
                  update("delayDays", Number(event.target.value))
                }
                className={cn(inputClass, "mt-1")}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm text-slate-700">
              <strong className="font-semibold">Enabled for the daily run.</strong>{" "}
              While this is off, the cron skips the campaign; &ldquo;Test&rdquo;
              and &ldquo;Run now&rdquo; still work, so you can check it before
              switching it on.
            </span>
          </label>

          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Placeholders ({variables.length})
            </summary>
            <dl className="mt-2 space-y-1.5">
              {variables.map((variable) => (
                <div key={variable.token} className="flex gap-3 text-xs">
                  <dt className="w-32 shrink-0 font-mono text-slate-700">
                    {variable.token}
                  </dt>
                  <dd className="text-slate-500">{variable.description}</dd>
                </div>
              ))}
            </dl>
          </details>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => setForm({ ...campaign.defaults })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <RotateCcw className="h-4 w-4" /> Reset to default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={preview}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "preview" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Preview
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

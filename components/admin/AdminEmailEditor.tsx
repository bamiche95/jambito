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
import AdminEmailContentFields, {
  emailFieldClass,
} from "./AdminEmailContentFields";

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

  const inputClass = emailFieldClass;

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
          <AdminEmailContentFields
            form={form}
            onChange={update}
            variables={variables}
            trailing={
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
            }
          />

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

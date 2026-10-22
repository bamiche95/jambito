"use client";

import { useState } from "react";
import { Eye, Loader2, Save, Trash2, X } from "lucide-react";
import { adminPost } from "@/lib/adminClient";
import type {
  AdminEmailTemplate,
  EmailBroadcastContent,
  EmailBroadcastPayload,
  EmailPreview,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import AdminEmailContentFields, { emailFieldClass } from "./AdminEmailContentFields";

type Notice = { kind: "ok" | "error" | "info"; text: string };

const BLANK: EmailBroadcastContent = {
  subject: "",
  heading: "",
  body: "",
  ctaLabel: "Start practising",
  ctaPath: "/cbt",
};

/**
 * Creates or edits one saved broadcast template.
 *
 * A template is copy only — it never stores recipients — so editing it cannot
 * change an email that is already queued or half-sent: a send freezes its copy
 * on the broadcast document.
 */
export default function AdminEmailTemplateEditor({
  token,
  template,
  variables,
  onClose,
  onSaved,
  onDeleted,
  onPreview,
  onNotice,
}: {
  token: string | null;
  template: AdminEmailTemplate | null;
  variables: { token: string; description: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleted: (message: string) => void;
  onPreview: (preview: EmailPreview, name: string) => void;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [form, setForm] = useState<EmailBroadcastContent>(
    template
      ? {
          subject: template.subject,
          heading: template.heading,
          body: template.body,
          ctaLabel: template.ctaLabel,
          ctaPath: template.ctaPath,
        }
      : BLANK
  );
  const [busy, setBusy] = useState<"save" | "preview" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EmailBroadcastContent>(
    key: K,
    value: EmailBroadcastContent[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the template a name before saving it.");
      return;
    }
    setBusy("save");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "template_save",
      id: template?.id ?? null,
      name: trimmed,
      content: form,
    });
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    const message = res.data.message ?? "Template saved.";
    onNotice(message, "ok");
    onSaved(message);
  }

  async function preview() {
    if (!token) return;
    setBusy("preview");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "broadcast_preview",
      content: form,
    });
    setBusy(null);
    if (!res.ok || !res.data?.preview) {
      setError(res.message);
      return;
    }
    onPreview(res.data.preview, name.trim() || form.subject.trim() || "Template");
  }

  async function remove() {
    if (!token || !template) return;
    setBusy("delete");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "template_delete",
      id: template.id,
    });
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    const message = res.data.message ?? "Template deleted.";
    onNotice(message, "ok");
    onDeleted(message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {template ? `Edit template "${template.name}"` : "New template"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Reusable copy for one-off emails. Recipients are never part of a
              template.
            </p>
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
              Template name
              <span className="font-normal normal-case text-slate-400">
                {name.length}/60
              </span>
            </span>
            <input
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Exam timetable notice"
              className={cn(emailFieldClass, "mt-1")}
            />
          </label>

          <AdminEmailContentFields
            form={form}
            onChange={update}
            variables={variables}
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4">
          <div>
            {template &&
              (confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Delete permanently?</span>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy === "delete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy !== null}
                    className="text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete template
                </button>
              ))}
          </div>

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
              Save template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


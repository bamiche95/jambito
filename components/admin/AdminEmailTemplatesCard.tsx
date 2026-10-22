"use client";

import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { formatDateOnly } from "@/lib/adminClient";
import type { AdminEmailTemplate } from "@/lib/types";

/**
 * The saved templates shelf.
 *
 * "Use" opens the composer prefilled with this copy; the recipients are still
 * chosen there. Deleting is a two-step action, because a template is the only
 * copy of text an admin may have written once and reused for months.
 */
export default function AdminEmailTemplatesCard({
  templates,
  deletingId,
  onNew,
  onCompose,
  onEdit,
  onDelete,
}: {
  templates: AdminEmailTemplate[];
  deletingId: string | null;
  onNew: () => void;
  onCompose: (template: AdminEmailTemplate) => void;
  onEdit: (template: AdminEmailTemplate) => void;
  onDelete: (template: AdminEmailTemplate) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Saved templates</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Reusable copy for one-off emails. A template never stores recipients.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
          No templates yet. Write a broadcast once, then save the copy here so the
          next one takes seconds.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-col rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {template.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {template.subject}
                  </p>
                </div>
                <FileText className="h-4 w-4 shrink-0 text-slate-300" />
              </div>

              <p className="mt-2 text-[11px] text-slate-400">
                Updated {formatDateOnly(template.updatedAt)}
                {template.updatedBy?.email ? ` · ${template.updatedBy.email}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCompose(template)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Send className="h-3.5 w-3.5" /> Use
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(template)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>

                {confirmId === template.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(null);
                        onDelete(template);
                      }}
                      disabled={deletingId === template.id}
                      className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deletingId === template.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="font-medium text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(template.id)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

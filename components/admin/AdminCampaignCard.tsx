"use client";

import { Eye, FlaskConical, Loader2, Send } from "lucide-react";
import { formatDateTime } from "@/lib/adminClient";
import type { AdminEmailCampaign } from "@/lib/types";
import { cn } from "@/lib/utils";

/** One campaign card in the admin Emails tab. Presentational only. */
export default function AdminCampaignCard({
  campaign,
  busy,
  onEdit,
  onPreview,
  onTest,
  onDryRun,
  onRun,
  onToggle,
}: {
  campaign: AdminEmailCampaign;
  busy: string | null;
  onEdit: () => void;
  onPreview: () => void;
  onTest: () => void;
  onDryRun: () => void;
  onRun: () => void;
  onToggle: () => void;
}) {
  const smallButton =
    "flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{campaign.name}</h3>
          <p className="mt-1 text-xs text-slate-500">{campaign.summary}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            campaign.enabled
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          )}
        >
          {campaign.enabled ? "Enabled" : "Off"}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">{campaign.when}</p>
      <p className="mt-2 text-xs text-slate-400">
        {campaign.stats.sent} sent · {campaign.stats.failed} failed
        {campaign.stats.lastSentAt
          ? ` · last ${formatDateTime(campaign.stats.lastSentAt)}`
          : ""}
      </p>

      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {campaign.subject}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className={smallButton}>
          Edit copy
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={busy === `preview:${campaign.id}`}
          className={smallButton}
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={busy === `test:${campaign.id}`}
          className={smallButton}
        >
          <FlaskConical className="h-3.5 w-3.5" /> Test
        </button>
        <button
          type="button"
          onClick={onDryRun}
          disabled={busy === `dry:${campaign.id}`}
          className={smallButton}
        >
          Dry run
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy === `run:${campaign.id}`}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === `run:${campaign.id}` ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Run now
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={campaign.enabled}
          onChange={onToggle}
          disabled={busy === `toggle:${campaign.id}`}
          className="h-4 w-4"
        />
        Include in the daily 07:00 run
      </label>
    </article>
  );
}

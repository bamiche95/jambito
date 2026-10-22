"use client";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/adminClient";
import type { AdminEmailBroadcast } from "@/lib/types";

const STATUS_STYLES: Record<
  AdminEmailBroadcast["status"],
  { label: string; className: string }
> = {
  sending: { label: "Sending", className: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-700" },
  partial: { label: "Partial", className: "bg-red-50 text-red-700" },
};

/**
 * The last few one-off sends.
 *
 * The counts come from the per-recipient state on the broadcast document, so a
 * batch that stopped at the time budget still shows exactly how many inboxes are
 * left (and "Send remaining" can finish the job).
 */
export default function AdminBroadcastList({
  broadcasts,
}: {
  broadcasts: AdminEmailBroadcast[];
}) {
  if (broadcasts.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
        No one-off emails yet. Use &ldquo;Compose email&rdquo; to send the first one.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {broadcasts.map((broadcast) => {
        const status = STATUS_STYLES[broadcast.status] ?? STATUS_STYLES.sending;
        return (
          <div
            key={broadcast.id}
            className="flex flex-wrap items-start justify-between gap-3 bg-white px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {broadcast.subject || "(no subject)"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(broadcast.createdAt)}
                {broadcast.createdBy?.email ? ` · ${broadcast.createdBy.email}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                  status.className
                )}
              >
                {status.label}
              </span>
              <span>
                {broadcast.sent}/{broadcast.recipients} delivered
              </span>
              {broadcast.failed > 0 && (
                <span className="text-red-600">{broadcast.failed} failed</span>
              )}
              {broadcast.skipped > 0 && (
                <span className="text-amber-700">{broadcast.skipped} skipped</span>
              )}
              {broadcast.pending > 0 && (
                <span className="text-slate-500">{broadcast.pending} pending</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

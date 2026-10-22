"use client";

import type { ReactNode } from "react";
import type { EmailBroadcastContent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Shared input look, also used by the surrounding forms' own fields. */
export const emailFieldClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

/**
 * The copy fields shared by the campaign editor, the broadcast composer and the
 * saved-template editor.
 *
 * Plain text on purpose: the server escapes the body and turns blank lines into
 * paragraphs, so an admin cannot paste markup that breaks an inbox (or the
 * preview iframe). The character counters mirror the limits the API enforces.
 */
export default function AdminEmailContentFields({
  form,
  onChange,
  variables,
  disabled = false,
  trailing = null,
}: {
  form: EmailBroadcastContent;
  onChange: <K extends keyof EmailBroadcastContent>(
    key: K,
    value: EmailBroadcastContent[K]
  ) => void;
  variables: { token: string; description: string }[];
  disabled?: boolean;
  /** Extra cell in the button row (the campaign editor's "Wait (days)"). */
  trailing?: ReactNode;
}) {
  return (
    <>
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
          disabled={disabled}
          onChange={(event) => onChange("subject", event.target.value)}
          className={cn(emailFieldClass, "mt-1")}
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
          disabled={disabled}
          onChange={(event) => onChange("heading", event.target.value)}
          className={cn(emailFieldClass, "mt-1")}
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
          disabled={disabled}
          onChange={(event) => onChange("body", event.target.value)}
          className={cn(emailFieldClass, "mt-1 resize-y leading-6")}
        />
        <span className="mt-1 block text-xs text-slate-400">
          Plain text. Leave a blank line between paragraphs; every blank line
          becomes a new paragraph in the email.
        </span>
      </label>

      <div className={cn("grid gap-4", trailing ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Button label
          </span>
          <input
            value={form.ctaLabel}
            maxLength={40}
            disabled={disabled}
            onChange={(event) => onChange("ctaLabel", event.target.value)}
            className={cn(emailFieldClass, "mt-1")}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Button link
          </span>
          <input
            value={form.ctaPath}
            maxLength={200}
            disabled={disabled}
            onChange={(event) => onChange("ctaPath", event.target.value)}
            className={cn(emailFieldClass, "mt-1")}
          />
          <span className="mt-1 block text-xs text-slate-400">
            A path on this site (/cbt) or a full https:// link.
          </span>
        </label>
        {trailing}
      </div>

      {variables.length > 0 && (
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
      )}
    </>
  );
}

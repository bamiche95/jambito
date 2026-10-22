"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  FlaskConical,
  Loader2,
  Save,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { adminGet, adminPost, adminQuery } from "@/lib/adminClient";
import type {
  AdminEmailCampaign,
  AdminEmailRecipient,
  AdminEmailRecipientsPayload,
  AdminEmailTemplate,
  EmailBroadcastContent,
  EmailBroadcastPayload,
  EmailBroadcastSummary,
  EmailPreview,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import AdminEmailContentFields, { emailFieldClass } from "./AdminEmailContentFields";

type Notice = { kind: "ok" | "error" | "info"; text: string };

const PAGE_SIZE = 8;
const BLANK: EmailBroadcastContent = {
  subject: "",
  heading: "",
  body: "",
  ctaLabel: "Start practising",
  ctaPath: "/cbt",
};

function pickContent(item: EmailBroadcastContent): EmailBroadcastContent {
  return {
    subject: item.subject,
    heading: item.heading,
    body: item.body,
    ctaLabel: item.ctaLabel,
    ctaPath: item.ctaPath,
  };
}

function statusBadge(recipient: AdminEmailRecipient) {
  if (recipient.unsubscribed) {
    return { label: "Opted out", className: "bg-amber-50 text-amber-700" };
  }
  if (recipient.status === "blocked") {
    return { label: "Blocked", className: "bg-red-50 text-red-700" };
  }
  if (recipient.status === "deactivated") {
    return { label: "Deactivated", className: "bg-slate-100 text-slate-600" };
  }
  if (recipient.isSubscribed) {
    return { label: "Subscribed", className: "bg-emerald-50 text-emerald-700" };
  }
  return null;
}

/**
 * Composes a one-off email to hand-picked accounts.
 *
 * The copy is always validated on the server, and the recipient list travels as
 * uids only — the API looks every address up itself, so this form can never be
 * used to mail an arbitrary string. "Send" is a two-step action with an explicit
 * confirmation, and anything a batch could not deliver is reported (and can be
 * retried with "Send remaining").
 */
export default function AdminEmailComposer({
  token,
  variables,
  templates,
  campaigns,
  mailConfigured,
  unsubscribeConfigured,
  paused,
  maxRecipients,
  remainingToday,
  initialTemplateId = null,
  initialCampaignId = null,
  onClose,
  onNotice,
  onSent,
  onPreview,
  onTemplatesChanged,
}: {
  token: string | null;
  variables: { token: string; description: string }[];
  templates: AdminEmailTemplate[];
  campaigns: AdminEmailCampaign[];
  mailConfigured: boolean;
  unsubscribeConfigured: boolean;
  paused: boolean;
  maxRecipients: number;
  remainingToday: number;
  initialTemplateId?: string | null;
  initialCampaignId?: string | null;
  onClose: () => void;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
  onSent: () => void;
  onPreview: (preview: EmailPreview, name: string) => void;
  onTemplatesChanged: () => void;
}) {
  const initialSource: EmailBroadcastContent | null = initialTemplateId
    ? templates.find((template) => template.id === initialTemplateId) ?? null
    : initialCampaignId
      ? campaigns.find((campaign) => campaign.id === initialCampaignId) ?? null
      : null;

  const [form, setForm] = useState<EmailBroadcastContent>(
    initialSource ? pickContent(initialSource) : BLANK
  );
  const [base, setBase] = useState(
    initialTemplateId
      ? `template:${initialTemplateId}`
      : initialCampaignId
        ? `campaign:${initialCampaignId}`
        : "blank"
  );
  const [templateName, setTemplateName] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [picker, setPicker] = useState<AdminEmailRecipientsPayload | null>(null);
  const [pickerBusy, setPickerBusy] = useState(true);
  const [selected, setSelected] = useState<Record<string, AdminEmailRecipient>>({});
  const [busy, setBusy] = useState<"preview" | "test" | "send" | "template" | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: EmailBroadcastSummary;
    broadcastId: string | null;
  } | null>(null);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedUids = useMemo(
    () => selectedList.map((row) => row.uid),
    [selectedList]
  );

  function update<K extends keyof EmailBroadcastContent>(
    key: K,
    value: EmailBroadcastContent[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Only the copy is copied; the recipient list is never part of a template. */
  function applyBase(value: string) {
    setBase(value);
    if (value === "blank") {
      setForm(BLANK);
      return;
    }
    const [kind, id] = value.split(":");
    const source =
      kind === "template"
        ? templates.find((template) => template.id === id)
        : campaigns.find((campaign) => campaign.id === id);
    if (source) setForm(pickContent(source));
  }

  // Debounce the search so typing does not fire one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    if (!token) return;

    async function loadPage() {
      const res = await adminGet<AdminEmailRecipientsPayload>(
        `/api/admin/emails${adminQuery({
          recipients: 1,
          search: query,
          page,
          limit: PAGE_SIZE,
        })}`,
        token
      );
      if (!active) return;
      setPickerBusy(false);
      if (res.ok && res.data) setPicker(res.data);
      else setError(res.message);
    }

    void loadPage();
    return () => {
      active = false;
    };
  }, [token, query, page]);

  function toggle(recipient: AdminEmailRecipient) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[recipient.uid]) delete next[recipient.uid];
      else next[recipient.uid] = recipient;
      return next;
    });
  }

  function togglePage() {
    const rows = picker?.recipients ?? [];
    const allPicked = rows.length > 0 && rows.every((row) => Boolean(selected[row.uid]));
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (allPicked) delete next[row.uid];
        else if (!next[row.uid]) next[row.uid] = row;
      }
      return next;
    });
  }

  const overLimit = selectedList.length > maxRecipients;
  const blockedReason = !mailConfigured
    ? "Mail is not configured on this deployment."
    : !unsubscribeConfigured
      ? "Set EMAIL_UNSUBSCRIBE_SECRET before sending: every email needs a working opt-out link."
      : paused
        ? "Automated emails are paused. Resume sending in the header first."
        : null;
  const canSend =
    selectedList.length > 0 && !overLimit && !blockedReason && busy === null;

  async function preview() {
    if (!token) return;
    setBusy("preview");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "broadcast_preview",
      content: form,
      uids: selectedUids.slice(0, 1),
    });
    setBusy(null);
    if (!res.ok || !res.data?.preview) {
      setError(res.message);
      return;
    }
    onPreview(res.data.preview, form.subject.trim() || "Broadcast");
  }

  async function sendTest() {
    if (!token) return;
    setBusy("test");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "broadcast_test",
      content: form,
    });
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    onNotice(res.data.message ?? "Test email sent to your address.", "ok");
  }

  async function saveTemplate() {
    if (!token) return;
    const name = templateName.trim();
    if (!name) {
      setError("Give the template a name before saving it.");
      return;
    }
    setBusy("template");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>("/api/admin/emails", token, {
      action: "template_save",
      name,
      content: form,
    });
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    setTemplateName("");
    onNotice(res.data.message ?? "Template saved.", "ok");
    onTemplatesChanged();
  }

  async function send(continueId: string | null = null) {
    if (!token) return;
    setBusy("send");
    setError(null);
    const res = await adminPost<EmailBroadcastPayload>(
      "/api/admin/emails",
      token,
      continueId
        ? { action: "broadcast_send", broadcastId: continueId, confirm: true }
        : {
            action: "broadcast_send",
            content: form,
            uids: selectedUids,
            confirm: true,
          }
    );
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      setError(res.message);
      return;
    }
    setConfirming(false);
    setResult({
      summary:
        res.data.summary ??
        { sent: 0, failed: 0, skipped: 0, remaining: 0, stoppedReason: null },
      broadcastId: res.data.broadcastId ?? null,
    });
    onNotice(res.data.message ?? "Broadcast sent.", "ok");
    onSent();
  }


  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Compose email</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sends one email to the accounts you pick. The copy is escaped on the
              server, and every message carries the unsubscribe link.
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

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Start from
              </span>
              <select
                value={base}
                onChange={(event) => applyBase(event.target.value)}
                className={cn(emailFieldClass, "mt-1 bg-white")}
              >
                <option value="blank">Blank email</option>
                {templates.length > 0 && (
                  <optgroup label="Saved templates">
                    {templates.map((template) => (
                      <option key={template.id} value={`template:${template.id}`}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Copy an automated campaign">
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={`campaign:${campaign.id}`}>
                      {campaign.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                Templates and campaigns only copy the text — recipients are chosen
                below.
              </span>
            </label>

            <AdminEmailContentFields
              form={form}
              onChange={update}
              variables={variables}
            />

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Save this copy as a template
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={templateName}
                  maxLength={60}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="e.g. Exam timetable notice"
                  className={cn(emailFieldClass, "min-w-0 flex-1 bg-white")}
                />
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {busy === "template" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save template
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                A template keeps the subject, heading, body and button — never the
                recipient list.
              </p>
            </div>
          </div>


          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Users className="h-3.5 w-3.5" /> Recipients
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  overLimit ? "text-red-600" : "text-slate-500"
                )}
              >
                {selectedList.length}/{maxRecipients}
              </span>
            </div>

            <div className="space-y-2 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPickerBusy(true);
                  }}
                  placeholder="Search email or uid"
                  className={cn(emailFieldClass, "pl-9")}
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={togglePage}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Select page
                </button>
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  className="font-medium text-slate-500 hover:underline"
                >
                  Clear all
                </button>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto">
                {pickerBusy && !picker ? (
                  <p className="flex items-center gap-1.5 px-1 py-3 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading accounts…
                  </p>
                ) : (picker?.recipients ?? []).length === 0 ? (
                  <p className="px-1 py-3 text-xs text-slate-500">
                    No account matches that search.
                  </p>
                ) : (
                  (picker?.recipients ?? []).map((recipient) => {
                    const badge = statusBadge(recipient);
                    return (
                      <label
                        key={recipient.uid}
                        className="flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selected[recipient.uid])}
                          onChange={() => toggle(recipient)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-700">
                            {recipient.email}
                          </span>
                          {badge && (
                            <span
                              className={cn(
                                "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                badge.className
                              )}
                            >
                              {badge.label}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span>
                  {picker
                    ? `${picker.total} account${picker.total === 1 ? "" : "s"}`
                    : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1 || pickerBusy}
                    onClick={() => {
                      setPickerBusy(true);
                      setPage((current) => Math.max(1, current - 1));
                    }}
                    className="rounded border border-slate-200 px-2 py-0.5 font-medium text-slate-600 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span>Page {page}</span>
                  <button
                    type="button"
                    disabled={!picker?.hasMore || pickerBusy}
                    onClick={() => {
                      setPickerBusy(true);
                      setPage((current) => current + 1);
                    }}
                    className="rounded border border-slate-200 px-2 py-0.5 font-medium text-slate-600 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>


              {selectedList.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  {selectedList.slice(0, 6).map((recipient) => (
                    <button
                      key={recipient.uid}
                      type="button"
                      onClick={() => toggle(recipient)}
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
                    >
                      {recipient.email}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  {selectedList.length > 6 && (
                    <span className="px-1 text-[11px] text-slate-500">
                      +{selectedList.length - 6} more
                    </span>
                  )}
                </div>
              )}

              <p
                className={cn(
                  "text-[11px]",
                  remainingToday === 0 ? "text-amber-700" : "text-slate-400"
                )}
              >
                {remainingToday === 0
                  ? "Today's daily cap is used up; the send will stop immediately."
                  : `${remainingToday} email(s) left under today's cap.`}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-200 p-4">
          {blockedReason && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {blockedReason}
            </p>
          )}
          {overLimit && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              A broadcast goes to at most {maxRecipients} recipients. Remove{" "}
              {selectedList.length - maxRecipients} from the list to continue.
            </p>
          )}

          {result && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Batch finished</p>
              <p className="mt-1">
                {result.summary.sent} sent · {result.summary.failed} failed ·{" "}
                {result.summary.skipped} skipped · {result.summary.remaining}{" "}
                remaining
                {result.summary.stoppedReason
                  ? ` · stopped: ${result.summary.stoppedReason.replace(/_/g, " ")}`
                  : ""}
              </p>
              {result.summary.remaining > 0 && result.broadcastId && (
                <button
                  type="button"
                  onClick={() => send(result.broadcastId)}
                  disabled={busy !== null || Boolean(blockedReason)}
                  className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Send remaining {result.summary.remaining}
                </button>
              )}
            </div>
          )}


          {confirming && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-blue-900">
                Send this email to {selectedList.length} account
                {selectedList.length === 1 ? "" : "s"}?
              </p>
              <p className="mt-1 text-xs text-blue-800">
                Subject: &ldquo;{form.subject || "(untitled)"}&rdquo;. Delivered
                messages are never sent twice, but the send itself cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy === "send" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy !== null}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={sendTest}
                disabled={busy !== null || !mailConfigured}
                title={!mailConfigured ? "Mail is not configured" : undefined}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "test" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                Send test to me
              </button>
              {!confirming && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!canSend}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Send to {selectedList.length || "…"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


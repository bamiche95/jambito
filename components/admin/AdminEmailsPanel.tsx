"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Eye,
  Loader2,
  Mail,
  MailPlus,
  PauseCircle,
  PlayCircle,
  Send,
  X,
} from "lucide-react";
import { adminGet, adminPost, formatDateTime } from "@/lib/adminClient";
import type {
  AdminEmailCampaign,
  AdminEmailTemplate,
  AdminEmailsPayload,
  EmailActionPayload,
  EmailPreview,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { NoticeBar } from "./AdminUi";
import AdminBroadcastList from "./AdminBroadcastList";
import AdminCampaignCard from "./AdminCampaignCard";
import AdminEmailComposer from "./AdminEmailComposer";
import AdminEmailEditor from "./AdminEmailEditor";
import AdminEmailTemplateEditor from "./AdminEmailTemplateEditor";
import AdminEmailTemplatesCard from "./AdminEmailTemplatesCard";

type Notice = { kind: "ok" | "error" | "info"; text: string };

/**
 * The email campaigns tab.
 *
 * Everything is explicit on purpose: each campaign shows when it fires, how many
 * messages it has actually delivered, and separate buttons for a preview (no
 * send), a test to the admin's own inbox, a dry run (who would receive it) and a
 * real batch. The global pause switch is one click, and the daily cap is the
 * backstop that keeps a mistake from becoming a mass mailing.
 */
export default function AdminEmailsPanel({
  token,
  onNotice,
}: {
  token: string | null;
  onNotice: (message: string, kind?: Notice["kind"]) => void;
}) {
  const [data, setData] = useState<AdminEmailsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminEmailCampaign | null>(null);
  const [preview, setPreview] = useState<{
    preview: EmailPreview;
    name: string;
  } | null>(null);
  const [capInput, setCapInput] = useState("");
  const [dryRun, setDryRun] = useState<NonNullable<
    EmailActionPayload["summary"]
  > | null>(null);
  const [composer, setComposer] = useState<{
    templateId: string | null;
    campaignId: string | null;
    nonce: number;
  } | null>(null);
  const [templateDraft, setTemplateDraft] = useState<{
    template: AdminEmailTemplate | null;
    nonce: number;
  } | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await adminGet<AdminEmailsPayload>("/api/admin/emails", token);
    if (!res.ok || !res.data) {
      setError(res.message);
      return;
    }
    setError(null);
    setData(res.data);
    setCapInput(String(res.data.settings.dailyCap));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Same shape as AdminPricingPanel: the fetch lives inside the effect so the
    // state updates happen after an await, never synchronously during render.
    async function loadInitial() {
      const res = await adminGet<AdminEmailsPayload>("/api/admin/emails", token);
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setError(res.message);
        return;
      }
      setError(null);
      setData(res.data);
      setCapInput(String(res.data.settings.dailyCap));
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function post(
    body: Record<string, unknown>,
    key: string
  ): Promise<EmailActionPayload | null> {
    if (!token) return null;
    setBusy(key);
    const res = await adminPost<EmailActionPayload>(
      "/api/admin/emails",
      token,
      body
    );
    setBusy(null);
    if (!res.ok || !res.data?.success) {
      onNotice(res.message, "error");
      return null;
    }
    if (res.data.message) onNotice(res.data.message, "ok");
    return res.data;
  }

  async function setPaused(paused: boolean) {
    const result = await post({ action: "settings", paused }, "pause");
    if (result?.settings) {
      setData((prev) =>
        prev ? { ...prev, settings: result.settings! } : prev
      );
    }
  }

  async function saveCap() {
    const result = await post(
      { action: "settings", dailyCap: Number(capInput) },
      "cap"
    );
    if (result?.settings) {
      setData((prev) =>
        prev ? { ...prev, settings: result.settings! } : prev
      );
      setCapInput(String(result.settings.dailyCap));
    }
  }

  async function toggleEnabled(campaign: AdminEmailCampaign) {
    const result = await post(
      {
        action: "save",
        id: campaign.id,
        content: {
          subject: campaign.subject,
          heading: campaign.heading,
          body: campaign.body,
          ctaLabel: campaign.ctaLabel,
          ctaPath: campaign.ctaPath,
          delayDays: campaign.delayDays,
          enabled: !campaign.enabled,
        },
      },
      `toggle:${campaign.id}`
    );
    if (result?.campaign) await load();
  }

  async function sendTest(campaign: AdminEmailCampaign) {
    await post({ action: "test", id: campaign.id }, `test:${campaign.id}`);
  }

  async function run(campaign: AdminEmailCampaign | null, dryRun: boolean) {
    const key = `${dryRun ? "dry" : "run"}:${campaign?.id ?? "all"}`;
    const result = await post(
      { action: "run", id: campaign?.id ?? null, dryRun },
      key
    );
    if (result) {
      setDryRun(dryRun ? result.summary ?? null : null);
      await load();
    }
  }

  async function showPreview(campaign: AdminEmailCampaign) {
    if (!token) return;
    setBusy(`preview:${campaign.id}`);
    const res = await adminPost<EmailActionPayload>(
      "/api/admin/emails",
      token,
      { action: "preview", id: campaign.id }
    );
    setBusy(null);
    if (!res.ok || !res.data?.preview) {
      onNotice(res.message, "error");
      return;
    }
    setPreview({ preview: res.data.preview, name: campaign.name });
  }

  async function deleteTemplate(template: AdminEmailTemplate) {
    setDeletingTemplate(template.id);
    const result = await post(
      { action: "template_delete", id: template.id },
      `template-delete:${template.id}`
    );
    setDeletingTemplate(null);
    if (result) await load();
  }

  function openComposer(templateId: string | null, campaignId: string | null) {
    setComposer({ templateId, campaignId, nonce: Date.now() });
  }

  const lastRun = data?.settings.lastRunSummary ?? null;
  const ready = Boolean(data?.mailConfigured && data?.unsubscribeConfigured);
  const smallButton =
    "flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

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
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the email
          campaigns…
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Mail className="h-5 w-5 text-blue-700" /> Progress emails
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Four automated emails about each student&apos;s own practice. Copy
              is editable, every send is deduplicated, and each message carries
              an unsubscribe link.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openComposer(null, null)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <MailPlus className="h-4 w-4" /> Compose email
            </button>
            <button
              type="button"
              onClick={() => setPaused(!data.settings.paused)}
              disabled={busy === "pause"}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                data.settings.paused
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              )}
            >
              {data.settings.paused ? (
                <PlayCircle className="h-4 w-4" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              {data.settings.paused ? "Resume all emails" : "Pause all emails"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-semibold",
              data.mailConfigured
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            {data.mailConfigured ? "SMTP configured" : "SMTP missing"}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-semibold",
              data.unsubscribeConfigured
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            {data.unsubscribeConfigured
              ? "Unsubscribe links ready"
              : "Unsubscribe secret missing"}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {data.counts.sentToday} sent today (cap {data.settings.dailyCap})
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {data.counts.unsubscribed} unsubscribed
          </span>
          {data.settings.paused && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
              All emails paused
            </span>
          )}
        </div>

        {!ready && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nothing will be sent until this deployment has SMTP credentials and
              an unsubscribe secret. Set <code>SMTP_PASSWORD</code> and{" "}
              <code>CRON_SECRET</code> (or <code>EMAIL_UNSUBSCRIBE_SECRET</code>)
              in the environment.
            </span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Daily cap
            <input
              type="number"
              min={1}
              max={1000}
              value={capInput}
              onChange={(event) => setCapInput(event.target.value)}
              className="mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button
            type="button"
            onClick={saveCap}
            disabled={busy === "cap"}
            className={smallButton}
          >
            {busy === "cap" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Save cap
          </button>
          <button
            type="button"
            onClick={() => run(null, true)}
            disabled={busy === "dry:all"}
            className={smallButton}
          >
            <Eye className="h-3.5 w-3.5" /> Dry run all enabled
          </button>
          <button
            type="button"
            onClick={() => run(null, false)}
            disabled={busy === "run:all"}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "run:all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Run all enabled now
          </button>
        </div>

        {lastRun && (
          <p className="mt-3 text-xs text-slate-500">
            Last run {formatDateTime(data.settings.lastRunAt)}: {lastRun.sent}{" "}
            sent
            {lastRun.failed ? `, ${lastRun.failed} failed` : ""}
            {lastRun.stoppedReason ? ` (stopped: ${lastRun.stoppedReason})` : ""}
            {lastRun.dryRun ? " · dry run" : ""}
          </p>
        )}
      </div>

      <AdminEmailTemplatesCard
        templates={data.templates}
        deletingId={deletingTemplate}
        onNew={() => setTemplateDraft({ template: null, nonce: Date.now() })}
        onCompose={(template) => openComposer(template.id, null)}
        onEdit={(template) => setTemplateDraft({ template, nonce: Date.now() })}
        onDelete={deleteTemplate}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {data.campaigns.map((campaign) => (
          <AdminCampaignCard
            key={campaign.id}
            campaign={campaign}
            busy={busy}
            onEdit={() => setEditing(campaign)}
            onPreview={() => showPreview(campaign)}
            onTest={() => sendTest(campaign)}
            onDryRun={() => run(campaign, true)}
            onRun={() => run(campaign, false)}
            onToggle={() => toggleEnabled(campaign)}
          />
        ))}
      </div>

      {dryRun && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Dry run — nobody was emailed
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                This is the audience the next real run would use. Addresses are
                partly masked.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDryRun(null)}
              aria-label="Dismiss dry run"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {dryRun.campaigns.map((campaign) => (
              <li key={campaign.id} className="text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  {campaign.name}
                </span>
                : {campaign.audience} due
                {campaign.reason ? ` (${campaign.reason})` : ""}
                {campaign.recipients.length > 0 && (
                  <span className="ml-1 text-slate-400">
                    {campaign.recipients.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Recent sends</h3>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1.5 pr-3 font-medium">Recipient</th>
                  <th className="py-1.5 pr-3 font-medium">Campaign</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent.map((send) => (
                  <tr key={send.id}>
                    <td className="py-1.5 pr-3 text-slate-700">{send.email}</td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {send.campaignId}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-semibold",
                          send.status === "sent"
                            ? "bg-emerald-50 text-emerald-700"
                            : send.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {send.status}
                      </span>
                      {send.error && (
                        <span className="mt-0.5 block text-[11px] text-red-500">
                          {send.error}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {formatDateTime(send.sentAt ?? send.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              One-off emails
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              The last 10 broadcasts. Every recipient is recorded once, so a retry
              can never deliver a duplicate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openComposer(null, null)}
            className={smallButton}
          >
            <MailPlus className="h-3.5 w-3.5" /> Compose
          </button>
        </div>
        <div className="mt-3">
          <AdminBroadcastList broadcasts={data.broadcasts} />
        </div>
      </div>

      {templateDraft && (
        <AdminEmailTemplateEditor
          key={`template-${templateDraft.nonce}`}
          token={token}
          template={templateDraft.template}
          variables={data.variables}
          onClose={() => setTemplateDraft(null)}
          onNotice={onNotice}
          onSaved={() => {
            setTemplateDraft(null);
            void load();
          }}
          onDeleted={() => {
            setTemplateDraft(null);
            void load();
          }}
          onPreview={(nextPreview, name) =>
            setPreview({ preview: nextPreview, name })
          }
        />
      )}

      {composer && (
        <AdminEmailComposer
          key={`composer-${composer.nonce}`}
          token={token}
          variables={data.variables}
          templates={data.templates}
          campaigns={data.campaigns}
          mailConfigured={data.mailConfigured}
          unsubscribeConfigured={data.unsubscribeConfigured}
          paused={data.settings.paused}
          maxRecipients={data.broadcastLimits.maxRecipients}
          remainingToday={data.broadcastLimits.remainingToday}
          initialTemplateId={composer.templateId}
          initialCampaignId={composer.campaignId}
          onClose={() => setComposer(null)}
          onNotice={onNotice}
          onSent={() => void load()}
          onPreview={(nextPreview, name) =>
            setPreview({ preview: nextPreview, name })
          }
          onTemplatesChanged={() => void load()}
        />
      )}

      {editing && (
        <AdminEmailEditor
          key={editing.id}
          token={token}
          campaign={editing}
          variables={data.variables}
          onClose={() => setEditing(null)}
          onNotice={onNotice}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onPreview={(nextPreview, name) =>
            setPreview({ preview: nextPreview, name })
          }
        />
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:p-8">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Preview — {preview.name}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {preview.preview.subject}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Rendered with sample values. No email was sent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title={`${preview.name} email preview`}
              srcDoc={preview.preview.html}
              sandbox=""
              className="h-[560px] w-full rounded-b-2xl bg-white"
            />
          </div>
        </div>
      )}
    </section>
  );
}
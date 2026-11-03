import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { writeAudit } from "@/lib/adminUsers";
import { SITE_URL } from "@/lib/site";
import { getUserByUid } from "@/lib/users";
import { getContactInbox, isMailConfigured, sendMail } from "@/lib/mailer";
import {
  getBrevoAccount,
  getBrevoDomain,
  getBrevoSender,
  isBrevoConfigured,
  listBrevoSenders,
  sendBrevoEmail,
} from "@/lib/brevo";
import { ensureCampaignTemplates } from "@/lib/brevoTemplates";
import {
  EMAIL_CAMPAIGN_DEFINITIONS,
  EMAIL_TEMPLATE_NAME_LIMIT,
  EMAIL_VARIABLES,
  getCampaignDefinition,
  normalizeCampaignDoc,
  sampleCampaignUser,
  validateCampaignContent,
} from "@/lib/emailCampaigns";
import {
  EMAIL_BROADCAST_MAX_RECIPIENTS,
  countSentSince,
  countUnsubscribedUsers,
  createEmailBroadcast,
  deleteEmailTemplate,
  getEmailBroadcast,
  getEmailCampaignDocs,
  getEmailCampaignStats,
  getEmailSettings,
  listEmailBroadcasts,
  listEmailRecipients,
  listEmailTemplates,
  listRecentEmailSends,
  resolveBroadcastRecipients,
  saveEmailCampaignDoc,
  saveEmailSettings,
  saveEmailTemplate,
} from "@/lib/emailStore";
import { runEmailCampaigns, sendBroadcastBatch } from "@/lib/emailEngine";
import { renderBroadcastEmail, renderCampaignEmail } from "@/lib/emailTemplates";
import { isUnsubscribeConfigured, unsubscribeUrl } from "@/lib/emailTokens";

export const dynamic = "force-dynamic";
// "Run now" and "Send" mail inside the request; the engines stop well before this.
export const maxDuration = 60;

/**
 * Admin control for the automated progress emails and one-off broadcasts.
 *
 * GET  -> campaign copy, per-campaign send counts, recent sends, settings,
 *         saved templates and recent broadcasts. `?recipients=1&search=&page=`
 *         returns the composer's recipient picker instead.
 * POST -> one of:
 *   { action: "save",     id, content }        update copy / enable a campaign
 *   { action: "preview",  id, content? }        render without sending
 *   { action: "test",     id }                  one message to the admin's own address
 *   { action: "run",      id?, dryRun?, limit? } run one campaign, or all enabled ones
 *   { action: "settings", paused?, dailyCap? }  global pause switch / daily cap
 *   { action: "broadcast_preview", content, uids? } render a one-off for one recipient
 *   { action: "broadcast_test",    content }        one message to the admin's address
 *   { action: "broadcast_send",    content?, uids?, confirm, broadcastId? }
 *                                                send (or continue) a broadcast
 *   { action: "template_save",     id?, name, content }
 *   { action: "template_delete",   id }
 *   { action: "templates_push",    id?, force? }  mirror the campaign copy into
 *                                                Brevo transactional templates
 *   { action: "brevo_check" }                    ask Brevo directly whether the
 *                                                key, sender and domain are good
 *
 * A test can only go to the signed-in admin. Accepting an arbitrary recipient
 * would turn the dashboard into an open relay for any compromised admin token.
 * A real broadcast only accepts uids, never an address, for the same reason.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function forbidden() {
  return NextResponse.json(
    { success: false, message: "Forbidden" },
    { status: 403, headers: NO_STORE }
  );
}

function fail(status, code, message) {
  return NextResponse.json(
    { success: false, code, message },
    { status, headers: NO_STORE }
  );
}

function actorOf(auth) {
  return {
    uid: auth.decoded.uid,
    email: auth.decoded.email ?? auth.user?.email ?? null,
  };
}

/** The five editable columns a broadcast or a template owns. */
function broadcastContent(value) {
  return {
    subject: value.subject,
    heading: value.heading,
    body: value.body,
    ctaLabel: value.ctaLabel,
    ctaPath: value.ctaPath,
  };
}

/**
 * Some transport must be configured before anything is sent: Brevo is the
 * student-facing one, the Go54 mailbox is the fallback.
 */
function canSendEmail() {
  return isBrevoConfigured() || isMailConfigured();
}

const NOT_CONFIGURED_MESSAGE =
  "Email is not configured on this deployment (set BREVO_API_KEY, or SMTP_USER and SMTP_PASSWORD).";

/**
 * Sends a dashboard test to the signed-in admin.
 *
 * A test uses rendered HTML rather than a Brevo template on purpose: it proves
 * the transport and the API key work without depending on a template having
 * been pushed, and it shows exactly the markup a recipient would get.
 */
async function sendTestEmail({ to, subject, text, html }) {
  if (isBrevoConfigured()) {
    const info = await sendBrevoEmail({
      to,
      subject,
      text,
      html,
      tag: "admin-test",
    });
    return { transport: "brevo", messageId: info.messageId };
  }
  const info = await sendMail({ to, subject, text, html });
  return { transport: "smtp", messageId: info?.messageId ?? null };
}

/** "Brevo" or "the mailbox" — the transport, named in admin messages. */
function transportLabel(transport) {
  return transport === "brevo" ? "Brevo" : "the mailbox";
}

/**
 * Asks Brevo whether this deployment can actually send: the key is accepted,
 * the From address is a verified sender or sits on an authenticated domain, and
 * the domain has SPF/DKIM.
 *
 * `BREVO_API_KEY` being present proves none of that on its own — the live
 * account once refused every request from an unlisted IP with a 401 that read
 * like a bad key — so the dashboard asks the provider instead of trusting its
 * own environment. Senders and domains are optional facts: a failure to list
 * them must not hide a working key.
 */
async function brevoStatus() {
  const sender = getBrevoSender();
  const [account, senders, domain] = await Promise.all([
    getBrevoAccount(),
    listBrevoSenders().catch(() => null),
    getBrevoDomain(sender.email).catch(() => null),
  ]);

  const verified = (senders ?? []).find(
    (entry) =>
      String(entry?.email ?? "").toLowerCase() === sender.email.toLowerCase()
  );
  const senderActive = Boolean(verified) && verified.active !== false;
  const domainAuthenticated = Boolean(domain?.authenticated);
  // Brevo accepts either a verified sender or any address on an authenticated
  // domain; only the second also keeps the mail out of the spam folder.
  const ready = senderActive || domainAuthenticated;

  const message = !ready
    ? `${sender.email} is neither a verified sender nor on an authenticated domain, so Brevo will reject every send.`
    : domainAuthenticated && !senderActive
      ? `${sender.email} is not a listed sender, but ${domain.domain_name} is authenticated, so Brevo accepts it.`
      : domainAuthenticated
        ? `${sender.email} is verified and ${domain.domain_name} is authenticated.`
        : `${sender.email} is a verified sender, but its domain has no SPF/DKIM in Brevo — expect spam filtering.`;

  return {
    ready,
    deliverable: domainAuthenticated,
    sender: {
      email: sender.email,
      name: sender.name,
      verified: Boolean(verified),
      active: senderActive,
    },
    domain: domain
      ? { name: domain.domain_name, authenticated: domainAuthenticated }
      : null,
    account: {
      email: account?.email ?? null,
      plan: account?.plan?.[0]?.type ?? null,
      credits: account?.plan?.[0]?.credits ?? null,
    },
    message,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const { searchParams } = new URL(request.url);

  try {
    if (searchParams.get("recipients") === "1") {
      const picker = await listEmailRecipients({
        search: searchParams.get("search") ?? "",
        page: searchParams.get("page") ?? 1,
        limit: searchParams.get("limit") ?? 25,
      });
      return NextResponse.json(
        { success: true, ...picker },
        { headers: NO_STORE }
      );
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [settings, docs, stats, recent, unsubscribed, sentToday, templates, broadcasts] =
      await Promise.all([
        getEmailSettings(),
        getEmailCampaignDocs(),
        getEmailCampaignStats(),
        listRecentEmailSends(25),
        countUnsubscribedUsers(),
        countSentSince(startOfDay),
        listEmailTemplates(),
        listEmailBroadcasts(10),
      ]);

    const campaigns = EMAIL_CAMPAIGN_DEFINITIONS.map((definition) => {
      const campaign = normalizeCampaignDoc(definition.id, docs.get(definition.id));
      return {
        ...campaign,
        stats: stats.get(definition.id) ?? {
          sent: 0,
          failed: 0,
          sending: 0,
          lastSentAt: null,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        settings,
        campaigns,
        recent,
        counts: { unsubscribed, sentToday },
        mailConfigured: isMailConfigured(),
        brevoConfigured: isBrevoConfigured(),
        brevoSender: getBrevoSender().email,
        unsubscribeConfigured: isUnsubscribeConfigured(),
        variables: EMAIL_VARIABLES,
        siteUrl: SITE_URL,
        templates,
        broadcasts,
        broadcastLimits: {
          maxRecipients: EMAIL_BROADCAST_MAX_RECIPIENTS,
          // Headroom today, so the composer can warn before a send rather than
          // after the daily cap stops the batch.
          remainingToday: Math.max(0, settings.dailyCap - sentToday),
        },
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("GET /api/admin/emails failed:", error);
    return fail(500, "server_error", "Could not load the email campaigns.");
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return fail(400, "invalid_body", "Invalid request body.");
  }

  const action = String(body.action ?? "");
  const id = body.id ? String(body.id) : null;
  const actor = actorOf(auth);

  try {
    if (action === "save") {
      if (!id) return fail(400, "missing_campaign", "Choose a campaign to save.");
      const validated = validateCampaignContent(body.content);
      if (!validated.ok) return fail(400, "invalid_content", validated.message);

      const saved = await saveEmailCampaignDoc(id, validated.value, actor);
      if (!saved.ok) return fail(400, "unknown_campaign", saved.message);

      await writeAudit({
        actor,
        action: "saveEmailCampaign",
        details: { campaignId: id, ...validated.value },
      });
      const campaign = normalizeCampaignDoc(id, saved.doc);
      return NextResponse.json(
        {
          success: true,
          campaign,
          message: `${campaign.name} saved${campaign.enabled ? " and enabled" : ""}.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "preview") {
      if (!id) return fail(400, "missing_campaign", "Choose a campaign to preview.");
      const docs = await getEmailCampaignDocs();
      let content = docs.get(id) ?? null;
      if (body.content) {
        const validated = validateCampaignContent(body.content);
        if (!validated.ok) return fail(400, "invalid_content", validated.message);
        content = { ...(content ?? {}), ...validated.value };
      }
      const campaign = normalizeCampaignDoc(id, content);
      if (!campaign) return fail(400, "unknown_campaign", "Unknown campaign.");

      const preview = renderCampaignEmail({
        campaign,
        user: sampleCampaignUser(),
        siteUrl: SITE_URL,
        contactEmail: getContactInbox(),
        unsubscribeUrl: unsubscribeUrl(SITE_URL, "sample-uid"),
      });
      return NextResponse.json(
        { success: true, preview, campaign },
        { headers: NO_STORE }
      );
    }

    if (action === "test") {
      if (!id) return fail(400, "missing_campaign", "Choose a campaign to test.");
      if (!canSendEmail()) {
        return fail(503, "not_configured", NOT_CONFIGURED_MESSAGE);
      }
      const to = String(auth.decoded.email ?? auth.user?.email ?? "").trim();
      if (!to) return fail(400, "no_email", "Your admin account has no email address.");

      const docs = await getEmailCampaignDocs();
      const campaign = normalizeCampaignDoc(id, docs.get(id));
      if (!campaign) return fail(400, "unknown_campaign", "Unknown campaign.");

      const template = renderCampaignEmail({
        campaign,
        user: { ...sampleCampaignUser(), email: to, name: to.split("@")[0] },
        siteUrl: SITE_URL,
        contactEmail: getContactInbox(),
        // A sample id, so clicking Unsubscribe in a test cannot opt the admin out.
        unsubscribeUrl: unsubscribeUrl(SITE_URL, "sample-uid"),
      });
      const sent = await sendTestEmail({
        to,
        subject: `[Test] ${template.subject}`,
        text: template.text,
        html: template.html,
      });
      await writeAudit({
        actor,
        action: "testEmailCampaign",
        details: { campaignId: id, to, transport: sent.transport },
      });
      return NextResponse.json(
        {
          success: true,
          message: `Test email sent to ${to} via ${transportLabel(sent.transport)}.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "run") {
      if (id && !getCampaignDefinition(id)) {
        return fail(400, "unknown_campaign", "Unknown campaign.");
      }
      const dryRun = body.dryRun === true;
      const summary = await runEmailCampaigns({
        campaignIds: id ? [id] : null,
        dryRun,
        limitPerCampaign: Number(body.limit ?? 25),
      });

      if (!dryRun) {
        await writeAudit({
          actor,
          action: "runEmailCampaigns",
          details: {
            campaignIds: id ? [id] : null,
            sent: summary.sent,
            failed: summary.failed,
            stoppedReason: summary.stoppedReason,
          },
        });
      }

      const audience = summary.campaigns.reduce(
        (total, campaign) => total + campaign.audience,
        0
      );
      return NextResponse.json(
        {
          success: true,
          dryRun,
          summary,
          message: dryRun
            ? `Dry run: ${audience} recipient(s) would be emailed.`
            : `Sent ${summary.sent} email(s)${
                summary.failed ? `, ${summary.failed} failed` : ""
              }${summary.stoppedReason ? ` (stopped: ${summary.stoppedReason})` : ""}.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "settings") {
      const settings = await saveEmailSettings({
        paused: typeof body.paused === "boolean" ? body.paused : undefined,
        dailyCap: body.dailyCap === undefined ? undefined : Number(body.dailyCap),
        actor,
      });
      await writeAudit({
        actor,
        action: "setEmailSettings",
        details: { paused: settings.paused, dailyCap: settings.dailyCap },
      });
      return NextResponse.json(
        {
          success: true,
          settings,
          message: settings.paused
            ? "Automated emails are paused."
            : "Automated emails are active.",
        },
        { headers: NO_STORE }
      );
    }

    if (action === "brevo_check") {
      if (!isBrevoConfigured()) {
        return fail(
          409,
          "brevo_unconfigured",
          "Set BREVO_API_KEY before asking Brevo about this account."
        );
      }
      try {
        const status = await brevoStatus();
        return NextResponse.json(
          { success: true, brevo: status, message: status.message },
          { headers: NO_STORE }
        );
      } catch (error) {
        // The code matters: `brevo_ip_blocked` and `brevo_unauthorized` need
        // different fixes, and the dashboard shows whichever came back.
        return NextResponse.json(
          {
            success: false,
            code: error?.code ?? "brevo_error",
            message: error?.message ?? "Brevo did not answer.",
          },
          { status: 502, headers: NO_STORE }
        );
      }
    }

    if (action === "templates_push") {
      if (!isBrevoConfigured()) {
        return fail(
          409,
          "brevo_unconfigured",
          "Set BREVO_API_KEY before pushing the campaign templates to Brevo."
        );
      }
      if (id && !getCampaignDefinition(id)) {
        return fail(400, "unknown_campaign", "Unknown campaign.");
      }

      // The runner pushes on demand too; this is the button that shows all four
      // succeed now, instead of discovering a problem on the next cron run.
      const result = await ensureCampaignTemplates({
        ids: id ? [id] : null,
        force: body.force === true,
      });

      await writeAudit({
        actor,
        action: "pushBrevoTemplates",
        details: {
          ids: id ? [id] : null,
          pushed: result.pushed,
          unchanged: result.unchanged,
          failed: result.failed,
        },
      });

      const failure = result.templates.find((template) => !template.ok);
      return NextResponse.json(
        {
          success: result.failed === 0,
          result,
          message: failure
            ? `Could not push ${failure.name}: ${failure.message ?? "unknown error"}`
            : `${result.pushed} template(s) pushed to Brevo, ${result.unchanged} already up to date.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "broadcast_preview") {
      const validated = validateCampaignContent(body.content);
      if (!validated.ok) return fail(400, "invalid_content", validated.message);

      // Previewing against a real account shows the {{name}} the recipient will
      // actually see; without one, the sample account is used.
      const firstUid = Array.isArray(body.uids) ? String(body.uids[0] ?? "") : "";
      const recipient = firstUid ? await getUserByUid(firstUid) : null;
      const previewUser = recipient?.email ? recipient : sampleCampaignUser();

      const preview = renderBroadcastEmail({
        content: broadcastContent(validated.value),
        user: previewUser,
        siteUrl: SITE_URL,
        contactEmail: getContactInbox(),
        unsubscribeUrl: unsubscribeUrl(
          SITE_URL,
          recipient?._id ? String(recipient._id) : "sample-uid"
        ),
      });
      return NextResponse.json(
        { success: true, preview },
        { headers: NO_STORE }
      );
    }

    if (action === "broadcast_test") {
      if (!canSendEmail()) {
        return fail(503, "not_configured", NOT_CONFIGURED_MESSAGE);
      }
      const to = String(auth.decoded.email ?? auth.user?.email ?? "").trim();
      if (!to) return fail(400, "no_email", "Your admin account has no email address.");

      const validated = validateCampaignContent(body.content);
      if (!validated.ok) return fail(400, "invalid_content", validated.message);

      const template = renderBroadcastEmail({
        content: broadcastContent(validated.value),
        user: { ...sampleCampaignUser(), email: to, name: to.split("@")[0] },
        siteUrl: SITE_URL,
        contactEmail: getContactInbox(),
        // A sample id, so clicking Unsubscribe in a test cannot opt the admin out.
        unsubscribeUrl: unsubscribeUrl(SITE_URL, "sample-uid"),
      });
      const sent = await sendTestEmail({
        to,
        subject: `[Test] ${template.subject}`,
        text: template.text,
        html: template.html,
      });
      await writeAudit({
        actor,
        action: "testEmailBroadcast",
        details: { to, subject: template.subject, transport: sent.transport },
      });
      return NextResponse.json(
        {
          success: true,
          message: `Test email sent to ${to} via ${transportLabel(sent.transport)}.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "broadcast_send") {
      if (body.confirm !== true) {
        return fail(400, "confirm_required", "Confirm the recipient list before sending.");
      }
      if (!canSendEmail()) {
        return fail(503, "not_configured", NOT_CONFIGURED_MESSAGE);
      }
      if (!isUnsubscribeConfigured()) {
        return fail(
          409,
          "unsubscribe_unconfigured",
          "Sending is blocked: EMAIL_UNSUBSCRIBE_SECRET is not set, so the email would have no working opt-out link."
        );
      }

      const settings = await getEmailSettings();
      if (settings.paused) {
        return fail(
          409,
          "paused",
          "Automated emails are paused. Resume sending in the header before composing a broadcast."
        );
      }

      let target = null;

      if (body.broadcastId) {
        // "Send remaining": the copy and audience are already frozen on the doc.
        target = await getEmailBroadcast(String(body.broadcastId));
        if (!target) {
          return fail(404, "unknown_broadcast", "That broadcast no longer exists.");
        }
      } else {
        const validated = validateCampaignContent(body.content);
        if (!validated.ok) return fail(400, "invalid_content", validated.message);

        const requested = Array.isArray(body.uids)
          ? [
              ...new Set(
                body.uids.map((uid) => String(uid ?? "")).filter(Boolean)
              ),
            ]
          : [];
        if (!requested.length) {
          return fail(400, "no_recipients", "Choose at least one recipient.");
        }
        if (requested.length > EMAIL_BROADCAST_MAX_RECIPIENTS) {
          return fail(
            400,
            "too_many_recipients",
            `A broadcast goes to at most ${EMAIL_BROADCAST_MAX_RECIPIENTS} recipients at a time.`
          );
        }

        const recipients = await resolveBroadcastRecipients(requested);
        if (!recipients.some((recipient) => recipient.status === "pending")) {
          return fail(
            400,
            "no_recipients",
            "None of the selected accounts can receive email (no address, deleted, or opted out)."
          );
        }

        const created = await createEmailBroadcast({
          content: broadcastContent(validated.value),
          recipients,
          actor,
        });
        target = created.doc;
      }

      const summary = await sendBroadcastBatch(String(target._id), {
        limit: Number(body.limit ?? EMAIL_BROADCAST_MAX_RECIPIENTS),
      });

      await writeAudit({
        actor,
        action: "sendEmailBroadcast",
        details: {
          broadcastId: String(target._id),
          subject: target.subject,
          recipients: target.recipients.length,
          sent: summary.sent,
          failed: summary.failed,
          skipped: summary.skipped,
          remaining: summary.remaining,
          stoppedReason: summary.stoppedReason,
        },
      });

      const parts = [`Sent ${summary.sent} email(s)`];
      if (summary.failed) parts.push(`${summary.failed} failed`);
      if (summary.skipped) parts.push(`${summary.skipped} skipped`);
      if (summary.remaining) parts.push(`${summary.remaining} still to send`);
      const reason = summary.stoppedReason
        ? ` (stopped: ${summary.stoppedReason.replace(/_/g, " ")})`
        : "";

      return NextResponse.json(
        {
          success: true,
          broadcastId: String(target._id),
          summary,
          message: `${parts.join(", ")}${reason}.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "template_save") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail(400, "missing_name", "Give the template a name before saving.");
      if (name.length > EMAIL_TEMPLATE_NAME_LIMIT) {
        return fail(
          400,
          "name_too_long",
          `A template name cannot be longer than ${EMAIL_TEMPLATE_NAME_LIMIT} characters.`
        );
      }

      const validated = validateCampaignContent(body.content);
      if (!validated.ok) return fail(400, "invalid_content", validated.message);

      const saved = await saveEmailTemplate({
        id,
        name,
        content: broadcastContent(validated.value),
        actor,
      });
      if (!saved.ok) {
        return fail(
          saved.code === "template_limit" ? 409 : 404,
          saved.code ?? "template_error",
          saved.message
        );
      }

      await writeAudit({
        actor,
        action: id ? "updateEmailTemplate" : "createEmailTemplate",
        details: { templateId: saved.template.id, name },
      });
      return NextResponse.json(
        {
          success: true,
          template: saved.template,
          message: `Template "${name}" saved.`,
        },
        { headers: NO_STORE }
      );
    }

    if (action === "template_delete") {
      if (!id) return fail(400, "missing_template", "Choose a template to delete.");
      const deleted = await deleteEmailTemplate(id);
      if (!deleted.ok) {
        return fail(404, deleted.code ?? "unknown_template", deleted.message);
      }
      await writeAudit({
        actor,
        action: "deleteEmailTemplate",
        details: { templateId: id, name: deleted.name },
      });
      return NextResponse.json(
        { success: true, message: `Template "${deleted.name}" deleted.` },
        { headers: NO_STORE }
      );
    }

    return fail(400, "unknown_action", "Unknown email action.");
  } catch (error) {
    console.error("POST /api/admin/emails failed:", error);
    return fail(500, "server_error", "The email action failed.");
  }
}

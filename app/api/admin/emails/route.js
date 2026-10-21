import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { writeAudit } from "@/lib/adminUsers";
import { SITE_URL } from "@/lib/site";
import { getContactInbox, isMailConfigured, sendMail } from "@/lib/mailer";
import {
  EMAIL_CAMPAIGN_DEFINITIONS,
  EMAIL_VARIABLES,
  getCampaignDefinition,
  normalizeCampaignDoc,
  sampleCampaignUser,
  validateCampaignContent,
} from "@/lib/emailCampaigns";
import {
  countSentSince,
  countUnsubscribedUsers,
  getEmailCampaignDocs,
  getEmailCampaignStats,
  getEmailSettings,
  listRecentEmailSends,
  saveEmailCampaignDoc,
  saveEmailSettings,
} from "@/lib/emailStore";
import { runEmailCampaigns } from "@/lib/emailEngine";
import { renderCampaignEmail } from "@/lib/emailTemplates";
import { isUnsubscribeConfigured, unsubscribeUrl } from "@/lib/emailTokens";

export const dynamic = "force-dynamic";
// "Run now" sends inside the request; the engine stops itself well before this.
export const maxDuration = 60;

/**
 * Admin control for the automated progress emails.
 *
 * GET  -> campaign copy, per-campaign send counts, recent sends and settings.
 * POST -> one of:
 *   { action: "save",     id, content }        update copy / enable a campaign
 *   { action: "preview",  id, content? }        render without sending
 *   { action: "test",     id }                  one message to the admin's own address
 *   { action: "run",      id?, dryRun?, limit? } run one campaign, or all enabled ones
 *   { action: "settings", paused?, dailyCap? }  global pause switch / daily cap
 *
 * A test can only go to the signed-in admin. Accepting an arbitrary recipient
 * would turn the dashboard into an open relay for any compromised admin token.
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

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (!auth) return forbidden();

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [settings, docs, stats, recent, unsubscribed, sentToday] =
      await Promise.all([
        getEmailSettings(),
        getEmailCampaignDocs(),
        getEmailCampaignStats(),
        listRecentEmailSends(25),
        countUnsubscribedUsers(),
        countSentSince(startOfDay),
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
        unsubscribeConfigured: isUnsubscribeConfigured(),
        variables: EMAIL_VARIABLES,
        siteUrl: SITE_URL,
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
      if (!isMailConfigured()) {
        return fail(
          503,
          "not_configured",
          "Mail is not configured on this deployment (set SMTP_USER and SMTP_PASSWORD)."
        );
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
      await sendMail({
        to,
        subject: `[Test] ${template.subject}`,
        text: template.text,
        html: template.html,
      });
      await writeAudit({
        actor,
        action: "testEmailCampaign",
        details: { campaignId: id, to },
      });
      return NextResponse.json(
        { success: true, message: `Test email sent to ${to}.` },
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

    return fail(400, "unknown_action", "Unknown email action.");
  } catch (error) {
    console.error("POST /api/admin/emails failed:", error);
    return fail(500, "server_error", "The email action failed.");
  }
}

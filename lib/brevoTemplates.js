import { createHash } from "node:crypto";
import { SITE_URL } from "@/lib/site";
import {
  brevoError,
  brevoRequest,
  getBrevoSender,
  isBrevoConfigured,
} from "@/lib/brevo";
import { EMAIL_CAMPAIGN_DEFINITIONS, normalizeCampaignDoc, previewVariables } from "@/lib/emailCampaigns";
import { getContactInbox } from "@/lib/mailer";
import { getEmailCampaignDocs, saveCampaignBrevoTemplate } from "@/lib/emailStore";
import { renderCampaignTemplate } from "@/lib/emailTemplates";

/**
 * Keeps one Brevo transactional template in step with each campaign's copy.
 *
 * The campaign copy lives in Mongo and is edited from the dashboard, so the
 * template in Brevo cannot be authored by hand — it would drift the first time
 * an admin changed a subject line. Instead the copy is rendered here with
 * `renderCampaignTemplate()` (every `{{token}}` becomes a Brevo
 * `{{ params.token }}`) and pushed over the API.
 *
 * Pushing is guarded by a content hash stored on the campaign document: an
 * unchanged campaign costs no API call at all, which matters because Brevo
 * allows 300 template operations per hour and the runner touches every enabled
 * campaign on every run.
 */

/** Brevo template names are cosmetic but must stay unique per campaign. */
export function campaignTemplateName(id) {
  return `cbtpractice-${id}`;
}

function baseUrl(siteUrl) {
  return String(siteUrl || SITE_URL || "https://www.cbtpractice.ng").replace(/\/+$/, "");
}

/** Short fingerprint of the rendered template: the "do I need to push?" check. */
function templateHash(rendered) {
  return createHash("sha256")
    .update(`${rendered.subject}\u0000${rendered.html}`)
    .digest("hex")
    .slice(0, 32);
}

/** The Brevo template id already stored for a campaign, if any. */
export function campaignTemplateId(campaign) {
  const id = Number(campaign?.brevoTemplateId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * The `params` Brevo fills into one student's copy of a campaign.
 *
 * `previewVariables()` is the same object the preview iframe uses, so what an
 * admin sees in the dashboard is what the recipient's template renders.
 */
export function templateParamsFor(user, { siteUrl = SITE_URL, unsubscribeUrl } = {}) {
  const params = previewVariables(user, baseUrl(siteUrl));
  return unsubscribeUrl ? { ...params, unsubscribeUrl } : params;
}

/**
 * Creates or updates the Brevo template for one campaign.
 *
 * A 404 on update means the template was deleted in Brevo (or the account was
 * recreated), so the id is dropped and the template is created again rather
 * than failing the whole run.
 */
export async function pushCampaignTemplate(
  campaign,
  { siteUrl = SITE_URL, contactEmail = getContactInbox(), force = false } = {}
) {
  if (!isBrevoConfigured()) {
    return { ok: false, reason: "brevo_unconfigured" };
  }
  if (!campaign?.id) {
    return { ok: false, reason: "unknown_campaign" };
  }

  const rendered = renderCampaignTemplate({ campaign, siteUrl: baseUrl(siteUrl), contactEmail });
  const hash = templateHash(rendered);
  const known = campaignTemplateId(campaign);

  if (!force && known && campaign.brevoTemplateHash === hash) {
    return { ok: true, id: known, changed: false, hash };
  }

  const sender = getBrevoSender();
  const body = {
    templateName: campaignTemplateName(campaign.id),
    subject: rendered.subject,
    sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) },
    htmlContent: rendered.html,
    isActive: true,
    tag: "cbtpractice-campaign",
  };

  let id = known;
  let created = false;

  if (id) {
    try {
      await brevoRequest(`/smtp/templates/${id}`, { method: "PUT", body });
    } catch (error) {
      if (error?.status !== 404) throw error;
      id = null;
    }
  }

  if (!id) {
    const payload = await brevoRequest("/smtp/templates", { method: "POST", body });
    id = Number(payload?.id) || null;
    created = true;
    if (!id) {
      throw brevoError("Brevo did not return a template id.", "brevo_template_missing");
    }
  }

  await saveCampaignBrevoTemplate(campaign.id, { templateId: id, hash }).catch((error) =>
    console.error(`[brevoTemplates] could not store the template id for ${campaign.id}:`, error)
  );

  return { ok: true, id, changed: true, created, hash };
}

/**
 * `pushCampaignTemplate` without the throw.
 *
 * The campaign runner must survive a Brevo outage for one campaign and still
 * attempt the others, so this returns the reason instead of raising.
 */
export async function ensureCampaignTemplate(campaign, options = {}) {
  try {
    return await pushCampaignTemplate(campaign, options);
  } catch (error) {
    console.error(
      `[brevoTemplates] could not push the template for ${campaign?.id ?? "?"}:`,
      error?.message ?? error
    );
    return {
      ok: false,
      reason: error?.code ?? "brevo_template_failed",
      message: String(error?.message ?? error),
    };
  }
}

/**
 * Pushes every campaign template, or just `ids`.
 *
 * Used by the dashboard's "Push templates" button and by `npm run check:brevo`,
 * where an admin wants to see all four succeed at once rather than discover a
 * problem on the next scheduled run.
 */
export async function ensureCampaignTemplates({
  ids = null,
  force = false,
  siteUrl = SITE_URL,
  contactEmail = getContactInbox(),
} = {}) {
  const docs = await getEmailCampaignDocs();
  const definitions = EMAIL_CAMPAIGN_DEFINITIONS.filter(
    (definition) => ids === null || ids.includes(definition.id)
  );

  const templates = [];
  for (const definition of definitions) {
    const campaign = normalizeCampaignDoc(definition.id, docs.get(definition.id));
    const result = await ensureCampaignTemplate(campaign, { siteUrl, contactEmail, force });
    templates.push({ id: definition.id, name: definition.name, ...result });
  }

  return {
    pushed: templates.filter((result) => result.ok && result.changed).length,
    unchanged: templates.filter((result) => result.ok && !result.changed).length,
    failed: templates.filter((result) => !result.ok).length,
    templates,
  };
}

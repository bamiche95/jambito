import { TRIAL_LIMIT } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";

/**
 * The four automated progress emails, as data.
 *
 * Admin-editable copy lives in Mongo (`emailCampaigns`); this file is the
 * source of truth for *when* each campaign is eligible and what the defaults
 * are. Keeping the conditions in code (rather than in the database) means an
 * admin can rewrite a subject line without being able to accidentally mail the
 * entire user base.
 *
 * Every campaign has a deterministic dedupe key:
 *   one-shot campaigns      -> the campaign id
 *   unfinished_set          -> the set key + the day it was last touched
 *   subscriber_thanks       -> the payment reference + the expiry date
 *
 * That key is claimed in `emailLog` with a unique index before anything is
 * sent, so a retried cron run, two overlapping runs, or a crash mid-batch can
 * never deliver the same email twice.
 */

export const EMAIL_CAMPAIGN_IDS = [
  "never_started",
  "trial_complete",
  "unfinished_set",
  "subscriber_thanks",
];

export const EMAIL_CAMPAIGN_DEFINITIONS = [
  {
    id: "never_started",
    name: "Never started",
    summary: "Signed up but never answered a question.",
    when: "Once, 2 days after sign-up, while the account has no attempts and no paused set.",
    defaultSubject: "Your free questions are still waiting, {{name}}",
    defaultHeading: "Ready when you are, {{name}}",
    defaultBody:
      "You created your CBT-Practice account but have not tried a question yet. Your {{trialLimit}} free questions are still on your account, and one timed set takes about ten minutes.\n\nPick the subject you are least confident about and do a single set today. The score tells you where you actually stand, which is a far better starting point than guessing.",
    defaultCtaLabel: "Start your free practice",
    defaultCtaPath: "/cbt",
    defaultEnabled: false,
    defaultDelayDays: 2,
    /** Minimum days between two campaign emails to the same student. */
    cooldownDays: 0,
  },
  {
    id: "trial_complete",
    name: "Free questions finished",
    summary: "Used all free questions, no active subscription.",
    when: "Once, a day after the last free question is used, while there is no active subscription.",
    defaultSubject: "You have used your {{trialLimit}} free questions, {{name}}",
    defaultHeading: "That is all {{trialLimit}} free questions",
    defaultBody:
      "You have now used all {{trialLimit}} free questions on your account. Your history is saved, so you can already see which subjects are strongest and which ones are costing you marks.\n\nUnlimited access is a single payment for 12 months of every exam board, subject and year — JAMB, WAEC, POST UTME, GCE and GST — and nothing renews automatically.",
    defaultCtaLabel: "See what unlimited access includes",
    defaultCtaPath: "/#pricing",
    defaultEnabled: false,
    defaultDelayDays: 1,
    cooldownDays: 0,
  },
  {
    id: "unfinished_set",
    name: "Unfinished practice set",
    summary: "Paused a set and has not come back.",
    when: "When a paused set has been idle for 2 days, at most once every 7 days.",
    defaultSubject: "Your {{subject}} set is still open, {{name}}",
    defaultHeading: "{{setProgress}} answered — pick up where you stopped",
    defaultBody:
      "You paused a {{exam}} {{subject}} {{year}} practice set with {{setProgress}} answered and {{timeLeft}} left on the clock. Your answers are saved, so nothing is lost.\n\nFinishing the set is what produces a score you can compare against your target. An unfinished attempt does not count towards your readiness estimate.",
    defaultCtaLabel: "Resume where you left off",
    defaultCtaPath: "/cbt",
    defaultEnabled: false,
    defaultDelayDays: 2,
    cooldownDays: 7,
  },
  {
    id: "subscriber_thanks",
    name: "Subscriber thank-you",
    summary: "Payment confirmed, access granted.",
    when: "Once per subscription, right after access is granted.",
    defaultSubject: "You are in, {{name}} — unlimited access is active",
    defaultHeading: "Unlimited access is active",
    defaultBody:
      "Your payment went through and your account now has unlimited access until {{expiry}}. Every exam board, subject and year is unlocked, and nothing renews automatically.\n\nYour practice history from the free trial is still there. A good next step is to finish any paused set, then work through a full past paper under the timer.",
    defaultCtaLabel: "Start practising",
    defaultCtaPath: "/cbt",
    defaultEnabled: false,
    defaultDelayDays: 0,
    cooldownDays: 0,
  },
];

/** Copy limits enforced by the API, so a stray paste cannot break the layout. */
export const EMAIL_CONTENT_LIMITS = {
  subject: 140,
  heading: 120,
  body: 4000,
  ctaLabel: 40,
  ctaPath: 200,
  delayDays: 30,
};

/**
 * Placeholders the editor advertises.
 *
 * `interpolate()` leaves an unknown `{{token}}` untouched, so a typo shows up in
 * the preview rather than silently becoming an empty string.
 */
export const EMAIL_VARIABLES = [
  { token: "{{name}}", description: "First name, or the part before @ in the email." },
  { token: "{{trialLimit}}", description: `Free questions included (${TRIAL_LIMIT}).` },
  { token: "{{trialLeft}}", description: "Free questions still unused." },
  { token: "{{sessions}}", description: "Completed practice sessions." },
  { token: "{{average}}", description: "Average score across completed sessions." },
  { token: "{{exam}}", description: "Exam board of the newest paused set." },
  { token: "{{subject}}", description: "Subject of the newest paused set." },
  { token: "{{year}}", description: "Year of the newest paused set." },
  { token: "{{answered}}", description: "Questions answered in that paused set." },
  { token: "{{setTotal}}", description: "Questions in that paused set." },
  { token: "{{setProgress}}", description: '"12 of 40" (or just "12" when the size is unknown).' },
  { token: "{{timeLeft}}", description: "Time left on the paused set, e.g. 7:32." },
  { token: "{{plan}}", description: "Plan name on the account." },
  { token: "{{expiry}}", description: "Subscription expiry, e.g. 12 Mar 2027." },
  { token: "{{siteUrl}}", description: "Public site URL." },
];

export function getCampaignDefinition(id) {
  return EMAIL_CAMPAIGN_DEFINITIONS.find((campaign) => campaign.id === id) ?? null;
}

/** Replaces `{{token}}` with the matching value; unknown tokens are left alone. */
export function interpolate(text, variables) {
  return String(text ?? "").replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (match, key) =>
      Object.prototype.hasOwnProperty.call(variables, key)
        ? String(variables[key] ?? "")
        : match
  );
}

/** `2026-10-21` in Lagos time — the granularity the dedupe keys use. */
function dayKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "unknown";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * The idempotency key for one student and one campaign.
 *
 * Returns `null` when the campaign has nothing specific to talk about, which is
 * also a safe "do not send" signal.
 */
export function campaignDedupeKey(campaignId, user) {
  if (campaignId === "unfinished_set") {
    const session = user?.practice?.inProgress?.[0];
    if (!session?.key) return null;
    return `${session.key}@${dayKey(session.updatedAt)}`;
  }
  if (campaignId === "subscriber_thanks") {
    const reference = user?.reference ?? user?.plan ?? "subscription";
    const expiry = user?.subscriptionExpiry
      ? dayKey(user.subscriptionExpiry)
      : "none";
    return `${reference}@${expiry}`;
  }
  return campaignId;
}

/** A believable user for the admin preview, so sample values are not blanks. */
export function sampleCampaignUser() {
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 12);
  return {
    _id: "sample-uid",
    name: "Ada",
    email: "ada.okafor@example.com",
    trialCount: TRIAL_LIMIT,
    plan: "12 months",
    subscriptionExpiry: expiry.toISOString(),
    practice: {
      completedSessions: 3,
      totalQuestions: 120,
      totalScore: 78,
      averagePercentage: 65,
      inProgress: [
        {
          key: "jamb__physics__2023",
          exam: "JAMB",
          subject: "Physics",
          year: "2023",
          answered: 12,
          total: 40,
          remainingSeconds: 452,
          updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        },
      ],
    },
  };
}

/** The default content for a campaign, before any admin edit. */
export function campaignDefaults(id) {
  const definition = getCampaignDefinition(id);
  if (!definition) return null;
  return {
    subject: definition.defaultSubject,
    heading: definition.defaultHeading,
    body: definition.defaultBody,
    ctaLabel: definition.defaultCtaLabel,
    ctaPath: definition.defaultCtaPath,
    enabled: definition.defaultEnabled,
    delayDays: definition.defaultDelayDays,
  };
}

/** Merges a stored document (or nothing) onto the defaults. */
export function normalizeCampaignDoc(id, doc) {
  const definition = getCampaignDefinition(id);
  if (!definition) return null;
  const defaults = campaignDefaults(id);
  const value = (key) =>
    typeof doc?.[key] === "string" && doc[key].trim() ? doc[key] : defaults[key];
  return {
    id,
    name: definition.name,
    summary: definition.summary,
    when: definition.when,
    cooldownDays: definition.cooldownDays,
    subject: value("subject"),
    heading: value("heading"),
    body: value("body"),
    ctaLabel: value("ctaLabel"),
    ctaPath: value("ctaPath"),
    enabled: doc?.enabled === true,
    delayDays:
      Number.isFinite(doc?.delayDays) && doc.delayDays >= 0
        ? Math.min(Math.round(doc.delayDays), EMAIL_CONTENT_LIMITS.delayDays)
        : defaults.delayDays,
    defaults,
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
}

/**
 * Validates an admin edit.
 *
 * The body is plain text on purpose: it is escaped and split into paragraphs by
 * the template, so an admin cannot paste markup that breaks an inbox (or adds a
 * script to the preview iframe). A CTA path must stay on this site, or be an
 * absolute https URL — never `//host` or `javascript:`.
 */
export function validateCampaignContent(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "No campaign content was sent." };
  }
  const read = (key, max, label) => {
    const raw = typeof input[key] === "string" ? input[key] : "";
    const value = raw.replace(/\r\n/g, "\n").trim();
    if (!value) return { ok: false, message: `${label} cannot be empty.` };
    if (value.length > max) {
      return {
        ok: false,
        message: `${label} cannot be longer than ${max} characters.`,
      };
    }
    return { ok: true, value };
  };

  const subject = read("subject", EMAIL_CONTENT_LIMITS.subject, "Subject");
  if (!subject.ok) return subject;
  const heading = read("heading", EMAIL_CONTENT_LIMITS.heading, "Heading");
  if (!heading.ok) return heading;
  const body = read("body", EMAIL_CONTENT_LIMITS.body, "Body");
  if (!body.ok) return body;
  const ctaLabel = read("ctaLabel", EMAIL_CONTENT_LIMITS.ctaLabel, "Button label");
  if (!ctaLabel.ok) return ctaLabel;
  const ctaPath = read("ctaPath", EMAIL_CONTENT_LIMITS.ctaPath, "Button link");
  if (!ctaPath.ok) return ctaPath;

  const path = ctaPath.value;
  const isSitePath =
    path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
  const isHttps = /^https:\/\/[^\s]+$/i.test(path);
  if (!isSitePath && !isHttps) {
    return {
      ok: false,
      message: "The button link must start with / (this site) or https://.",
    };
  }

  const delayRaw = Number(input.delayDays ?? 0);
  const delayDays = Number.isFinite(delayRaw)
    ? Math.min(Math.max(Math.round(delayRaw), 0), EMAIL_CONTENT_LIMITS.delayDays)
    : 0;

  return {
    ok: true,
    value: {
      subject: subject.value,
      heading: heading.value,
      body: body.value,
      ctaLabel: ctaLabel.value,
      ctaPath: path,
      enabled: input.enabled === true,
      delayDays,
    },
  };
}

/**
 * The variables a preview (or a real send) can reference.
 *
 * Values are raw here; `renderCampaignEmail` escapes after interpolation, so
 * a name containing `<` cannot inject markup.
 */
export function previewVariables(user, siteUrl = SITE_URL) {
  const practice = user?.practice ?? {};
  const session = practice.inProgress?.[0] ?? null;
  const answered = session?.answered ?? 0;
  const setTotal = session?.total ?? null;
  const remaining = session?.remainingSeconds ?? 0;
  const email = String(user?.email ?? "");
  const fallbackName = email.split("@")[0] || "there";
  const name = String(user?.name ?? "").trim().split(/\s+/)[0] || fallbackName;

  return {
    name,
    trialLimit: String(TRIAL_LIMIT),
    trialLeft: String(Math.max(0, TRIAL_LIMIT - (user?.trialCount ?? 0))),
    sessions: String(practice.completedSessions ?? 0),
    average:
      practice.averagePercentage === null ||
      practice.averagePercentage === undefined
        ? "—"
        : `${practice.averagePercentage}%`,
    exam: session?.exam ?? "JAMB",
    subject: session?.subject ?? "Physics",
    year: session?.year ?? "2023",
    answered: String(answered),
    setTotal: setTotal ? String(setTotal) : "",
    setProgress: setTotal ? `${answered} of ${setTotal}` : String(answered),
    timeLeft: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
    plan: user?.plan ?? "12 months",
    expiry: user?.subscriptionExpiry
      ? new Intl.DateTimeFormat("en-NG", {
          timeZone: "Africa/Lagos",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(user.subscriptionExpiry))
      : "12 months from today",
    siteUrl: String(siteUrl ?? SITE_URL).replace(/\/+$/, ""),
  };
}

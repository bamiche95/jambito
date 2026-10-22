import { TRIAL_LIMIT } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";
import { getUsersCollection } from "@/lib/users";
import { getContactInbox, isMailConfigured, sendMail } from "@/lib/mailer";
import {
  EMAIL_CAMPAIGN_DEFINITIONS,
  campaignDedupeKey,
  getCampaignDefinition,
  normalizeCampaignDoc,
} from "@/lib/emailCampaigns";
import {
  claimEmailSend,
  countSentSince,
  finalizeEmailBroadcast,
  getEmailBroadcast,
  getEmailCampaignDocs,
  getEmailSettings,
  markBroadcastRecipient,
  markEmailFailed,
  markEmailSent,
  recordEmailRun,
} from "@/lib/emailStore";
import { renderBroadcastEmail, renderCampaignEmail } from "@/lib/emailTemplates";
import { isUnsubscribeConfigured, unsubscribeUrl } from "@/lib/emailTokens";

/**
 * The campaign runner.
 *
 * Reads only `users` (the denormalised `practice` summary included), claims each
 * message in `emailLog`, then sends at one message per second. It is designed to
 * be safe to run twice concurrently and safe to kill halfway:
 *
 *   - the unique claim is taken BEFORE the send, so a duplicate can only be
 *     skipped, never re-sent;
 *   - a send is awaited before the claim is marked `sent`, and a failure is
 *     retried at most twice on later runs;
 *   - a time budget stops the batch cleanly, leaving the rest for tomorrow.
 *
 * A small deployment gets one cron run a day: 4 campaigns × 25 messages is more
 * than the default daily cap allows, which is why the cap is checked per message
 * rather than per campaign.
 */

const DAY_MS = 86_400_000;
const COOLDOWN_MS = 3 * DAY_MS;
const BETWEEN_SENDS_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const SCAN_LIMIT = 300;
const DEFAULT_BATCH = 25;
const DEFAULT_BUDGET_MS = 45_000;
/** A broadcast waits a little less between messages than a campaign run. */
const BROADCAST_BETWEEN_SENDS_MS = 500;
const BROADCAST_DEFAULT_BATCH = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `ada***@example.com` — enough for an admin to recognise, not a full list. */
export function maskEmail(email) {
  const [local, domain] = String(email ?? "").split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** "has an active subscription", matching lib/users.js `isSubscribed()`. */
function subscribedClause(now) {
  return {
    isSubscribed: true,
    $or: [{ subscriptionExpiry: null }, { subscriptionExpiry: { $gt: now } }],
  };
}

/**
 * The Mongo filter for one campaign.
 *
 * Exported so the admin dry-run and any future report use exactly the same
 * definition of "audience" as the sender.
 */
export function audienceFilter(campaign, now = new Date()) {
  const clauses = [
    { email: { $type: "string", $ne: "" } },
    // Admins are excluded so a dashboard test account never lands in a campaign.
    { role: { $ne: "admin" } },
    { emailUnsubscribedAt: { $exists: false } },
    {
      $or: [
        { status: { $exists: false } },
        { status: null },
        { status: "active" },
      ],
    },
  ];

  if (campaign.id === "subscriber_thanks") {
    clauses.push(subscribedClause(now));
  } else {
    clauses.push({ $nor: [subscribedClause(now)] });
  }

  const delayed = (days) => new Date(now.getTime() - Math.max(0, days) * DAY_MS);
  const idleBefore = delayed(campaign.delayDays);
  const cooldownBefore = delayed(campaign.cooldownDays);

  switch (campaign.id) {
    case "never_started":
      clauses.push({ createdAt: { $lte: idleBefore } });
      clauses.push({ $or: [{ trialCount: { $exists: false } }, { trialCount: 0 }] });
      clauses.push({
        $or: [
          { "practice.completedSessions": { $exists: false } },
          { "practice.completedSessions": 0 },
        ],
      });
      clauses.push({ "practice.inProgress.0": { $exists: false } });
      clauses.push({ "emailState.never_started": { $exists: false } });
      break;

    case "trial_complete":
      clauses.push({ trialCount: { $gte: TRIAL_LIMIT } });
      clauses.push({
        $or: [
          { trialExhaustedAt: { $lte: idleBefore } },
          // Accounts that exhausted the trial before `trialExhaustedAt` existed
          // are still eligible once they are old enough.
          { trialExhaustedAt: { $exists: false }, createdAt: { $lte: idleBefore } },
        ],
      });
      clauses.push({ "emailState.trial_complete": { $exists: false } });
      break;

    case "unfinished_set":
      clauses.push({ "practice.inProgress.0": { $exists: true } });
      // Element 0 is the most recently updated paused set.
      clauses.push({ "practice.inProgress.0.updatedAt": { $lte: idleBefore } });
      clauses.push({
        $or: [
          { "emailState.unfinished_set.at": { $exists: false } },
          { "emailState.unfinished_set.at": { $lte: cooldownBefore } },
        ],
      });
      break;

    case "subscriber_thanks":
      // No emailState filter: the dedupe key includes the subscription, so a
      // renewal gets its own thank-you while the same one can never repeat.
      break;

    default:
      // Unknown campaign: match nobody rather than everybody.
      clauses.push({ _id: { $exists: false } });
  }

  return { $and: clauses };
}

/** Candidate users for a campaign, oldest first (newest subscription first). */
export async function selectAudience(
  campaign,
  { now = new Date(), limit = SCAN_LIMIT } = {}
) {
  const users = await getUsersCollection();
  const sort =
    campaign.id === "subscriber_thanks" ? { updatedAt: -1 } : { createdAt: 1 };
  return users
    .find(audienceFilter(campaign, now))
    .sort(sort)
    .limit(Math.min(Math.max(Number(limit) || SCAN_LIMIT, 1), 500))
    .toArray();
}

/**
 * Narrows the audience to people who are actually due a message.
 *
 * `emailState` is a fast pre-filter; the dedupe key comparison is what is exact
 * (a set paused again on another day is a new, legitimate message). The global
 * cooldown keeps two different campaigns from hitting the same inbox on the same
 * day; the subscriber thank-you is exempt because it is transactional and its
 * own key already makes it one-per-subscription.
 */
async function buildDueList(
  campaign,
  { now = new Date(), limit = SCAN_LIMIT } = {}
) {
  const candidates = await selectAudience(campaign, { now, limit });
  const cooldownMs = Math.max(
    COOLDOWN_MS,
    (campaign.cooldownDays ?? 0) * DAY_MS
  );
  const due = [];

  for (const user of candidates) {
    const key = campaignDedupeKey(campaign.id, user);
    if (!key) continue;

    const state = user.emailState?.[campaign.id];
    if (state?.key === key) continue;

    if (campaign.id !== "subscriber_thanks" && user.emailLastSentAt) {
      const lastSent = new Date(user.emailLastSentAt).getTime();
      if (Number.isFinite(lastSent) && now.getTime() - lastSent < cooldownMs) {
        continue;
      }
    }

    due.push({ user, key });
  }

  return { candidates: candidates.length, due };
}

function emptySummary(now, dryRun) {
  return {
    startedAt: new Date(now).toISOString(),
    finishedAt: null,
    dryRun: Boolean(dryRun),
    sent: 0,
    failed: 0,
    skipped: 0,
    campaigns: [],
    stoppedReason: null,
  };
}

/**
 * Sends every enabled campaign that is due.
 *
 * `dryRun` reports exactly who would receive what, without claiming or sending;
 * it is what the dashboard's dry-run button calls. Passing `campaignIds`
 * explicitly also runs a disabled campaign, which is how an admin sends a
 * "run now" batch after previewing it.
 */
export async function runEmailCampaigns({
  campaignIds = null,
  dryRun = false,
  limitPerCampaign = DEFAULT_BATCH,
  budgetMs = DEFAULT_BUDGET_MS,
  now = new Date(),
} = {}) {
  const startedAt = Date.now();
  const summary = emptySummary(now, dryRun);
  const finish = () => {
    summary.finishedAt = new Date().toISOString();
    return summary;
  };

  const settings = await getEmailSettings();
  if (settings.paused) {
    summary.stoppedReason = "paused";
    return finish();
  }

  if (!dryRun) {
    if (!isMailConfigured()) {
      summary.stoppedReason = "mail_unconfigured";
      return finish();
    }
    if (!isUnsubscribeConfigured()) {
      // Sending without a working opt-out would break the promise made in every
      // email and in the privacy policy. Refuse rather than silently omit it.
      summary.stoppedReason = "unsubscribe_unconfigured";
      return finish();
    }
  }

  const selected = EMAIL_CAMPAIGN_DEFINITIONS.filter(
    (definition) => campaignIds === null || campaignIds.includes(definition.id)
  );
  if (!selected.length) {
    summary.stoppedReason = "no_campaigns";
    return finish();
  }

  const docs = await getEmailCampaignDocs();
  const batch = Math.min(
    Math.max(Math.round(Number(limitPerCampaign)) || DEFAULT_BATCH, 1),
    100
  );
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  let sentToday = dryRun ? 0 : await countSentSince(startOfDay);
  let consecutiveFailures = 0;
  const contactEmail = getContactInbox();
  const explicitRun = campaignIds !== null;

  outer: for (const definition of selected) {
    const campaign = normalizeCampaignDoc(definition.id, docs.get(definition.id));
    const result = {
      id: campaign.id,
      name: campaign.name,
      enabled: campaign.enabled,
      audience: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: null,
      recipients: [],
    };

    if (!campaign.enabled && !explicitRun) {
      result.reason = "disabled";
      summary.campaigns.push(result);
      continue;
    }

    const { due } = await buildDueList(campaign, { now, limit: SCAN_LIMIT });
    result.audience = due.length;

    if (dryRun) {
      result.reason = "dry_run";
      result.recipients = due
        .slice(0, batch)
        .map(({ user }) => maskEmail(user.email));
      summary.campaigns.push(result);
      continue;
    }

    for (const { user, key } of due.slice(0, batch)) {
      if (sentToday >= settings.dailyCap) {
        summary.stoppedReason = "daily_cap";
        break outer;
      }
      if (Date.now() - startedAt >= budgetMs) {
        summary.stoppedReason = "time_budget";
        break outer;
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.stoppedReason = "circuit_breaker";
        break outer;
      }

      let claim;
      try {
        claim = await claimEmailSend({
          campaignId: campaign.id,
          dedupeKey: key,
          uid: String(user._id),
          email: user.email,
          now: new Date(),
        });
      } catch (error) {
        console.error("[emailEngine] claim failed:", error);
        summary.stoppedReason = "claim_failed";
        break outer;
      }
      if (!claim.ok) {
        result.skipped += 1;
        summary.skipped += 1;
        continue;
      }

      const optOut = unsubscribeUrl(SITE_URL, String(user._id));
      try {
        if (!optOut) throw new Error("No unsubscribe URL could be generated.");
        const template = renderCampaignEmail({
          campaign,
          user,
          siteUrl: SITE_URL,
          contactEmail,
          unsubscribeUrl: optOut,
        });
        const info = await sendMail({
          to: user.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
        await markEmailSent({
          id: claim.id,
          userId: String(user._id),
          campaignId: campaign.id,
          dedupeKey: key,
          messageId: info?.messageId ?? null,
        });
        result.sent += 1;
        summary.sent += 1;
        sentToday += 1;
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        result.failed += 1;
        summary.failed += 1;
        await markEmailFailed({ id: claim.id, error }).catch((markError) =>
          console.error("[emailEngine] could not mark a send failed:", markError)
        );
        console.error(
          `[emailEngine] ${campaign.id} -> ${maskEmail(user.email)} failed:`,
          error?.message ?? error
        );
      }

      if (BETWEEN_SENDS_MS > 0) await sleep(BETWEEN_SENDS_MS);
    }

    summary.campaigns.push(result);
  }

  summary.finishedAt = new Date().toISOString();
  if (!dryRun) {
    await recordEmailRun(summary);
  }
  return summary;
}

/**
 * Sends one campaign to one account, now.
 *
 * Used by the Paystack webhook (`after()`) so a subscriber gets the thank-you
 * within seconds instead of waiting for the next daily run. It shares every
 * guard with the batch path — pause switch, enabled flag, unsubscribe state,
 * unique claim — so the cron arriving later simply finds the claim taken.
 *
 * Never throws: a mail problem must not affect the payment that triggered it.
 */
export async function sendCampaignToUser(
  campaignId,
  uid,
  { now = new Date() } = {}
) {
  const definition = getCampaignDefinition(campaignId);
  if (!definition || !uid) return { ok: false, reason: "unknown_campaign" };
  if (!isMailConfigured()) return { ok: false, reason: "mail_unconfigured" };
  if (!isUnsubscribeConfigured()) {
    return { ok: false, reason: "unsubscribe_unconfigured" };
  }

  try {
    const settings = await getEmailSettings();
    if (settings.paused) return { ok: false, reason: "paused" };

    const docs = await getEmailCampaignDocs();
    const campaign = normalizeCampaignDoc(campaignId, docs.get(campaignId));
    if (!campaign.enabled) return { ok: false, reason: "disabled" };

    const users = await getUsersCollection();
    const user = await users.findOne({ _id: uid });
    if (!user?.email) return { ok: false, reason: "no_email" };
    if (user.emailUnsubscribedAt) return { ok: false, reason: "unsubscribed" };

    const dedupeKey = campaignDedupeKey(campaignId, user);
    if (!dedupeKey) return { ok: false, reason: "not_due" };

    const claim = await claimEmailSend({
      campaignId,
      dedupeKey,
      uid,
      email: user.email,
      now,
    });
    if (!claim.ok) return { ok: false, reason: claim.reason };

    const optOut = unsubscribeUrl(SITE_URL, uid);
    if (!optOut) {
      await markEmailFailed({
        id: claim.id,
        error: "No unsubscribe URL could be generated.",
      });
      return { ok: false, reason: "unsubscribe_unconfigured" };
    }

    try {
      const template = renderCampaignEmail({
        campaign,
        user,
        siteUrl: SITE_URL,
        contactEmail: getContactInbox(),
        unsubscribeUrl: optOut,
      });
      const info = await sendMail({
        to: user.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      await markEmailSent({
        id: claim.id,
        userId: uid,
        campaignId,
        dedupeKey,
        messageId: info?.messageId ?? null,
      });
      return { ok: true, messageId: info?.messageId ?? null };
    } catch (error) {
      await markEmailFailed({ id: claim.id, error }).catch(() => undefined);
      console.error(
        `[emailEngine] ${campaignId} -> ${maskEmail(user.email)} failed:`,
        error?.message ?? error
      );
      return { ok: false, reason: "send_failed" };
    }
  } catch (error) {
    console.error(`[emailEngine] ${campaignId} for ${uid} failed:`, error);
    return { ok: false, reason: "error" };
  }
}

/**
 * Sends one batch of a one-off broadcast.
 *
 * Shares every guard with the campaign runner: pause switch, mail/unsubscribe
 * configuration, daily cap, time budget, circuit breaker and the unique claim.
 * Three things differ:
 *
 *   - the copy and the audience live on the `emailBroadcasts` document, so
 *     calling this again with the same id is exactly the "Send remaining"
 *     button (and an already-delivered recipient can never be mailed twice);
 *   - each account is re-read before sending, so an opt-out that arrived after
 *     the draft was written is respected;
 *   - an account with no address or an opt-out is recorded as `skipped`
 *     instead of silently disappearing from the history.
 *
 * Never throws: the route turns the summary into a message for the admin.
 */
export async function sendBroadcastBatch(
  broadcastId,
  {
    limit = BROADCAST_DEFAULT_BATCH,
    budgetMs = DEFAULT_BUDGET_MS,
    now = new Date(),
  } = {}
) {
  const summary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    stoppedReason: null,
  };

  const broadcast = await getEmailBroadcast(broadcastId);
  if (!broadcast) {
    summary.stoppedReason = "unknown_broadcast";
    return summary;
  }
  if (!isMailConfigured()) {
    summary.stoppedReason = "mail_unconfigured";
    return summary;
  }
  if (!isUnsubscribeConfigured()) {
    summary.stoppedReason = "unsubscribe_unconfigured";
    return summary;
  }

  const settings = await getEmailSettings();
  if (settings.paused) {
    summary.stoppedReason = "paused";
    return summary;
  }

  const records = broadcast.recipients ?? [];
  const toAttempt = records.filter(
    (recipient) => recipient.status === "pending" || recipient.status === "failed"
  );
  if (!toAttempt.length) {
    summary.stoppedReason = "nothing_to_send";
    return summary;
  }

  const batchSize = Math.min(
    Math.max(Math.round(Number(limit)) || BROADCAST_DEFAULT_BATCH, 1),
    100
  );
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  let sentToday = await countSentSince(startOfDay);
  const startedAt = Date.now();
  const contactEmail = getContactInbox();
  const campaignId = `broadcast:${broadcastId}`;
  const users = await getUsersCollection();
  let consecutiveFailures = 0;

  for (const recipient of toAttempt.slice(0, batchSize)) {
    if (sentToday >= settings.dailyCap) {
      summary.stoppedReason = "daily_cap";
      break;
    }
    if (Date.now() - startedAt >= budgetMs) {
      summary.stoppedReason = "time_budget";
      break;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      summary.stoppedReason = "circuit_breaker";
      break;
    }

    const user = await users.findOne({ _id: recipient.uid });
    if (!user?.email || user.emailUnsubscribedAt) {
      await markBroadcastRecipient(broadcastId, recipient.uid, {
        status: "skipped",
        error: user?.email ? "unsubscribed" : "no_email",
      }).catch((error) =>
        console.error("[emailEngine] could not record a skip:", error)
      );
      summary.skipped += 1;
      continue;
    }

    let claim;
    try {
      claim = await claimEmailSend({
        campaignId,
        dedupeKey: recipient.uid,
        uid: recipient.uid,
        email: user.email,
        now: new Date(),
      });
    } catch (error) {
      console.error("[emailEngine] broadcast claim failed:", error);
      summary.stoppedReason = "claim_failed";
      break;
    }
    if (!claim.ok) {
      // Another batch (or a double click) already holds this message.
      summary.skipped += 1;
      continue;
    }

    try {
      const optOut = unsubscribeUrl(SITE_URL, recipient.uid);
      if (!optOut) throw new Error("No unsubscribe URL could be generated.");
      const template = renderBroadcastEmail({
        content: broadcast,
        user,
        siteUrl: SITE_URL,
        contactEmail,
        unsubscribeUrl: optOut,
      });
      const info = await sendMail({
        to: user.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      await markEmailSent({
        id: claim.id,
        userId: recipient.uid,
        campaignId,
        dedupeKey: recipient.uid,
        messageId: info?.messageId ?? null,
      });
      await markBroadcastRecipient(broadcastId, recipient.uid, {
        status: "sent",
        sentAt: new Date(),
        error: null,
      });
      summary.sent += 1;
      sentToday += 1;
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      summary.failed += 1;
      await markEmailFailed({ id: claim.id, error }).catch(() => undefined);
      await markBroadcastRecipient(broadcastId, recipient.uid, {
        status: "failed",
        error: String(error?.message ?? error).slice(0, 300),
      }).catch(() => undefined);
      console.error(
        `[emailEngine] broadcast ${broadcastId} -> ${maskEmail(user.email)} failed:`,
        error?.message ?? error
      );
    }

    if (BROADCAST_BETWEEN_SENDS_MS > 0) await sleep(BROADCAST_BETWEEN_SENDS_MS);
  }

  const settled = await finalizeEmailBroadcast(broadcastId).catch((error) => {
    console.error("[emailEngine] could not finalize a broadcast:", error);
    return null;
  });
  if (settled?.counts) {
    summary.remaining = settled.counts.pending + settled.counts.failed;
  }

  return summary;
}

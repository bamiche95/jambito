/**
 * Brevo (formerly Sendinblue) transactional email API.
 *
 * The student-facing mail used to leave through the Go54 mailbox, which starts
 * refusing connections after two to four messages and then trips the campaign
 * runner's circuit breaker. Brevo is an HTTPS API instead of an SMTP socket, so
 * there is no per-connection throttle: one call can personalise a whole batch
 * (`messageVersions`) and the provider owns retries, bounces and DKIM.
 *
 * Two shapes are supported, deliberately:
 *
 *   - `sendBrevoTemplate`  one stored template + one set of `params` per
 *                          recipient, sent as a single batch. This is what the
 *                          four progress campaigns use, so the copy can be
 *                          edited in Brevo and still be personalised per user.
 *   - `sendBrevoEmail`     a fully rendered HTML message for one recipient.
 *                          Used for one-off broadcasts and dashboard tests,
 *                          where the HTML is composed by this app.
 *
 * SERVER ONLY: `BREVO_API_KEY` must never be prefixed with `NEXT_PUBLIC_`.
 * Errors carry a machine-readable `code` plus the provider's own message, so
 * `emailLog.error` can finally explain what went wrong.
 */

const API_BASE = "https://api.brevo.com/v3";
const DEFAULT_SENDER_EMAIL = "contact@cbtpractice.ng";
const DEFAULT_SENDER_NAME = "CBT-Practice";
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_BASE_MS = 400;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_ATTEMPTS = 3;

/**
 * `POST /v3/smtp/email` accepts 2,000 recipients per call with at most 99 per
 * message version. One version per recipient means the version cap is what
 * binds, so 100 is the safest reading of both numbers.
 */
export const BREVO_MAX_VERSIONS = 100;

/** Status codes worth a second attempt: a full queue is not a bad request. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function env(name) {
  return (process.env[name] ?? "").trim();
}

/**
 * The resolved Brevo settings. Read on every call (not captured at import time)
 * so editing `.env.local` in development takes effect without a restart — the
 * same rule `lib/mailer.js` follows.
 *
 * The sender falls back to `MAIL_FROM_*` because that address is already the
 * one this domain is authenticated for; one place to change it avoids a deploy
 * that sends from an unverified address and gets silently rejected.
 */
export function getBrevoConfig() {
  const apiKey = env("BREVO_API_KEY");
  const senderEmail =
    env("BREVO_SENDER_EMAIL") || env("MAIL_FROM_EMAIL") || DEFAULT_SENDER_EMAIL;
  const senderName =
    env("BREVO_SENDER_NAME") || env("MAIL_FROM_NAME") || DEFAULT_SENDER_NAME;
  return { apiKey, senderEmail, senderName, configured: Boolean(apiKey) };
}

/** True when an API key is present, i.e. Brevo can actually be called. */
export function isBrevoConfigured() {
  return getBrevoConfig().configured;
}

/** The address Brevo sends from, for the dashboard's status line. */
export function getBrevoSender() {
  const config = getBrevoConfig();
  return { email: config.senderEmail, name: config.senderName };
}

/** Error carrying a machine-readable `code` the engine and the routes can map. */
export function brevoError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attemptUrl(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * One HTTP attempt. Returns the parsed body regardless of status so the caller
 * can decide whether to retry; only a transport problem throws.
 */
async function performRequest(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

/** How long to wait before a retry: the provider's own hint, or exponential. */
function retryDelayMs(response, attempt) {
  const header = Number(
    response?.headers?.get("retry-after") ??
      response?.headers?.get("x-sib-ratelimit-reset") ??
      0
  );
  const hinted = Number.isFinite(header) && header > 0 ? header * 1000 : 0;
  const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
  return Math.min(Math.max(hinted, backoff), MAX_RETRY_DELAY_MS);
}

/**
 * Brevo answers 401/403 both for a wrong key and for a blocked source IP, and
 * the two need different fixes: rotate the key, or allowlist the deployment's
 * address. Only the provider's message tells them apart.
 */
const IP_BLOCKED_HINT =
  /ip address|ip is not|unrecognised ip|unrecognized ip|unauthorized ip|unauthorised ip|allowlist|whitelist/i;

const ERROR_SUMMARIES = {
  brevo_unauthorized: "Brevo rejected the API key.",
  brevo_ip_blocked: "Brevo refused this server's IP address.",
  brevo_credits: "The Brevo account has no email credits left.",
  brevo_rate_limited: "Brevo rate-limited the request.",
  brevo_rejected: "Brevo rejected the request.",
  brevo_error: "Brevo returned an error.",
};

/**
 * Turns a failed Brevo response into an error an admin can act on.
 *
 * The provider message is kept in `detail` and appended to `message`, because
 * `markEmailFailed()` stores `error.message`: that is how "sender not valid",
 * "blocked by policy" or "insufficient credits" stops being invisible.
 *
 * The status code alone is not enough: the live account refused every request
 * from an unlisted IP with a 401 whose body said so, which used to be reported
 * as a bad API key and sent the reader looking in the wrong place.
 */
function translateError(response, payload, path) {
  const status = response.status;
  const detail = String(payload?.message ?? payload?.error ?? "").trim();
  const unauthorized = status === 401 || status === 403;
  const code = unauthorized
    ? IP_BLOCKED_HINT.test(detail)
      ? "brevo_ip_blocked"
      : "brevo_unauthorized"
    : status === 402
      ? "brevo_credits"
      : status === 429
        ? "brevo_rate_limited"
        : status === 400
          ? "brevo_rejected"
          : "brevo_error";

  const summary = ERROR_SUMMARIES[code] ?? ERROR_SUMMARIES.brevo_error;

  const error = brevoError(detail ? `${summary} ${detail}` : summary, code);
  error.status = status;
  error.detail = detail || null;
  error.path = path;
  return error;
}

/**
 * Calls the Brevo API, retrying a rate limit or a 5xx twice and honouring the
 * provider's own `retry-after` hint.
 *
 * Returns the parsed body; `{}` for a 204, since the template update endpoint
 * answers with no content.
 */
export async function brevoRequest(
  path,
  { method = "GET", body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  const config = getBrevoConfig();
  if (!config.configured) {
    throw brevoError(
      "Brevo is not configured: set BREVO_API_KEY in the environment.",
      "brevo_unconfigured"
    );
  }

  const options = {
    method,
    headers: {
      accept: "application/json",
      "api-key": config.apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let result;
    try {
      result = await performRequest(attemptUrl(path), options, timeoutMs);
    } catch (cause) {
      const timedOut = cause?.name === "AbortError";
      lastError = brevoError(
        timedOut ? "Brevo did not answer in time." : "Brevo could not be reached.",
        timedOut ? "brevo_timeout" : "brevo_unreachable"
      );
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(RETRY_BASE_MS * attempt);
      continue;
    }

    const { response, payload } = result;
    if (response.ok) return payload ?? {};

    lastError = translateError(response, payload, path);
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw lastError;
    }
    await sleep(retryDelayMs(response, attempt));
  }

  throw lastError ?? brevoError("Brevo request failed.", "brevo_error");
}

/** The account behind the API key: used by `npm run check:brevo`. */
export async function getBrevoAccount() {
  return brevoRequest("/account");
}

/** The senders Brevo has verified — a send from anything else is rejected. */
export async function listBrevoSenders() {
  const payload = await brevoRequest("/senders");
  return Array.isArray(payload?.senders) ? payload.senders : [];
}

/**
 * The domain record that covers an address, or null when the domain was never
 * added in Brevo.
 *
 * A verified *sender* is enough for Brevo to accept a message, but without an
 * authenticated *domain* there is no SPF/DKIM alignment and Gmail files the
 * result as spam. The dashboard needs both facts, so this returns the record
 * (with its `authenticated` flag) rather than a boolean.
 */
export async function getBrevoDomain(email) {
  const value = String(email ?? "");
  const at = value.lastIndexOf("@");
  const domain = at === -1 ? "" : value.slice(at + 1).trim().toLowerCase();
  if (!domain) return null;

  const payload = await brevoRequest("/senders/domains");
  const domains = Array.isArray(payload?.domains) ? payload.domains : [];
  return (
    domains.find((entry) => {
      const name = String(entry?.domain_name ?? "").toLowerCase();
      return Boolean(name) && (domain === name || domain.endsWith(`.${name}`));
    }) ?? null
  );
}

function oneLine(value, max = 180) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** Accepts `"a@b.c"`, `[{ email, name }]` or `["a@b.c"]`. */
function recipientList(to) {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((entry) => (typeof entry === "string" ? { email: entry } : entry))
    .filter((entry) => entry?.email)
    .map((entry) => ({
      email: oneLine(entry.email, 254),
      ...(entry.name ? { name: oneLine(entry.name, 120) } : {}),
    }));
}

/**
 * Brevo inserts `params` into the template without escaping, so a value that
 * contains `<` could open a tag. Names here come from the account's own email
 * address, but stripping the markup characters costs nothing and removes the
 * whole class of problem. Line breaks are collapsed too: a param can end up in
 * the subject, where a newline would split the header.
 */
function sanitiseParams(params) {
  const out = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined) continue;
    out[key] = String(value)
      .replace(/[<>]/g, "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 600);
  }
  return out;
}

function senderHeader() {
  const { senderEmail, senderName } = getBrevoConfig();
  const name = oneLine(senderName, 120);
  return { email: senderEmail, ...(name ? { name } : {}) };
}

/**
 * Sends one fully rendered message to one recipient.
 *
 * There is no SMTP session to throttle here, and a thrown error carries
 * Brevo's own reason instead of a generic refusal.
 */
export async function sendBrevoEmail({
  to,
  subject,
  html = null,
  text = null,
  replyTo = null,
  tag = null,
}) {
  const recipients = recipientList(to);
  if (!recipients.length) {
    throw brevoError("No recipient address was given.", "brevo_no_recipient");
  }

  const body = {
    sender: senderHeader(),
    to: recipients,
    subject: oneLine(subject, 200),
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
    ...(replyTo ? { replyTo: { email: oneLine(replyTo, 254) } } : {}),
    ...(tag ? { tags: [oneLine(tag, 60)] } : {}),
  };

  const payload = await brevoRequest("/smtp/email", { method: "POST", body });
  return { messageId: payload?.messageId ?? null };
}

/**
 * Sends one Brevo template to many recipients, each with its own `params`.
 *
 * `messageVersions` is what replaces the per-message loop: a hundred student
 * emails cost one request, so a campaign run finishes long before its time
 * budget and the daily cap becomes the only limit.
 *
 * The reply carries `messageIds` — one id per version — where a single-recipient
 * send carries `messageId`. Both are read: the id is the only way to reconcile a
 * `emailLog` row with Brevo's own delivery log, and losing it (as the first
 * version of this function did) meant every ledger row recorded `null`.
 *
 * `batches` counts the requests, not the ids, because a batch is what costs a
 * call.
 */
export async function sendBrevoTemplate({
  templateId,
  recipients,
  replyTo = null,
  tag = null,
}) {
  const id = Number(templateId);
  if (!Number.isFinite(id) || id <= 0) {
    throw brevoError("A Brevo template id is required.", "brevo_template_missing");
  }

  const versions = (recipients ?? [])
    .filter((recipient) => recipient?.email)
    .map((recipient) => ({
      to: recipientList([recipient]),
      params: sanitiseParams(recipient.params),
    }));
  if (!versions.length) {
    throw brevoError("No recipient address was given.", "brevo_no_recipient");
  }

  const messageIds = [];
  let batches = 0;
  for (let index = 0; index < versions.length; index += BREVO_MAX_VERSIONS) {
    const body = {
      templateId: id,
      messageVersions: versions.slice(index, index + BREVO_MAX_VERSIONS),
      ...(replyTo ? { replyTo: { email: oneLine(replyTo, 254) } } : {}),
      ...(tag ? { tags: [oneLine(tag, 60)] } : {}),
    };
    const payload = await brevoRequest("/smtp/email", { method: "POST", body });
    batches += 1;
    if (Array.isArray(payload?.messageIds)) {
      messageIds.push(...payload.messageIds.filter(Boolean));
    } else if (payload?.messageId) {
      messageIds.push(payload.messageId);
    }
  }

  // Shorter than `versions` means the provider answered with fewer ids than
  // messages: the caller then records one id for the batch instead of guessing.
  return { messageIds, batches };
}

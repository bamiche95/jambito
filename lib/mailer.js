import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

/**
 * Server-only SMTP transport for the site's mailbox.
 *
 * Everything here reads `SMTP_*` / `MAIL_FROM_*` from the server environment:
 * the password must NEVER be exposed to the browser, so there is no
 * `NEXT_PUBLIC_` variant of any of these. The mailbox itself is the Go54
 * account behind contact@cbtpractice.ng (smtp.go54mail.com:587, STARTTLS).
 *
 * Two callers use this: `app/api/contact` (a visitor's message forwarded to the
 * support inbox) and `app/api/welcome` (the one-off welcome mail for a new
 * account). Both are route handlers on the Node runtime, which is why the
 * transport is created per server process and reused — no browser code may
 * import this file.
 */

const DEFAULT_HOST = "smtp.go54mail.com";
const DEFAULT_PORT = 587;
const DEFAULT_FROM_EMAIL = "contact@cbtpractice.ng";
const DEFAULT_FROM_NAME = "CBT-Practice";

function env(name) {
  return (process.env[name] ?? "").trim();
}

/**
 * The resolved SMTP settings.
 *
 * `SMTP_SECURE=false` + port 587 means "connect in the clear, then upgrade with
 * STARTTLS" — which is what Go54 documents and what `requireTLS` below enforces,
 * so a server that refuses to upgrade is a hard error rather than a silent
 * plaintext login. Port 465 (implicit TLS) is accepted too.
 */
export function getMailConfig() {
  const host = env("SMTP_HOST") || DEFAULT_HOST;
  const port = Number(env("SMTP_PORT")) || DEFAULT_PORT;
  const user = env("SMTP_USER") || DEFAULT_FROM_EMAIL;
  // Not trimmed: a mailbox password may legitimately start or end with a space.
  const password = process.env.SMTP_PASSWORD ?? "";
  const secure = env("SMTP_SECURE") === "true" || port === 465;
  const fromEmail = env("MAIL_FROM_EMAIL") || user || DEFAULT_FROM_EMAIL;
  const fromName = env("MAIL_FROM_NAME") || DEFAULT_FROM_NAME;

  return {
    host,
    port,
    secure,
    user,
    password,
    fromEmail,
    fromName,
    configured: Boolean(host && port && user && password),
  };
}

/** True when a password is present, i.e. mail can actually be sent. */
export function isMailConfigured() {
  return getMailConfig().configured;
}

/** Where contact-form messages are delivered. Defaults to the sending mailbox. */
export function getContactInbox() {
  const config = getMailConfig();
  return env("CONTACT_TO_EMAIL") || config.fromEmail;
}

function fromHeader(config) {
  const name = config.fromName.replace(/["\\\r\n]/g, "").trim();
  return name ? `"${name}" <${config.fromEmail}>` : config.fromEmail;
}

/**
 * One transporter per process (and per account/password pair, so editing the
 * env in dev takes effect without a restart). Not pooled: submissions are
 * low-volume, and a serverless instance should not hold an SMTP socket open
 * between invocations.
 */
const CACHE_KEY = "__cbtPracticeMailTransport";

function getTransporter(config) {
  const fingerprint = createHash("sha256")
    .update(
      [config.host, config.port, config.secure, config.user, config.password].join(
        "\u0000"
      )
    )
    .digest("hex")
    .slice(0, 16);

  const cached = globalThis[CACHE_KEY];
  if (cached?.fingerprint === fingerprint) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // STARTTLS is mandatory on 587: never fall back to an unencrypted session.
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: "TLSv1.2", servername: config.host },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: false,
    logger: false,
    debug: false,
  });

  globalThis[CACHE_KEY] = { fingerprint, transporter };
  return transporter;
}

/** Error carrying a machine-readable `code` the route handlers can map. */
function mailError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Opens a real connection, upgrades to TLS and logs in, then closes it.
 *
 * This is a diagnostic (`npm run check:mail`), never called from a request
 * handler: the contact form sends, it does not probe. It answers the one
 * question the send path cannot — "are these credentials still valid?" — with
 * the provider's own error code attached, because "auth failed" and "wrong
 * host" need very different fixes.
 */
export async function verifyMailConnection() {
  const config = getMailConfig();
  if (!config.configured) {
    throw mailError(
      "Mail is not configured: set SMTP_USER and SMTP_PASSWORD in the environment.",
      "mail_unconfigured"
    );
  }

  try {
    await getTransporter(config).verify();
    return true;
  } catch (error) {
    const reason = `${error?.code ?? error?.name ?? "error"}: ${
      error?.message ?? error
    }`;
    console.error(
      `[mailer] verify against ${config.host}:${config.port} failed: ${reason}`
    );
    const wrapped = mailError(
      "The mail server refused the connection or the credentials.",
      "mail_verify_failed"
    );
    // Provider code kept for the CLI; routes never return this to a visitor.
    wrapped.detail = reason;
    throw wrapped;
  }
}

/**
 * Sends one message. Throws when the mailbox is not configured, so callers
 * answer an honest 503 instead of pretending a message went out.
 *
 * Return value/error messages deliberately contain no credentials.
 */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const config = getMailConfig();
  if (!config.configured) {
    throw mailError(
      "Mail is not configured: set SMTP_USER and SMTP_PASSWORD in the environment.",
      "mail_unconfigured"
    );
  }

  const message = {
    from: fromHeader(config),
    to,
    subject,
    text,
    html,
  };
  // Reply-To is attacker-controlled on the contact form; strip CR/LF so it can
  // never inject extra headers.
  if (replyTo) message.replyTo = String(replyTo).replace(/[\r\n]+/g, " ").trim();

  try {
    const info = await getTransporter(config).sendMail(message);
    return { messageId: info.messageId };
  } catch (error) {
    console.error(
      `[mailer] send to ${to} failed: ${error?.code ?? error?.name ?? "error"}: ${
        error?.message ?? error
      }`
    );
    throw mailError("The mail server did not accept the message.", "mail_send_failed");
  }
}

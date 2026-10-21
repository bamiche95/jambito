import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { getContactInbox, isMailConfigured, sendMail } from "@/lib/mailer";
import { contactMessageEmail } from "@/lib/emailTemplates";
import {
  checkContactRateLimit,
  createContactToken,
  getClientIp,
  hashValue,
  isSameOriginRequest,
  isValidEmail,
  looksLikeSpam,
  sanitizeField,
  verifyContactToken,
} from "@/lib/contactGuard";

/**
 * The public contact form.
 *
 * GET  /api/contact  -> { success, token, issuedAt, minAgeMs }
 * POST /api/contact  -> { success } | { success: false, code, message }
 *
 * The page fetches a signed token on mount and posts it back with the message;
 * see lib/contactGuard.js for what the token proves and how the limits work.
 * Nothing here trusts the client: every field is re-validated, capped and
 * stripped of control characters before it reaches a mail header.
 *
 * Status codes are chosen so the form can show the right message:
 *   400 invalid_fields / token_invalid / token_expired / too_fast / spam
 *   403 bad_origin
 *   429 rate_limited (with Retry-After)
 *   502 send_failed       -> tell the visitor to email us directly
 *   503 not_configured    -> the deployment is missing SMTP credentials
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const LIMITS = { name: 80, email: 254, message: 4000 };
const MIN_MESSAGE = 10;

function fail(status, code, message, extraHeaders = {}) {
  return NextResponse.json(
    { success: false, code, message },
    { status, headers: { ...NO_STORE, ...extraHeaders } }
  );
}

/** Issues a fresh timing token. */
export async function GET() {
  try {
    const { token, issuedAt, minAgeMs } = createContactToken();
    return NextResponse.json(
      { success: true, token, issuedAt, minAgeMs },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("[contact] could not issue token:", error?.message ?? error);
    return fail(
      503,
      "not_configured",
      "The contact form is temporarily unavailable. Please email us directly."
    );
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return fail(403, "bad_origin", "This request did not come from cbtpractice.ng.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_fields", "We could not read that submission.");
  }
  if (!body || typeof body !== "object") {
    return fail(400, "invalid_fields", "We could not read that submission.");
  }

  // Honeypot: a field hidden from sighted users and screen readers. Bots fill
  // every input they find, so a non-empty value means the message is junk. The
  // reply is a normal success on purpose — telling the bot it was detected only
  // teaches it to skip this field.
  //
  // The field is deliberately NOT called "website"/"url": browser and password
  // autofill happily target those names, and a filled-in honeypot would silently
  // bin a real student's message.
  const trap = body.contact_extra;
  if (trap && (typeof trap !== "string" || trap.trim() !== "")) {
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  }

  const name = sanitizeField(body.name, LIMITS.name);
  const email = sanitizeField(body.email, LIMITS.email);
  const message = sanitizeField(body.message, LIMITS.message, { keepNewlines: true });

  if (name.length < 2 || !isValidEmail(email) || message.length < MIN_MESSAGE) {
    return fail(
      400,
      "invalid_fields",
      "Please add your name, a valid email address and a message of at least 10 characters."
    );
  }

  const tokenCheck = verifyContactToken(body.token);
  if (!tokenCheck.ok) {
    if (tokenCheck.reason === "too_fast") {
      return fail(
        400,
        "too_fast",
        "That was a little quick — please check your message and try again."
      );
    }
    return fail(
      400,
      tokenCheck.reason === "expired" ? "token_expired" : "token_invalid",
      "This form session has expired. Refresh the page and send your message again."
    );
  }

  if (looksLikeSpam(message)) {
    return fail(
      400,
      "spam",
      "Please shorten your message or send it to us by email instead."
    );
  }

  const ip = getClientIp(request);
  const ipHash = hashValue(ip);

  // Check the mailbox before spending the visitor's rate-limit allowance: an
  // unconfigured deployment should not make a real person wait 10 minutes.
  if (!isMailConfigured()) {
    console.error(
      "[contact] SMTP is not configured; submission not delivered (set SMTP_USER and SMTP_PASSWORD)."
    );
    return fail(
      503,
      "not_configured",
      `Our contact form is temporarily unavailable. Please email ${getContactInbox()} and we will reply.`
    );
  }

  const limit = await checkContactRateLimit({ ip, email });
  if (!limit.allowed) {
    return fail(
      429,
      "rate_limited",
      "You have sent us several messages already. Please give us a little time to reply.",
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const inbox = getContactInbox();
  const template = contactMessageEmail({
    name,
    email,
    message,
    submittedAt: new Date().toISOString(),
    ipHash,
    replyTo: email,
    siteUrl: SITE_URL,
    contactEmail: inbox,
  });

  try {
    await sendMail({
      to: inbox,
      replyTo: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      `[contact] delivery failed (${error?.code ?? "error"}):`,
      error?.message ?? error
    );
    return fail(
      502,
      "send_failed",
      `We could not send your message just now. Please email ${inbox} and we will pick it up.`
    );
  }
}

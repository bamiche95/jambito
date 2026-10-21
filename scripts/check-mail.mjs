#!/usr/bin/env node
/**
 * Checks the Go54 mailbox that /api/contact and /api/welcome send through.
 *
 * Go54's settings (as documented for cbtpractice.ng):
 *   SMTP  smtp.go54mail.com : 587  STARTTLS   user = full address
 *   SMTP  smtp.go54mail.com : 465  implicit TLS (fallback; same credentials)
 *   IMAP  imap.go54mail.com : 993  SSL/TLS    (not used by this app)
 *
 * `verify()` performs the real handshake — TCP connect, EHLO, STARTTLS (587),
 * TLS handshake and AUTH — so a PASS here means the credentials and the host
 * configuration are both right, not merely that the env vars are present.
 * Sending is a separate opt-in step because it puts a message in a real inbox.
 *
 * Usage:
 *   npm run check:mail
 *   npm run check:mail -- --send you@example.com
 *
 * Exit codes: 0 = ready to send, 1 = not configured or rejected.
 */

import { getMailConfig, sendMail, verifyMailConnection } from "../lib/mailer.js";

const config = getMailConfig();
const mode = config.secure ? "implicit TLS" : "STARTTLS";

console.log("Go54 mailbox (resolved from .env.local)");
console.log(`  host      ${config.host}:${config.port}  (${mode})`);
console.log(`  user      ${config.user}`);
console.log(`  from      "${config.fromName}" <${config.fromEmail}>`);
console.log(`  inbox     ${process.env.CONTACT_TO_EMAIL || config.fromEmail}`);
console.log(`  password  ${config.password ? "set" : "MISSING"}`);

if (!config.configured) {
  console.error(
    "\nFAIL  SMTP_PASSWORD is empty.\n" +
      "      Put the password you use to sign in to the mailbox in .env.local as\n" +
      '      SMTP_PASSWORD="..." and run this again.'
  );
  process.exit(1);
}

try {
  await verifyMailConnection();
  console.log("\nPASS  connected, upgraded to TLS and authenticated");
} catch (error) {
  console.error(`\nFAIL  ${error.code ?? "error"}: ${error.detail ?? error.message}`);
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND/i.test(String(error.detail))) {
    console.error(
      "      The connection itself failed, so this is the host/port — not the password.\n" +
        "      Port 587 (STARTTLS) is blocked by a number of ISPs, office networks and\n" +
        '      sandboxes: try SMTP_PORT="465" (implicit TLS) and run this again.'
    );
  } else if (/EAUTH|535|Invalid login/i.test(String(error.detail))) {
    console.error(
      "      The server was reached and rejected the credentials. Check SMTP_USER\n" +
        "      (the full address) and SMTP_PASSWORD (the mailbox sign-in password)."
    );
  }
  process.exit(1);
}

const sendIndex = process.argv.indexOf("--send");
if (sendIndex !== -1) {
  const to = process.argv[sendIndex + 1];
  if (!to || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(to)) {
    console.error("\nFAIL  --send needs an email address, e.g. --send you@example.com");
    process.exit(1);
  }

  try {
    const { messageId } = await sendMail({
      to,
      subject: "CBT-Practice mail check",
      text:
        "This is a test message from `npm run check:mail`.\n\n" +
        "If you can read this, the contact form and welcome emails can be delivered.",
      html:
        '<p>This is a test message from <code>npm run check:mail</code>.</p>' +
        "<p>If you can read this, the contact form and welcome emails can be delivered.</p>",
    });
    console.log(`PASS  test message accepted for ${to} (id ${messageId})`);
  } catch (error) {
    console.error(`\nFAIL  ${error.code ?? "error"}: ${error.message}`);
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * Checks the Brevo account that every student-facing email is sent through.
 *
 * Three questions, in the order they actually break a deployment:
 *   1. Is the API key valid, and does the account still have email credits?
 *   2. Is BREVO_SENDER_EMAIL a verified sender, on a domain that is
 *      authenticated (SPF/DKIM) in Brevo? An unverified sender is rejected with
 *      a 400, and an unauthenticated domain lands in spam.
 *   3. Which campaign templates exist, and are they active?
 *
 * Sending is a separate opt-in step because it puts a message in a real inbox.
 * Pushing the four campaign templates needs the app's renderers (they import
 * `@/lib/...`), so this script reports them instead: use the dashboard's
 * "Push templates" button, or POST /api/admin/emails with
 * `{"action":"templates_push"}`.
 *
 * Usage:
 *   npm run check:brevo
 *   npm run check:brevo -- --templates
 *   npm run check:brevo -- --send you@example.com
 *
 * Exit codes: 0 = ready to send (WARN lines are still exit 0), 1 = not
 * configured, or a problem above that must be fixed before any campaign.
 */

import {
  brevoRequest,
  getBrevoAccount,
  getBrevoConfig,
  listBrevoSenders,
  sendBrevoEmail,
} from "../lib/brevo.js";

const config = getBrevoConfig();

console.log("Brevo (resolved from .env.local)");
console.log(
  `  api key   ${config.apiKey ? `set (${config.apiKey.slice(0, 6)}…)` : "MISSING"}`
);
console.log(`  from      "${config.senderName}" <${config.senderEmail}>`);

if (!config.configured) {
  console.error(
    "\nFAIL  BREVO_API_KEY is empty.\n" +
      "      Brevo dashboard -> SMTP & API -> API Keys, then in .env.local:\n" +
      '      BREVO_API_KEY="xkeysib-..."\n' +
      "      Until it is set the campaign runner falls back to the Go54 mailbox,\n" +
      "      which is the transport that throttles a burst of messages."
  );
  process.exit(1);
}

let account;
try {
  account = await getBrevoAccount();
} catch (error) {
  console.error(`\nFAIL  ${error.code ?? "error"}: ${error.message}`);
  process.exit(1);
}

const plan = account?.plan?.[0] ?? {};
console.log(
  `\nPASS  key accepted — ${account?.email ?? "account"}` +
    `${account?.companyName ? ` (${account.companyName})` : ""}`
);
console.log(
  `      plan      ${plan.type ?? "unknown"}${plan.creditsType ? ` / ${plan.creditsType}` : ""}`
);
console.log(`      credits   ${plan.credits ?? "unknown"} email(s) left`);

// --- sender and domain ----------------------------------------------------
// Brevo accepts a message from a verified sender OR from any address on a
// domain authenticated in the account. Delivery really needs the second: with
// no SPF/DKIM aligned to the From domain, Gmail still files the mail as spam.
// The two facts are therefore fetched together and judged together.
let problems = 0;
// Facts this run could not confirm. They are not failures — the key was
// accepted — but "Ready" must not be printed on top of them.
let unknowns = 0;

let senders = [];
let sendersReadable = true;
try {
  senders = await listBrevoSenders();
} catch (error) {
  sendersReadable = false;
  unknowns += 1;
  console.error(
    `\nWARN  could not list senders: ${error.code ?? error.message}` +
      `\n      Whether ${config.senderEmail} is a verified address is unknown.`
  );
}

let domains = [];
let domainsReadable = true;
try {
  const payload = await brevoRequest("/senders/domains");
  domains = Array.isArray(payload?.domains) ? payload.domains : [];
} catch (error) {
  domainsReadable = false;
  unknowns += 1;
  console.error(
    `\nWARN  could not read the domain list: ${error.code ?? error.message}` +
      "\n      SPF/DKIM for the sending domain is therefore unconfirmed."
  );
}

const sender = senders.find(
  (entry) =>
    String(entry?.email ?? "").toLowerCase() === config.senderEmail.toLowerCase()
);
const senderInactive = Boolean(sender) && sender.active === false;

const senderDomain = config.senderEmail.split("@")[1]?.toLowerCase() ?? "";
const domain = domains.find((entry) => {
  const name = String(entry?.domain_name ?? "").toLowerCase();
  return name && (senderDomain === name || senderDomain.endsWith(`.${name}`));
});
const domainAuthenticated = Boolean(domain?.authenticated);

if (senderInactive) {
  problems += 1;
  console.error(
    `\nFAIL  sender ${sender.email} is verified but INACTIVE in Brevo.` +
      "\n      Reactivate it under Senders, Domains & IPs -> Senders."
  );
} else if (sender) {
  console.log(`PASS  sender ${sender.email} is active (verified in Brevo)`);
} else if (domainAuthenticated) {
  console.log(
    `PASS  ${config.senderEmail} is on ${domain.domain_name}, which is authenticated —` +
      "\n      Brevo accepts any address on an authenticated domain."
  );
} else if (sendersReadable && domainsReadable) {
  problems += 1;
  console.error(
    `\nFAIL  ${config.senderEmail} is neither a verified sender nor on an authenticated domain.` +
      "\n      Brevo rejects every send from it. Add the address under Senders," +
      "\n      Domains & IPs -> Senders, or authenticate the domain, then set" +
      "\n      BREVO_SENDER_EMAIL to it."
  );
  const known = senders.map((entry) => entry?.email).filter(Boolean);
  console.error(`      Verified senders: ${known.length ? known.join(", ") : "none"}`);
}

if (domainAuthenticated) {
  console.log(`PASS  domain ${domain.domain_name} is authenticated (SPF/DKIM)`);
} else if (domainsReadable && domain) {
  problems += 1;
  console.error(
    `\nFAIL  domain ${domain.domain_name} is in Brevo but not authenticated.` +
      "\n      Finish the DNS records Brevo shows for it before sending campaigns."
  );
} else if (domainsReadable) {
  unknowns += 1;
  console.error(
    `\nWARN  ${senderDomain} is not authenticated in Brevo.` +
      "\n      A verified single sender still sends, but with no SPF/DKIM for the" +
      "\n      domain Gmail and Outlook will likely file these as spam. Authenticate" +
      "\n      the domain under Senders, Domains & IPs -> Domains."
  );
}

// --- templates -----------------------------------------------------------
if (process.argv.includes("--templates")) {
  try {
    const payload = await brevoRequest("/smtp/templates?limit=100&offset=0");
    // This account answers `{}` here even when templates exist, so an empty
    // body means "could not read", not "none yet". Telling the two apart is
    // the whole point: one means press "Push templates", the other means the
    // listing endpoint is the problem.
    const listed = Array.isArray(payload?.templates) ? payload.templates : null;
    if (!listed) {
      unknowns += 1;
      console.error(
        `\nWARN  Brevo returned no template list (GET /smtp/templates -> ${JSON.stringify(payload)}).` +
          "\n      Templates can still be pushed and used; only this listing is unavailable." +
          "\n      Check Admin -> Emails instead."
      );
    }
    const ours = (listed ?? []).filter((entry) =>
      String(entry?.name ?? "").startsWith("cbtpractice-")
    );
    if (listed) {
      console.log(
        `\nCampaign templates (${ours.length} of ${payload.count ?? listed.length} total)`
      );
    }
    if (listed && !ours.length) {
      console.log(
        '  none yet — open Admin -> Emails and press "Push templates", or run one campaign.'
      );
    }
    for (const entry of ours) {
      console.log(
        `  #${entry.id}  ${entry.name}${entry.isActive === false ? "  (INACTIVE)" : ""}`
      );
      console.log(`        ${entry.subject ?? ""}`);
    }
    if (ours.some((entry) => entry.isActive === false)) problems += 1;
  } catch (error) {
    unknowns += 1;
    console.error(
      `\nWARN  could not list templates: ${error.code ?? error.message}`
    );
  }
}

// --- live send -----------------------------------------------------------
const sendIndex = process.argv.indexOf("--send");
if (sendIndex !== -1) {
  const to = process.argv[sendIndex + 1];
  if (!to || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(to)) {
    console.error("\nFAIL  --send needs an email address, e.g. --send you@example.com");
    process.exit(1);
  }

  try {
    const { messageId } = await sendBrevoEmail({
      to,
      subject: "CBT-Practice Brevo check",
      text:
        "This is a test message from `npm run check:brevo`.\n\n" +
        "If you can read this, the progress emails can be delivered through Brevo.",
      html:
        "<p>This is a test message from <code>npm run check:brevo</code>.</p>" +
        "<p>If you can read this, the progress emails can be delivered through Brevo.</p>",
      tag: "brevo-check",
    });
    console.log(`\nPASS  test message accepted for ${to} (id ${messageId})`);
  } catch (error) {
    console.error(`\nFAIL  ${error.code ?? "error"}: ${error.message}`);
    process.exit(1);
  }
}

if (problems) {
  console.error(
    `\n${problems} problem(s) above must be fixed before campaigns will deliver.`
  );
  process.exit(1);
}

if (unknowns) {
  console.log(
    `\nReady for sending, but ${unknowns} check(s) could not be run (see the WARN lines).`
  );
} else {
  console.log("\nReady: student email can go through Brevo.");
}

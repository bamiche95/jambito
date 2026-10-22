/**
 * Email bodies for the two messages the site sends.
 *
 * Kept dependency-free (no React, no Tailwind): an inbox renders plain HTML, so
 * everything is a table-based layout with inline styles — the only thing Gmail,
 * Outlook and iOS Mail agree on. Every message is multipart with a real
 * plain-text alternative, which is also what keeps it out of spam filters.
 *
 * Dynamic values (a student's name, a contact message) are always escaped for
 * HTML and reduced to a single line before they reach a header or a subject.
 */

import { interpolate, previewVariables } from "./emailCampaigns";


const COLORS = {
  navy: "#0b1e48",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
  blueBorder: "#bfdbfe",
  blueText: "#1e3a8a",
  orange: "#ff5722",
  orangeSoft: "#fff7ed",
  orangeBorder: "#fed7aa",
  orangeText: "#9a3412",
  emerald: "#10b981",
  slate900: "#0f172a",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  border: "#e2e8f0",
  cream: "#faf8f5",
  white: "#ffffff",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";


/** HTML-escapes text that came from a form field. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Collapses whitespace and removes CR/LF — used for anything that ends up in a
 * header (`Subject`, `Reply-To`) so a newline can never inject another header.
 */
export function oneLine(value, max = 160) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * A friendly first name for the greeting.
 *
 * Google sign-ins carry a display name; email sign-ups do not, so the local part
 * of the address is the fallback. Deliberately not title-cased: "ada.okafor"
 * would become a name the student never chose.
 */
export function greetingName(name, email) {
  const fromName = oneLine(name, 60).split(" ")[0];
  if (fromName) return fromName;
  const local = oneLine(email, 254).split("@")[0];
  return local || "there";
}

/** Shared frame: brand header, card body, support footer. */
function layout({
  preheader,
  heading,
  bodyHtml,
  siteUrl,
  contactEmail,
  footerNote,
  footerHtml = "",
  accent = COLORS.blue,
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${escapeHtml(oneLine(heading, 120))}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.cream};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(oneLine(preheader, 200))}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;font-family:${FONT};">
            <tr>
              <td style="background:${COLORS.navy};padding:22px 28px;">
                <a href="${escapeHtml(siteUrl)}" style="color:${COLORS.white};font-size:20px;font-weight:800;letter-spacing:-0.01em;text-decoration:none;">CBT-Practice</a>
                <div style="margin-top:6px;color:#a5b4dc;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">
                  JAMB &middot; WAEC &middot; POST UTME &middot; GCE &middot; GST
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <div style="height:4px;width:44px;background:${accent};border-radius:999px;margin-bottom:18px;"></div>
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;color:${COLORS.slate900};">
                  ${escapeHtml(heading)}
                </h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 26px;background:#f8fafc;border-top:1px solid ${COLORS.border};">
                <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.slate600};">
                  Need a hand? Reply to this email or write to
                  <a href="mailto:${escapeHtml(contactEmail)}" style="color:${COLORS.blue};font-weight:600;text-decoration:none;">${escapeHtml(contactEmail)}</a>.
                </p>
                <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${COLORS.slate400};">
                  ${escapeHtml(footerNote)}
                </p>
                ${
                  footerHtml
                    ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${COLORS.slate400};">${footerHtml}</p>`
                    : ""
                }
                <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${COLORS.slate400};">
                  <a href="${escapeHtml(siteUrl)}" style="color:${COLORS.slate500};text-decoration:underline;">cbtpractice.ng</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Bulletproof-enough CTA button. */
function button(href, label, color = COLORS.blue) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px;">
    <tr>
      <td align="center" bgcolor="${color}" style="border-radius:10px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${COLORS.white};text-decoration:none;border-radius:10px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function paragraph(text, { color = COLORS.slate600, size = 15, margin = "14px 0 0" } = {}) {
  return `<p style="margin:${margin};font-size:${size}px;line-height:1.65;color:${color};">${text}</p>`;
}

/**
 * The welcome mail for a brand-new account.
 *
 * Written to do a job rather than say "thanks": say what the student has right
 * now (the free questions), what is covered, and the one habit that makes the
 * app stick (installing it so practice works offline). No price is printed — the
 * figure is editable from the admin dashboard — so the email points at
 * /#pricing instead of quoting an amount that could be stale.
 */
export function welcomeEmail({
  name,
  email,
  siteUrl,
  contactEmail,
  trialLimit = 40,
}) {
  const firstName = greetingName(name, email);
  const base = String(siteUrl || "https://www.cbtpractice.ng").replace(/\/+$/, "");
  const practiceUrl = `${base}/cbt`;
  const pricingUrl = `${base}/#pricing`;
  const whatsInside = [
    "JAMB, WAEC, POST UTME, GCE and GST past questions",
    "Every subject and every year, in one place",
    "Detailed explanations after each question",
    "Progress analytics and a History that follows your account",
  ];

  const listHtml = whatsInside
    .map(
      (item) => `<tr>
        <td valign="top" style="padding:7px 0 0;width:24px;font-size:15px;line-height:1.5;color:${COLORS.emerald};font-weight:700;">&#10003;</td>
        <td valign="top" style="padding:7px 0 0;font-size:15px;line-height:1.6;color:${COLORS.slate600};">${escapeHtml(item)}</td>
      </tr>`
    )
    .join("");

  const bodyHtml = `
    ${paragraph(
      `Hi ${escapeHtml(firstName)},<br />Your CBT-Practice account is ready — welcome aboard. You can start practising right now, and you do not need a card to begin.`
    )}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:${COLORS.blueSoft};border:1px solid ${COLORS.blueBorder};border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.blue};">Your free practice is live</p>
          <p style="margin:7px 0 0;font-size:14px;line-height:1.65;color:${COLORS.blueText};">
            <strong>${escapeHtml(trialLimit)} free questions</strong> are waiting on your account. They are timed and marked the way the real CBT exam works, so your first attempt already tells you something useful.
          </p>
        </td>
      </tr>
    </table>
    ${button(practiceUrl, "Start your free practice")}
    <h2 style="margin:22px 0 0;font-size:16px;line-height:1.4;font-weight:700;color:${COLORS.slate900};">What you can do today</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
      ${listHtml}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background:${COLORS.orangeSoft};border:1px solid ${COLORS.orangeBorder};border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.orange};">Practise without data</p>
          <p style="margin:7px 0 0;font-size:14px;line-height:1.65;color:${COLORS.orangeText};">
            Install CBT-Practice on your phone once and your question sets stay available offline. Open <a href="${escapeHtml(base)}" style="color:${COLORS.orangeText};font-weight:600;">cbtpractice.ng</a> in Chrome or Safari, then choose <strong>Add to Home screen</strong> from the browser menu.
          </p>
        </td>
      </tr>
    </table>
    ${paragraph(
      `When you are ready for unlimited access, one payment covers <strong>12 months</strong> of every exam board, subject and year — and nothing renews automatically. <a href="${escapeHtml(pricingUrl)}" style="color:${COLORS.blue};font-weight:600;">See what is included</a>.`
    )}
    ${paragraph(
      `Good luck with your preparation,<br /><strong style="color:${COLORS.slate900};">The CBT-Practice team</strong>`
    )}
    ${paragraph(
      `Tip: keep this email — if you ever get stuck, just reply to it and it comes straight to us.`,
      { color: COLORS.slate500, size: 13 }
    )}
  `;

  const subject = oneLine(`Welcome to CBT-Practice, ${firstName} 🎉`, 140);
  const text = [
    `Hi ${firstName},`,
    "",
    "Your CBT-Practice account is ready — welcome aboard. You can start practising",
    "right now, and you do not need a card to begin.",
    "",
    "YOUR FREE PRACTICE IS LIVE",
    `You have ${trialLimit} free questions on your account. They are timed and marked`,
    "the way the real CBT exam works, so your first attempt already tells you",
    "something useful.",
    "",
    `Start here: ${practiceUrl}`,
    "",
    "WHAT YOU CAN DO TODAY",
    ...whatsInside.map((item) => `- ${item}`),
    "",
    "PRACTISE WITHOUT DATA",
    "Install CBT-Practice on your phone once and your question sets stay available",
    `offline. Open ${base} in Chrome or Safari, then choose "Add to Home screen"`,
    "from the browser menu.",
    "",
    "When you are ready for unlimited access, one payment covers 12 months of every",
    "exam board, subject and year — and nothing renews automatically.",
    pricingUrl,
    "",
    "Good luck with your preparation,",
    "The CBT-Practice team",
    "",
    "Tip: keep this email — if you ever get stuck, just reply to it and it comes",
    `straight to us. You can also write to ${contactEmail}.`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preheader: `Your ${trialLimit} free questions are ready — start practising for JAMB, WAEC and POST UTME.`,
      heading: `Welcome to CBT-Practice, ${firstName} 🎉`,
      bodyHtml,
      siteUrl: base,
      contactEmail,
      footerNote:
        "You are receiving this because you created a CBT-Practice account with this address.",
    }),
  };
}

/**
 * The support-desk notification for a contact-form submission.
 *
 * Header fields are single-lined; the message body is escaped and rendered with
 * preserved line breaks because it is free text written by a stranger. The
 * sender is put in Reply-To by the route handler, so replying answers them.
 */
export function contactMessageEmail({
  name,
  email,
  message,
  submittedAt,
  ipHash,
  replyTo,
  siteUrl,
  contactEmail,
}) {
  const safeName = oneLine(name, 80);
  const safeEmail = oneLine(email, 254);
  const when = submittedAt
    ? new Date(submittedAt).toUTCString()
    : new Date().toUTCString();
  const safeMessage = String(message ?? "").slice(0, 5000);

  const metaRow = (label, value) => `<tr>
    <td style="padding:6px 12px 6px 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.slate400};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;line-height:1.6;color:${COLORS.slate900};word-break:break-word;">${value}</td>
  </tr>`;

  const bodyHtml = `
    ${paragraph(
      `A message came in through the contact form on cbtpractice.ng. <strong>Reply to this email</strong> to answer ${escapeHtml(safeName)} directly.`
    )}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;">
      ${metaRow("From", escapeHtml(safeName))}
      ${metaRow(
        "Email",
        `<a href="mailto:${escapeHtml(safeEmail)}" style="color:${COLORS.blue};text-decoration:none;">${escapeHtml(safeEmail)}</a>`
      )}
      ${metaRow("Received", escapeHtml(when))}
      ${
        ipHash
          ? metaRow(
              "IP hash",
              `<span style="color:${COLORS.slate500};font-family:monospace;">${escapeHtml(ipHash)}</span>`
            )
          : ""
      }
    </table>
    <div style="margin:20px 0 0;padding:16px 18px;background:${COLORS.cream};border:1px solid ${COLORS.border};border-radius:12px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.slate400};">Message</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:${COLORS.slate900};white-space:pre-wrap;">${escapeHtml(safeMessage)}</p>
    </div>
    ${button(
      `mailto:${safeEmail}?subject=${encodeURIComponent("Re: your message to CBT-Practice")}`,
      `Reply to ${safeName}`
    )}
  `;

  return {
    subject: oneLine(`New contact message from ${safeName} (${safeEmail})`, 160),
    text: [
      "New message via the CBT-Practice contact form.",
      "",
      `Name:     ${safeName}`,
      `Email:    ${safeEmail}`,
      `Received: ${when}`,
      ...(ipHash ? [`IP hash:  ${ipHash}`] : []),
      "",
      "Message",
      "-------",
      safeMessage,
      "",
      `Reply to this email to answer ${safeName} directly (${replyTo || safeEmail}).`,
      `Support inbox: ${contactEmail}`,
    ].join("\n"),
    html: layout({
      preheader: `New contact message from ${safeName}`,
      heading: "New message via the website",
      bodyHtml,
      siteUrl: String(siteUrl || "https://www.cbtpractice.ng").replace(/\/+$/, ""),
      contactEmail,
      footerNote:
        "Sent by the contact form at cbtpractice.ng. The sender's address is in Reply-To.",
      accent: COLORS.orange,
    }),
  };
}

/**
 * Renders one admin-editable campaign for one student.
 *
 * The admin only edits plain text; this function owns every piece of HTML. The
 * body is escaped *after* interpolation, so a name containing `<` cannot inject
 * markup, and blank lines become paragraphs. The opt-out link is part of the
 * footer, which is why the engine refuses to run without an unsubscribe secret.
 */
export function renderCampaignEmail({
  campaign,
  user,
  siteUrl,
  contactEmail,
  unsubscribeUrl: optOutUrl = null,
  optOutLead = "Prefer not to get these progress emails?",
  optOutTextLabel = "Unsubscribe from progress emails",
  footerNote = "You are receiving this because you have a CBT-Practice account.",
  signOff = "Good luck with your preparation,",
}) {
  const base = String(siteUrl || "https://www.cbtpractice.ng").replace(/\/+$/, "");
  const variables = previewVariables(user, base);

  const subject =
    oneLine(interpolate(campaign.subject, variables), 140) || campaign.name;
  const heading =
    oneLine(interpolate(campaign.heading, variables), 120) || campaign.name;

  const paragraphs = escapeHtml(interpolate(campaign.body, variables))
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => paragraph(block.replace(/\n/g, "<br />")))
    .join("");

  const ctaHref = String(campaign.ctaPath ?? "/").startsWith("http")
    ? campaign.ctaPath
    : `${base}${campaign.ctaPath}`;

  const footerHtml = optOutUrl
    ? `${escapeHtml(optOutLead)} <a href="${escapeHtml(optOutUrl)}" style="color:${COLORS.slate500};text-decoration:underline;">Unsubscribe</a>.`
    : "";

  const provider = `<strong style="color:${COLORS.slate900};">The CBT-Practice team</strong>`;
  const signOffHtml = signOff
    ? `${escapeHtml(signOff)}<br />${provider}`
    : provider;

  const bodyHtml = `
    ${paragraphs}
    ${button(ctaHref, campaign.ctaLabel)}
    ${paragraph(signOffHtml)}
  `;

  const textLines = [
    interpolate(campaign.heading, variables),
    "",
    interpolate(campaign.body, variables),
    "",
    `${campaign.ctaLabel}: ${ctaHref}`,
  ];
  if (signOff) textLines.push("", signOff);
  textLines.push("", "The CBT-Practice team");
  if (optOutUrl) {
    textLines.push("", `${optOutTextLabel}: ${optOutUrl}`);
  }
  if (contactEmail) {
    textLines.push("", `Questions? Write to ${contactEmail}.`);
  }

  return {
    subject,
    text: textLines.join("\n"),
    html: layout({
      preheader: subject,
      heading,
      bodyHtml,
      siteUrl: base,
      contactEmail,
      footerNote,
      footerHtml,
    }),
  };
}

/**
 * Renders a one-off admin broadcast (or a saved template) for one recipient.
 *
 * Broadcasts are not "progress" emails, so the wording differs from a campaign:
 * the sign-off drops the exam-prep line and the opt-out talks about "these
 * emails". Everything else — escaping, paragraph splitting, the CTA button — is
 * shared with campaigns, so a broadcast can never render markup an admin typed.
 */
export function renderBroadcastEmail({
  content,
  user,
  siteUrl,
  contactEmail,
  unsubscribeUrl: optOutUrl = null,
}) {
  return renderCampaignEmail({
    campaign: {
      name: content.subject,
      subject: content.subject,
      heading: content.heading,
      body: content.body,
      ctaLabel: content.ctaLabel,
      ctaPath: content.ctaPath,
    },
    user,
    siteUrl,
    contactEmail,
    unsubscribeUrl: optOutUrl,
    optOutLead: "Prefer not to receive these emails?",
    optOutTextLabel: "Unsubscribe from these emails",
    footerNote: "You are receiving this because you have a CBT-Practice account.",
    signOff: "Best regards,",
  });
}



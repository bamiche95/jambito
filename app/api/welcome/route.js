import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { TRIAL_LIMIT } from "@/lib/plans";
import { requireApiUser } from "@/lib/serverAuth";
import { getUsersCollection } from "@/lib/users";
import { getContactInbox, isMailConfigured, sendMail } from "@/lib/mailer";
import { welcomeEmail } from "@/lib/emailTemplates";

/**
 * POST /api/welcome  -> { success, sent, reason? }
 *
 * Sends the one-off welcome mail for the signed-in account. The client calls
 * this fire-and-forget right after a brand-new sign-up (email registration, or
 * a Google popup that reports `isNewUser`), so a mail outage never blocks the
 * sign-up itself.
 *
 * Idempotency lives in MongoDB, not in the caller: `welcomeEmailSentAt` is
 * claimed with a conditional `findOneAndUpdate`, so the second of two racing
 * requests (StrictMode double effect, retried fetch) finds nothing to claim and
 * answers `sent: false`. If SMTP rejects the message the claim is released so a
 * later attempt can still deliver it.
 *
 * Only accounts created in the last week are eligible — that keeps the endpoint
 * from mailing every long-standing user if it is ever called for one.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const NEW_ACCOUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function fail(status, code, message) {
  return NextResponse.json(
    { success: false, code, message },
    { status, headers: NO_STORE }
  );
}

export async function POST(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return fail(auth.status, auth.code, auth.message);
  }

  const { decoded, user } = auth;
  const email = String(decoded.email ?? user?.email ?? "").trim();
  if (!email) {
    return fail(400, "no_email", "This account has no email address to write to.");
  }

  if (!isMailConfigured()) {
    // 503, not 502: the deployment is missing credentials, nothing is broken on
    // the student's side, and the client treats the failure as non-fatal.
    return fail(
      503,
      "not_configured",
      "Mail is not configured on this deployment (set SMTP_USER and SMTP_PASSWORD)."
    );
  }

  const users = await getUsersCollection();
  const cutoff = new Date(Date.now() - NEW_ACCOUNT_WINDOW_MS);
  const claim = await users.findOneAndUpdate(
    {
      _id: decoded.uid,
      welcomeEmailSentAt: { $exists: false },
      createdAt: { $gte: cutoff },
    },
    { $set: { welcomeEmailSentAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!claim) {
    return NextResponse.json(
      { success: true, sent: false, reason: "already_sent_or_not_new" },
      { headers: NO_STORE }
    );
  }

  const template = welcomeEmail({
    name: decoded.name ?? user?.displayName ?? "",
    email,
    siteUrl: SITE_URL,
    contactEmail: getContactInbox(),
    trialLimit: TRIAL_LIMIT,
  });

  try {
    await sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
    return NextResponse.json({ success: true, sent: true }, { headers: NO_STORE });
  } catch (error) {
    // Release the claim so the next sign-in can try again.
    await users
      .updateOne({ _id: decoded.uid }, { $unset: { welcomeEmailSentAt: "" } })
      .catch((unsetError) =>
        console.error("[welcome] could not release claim:", unsetError?.message ?? unsetError)
      );

    console.error(
      `[welcome] send failed for ${decoded.uid} (${error?.code ?? "error"}):`,
      error?.message ?? error
    );
    return fail(502, "send_failed", "The welcome email could not be sent.");
  }
}

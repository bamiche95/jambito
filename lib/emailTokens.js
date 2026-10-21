import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless unsubscribe links.
 *
 * An email must carry a working opt-out without the app storing a token per
 * recipient, so the link is `uid` + an HMAC of that uid. The signature is
 * verified with `timingSafeEqual`, and the secret never leaves the server.
 *
 * `CRON_SECRET` is accepted as a fallback because a deployment that already has
 * a cron needs no second secret to be able to send compliant email; setting
 * `EMAIL_UNSUBSCRIBE_SECRET` is still preferred, so rotating the cron token does
 * not invalidate every unsubscribe link already sitting in an inbox.
 */

const CONTEXT = "cbtpractice:unsubscribe:";

function getSecret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    ""
  ).trim();
}

/** False means campaign email must not be sent at all (no opt-out link). */
export function isUnsubscribeConfigured() {
  return Boolean(getSecret());
}

export function createUnsubscribeToken(uid) {
  const secret = getSecret();
  const id = String(uid ?? "").trim();
  if (!secret || !id) return null;
  return createHmac("sha256", secret)
    .update(`${CONTEXT}${id}`)
    .digest("base64url");
}

export function verifyUnsubscribeToken(uid, token) {
  const expected = createUnsubscribeToken(uid);
  if (!expected || typeof token !== "string" || !token) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(token, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The absolute unsubscribe URL for one account, or `null` when no secret is
 * configured. Callers must treat `null` as "do not send": email without a
 * working opt-out is exactly what this feature exists to avoid.
 */
export function unsubscribeUrl(siteUrl, uid) {
  const token = createUnsubscribeToken(uid);
  if (!token) return null;
  const base = String(siteUrl ?? "").replace(/\/+$/, "");
  return `${base}/unsubscribe?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
}

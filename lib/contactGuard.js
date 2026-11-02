import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getMongoClient } from "@/lib/mongodb";

/**
 * Server-side guards for the public contact form.
 *
 * The form has no account behind it, so every check has to live in the route
 * handler. Three cheap layers stop the bots that actually hit a small Nigerian
 * exam site — scripted form fillers and bulk "SEO" spam — without a CAPTCHA or a
 * third-party script:
 *
 *   1. a honeypot field (checked by the route),
 *   2. this signed timing token, issued when the form mounts, which a bot must
 *      fetch and then wait out before its POST is accepted,
 *   3. rate limits persisted in MongoDB, so they hold across serverless
 *      instances instead of resetting with every cold start.
 *
 * The token secret is `CONTACT_TOKEN_SECRET`, falling back to the mailbox
 * password so a deployment that only sets the SMTP credentials still works.
 * Rotating either value invalidates outstanding tokens (they simply fail and
 * the visitor's next page load issues a new one).
 */

const TOKEN_VERSION = 1;

/** A human needs at least this long to read the form and write a message. */
export const MIN_FILL_MS = 3_000;

/** Tokens older than this are stale even if the signature is valid. */
export const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IP_WINDOW_MAX = 4;
const IP_DAY_MAX = 15;
const EMAIL_DAY_MAX = 5;

function tokenSecret() {
  const value = (
    process.env.CONTACT_TOKEN_SECRET ||
    process.env.SMTP_PASSWORD ||
    ""
  ).trim();
  if (!value) {
    const error = new Error(
      "CONTACT_TOKEN_SECRET (or SMTP_PASSWORD) must be set to issue contact-form tokens."
    );
    error.code = "contact_token_unconfigured";
    throw error;
  }
  return value;
}

function sign(payload) {
  return createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

/**
 * Issues a token. `issuedAt`/`minAgeMs` go back to the client so a form whose
 * first token request failed can still wait out the minimum age before posting.
 */
export function createContactToken() {
  const issuedAt = Date.now();
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${TOKEN_VERSION}.${issuedAt}.${nonce}`;
  return {
    token: `${payload}.${sign(payload)}`,
    issuedAt,
    minAgeMs: MIN_FILL_MS,
  };
}

/**
 * Verifies signature and age.
 *
 * `reason` is deliberately specific enough for a friendly message but never
 * tells a bot whether it guessed a format right: every malformed token is
 * simply "invalid".
 */
export function verifyContactToken(token) {
  if (typeof token !== "string" || token.length > 200) {
    return { ok: false, reason: "invalid" };
  }

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "invalid" };

  const [version, issued, nonce, signature] = parts;
  if (Number(version) !== TOKEN_VERSION) return { ok: false, reason: "invalid" };
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const expected = Buffer.from(sign(`${version}.${issued}.${nonce}`), "utf8");
  const provided = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  const age = Date.now() - issuedAt;
  if (age < 0 || age > TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  if (age < MIN_FILL_MS) {
    return { ok: false, reason: "too_fast", waitMs: MIN_FILL_MS - age };
  }
  return { ok: true };
}

/** Hashes an IP or email so the rate-limit store never holds raw identifiers. */
export function hashValue(value) {
  return createHash("sha256")
    .update(String(value ?? "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Best-effort client IP. Vercel sets `x-forwarded-for` (client first, proxies
 * after); the header is spoofable in principle, which is exactly why the signed
 * token and the honeypot exist — the limiter only has to make bulk abuse slow.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Same-origin check for browser submits. Requests without an `Origin` header
 * (curl, server-side scripts) are left to the token + limits rather than being
 * rejected, so the endpoint stays testable.
 */
export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      .trim();
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Rough link-count heuristic: genuine support messages rarely carry five URLs. */
export function looksLikeSpam(message) {
  const links = String(message ?? "").match(/https?:\/\/|www\./gi) ?? [];
  return links.length > 4;
}

/**
 * Trims, strips control characters (including CR/LF, which have no business in a
 * name or subject) and caps the length. Message bodies keep their newlines —
 * callers pass `keepNewlines` for those.
 */
export function sanitizeField(value, max, { keepNewlines = false } = {}) {
  const pattern = keepNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(pattern, "")
    .trim()
    .slice(0, max);
}

/**
 * Pragmatic address check: one `@`, a dot in the domain, no spaces or the
 * characters that break a `RCPT TO` line. The real validation is the SMTP
 * server's answer; this only keeps obvious garbage out of the inbox.
 */
export function isValidEmail(value) {
  const email = String(value ?? "").trim();
  if (email.length < 6 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  return /^[^\s@<>()[\]\\,;:]+@[^\s@<>()[\]\\,;:]+\.[A-Za-z]{2,}$/.test(email);
}

const DB_NAME = process.env.MONGODB_DB ?? "jambito";

async function getThrottleCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection("contactThrottle");
}

let indexesReady = null;

/**
 * Mirrors the lazy index setup in lib/paymentsStore.js: a deployment that never
 * ran scripts/ensure-indexes.mjs still gets the TTL cleanup. Failure is logged
 * and retried on the next submission rather than blocking a real message.
 */
async function ensureIndexes(collection) {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    await collection.createIndex({ key: 1, at: -1 }, { name: "key_at" });
    await collection.createIndex(
      { at: 1 },
      { name: "at_ttl", expireAfterSeconds: 24 * 60 * 60 }
    );
  })().catch((error) => {
    console.error("[contactGuard] could not ensure indexes:", error);
    indexesReady = null;
    return undefined;
  });
  return indexesReady;
}

/**
 * Counts recent submissions for this IP and sender address, then records this
 * one. A Mongo outage fails OPEN (the message is still emailed, the token and
 * honeypot still apply) — losing a genuine support request is worse than
 * briefly missing a limit.
 */
export async function checkContactRateLimit({ ip, email }) {
  try {
    const throttle = await getThrottleCollection();
    await ensureIndexes(throttle);

    const now = Date.now();
    const ipKey = `ip:${hashValue(ip)}`;
    const emailKey = `email:${hashValue(email)}`;

    const [ipRecent, ipDay, emailDay] = await Promise.all([
      throttle.countDocuments({ key: ipKey, at: { $gte: new Date(now - WINDOW_MS) } }),
      throttle.countDocuments({ key: ipKey, at: { $gte: new Date(now - DAY_MS) } }),
      throttle.countDocuments({ key: emailKey, at: { $gte: new Date(now - DAY_MS) } }),
    ]);

    if (ipRecent >= IP_WINDOW_MAX) {
      return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
    }
    if (ipDay >= IP_DAY_MAX || emailDay >= EMAIL_DAY_MAX) {
      return { allowed: false, retryAfterSeconds: Math.ceil(DAY_MS / 1000) };
    }

    const at = new Date(now);
    await Promise.all([
      throttle.insertOne({ key: ipKey, kind: "ip", at }),
      throttle.insertOne({ key: emailKey, kind: "email", at }),
    ]);
    return { allowed: true };
  } catch (error) {
    console.error(
      "[contactGuard] rate limit unavailable, allowing this submission:",
      error?.message ?? error
    );
    return { allowed: true, degraded: true };
  }
}

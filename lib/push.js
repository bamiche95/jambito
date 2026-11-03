import webpush from "web-push";

/**
 * The Web Push transport (VAPID), server side only.
 *
 * Deliberately tiny and provider-neutral, the same shape as lib/brevo.js: one
 * place that knows how to hand a payload to the push service, and one place
 * that classifies what came back, so callers (routes, cron, scripts) never
 * import `web-push` directly.
 *
 * Two facts worth remembering:
 *
 *   - The payload is encrypted per subscription and the whole message must stay
 *     under 4 KB. We send short strings and a URL, never content.
 *   - A subscription is a URL plus two keys. When the browser is wiped, the app
 *     uninstalled, or permission revoked, the push service answers 404 or 410
 *     for ever after. That is `gone` below, and the caller must retire the row
 *     rather than pretend the send worked.
 *
 * VAPID keys are read from the environment on every call, not at module scope,
 * so unsetting them turns push off without a redeploy (see `isPushConfigured`).
 */

/** The public key is safe to hand to the browser; the private one never leaves. */
export function getVapidPublicKey() {
  return (process.env.PUSH_VAPID_PUBLIC ?? "").trim();
}

function getVapidPrivateKey() {
  return (process.env.PUSH_VAPID_PRIVATE ?? "").trim();
}

/**
 * `sub` must be a `mailto:` or `https:` URL: the push services use it to contact
 * the sender of a message that is being abused.
 */
export function getPushSubject() {
  const value = (process.env.PUSH_SUBJECT ?? "").trim();
  return value || "mailto:contact@cbtpractice.ng";
}

/** True when both halves of the VAPID keypair are present and usable. */
export function isPushConfigured() {
  try {
    configure();
    return true;
  } catch {
    return false;
  }
}

/**
 * What the client is told about the deployment. The public key is served from
 * the API rather than inlined as `NEXT_PUBLIC_*`, so it can be rotated without a
 * rebuild and a Preview deployment can never be missing it.
 */
export function getPushConfig() {
  const publicKey = getVapidPublicKey();
  let problem = null;
  try {
    configure();
  } catch (error) {
    problem = error?.message ?? String(error);
  }
  return {
    configured: Boolean(publicKey && getVapidPrivateKey()) && !problem,
    publicKey: publicKey || null,
    subject: getPushSubject(),
    problem,
  };
}

let configuredWith = null;

/**
 * `setVapidDetails` throws on a malformed key, so it doubles as the validity
 * check. Memoised on the exact key triple: env vars cannot change inside a
 * running function except between requests, and that case is covered because a
 * changed triple misses the cache.
 */
function configure() {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  if (!publicKey || !privateKey) {
    const error = new Error(
      "Push is not configured: set PUSH_VAPID_PUBLIC and PUSH_VAPID_PRIVATE."
    );
    error.code = "push_unconfigured";
    throw error;
  }

  const signature = `${publicKey}|${privateKey}|${getPushSubject()}`;
  if (configuredWith === signature) return;

  try {
    webpush.setVapidDetails(getPushSubject(), publicKey, privateKey);
    configuredWith = signature;
  } catch (error) {
    configuredWith = null;
    const wrapped = new Error(
      `VAPID keys are unusable (${error?.message || error}). Regenerate with ` +
        "`npx web-push generate-vapid-keys`."
    );
    wrapped.code = "push_misconfigured";
    throw wrapped;
  }
}

/**
 * Builds (but does not send) a request for one subscription.
 *
 * Used to reject a bad subscription at registration time instead of discovering
 * it on the first real send, which would otherwise look like a delivery problem.
 */
export function assertUsableSubscription(subscription) {
  try {
    configure();
  } catch (error) {
    return { ok: false, code: error?.code ?? "push_unconfigured", message: error?.message };
  }
  try {
    webpush.generateRequestDetails(subscription, "{}");
    return { ok: true };
  } catch (error) {
    return { ok: false, code: "push_invalid", message: error?.message || String(error) };
  }
}

/** The shape stored in Mongo, reduced to what `web-push` needs. */
function toWebPushSubscription(subscription) {
  return {
    endpoint: String(subscription.endpoint ?? ""),
    keys: {
      p256dh: String(subscription.keys?.p256dh ?? ""),
      auth: String(subscription.keys?.auth ?? ""),
    },
  };
}

export const PUSH_MAX_PAYLOAD_BYTES = 3_800;

/**
 * Sends one notification to one subscription.
 *
 * Never throws: a dead subscription is expected, not exceptional. The result is
 * one of
 *
 *   { ok: true }
 *   { ok: false, gone: true,  code: "push_gone",     status }
 *   { ok: false, gone: false, code: "push_rejected"|"push_unconfigured", ... }
 */
export async function sendPush(subscription, payload, { ttl = 86_400 } = {}) {
  if (!subscription?.endpoint) {
    return { ok: false, gone: false, code: "push_invalid", message: "No endpoint." };
  }

  let body;
  try {
    body = JSON.stringify(payload ?? {});
  } catch (error) {
    return {
      ok: false,
      gone: false,
      code: "push_invalid",
      message: `Payload is not JSON-serialisable: ${error?.message || error}`,
    };
  }

  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > PUSH_MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      gone: false,
      code: "push_too_large",
      message: `Payload is ${bytes} bytes; the limit is ${PUSH_MAX_PAYLOAD_BYTES}.`,
    };
  }

  try {
    configure();
  } catch (error) {
    return {
      ok: false,
      gone: false,
      code: error?.code ?? "push_unconfigured",
      message: error?.message ?? String(error),
    };
  }

  try {
    await webpush.sendNotification(toWebPushSubscription(subscription), body, {
      TTL: Math.max(0, Math.round(Number(ttl) || 0)),
      // Reminders are not emergencies: "normal" avoids being throttled.
      urgency: "normal",
    });
    return { ok: true };
  } catch (error) {
    const status = error?.statusCode ?? null;
    // 404/410: the subscription is permanently gone. 403 is a VAPID key
    // mismatch — our problem, not the device's, so the row is kept.
    const gone = status === 404 || status === 410;
    return {
      ok: false,
      gone,
      code: gone ? "push_gone" : "push_rejected",
      status,
      message: String(error?.body || error?.message || error).slice(0, 300),
    };
  }
}

/**
 * Sends the same payload to many subscriptions, bounded so a 500-device
 * broadcast cannot open 500 sockets at once (and exceed the function's memory).
 */
export async function sendPushBatch(subscriptions, payload, { concurrency = 12 } = {}) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  const results = new Array(list.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await sendPush(list[index], payload);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), list.length || 1) }, worker)
  );

  return {
    total: list.length,
    sent: results.filter((result) => result?.ok).length,
    gone: results.filter((result) => result?.gone).length,
    failed: results.filter((result) => result && !result.ok && !result.gone).length,
    results,
  };
}

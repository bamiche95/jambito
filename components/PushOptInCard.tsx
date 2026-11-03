"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BellRing, Check, Loader2, Send, ShieldAlert, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isIos, isRunningStandalone } from "@/lib/pwa-install";
import {
  disablePush,
  enablePush,
  fetchPushState,
  getPushPermission,
  isPushSupported,
  saveNotificationPrefs,
  sendTestPush,
} from "@/lib/pushClient";
import type { NotificationPrefs, PushState } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The one place a student is asked for notification permission.
 *
 * Web Push permission is a single, permanent decision per browser: Chrome and
 * Safari both remember a "block" until the visitor changes site settings, and
 * iOS refuses even to show the prompt outside an installed app. That shapes
 * everything here —
 *
 *   - nothing is requested on mount, only after a tap (`enable`);
 *   - `variant="nudge"` is the low-key ask shown once a set has been finished,
 *     which is the value moment (see components/cbt/CbtPractice.tsx);
 *   - `variant="panel"` is the full control on the profile page: state, the
 *     test button, the three campaign toggles, and the way back out;
 *   - an unconfigured deployment (no VAPID keys) renders nothing at all, so a
 *     Preview build never shows a button that cannot work.
 */

/** Shown once per session after a test, then quiet again. */
const NUDGE_DISMISS_KEY = "jambito:push-nudge-dismissed";

const subscribeNever = () => () => {};
const readSupported = () => isPushSupported();
const readPermission = () => getPushPermission();
const readSupportedOnServer = () => false;
const readPermissionOnServer = () => "unsupported" as const;

/**
 * iOS in a tab has no PushManager, so the only way in is Share -> Add to Home
 * Screen. Read through `useSyncExternalStore` so the server render never
 * touches `navigator` (this component is prerendered with the rest of the page).
 */
const readIosNeedsInstall = () =>
  isIos(navigator.userAgent, navigator.maxTouchPoints > 0) && !isRunningStandalone(window);
const readIosOnServer = () => false;

/**
 * A "Not now" tap is remembered for the session in storage, and read here so
 * the choice survives a remount without an effect writing state on mount.
 */
const readNudgeDismissed = () => {
  try {
    return globalThis.sessionStorage?.getItem(NUDGE_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};
const readNudgeDismissedOnServer = () => false;

type Notice = { kind: "ok" | "error" | "info"; text: string };

export default function PushOptInCard({ variant = "panel" }: { variant?: "panel" | "nudge" }) {
  const { user, getIdToken } = useAuth();
  const supported = useSyncExternalStore(
    subscribeNever,
    readSupported,
    readSupportedOnServer
  );
  // Re-read on every render; `bump()` below is what makes a permission change
  // (default -> granted) visible without a second subscription.
  const permission = useSyncExternalStore(
    subscribeNever,
    readPermission,
    readPermissionOnServer
  );
  const iosNeedsInstall = useSyncExternalStore(
    subscribeNever,
    readIosNeedsInstall,
    readIosOnServer
  );

  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | "prefs" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const sessionDismissed = useSyncExternalStore(
    subscribeNever,
    readNudgeDismissed,
    readNudgeDismissedOnServer
  );
  const dismissed = dismissedNow || sessionDismissed;

  // Load the account's push state once the auth user is known. Every state
  // update happens in the promise callbacks — never synchronously in the effect
  // body — which is both what the react-hooks lint rule requires and what the
  // rest of the admin panels do.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getIdToken()
      .then((token) => (token ? fetchPushState(token) : null))
      .then((next) => {
        if (!cancelled && next) setState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getIdToken, user]);

  const subscribed = (state?.devices.length ?? 0) > 0;

  const enable = useCallback(async () => {
    setBusy("enable");
    setNotice(null);
    const token = await getIdToken();
    if (!token) {
      setBusy(null);
      setNotice({ kind: "error", text: "Please sign in again to turn reminders on." });
      return;
    }
    const result = await enablePush(token);
    if (result.ok) {
      const next = await fetchPushState(token);
      if (next) setState(next);
      setNotice({ kind: "ok", text: "Reminders are on. We'll keep it to exam-relevant updates." });
    } else {
      setNotice({ kind: "error", text: result.message ?? "Could not turn reminders on." });
    }
    bump();
    setBusy(null);
  }, [bump, getIdToken]);

  const disable = useCallback(async () => {
    setBusy("disable");
    setNotice(null);
    const token = await getIdToken();
    if (!token) {
      setBusy(null);
      return;
    }
    const result = await disablePush(token);
    if (result.ok) {
      const next = await fetchPushState(token);
      if (next) setState(next);
      setNotice({ kind: "info", text: "Reminders are off for this device." });
    } else {
      setNotice({ kind: "error", text: result.message ?? "Could not turn reminders off." });
    }
    bump();
    setBusy(null);
  }, [bump, getIdToken]);

  const test = useCallback(async () => {
    setBusy("test");
    setNotice(null);
    const token = await getIdToken();
    if (!token) {
      setBusy(null);
      return;
    }
    const result = await sendTestPush(token);
    setNotice({
      kind: result.success ? "ok" : "error",
      text:
        result.message ??
        (result.success ? "Test sent." : "The test could not be delivered."),
    });
    setBusy(null);
  }, [getIdToken]);

  const setPref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      if (!state) return;
      setBusy("prefs");
      // Optimistic: the toggle must not lag behind the finger. A failure puts
      // the server's answer back below.
      setState({ ...state, prefs: { ...state.prefs, [key]: value } });
      const token = await getIdToken();
      const result = token
        ? await saveNotificationPrefs(token, { [key]: value } as Partial<NotificationPrefs>)
        : { ok: false, message: "Please sign in again." };
      if (!result.ok && result.message) {
        setNotice({ kind: "error", text: result.message });
        const fresh = token ? await fetchPushState(token) : null;
        if (fresh) setState(fresh);
      }
      setBusy(null);
    },
    [getIdToken, state]
  );

  const notNow = useCallback(() => {
    try {
      globalThis.sessionStorage?.setItem(NUDGE_DISMISS_KEY, "1");
    } catch {
      // Ignore: the in-memory flag still applies this session.
    }
    setDismissedNow(true);
  }, []);

  // Nothing to offer: signed out, or this deployment has no VAPID keys. The
  // nudge is silent about both; the panel explains the iOS case, because that
  // is the one a student can actually fix.
  if (!user) return null;
  if (!supported) {
    if (variant === "nudge") return null;
    return (
      <Shell>
        <Header title="Notifications" />
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          {iosNeedsInstall
            ? "On iPhone, notifications only work in the installed app: tap Share, then Add to Home Screen, and open it from there."
            : "This browser cannot show notifications. Try Chrome on Android, or the installed app."}
        </p>
      </Shell>
    );
  }
  if (!state?.configured) return null;
  // "Not now" silences the result-card ask for the session only; the profile
  // panel stays available, because that is where you go to change your mind.
  if (dismissed && variant === "nudge") return null;
  // A nudge is only useful before the decision is made.
  if (
    variant === "nudge" &&
    (subscribed || (permission !== "granted" && permission !== "default"))
  ) {
    return null;
  }

  const enableButton = (
    <button
      type="button"
      onClick={enable}
      disabled={busy !== null}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
    >
      {busy === "enable" ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <BellRing className="h-4 w-4" aria-hidden />
      )}
      {busy === "enable" ? "Turning on…" : "Turn on reminders"}
    </button>
  );

  if (variant === "nudge") {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300">
            <BellRing className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Want a reminder to practise?
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-800/80 dark:text-blue-200/80">
              One short reminder a day, sent in the evening. No streaks, no spam.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {enableButton}
              <button
                type="button"
                onClick={notNow}
                className="rounded-lg px-3 py-2 text-sm font-medium text-blue-900/60 transition-transform active:scale-95 dark:text-blue-200/60"
              >
                Not now
              </button>
            </div>
            {notice && <NoticeLine notice={notice} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <Header
        title="Notifications"
        aside={
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              subscribed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
            )}
          >
            {subscribed ? "On" : "Off"}
          </span>
        }
      />

      {!subscribed ? (
        <>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            One short reminder a day when a practice set fits, plus trial and exam
            updates. Nothing else — and you can switch it off here any time.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {permission === "denied" ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Notifications are blocked for this site. Open your browser&apos;s site
                settings, allow notifications for cbtpractice.ng, then reload this page.
              </p>
            ) : (
              enableButton
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            On for {state.devices.length} device{state.devices.length === 1 ? "" : "s"} — we
            send from here, so there is no setting to repeat on each phone.
          </p>

          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            {state.devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {device.platform}
                  {device.failureCount > 0 ? " · retrying" : ""}
                </span>
                <span className="shrink-0">
                  {device.lastOkAt
                    ? `delivered ${new Date(device.lastOkAt).toLocaleDateString()}`
                    : "not delivered yet"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2">
            <Toggle
              label="Daily practice reminder"
              hint="One nudge a day, sent in the evening if you have not practised."
              checked={state.prefs.dailyReminder}
              disabled={busy === "prefs"}
              onChange={(value) => setPref("dailyReminder", value)}
            />
            <Toggle
              label="Free trial progress"
              hint="How many of your 40 free questions are left."
              checked={state.prefs.trialProgress}
              disabled={busy === "prefs"}
              onChange={(value) => setPref("trialProgress", value)}
            />
            <Toggle
              label="Product updates"
              hint="New subjects, new features. Rare."
              checked={state.prefs.productUpdates}
              disabled={busy === "prefs"}
              onChange={(value) => setPref("productUpdates", value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={test}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {busy === "test" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Send a test
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {busy === "disable" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Turn off on this device
            </button>
          </div>
        </>
      )}

      {notice && <NoticeLine notice={notice} />}
    </Shell>
  );
}

/** The card the profile page renders. Matches the other profile sections. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {children}
    </section>
  );
}

function Header({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
          Reminders
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p
      role="status"
      className={cn(
        "mt-3 rounded-lg px-3 py-2 text-xs leading-5",
        notice.kind === "ok"
          ? "bg-emerald-50 text-emerald-800"
          : notice.kind === "error"
            ? "bg-red-50 text-red-700"
            : "bg-slate-50 text-slate-600"
      )}
    >
      {notice.text}
    </p>
  );
}

/**
 * A checkbox row rather than a switch: it is the control browsers style
 * correctly for keyboard and screen-reader users without extra ARIA, and it
 * survives the app's dark cards unchanged.
 */
function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5",
        disabled && "opacity-60"
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
      />
    </label>
  );
}

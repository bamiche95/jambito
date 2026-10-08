"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  Download,
  EllipsisVertical,
  Share,
  Smartphone,
  WifiOff,
  X,
} from "lucide-react";
import {
  dismissInstall,
  getInstallServerSnapshot,
  getInstallSnapshot,
  isIos,
  promptInstall,
  restoreInstallDismissal,
  subscribeToInstall,
  type InstallSnapshot,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

/**
 * Install-to-home-screen affordance.
 *
 * The old version rendered nothing at all until Chrome fired
 * `beforeinstallprompt`, which meant iOS (where that event does not exist) and
 * every browser that never fires it saw a dead end. This renders a device
 * "feature row" instead, and opens a native-feeling bottom sheet: tap-to-install
 * when the browser supports it, otherwise explicit Share / menu steps. Both call
 * sites on the home page sit on dark sections, hence the translucent styling.
 *
 * It is mounted twice on the home page, so all shared state lives in
 * `lib/pwa-install.ts` rather than in this component.
 */

function useInstall(): InstallSnapshot {
  return useSyncExternalStore(
    subscribeToInstall,
    getInstallSnapshot,
    getInstallServerSnapshot
  );
}

/**
 * Client-only reads go through `useSyncExternalStore` with a never-firing
 * subscribe: the user agent is not available while server rendering, and the
 * server snapshot (`false`) keeps the hydration render identical.
 */
const subscribeNever = () => () => {};
const readIsIos = () => isIos(navigator.userAgent, navigator.maxTouchPoints > 0);
const readIsIosOnServer = () => false;

export default function InstallPwaBanner() {
  const install = useInstall();
  const [requested, setRequested] = useState(false);
  const ios = useSyncExternalStore(subscribeNever, readIsIos, readIsIosOnServer);
  const titleId = useId();

  // Opening is a request, not a state: once the app is installed the sheet is
  // closed by derivation instead of by an effect that writes state.
  const open = requested && !install.installed;

  const close = useCallback(() => setRequested(false), []);

  // sessionStorage is client-only and echoed into the shared store, so it is
  // applied after mount to keep the server and client markup identical.
  useEffect(() => {
    restoreInstallDismissal();
  }, []);

  if (install.installed) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-emerald-400">
        <Check className="h-4 w-4" aria-hidden />
        Installed — open CBT-Practice from your home screen.
      </p>
    );
  }

  const notNow = () => {
    dismissInstall();
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setRequested(true)}
        className={cn(
          "group inline-flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/15 px-4 py-3 text-left text-white backdrop-blur transition-transform duration-150 active:scale-[0.98] md:w-auto",
          install.dismissed
            ? "bg-white/5 opacity-80"
            : "bg-white/10 md:hover:bg-white/15"
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Install the app</span>
          {!install.dismissed && (
            <span className="block text-xs text-white/70">
              Full screen · works offline · no store needed
            </span>
          )}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-white/60 transition-transform group-active:translate-x-0.5"
          aria-hidden
        />
      </button>

      {open && (
        <InstallDrawer
          install={install}
          ios={ios}
          titleId={titleId}
          onClose={close}
          onNotNow={notNow}
        />
      )}
    </>
  );
}

interface InstallDrawerProps {
  install: InstallSnapshot;
  ios: boolean;
  titleId: string;
  onClose: () => void;
  onNotNow: () => void;
}

function InstallDrawer({
  install,
  ios,
  titleId,
  onClose,
  onNotNow,
}: InstallDrawerProps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<
    "accepted" | "dismissed" | "unavailable" | null
  >(null);

  // Escape closes the sheet, and the page behind it must not scroll.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleInstall = async () => {
    setBusy(true);
    const result = await promptInstall();
    setBusy(false);
    setOutcome(result);
    if (result === "accepted") onClose();
  };

  const steps = ios
    ? [
        "Tap the Share button (square with an arrow) in Safari's toolbar.",
        'Scroll down and choose "Add to Home Screen".',
        'Tap "Add" — the icon lands on your home screen.',
      ]
    : [
        "Open your browser menu (⋮ or …).",
        'Choose "Install app" or "Add to Home screen".',
        "Confirm — it opens like any other installed app.",
      ];

  const bullet =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-blue-600 dark:bg-slate-800/60 dark:text-blue-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Close install instructions"
        onClick={onClose}
        className="animate-backdrop-in absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-sm motion-reduce:animate-none"
      />

      {/* The sheet itself: rounded top corners, grab handle, slides up. */}
      <div className="pb-safe animate-sheet-in relative w-full max-w-lg rounded-t-3xl border-t border-slate-200 bg-white px-5 pt-3 shadow-2xl motion-reduce:animate-none dark:border-slate-700 dark:bg-slate-900">
        <div
          aria-hidden
          className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"
        />

        <div className="mt-5 flex items-start gap-4">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 dark:border-slate-700"
          />
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Install CBT-Practice
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add it to your home screen for a full-screen app that keeps working
              with no network.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-400"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <li className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800/60">
            <span className={cn(bullet, "mx-auto mb-2")}>
              <WifiOff className="h-4 w-4" aria-hidden />
            </span>
            Works offline
          </li>
          <li className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800/60">
            <span className={cn(bullet, "mx-auto mb-2")}>
              <Smartphone className="h-4 w-4" aria-hidden />
            </span>
            Full screen
          </li>
          <li className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800/60">
            <span className={cn(bullet, "mx-auto mb-2")}>
              <Download className="h-4 w-4" aria-hidden />
            </span>
            No app store
          </li>
        </ul>

        <div className="mt-5">
          {install.canPrompt ? (
            <>
              <button
                type="button"
                onClick={handleInstall}
                disabled={busy}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                <Download className="h-5 w-5" aria-hidden />
                {busy ? "Opening…" : "Install app"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Your browser will ask you to confirm.
              </p>
            </>
          ) : (
            <>
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ios ? (
                  <>
                    <Share className="h-3.5 w-3.5" aria-hidden />
                    Share → Add to Home Screen
                  </>
                ) : (
                  <>
                    <EllipsisVertical className="h-3.5 w-3.5" aria-hidden />
                    Browser menu → Install app
                  </>
                )}
              </span>
              <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {outcome === "dismissed" && (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              No problem — you can install any time from your browser menu.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 pb-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Under 1 MB · no app store
          </span>
          <button
            type="button"
            onClick={onNotNow}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-transform active:scale-95 dark:text-slate-400"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** Quiet one-liner for places that only want to mention offline support. */
export function InstallHint() {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-slate-400">
      <Smartphone className="w-4 h-4" />
      Works offline — add to home screen for the best experience.
    </div>
  );
}

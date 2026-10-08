/**
 * PWA install state, deliberately kept out of React and free of any imports.
 *
 * Two reasons:
 * 1. The home page renders the install banner twice (hero + install section).
 *    A captured `beforeinstallprompt` event is single-use, so both banners have
 *    to observe one shared store instead of registering a listener each — with
 *    two listeners the second render used to overwrite the first state and the
 *    button could end up holding an already-consumed event.
 * 2. It is the one part of the mobile shell that can be exercised without a
 *    browser, so it holds all the branching (prompt replay, standalone
 *    detection, iOS detection, dismissal memory) while the component stays
 *    presentational.
 */

/** The non-standard event Chrome/Edge fire when the app is installable. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallSnapshot {
  /** The browser offered a native prompt we can replay on tap. */
  canPrompt: boolean;
  /** Already running standalone, or installed during this session. */
  installed: boolean;
  /** The student chose "Not now" earlier in this session. */
  dismissed: boolean;
}

/** sessionStorage key remembering a "Not now" tap for the rest of the session. */
export const INSTALL_DISMISS_KEY = "jambito:pwa-install-dismissed";

/** The minimum of `window` this module touches, so tests can pass a stub. */
export interface InstallWindow {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  /** `userAgent` is listed so the real `Navigator` satisfies this shape. */
  navigator?: { standalone?: boolean; userAgent?: string };
  matchMedia?: (query: string) => { matches: boolean };
}

const INITIAL: InstallSnapshot = {
  canPrompt: false,
  installed: false,
  dismissed: false,
};

// A single frozen snapshot is returned on the server and during hydration so
// the first client render matches the server markup exactly.
const SERVER_SNAPSHOT: InstallSnapshot = Object.freeze({ ...INITIAL });

let snapshot: InstallSnapshot = INITIAL;
let deferred: BeforeInstallPromptEvent | null = null;
let wired = false;
const listeners = new Set<() => void>();

function patch(next: Partial<InstallSnapshot>): void {
  const merged = { ...snapshot, ...next };
  if (
    merged.canPrompt === snapshot.canPrompt &&
    merged.installed === snapshot.installed &&
    merged.dismissed === snapshot.dismissed
  ) {
    return;
  }
  snapshot = merged;
  listeners.forEach((listener) => listener());
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot;
}

export function getInstallServerSnapshot(): InstallSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeToInstall(listener: () => void): () => void {
  wireInstallListeners(window);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Attach the install listeners once per page load, no matter how many banners
 * are mounted. Also detects an already-installed app so we never invite someone
 * who is reading the page from their home screen to install it again.
 */
export function wireInstallListeners(target: InstallWindow): void {
  if (wired) return;
  wired = true;

  target.addEventListener("beforeinstallprompt", (event) => {
    // Swallow Chrome's own mini-infobar: the drawer is our surface for this.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    patch({ canPrompt: true });
  });

  target.addEventListener("appinstalled", () => {
    deferred = null;
    patch({ canPrompt: false, installed: true });
  });

  if (isRunningStandalone(target)) patch({ installed: true });
}

export function isRunningStandalone(target: InstallWindow): boolean {
  if (target.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari exposes the flag on navigator instead of a media query.
  return target.navigator?.standalone === true;
}

/**
 * True on iOS/iPadOS, where no `beforeinstallprompt` exists and only Safari's
 * Share → Add to Home Screen can install. iPadOS 13+ reports a desktop
 * "Macintosh" user agent, so a touch-capable Mac is treated as an iPad.
 */
export function isIos(userAgent: string, hasTouch: boolean): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return hasTouch && /Macintosh/.test(userAgent);
}

/**
 * Replays the captured prompt. A captured event can only be used once, so the
 * reference is cleared first — a second tap after a dismissal falls back to the
 * manual instructions instead of hanging on a dead event.
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferred;
  if (!event) return "unavailable";

  deferred = null;
  patch({ canPrompt: false });

  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/** "Not now" — remembered for the session so the banner goes quiet. */
export function dismissInstall(): void {
  try {
    globalThis.sessionStorage?.setItem(INSTALL_DISMISS_KEY, "1");
  } catch {
    // Private mode / storage disabled: the in-memory flag still applies.
  }
  patch({ dismissed: true });
}

/** Applied after mount so the server render is never storage-dependent. */
export function restoreInstallDismissal(): void {
  try {
    if (globalThis.sessionStorage?.getItem(INSTALL_DISMISS_KEY) === "1") {
      patch({ dismissed: true });
    }
  } catch {
    // Ignore: no storage means no memory, and the banner just stays visible.
  }
}

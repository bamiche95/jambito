"use client";

import {
  deleteAttempt,
  deletePracticeSession,
  deletePracticeSync,
  enqueuePracticeSync,
  getAttemptEntries,
  getAttempts,
  getPracticeSession,
  getPracticeSessions,
  getPracticeSyncQueue,
  saveAttempt,
  savePracticeSession,
} from "./offlineStore";
import type { AttemptRecord, PracticeSession } from "./types";
import { getFirebaseAuth } from "./firebase";

/**
 * Practice persistence for the UI: IndexedDB first, server second.
 *
 * Reads return the cached copy immediately and then merge in whatever the server
 * has, so History/Stats stay instant and still work offline. Writes are stored
 * locally and queued; the queue is a durable IndexedDB outbox, so a session
 * finished on a train is uploaded on the next connection instead of being lost.
 *
 * The server is authoritative for accounts, but never for a write that is still
 * pending: those local rows are newer than anything the list endpoint can know.
 */

interface PracticeAuth {
  uid: string;
  getIdToken: () => Promise<string | null>;
}

type ApiResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
};

let auth: PracticeAuth | null = null;
let bootstrappedUid: string | null = null;
let flushing = false;
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const IMPORT_FLAG_PREFIX = "jambito:practice-imported:";

/**
 * The account to write for.
 *
 * `AuthProvider` registers the signed-in user, but a child view's mount effect
 * runs *before* its parent's, so the first read on a page can happen before the
 * registration. Falling back to Firebase's own `currentUser` (populated as soon
 * as the auth listener fires) keeps that first read authenticated.
 */
function resolveAuth(): PracticeAuth | null {
  if (auth) return auth;
  const user = getFirebaseAuth().currentUser;
  return user ? { uid: user.uid, getIdToken: () => user.getIdToken() } : null;
}
/** Autosave is chatty by nature; 20s keeps writes rare without losing progress. */
const SESSION_UPLOAD_DELAY = 20_000;
/** A finished attempt is worth uploading promptly (it gates the emails). */
const WRITE_UPLOAD_DELAY = 2_000;

async function api(
  path: string,
  init: RequestInit = {},
  options: { keepalive?: boolean } = {}
): Promise<ApiResult> {
  const current = resolveAuth();
  if (!current) return { ok: false, status: 0, json: null };

  let token: string | null = null;
  try {
    token = await current.getIdToken();
  } catch {
    return { ok: false, status: 0, json: null };
  }
  if (!token) return { ok: false, status: 401, json: null };

  try {
    const response = await fetch(path, {
      ...init,
      keepalive: options.keepalive ?? false,
      // Without a timeout a half-open connection can leave the resume screen
      // waiting for the browser's default (minutes). Local data is still
      // served, and a timed-out write stays in the outbox.
      signal:
        !options.keepalive &&
        typeof AbortSignal !== "undefined" &&
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(10_000)
          : undefined,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const json = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { ok: response.ok, status: response.status, json };
  } catch {
    // Offline, DNS failure, aborted connection: the queue keeps the write.
    return { ok: false, status: 0, json: null };
  }
}

function wasImported(uid: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(`${IMPORT_FLAG_PREFIX}${uid}`));
  } catch {
    return false;
  }
}

function markImported(uid: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${IMPORT_FLAG_PREFIX}${uid}`, new Date().toISOString());
  } catch {
    // Storage disabled: the import is idempotent, so a repeat is harmless.
  }
}

/**
 * Rewrites pre-migration attempts under the stable `sessionId` the server
 * derives (`key|date`), deleting the old random-keyed row. Without this the
 * first merge after importing would show every legacy attempt twice.
 */
async function normalizeLocalAttempts(): Promise<void> {
  const entries = await getAttemptEntries();
  const kept = new Set<string>();
  for (const { id, record } of entries) {
    const ref = record.sessionId ?? `${record.key}|${record.date}`;
    if (id === ref) {
      kept.add(ref);
      continue;
    }
    if (kept.has(ref)) {
      await deleteAttempt(id);
      continue;
    }
    await saveAttempt({ ...record, sessionId: ref });
    await deleteAttempt(id);
    kept.add(ref);
  }
}

/**
 * Uploads the device-only history once per account.
 *
 * Guarded by a localStorage flag (per uid) and idempotent server-side, so a
 * cleared flag or a failed response can only repeat the same upserts.
 */
async function importLocalHistoryOnce(uid: string): Promise<void> {
  if (wasImported(uid)) return;
  const [allAttempts, allSessions] = await Promise.all([
    getAttempts(),
    getPracticeSessions(),
  ]);
  // Never upload another account's cached rows: the cache is device-wide, the
  // import is per account.
  const attempts = allAttempts.filter((row) => !row.uid || row.uid === uid);
  const sessions = allSessions.filter((row) => !row.uid || row.uid === uid);
  if (!attempts.length && !sessions.length) {
    markImported(uid);
    return;
  }
  const result = await api("/api/practice/import", {
    method: "POST",
    body: JSON.stringify({ attempts, sessions }),
  });
  if (result.ok) markImported(uid);
}

async function bootstrap(uid: string): Promise<void> {
  if (bootstrappedUid === uid) return;
  bootstrappedUid = uid;
  try {
    await normalizeLocalAttempts();
    await importLocalHistoryOnce(uid);
    await flushPracticeQueue();
  } catch (error) {
    console.error("practice sync bootstrap failed:", error);
    // Allow the online listener to try again in this session.
    bootstrappedUid = null;
  }
}

async function ensureReady(): Promise<void> {
  const current = resolveAuth();
  if (!current) return;
  if (bootstrappedUid !== current.uid) {
    await bootstrap(current.uid);
    return;
  }
  await flushPracticeQueue();
}

function scheduleFlush(id: string, delay: number): void {
  if (typeof window === "undefined") return;
  const existing = flushTimers.get(id);
  if (existing) clearTimeout(existing);
  flushTimers.set(
    id,
    setTimeout(() => {
      flushTimers.delete(id);
      void flushPracticeQueue();
    }, delay)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called by `AuthProvider` whenever the signed-in account changes.
 *
 * The first call for an account performs the one-time import of its local
 * history and drains anything queued while signed out.
 */
export function setPracticeAuthProvider(next: PracticeAuth | null): void {
  const uid = next?.uid ?? null;
  if (auth?.uid === uid) {
    auth = next;
    return;
  }
  auth = next;
  if (!uid) {
    bootstrappedUid = null;
    return;
  }
  void bootstrap(uid);
}

/** Stores a finished attempt locally, then queues it for upload. */
export async function recordAttempt(attempt: AttemptRecord): Promise<void> {
  const current = resolveAuth();
  const ref = attempt.sessionId ?? `${attempt.key}|${attempt.date}`;
  const record: AttemptRecord = {
    ...attempt,
    sessionId: ref,
    ...(current ? { uid: current.uid } : {}),
  };

  await saveAttempt(record);

  // Only clear the paused set when it belongs to this account: on a shared
  // device another student may have paused the same exam/subject/year.
  const paused = await getPracticeSession(record.key);
  if (!paused?.uid || !current || paused.uid === current.uid) {
    await deletePracticeSession(record.key);
  }

  if (!current) return;

  // The attempt POST removes the server-side session for this set, so a queued
  // autosave must not be allowed to resurrect it afterwards.
  await deletePracticeSync(`session:${current.uid}:${record.key}`);
  await deletePracticeSync(`session-delete:${current.uid}:${record.key}`);
  await enqueuePracticeSync({
    id: `attempt:${current.uid}:${ref}`,
    uid: current.uid,
    type: "attempt",
    payload: record,
    at: Date.now(),
  });
  scheduleFlush(`attempt:${ref}`, WRITE_UPLOAD_DELAY);
}

/** Stores a paused session locally, then schedules a debounced upload. */
export async function persistPracticeSession(
  session: PracticeSession
): Promise<void> {
  const current = resolveAuth();
  const record: PracticeSession = {
    ...session,
    ...(current ? { uid: current.uid } : {}),
  };
  await savePracticeSession(record);

  if (!current) return;
  await enqueuePracticeSync({
    id: `session:${current.uid}:${session.key}`,
    uid: current.uid,
    type: "session",
    payload: record,
    at: Date.now(),
  });
  scheduleFlush(`session:${session.key}`, SESSION_UPLOAD_DELAY);
}

/** Drops a paused session locally and on the server. */
export async function clearPracticeSession(key: string): Promise<void> {
  const paused = await getPracticeSession(key);
  const current = resolveAuth();
  if (!paused?.uid || !current || paused.uid === current.uid) {
    await deletePracticeSession(key);
  }

  if (!current) return;
  await deletePracticeSync(`session:${current.uid}:${key}`);
  await enqueuePracticeSync({
    id: `session-delete:${current.uid}:${key}`,
    uid: current.uid,
    type: "session-delete",
    key,
    at: Date.now(),
  });
  scheduleFlush(`session-delete:${key}`, WRITE_UPLOAD_DELAY);
}

/**
 * Cached attempts merged with the server's latest 200.
 *
 * A pending local attempt wins over its server copy, because the server may not
 * have received the newer score yet.
 */
export async function loadAttempts(
  options: { onUpdate?: (rows: AttemptRecord[]) => void } = {}
): Promise<AttemptRecord[]> {
  const current = resolveAuth();
  const cached = await getAttempts();
  if (!current) {
    options.onUpdate?.(cached);
    return cached;
  }

  // The IndexedDB cache is shared by every account that used this browser.
  // `uid` keeps one student's history out of another student's screen.
  const visible = (rows: AttemptRecord[]) =>
    rows.filter((row) => !row.uid || row.uid === current.uid);
  const emit = (rows: AttemptRecord[]) => {
    try {
      options.onUpdate?.(rows);
    } catch {
      // A view that unmounted mid-refresh must not break the merge.
    }
  };

  // Paint the cache first: History stays instant, the network call follows.
  emit(visible(cached));

  const result = await api("/api/practice/attempts?limit=200");
  const serverAttempts = result.json?.attempts;
  if (!result.ok || !Array.isArray(serverAttempts)) return visible(cached);

  const pending = new Set(
    (await getPracticeSyncQueue(current.uid)).flatMap((item) =>
      item.type === "attempt" && item.payload.sessionId
        ? [item.payload.sessionId]
        : []
    )
  );

  for (const value of serverAttempts) {
    const attempt = value as AttemptRecord;
    if (!attempt?.sessionId || pending.has(attempt.sessionId)) continue;
    await saveAttempt({ ...attempt, uid: current.uid });
  }
  const merged = visible(await getAttempts());
  emit(merged);
  return merged;
}

/** Cached paused sessions merged with the server's newest copy of each set. */
export async function loadPracticeSessions(
  options: { onUpdate?: (rows: PracticeSession[]) => void } = {}
): Promise<PracticeSession[]> {
  const current = resolveAuth();
  const cached = await getPracticeSessions();
  if (!current) {
    options.onUpdate?.(cached);
    return cached;
  }

  const visible = (rows: PracticeSession[]) =>
    rows.filter((row) => !row.uid || row.uid === current.uid);
  const emit = (rows: PracticeSession[]) => {
    try {
      options.onUpdate?.(rows);
    } catch {
      // Ignore a callback from an unmounted view.
    }
  };

  emit(visible(cached));

  const result = await api("/api/practice/sessions");
  const serverSessions = result.json?.sessions;
  if (!result.ok || !Array.isArray(serverSessions)) return visible(cached);

  const local = new Map(visible(cached).map((session) => [session.key, session]));
  for (const value of serverSessions) {
    const session = value as PracticeSession;
    const cachedSession = local.get(session.key);
    if (
      cachedSession &&
      new Date(cachedSession.updatedAt) >= new Date(session.updatedAt)
    ) {
      continue;
    }
    await savePracticeSession({ ...session, uid: current.uid });
  }
  const merged = visible(await getPracticeSessions());
  emit(merged);
  return merged;
}

/**
 * One paused session, for the resume flow.
 *
 * The local copy answers immediately (the normal case). Only when this device
 * has never seen the set do we wait for the server — that is the cross-device
 * resume. A background refresh keeps a stale local copy from lingering forever.
 */
export async function loadPracticeSession(
  key: string
): Promise<PracticeSession | null> {
  const current = resolveAuth();
  const local = await getPracticeSession(key);
  // A cached set that belongs to a different account on this device is not a
  // resume candidate; fall through to the server copy for this account.
  const usable = local && (!current || !local.uid || local.uid === current.uid)
    ? local
    : null;
  if (!current) return usable;

  if (usable) {
    void refreshSession(key, current.uid);
    return usable;
  }

  const result = await api(`/api/practice/sessions?key=${encodeURIComponent(key)}`);
  const session = result.json?.session as PracticeSession | null | undefined;
  if (result.ok && session) {
    await savePracticeSession({ ...session, uid: current.uid });
    return session;
  }
  return null;
}

async function refreshSession(key: string, uid: string): Promise<void> {
  const result = await api(`/api/practice/sessions?key=${encodeURIComponent(key)}`);
  const session = result.json?.session as PracticeSession | null | undefined;
  if (!result.ok || !session) return;
  const local = await getPracticeSession(key);
  if (
    local?.uid === uid &&
    new Date(local.updatedAt) >= new Date(session.updatedAt)
  ) {
    return;
  }
  await savePracticeSession({ ...session, uid });
}

/**
 * Drains the outbox, oldest first.
 *
 * A 400 means the server will never accept that item, so it is dropped rather
 * than blocking every later write. Network/5xx/401 failures keep the item and
 * stop the loop; the next flush (online, pagehide, next autosave) retries.
 */
export async function flushPracticeQueue(keepalive = false): Promise<void> {
  const current = resolveAuth();
  if (!current || flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  flushing = true;
  try {
    const items = (await getPracticeSyncQueue(current.uid)).slice(0, 50);
    for (const item of items) {
      let result: ApiResult;
      if (item.type === "attempt") {
        result = await api(
          "/api/practice/attempts",
          { method: "POST", body: JSON.stringify(item.payload) },
          { keepalive }
        );
      } else if (item.type === "session") {
        result = await api(
          "/api/practice/sessions",
          { method: "PUT", body: JSON.stringify(item.payload) },
          { keepalive }
        );
      } else {
        result = await api(
          `/api/practice/sessions?key=${encodeURIComponent(item.key)}`,
          { method: "DELETE" },
          { keepalive }
        );
      }

      if (result.ok || result.status === 400) {
        await deletePracticeSync(item.id);
        continue;
      }
      break;
    }
  } catch (error) {
    console.error("practice sync flush failed:", error);
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void ensureReady();
  });
  // `pagehide` covers tab close and mobile backgrounding; `keepalive` lets the
  // request outlive the page. Whatever does not make it stays in the outbox.
  window.addEventListener("pagehide", () => {
    void flushPracticeQueue(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushPracticeQueue(true);
  });
}

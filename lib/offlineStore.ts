import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AttemptRecord, PracticeSession, QuestionsPayload } from "./types";

/**
 * Client-side IndexedDB persistence for offline-first question caching,
 * practice history, trial quotas, and bookmarks.
 *
 * Everything here is safe to import on the server (no top-level browser API
 * access); the actual `indexedDB` calls only run in the browser.
 */

const DB_NAME = "jambito-offline";
// v3 adds `syncQueue`, the durable outbox for practice writes made offline.
const DB_VERSION = 3;

/**
 * A practice write waiting to reach the server.
 *
 * Stored in IndexedDB (not memory) so closing the tab offline does not lose a
 * finished session. `uid` scopes each item to the account that created it, so a
 * shared device never uploads one student's history into another's account.
 */
export type PracticeSyncItem =
  | {
      id: string;
      uid: string;
      type: "attempt";
      payload: AttemptRecord;
      at: number;
    }
  | {
      id: string;
      uid: string;
      type: "session";
      payload: PracticeSession;
      at: number;
    }
  | {
      id: string;
      uid: string;
      type: "session-delete";
      key: string;
      at: number;
    };

interface JambitoDB extends DBSchema {
  questions: {
    key: string;
    value: QuestionsPayload;
  };
  attempts: {
    key: string;
    value: AttemptRecord;
    indexes: { "by-date": string };
  };
  sessions: {
    key: string;
    value: PracticeSession;
  };
  bookmarks: {
    key: string;
    value: { id: string | number; savedAt: string };
  };
  syncQueue: {
    key: string;
    value: PracticeSyncItem;
    indexes: { "by-at": number };
  };
}

let dbPromise: Promise<IDBPDatabase<JambitoDB>> | null = null;

function getDB(): Promise<IDBPDatabase<JambitoDB>> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<JambitoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("questions")) {
          db.createObjectStore("questions");
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const store = db.createObjectStore("attempts");
          store.createIndex("by-date", "date");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions");
        }
        if (!db.objectStoreNames.contains("bookmarks")) {
          db.createObjectStore("bookmarks");
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue");
          store.createIndex("by-at", "at");
        }
      },
    });
  }
  return dbPromise;
}

/** Canonical storage key for a subject/year question set. */
export function questionKey(exam: string, subject: string, year: string): string {
  return [exam, subject, year]
    .map((s) => String(s ?? "").trim().toLowerCase())
    .join("__");
}

// ---------------------------------------------------------------------------
// Questions (offline question caching)
// ---------------------------------------------------------------------------

export async function saveQuestions(
  key: string,
  payload: QuestionsPayload
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).put("questions", payload, key);
}

export async function getCachedQuestions(
  key: string
): Promise<QuestionsPayload | null> {
  const db = getDB();
  if (!db) return null;
  const value = await (await db).get("questions", key);
  return value ?? null;
}

export async function hasCachedQuestions(key: string): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const value = await (await db).get("questions", key);
  return Boolean(value?.questions?.length);
}

/**
 * Drops a cached question set. Used when the server answers 402 (trial
 * exhausted) so a previously cached full set can't be replayed offline.
 */
export async function deleteCachedQuestions(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).delete("questions", key);
}

/**
 * Drops EVERY cached question set.
 *
 * Called when the server reports the account is blocked/deactivated: the sets
 * were cached while the account still had access, and `/api/questions` is
 * NetworkFirst, so without this the whole answer library would keep working
 * offline from IndexedDB after the lockout.
 */
export async function clearAllCachedQuestions(): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).clear("questions");
}

// ---------------------------------------------------------------------------
// Attempts (practice history)
// ---------------------------------------------------------------------------

export async function saveAttempt(record: AttemptRecord): Promise<void> {
  const db = getDB();
  if (!db) return;
  // Reusing a session id makes completion writes idempotent across retries.
  const id =
    record.sessionId ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await (await db).put("attempts", record, id);
}

export async function getAttempts(): Promise<AttemptRecord[]> {
  const db = getDB();
  if (!db) return [];
  const all = await (await db).getAll("attempts");
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface CachedAttemptEntry {
  /** The IndexedDB key (the attempt's `sessionId`, historically random). */
  id: string;
  record: AttemptRecord;
}

/**
 * Attempts with their storage keys.
 *
 * Needed once, for the migration: records saved before server-side practice
 * existed were keyed by a random UUID, while the server derives a stable
 * `key|date` id. Reading the keys lets `lib/practiceRepo.ts` rewrite those rows
 * under the stable id instead of importing them a second time.
 */
export async function getAttemptEntries(): Promise<CachedAttemptEntry[]> {
  const db = getDB();
  if (!db) return [];
  const d = await db;
  const keys = await d.getAllKeys("attempts");
  const entries: CachedAttemptEntry[] = [];
  for (const key of keys) {
    const record = await d.get("attempts", key);
    if (record) entries.push({ id: String(key), record });
  }
  return entries;
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).delete("attempts", id);
}

export async function savePracticeSession(
  session: PracticeSession
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).put("sessions", session, session.key);
}

export async function getPracticeSession(
  key: string
): Promise<PracticeSession | null> {
  const db = getDB();
  if (!db) return null;
  return (await (await db).get("sessions", key)) ?? null;
}

export async function getPracticeSessions(): Promise<PracticeSession[]> {
  const db = getDB();
  if (!db) return [];
  const sessions = await (await db).getAll("sessions");
  return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function deletePracticeSession(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).delete("sessions", key);
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export async function toggleBookmark(id: string | number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const d = await db;
  const key = String(id);
  const existing = await d.get("bookmarks", key);
  if (existing) {
    await d.delete("bookmarks", key);
    return false;
  }
  await d.put("bookmarks", { id, savedAt: new Date().toISOString() });
  return true;
}

export async function isBookmarked(id: string | number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  return Boolean(await (await db).get("bookmarks", String(id)));
}

export async function getBookmarkIds(): Promise<(string | number)[]> {
  const db = getDB();
  if (!db) return [];
  const all = await (await db).getAll("bookmarks");
  return all.map((b) => b.id);
}

// ---------------------------------------------------------------------------
// Last-known entitlement (lets the UI fail closed while offline)
// ---------------------------------------------------------------------------

const ENTITLEMENT_KEY = "jambito:entitlement";

/** The most recent trial/subscription status the server confirmed. */
export interface Entitlement {
  uid: string;
  isSubscribed: boolean;
  trialRemaining: number;
  checkedAt: string;
}

export function saveEntitlement(entitlement: Entitlement): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement));
  } catch {
    // Storage disabled — the server stays the source of truth.
  }
}

/** Returns the stored status, but only for the account it belongs to. */
export function getEntitlement(uid?: string | null): Entitlement | null {
  if (typeof localStorage === "undefined" || !uid) return null;
  try {
    const raw = localStorage.getItem(ENTITLEMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entitlement;
    return parsed?.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

export function clearEntitlement(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ENTITLEMENT_KEY);
  } catch {
    // ignore
  }
}

/** True when the last server check said this account is out of free questions. */
export function isEntitlementLocked(
  entitlement: Entitlement | null
): boolean {
  return Boolean(
    entitlement && !entitlement.isSubscribed && entitlement.trialRemaining <= 0
  );
}

// ---------------------------------------------------------------------------
// Practice sync outbox
// ---------------------------------------------------------------------------

/**
 * Queues a practice write. Re-queueing the same id replaces the previous entry
 * (attempt ids are deterministic, session ids are the set key), so a burst of
 * autosaves leaves one pending write instead of dozens.
 */
export async function enqueuePracticeSync(item: PracticeSyncItem): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).put("syncQueue", item, item.id);
}

/** Pending writes for one account, oldest first. */
export async function getPracticeSyncQueue(
  uid: string
): Promise<PracticeSyncItem[]> {
  const db = getDB();
  if (!db) return [];
  const all = await (await db).getAll("syncQueue");
  return all
    .filter((item) => item.uid === uid)
    .sort((a, b) => a.at - b.at);
}

export async function deletePracticeSync(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).delete("syncQueue", id);
}

/** Number of writes still waiting to reach the server (0 when fully synced). */
export async function countPracticeSync(uid: string): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const all = await (await db).getAll("syncQueue");
  return all.filter((item) => item.uid === uid).length;
}

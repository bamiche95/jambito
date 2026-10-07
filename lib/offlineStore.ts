import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AttemptRecord, QuestionsPayload } from "./types";

/**
 * Client-side IndexedDB persistence for offline-first question caching,
 * practice history, trial quotas, and bookmarks.
 *
 * Everything here is safe to import on the server (no top-level browser API
 * access); the actual `indexedDB` calls only run in the browser.
 */

const DB_NAME = "jambito-offline";
const DB_VERSION = 1;

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
  trials: {
    key: string;
    value: { key: string; used: number };
  };
  bookmarks: {
    key: string;
    value: { id: string | number; savedAt: string };
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
        if (!db.objectStoreNames.contains("trials")) {
          db.createObjectStore("trials");
        }
        if (!db.objectStoreNames.contains("bookmarks")) {
          db.createObjectStore("bookmarks");
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

// ---------------------------------------------------------------------------
// Attempts (practice history)
// ---------------------------------------------------------------------------

export async function saveAttempt(record: AttemptRecord): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).put("attempts", record);
}

export async function getAttempts(): Promise<AttemptRecord[]> {
  const db = getDB();
  if (!db) return [];
  const all = await (await db).getAll("attempts");
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Trial quotas (freemium)
// ---------------------------------------------------------------------------

export async function getTrialUsed(key: string): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const value = await (await db).get("trials", key);
  return value?.used ?? 0;
}

export async function incrementTrial(key: string): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const d = await db;
  const current = (await d.get("trials", key))?.used ?? 0;
  const next = current + 1;
  await d.put("trials", { key, used: next });
  return next;
}

export async function resetTrials(): Promise<void> {
  const db = getDB();
  if (!db) return;
  await (await db).clear("trials");
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

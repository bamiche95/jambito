import clientPromise from "@/lib/mongodb";

/**
 * Server-side practice records.
 *
 * Until now every attempt and paused session lived only in the student's
 * IndexedDB. This module moves the authoritative copy into MongoDB so History,
 * Stats, the profile and the automated progress emails all agree — and so a
 * paused set can be resumed on another device.
 *
 * Two collections plus one denormalised summary:
 *
 *   practiceAttempts  one doc per completed session, `_id = "<uid>:<ref>"`.
 *                     The deterministic id is the idempotency guard: replaying
 *                     an offline write can only ever update the same row.
 *   practiceSessions  one doc per paused set, `_id = "<uid>:<key>"` (the key is
 *                     the exam/subject/year cache key the client already uses).
 *   users.practice    aggregate counters, recomputed here on write, so the email
 *                     engine can select an audience without touching either
 *                     collection (or any answer map).
 *
 * Nothing here trusts the client: scores are re-derived, dates are clamped and
 * answers are capped and filtered before they reach Mongo.
 */

const DB_NAME = "jambito";
const MAX_ANSWERS = 500;
const MAX_ATTEMPTS_IMPORT = 500;
const MAX_SESSIONS_IMPORT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const EARLIEST_DATE = Date.parse("2020-01-01T00:00:00.000Z");

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getPracticeAttemptsCollection() {
  return (await getDb()).collection("practiceAttempts");
}

export async function getPracticeSessionsCollection() {
  return (await getDb()).collection("practiceSessions");
}

let indexPromise = null;

/**
 * Indexes the queries depend on. `scripts/ensure-indexes.mjs` creates the same
 * ones at deploy time; this lazy path keeps a deployment that skipped the
 * script from scanning the collection. Idempotent, runs at most once per
 * process, and never fails a write.
 */
async function ensurePracticeIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [attempts, sessions] = await Promise.all([
        getPracticeAttemptsCollection(),
        getPracticeSessionsCollection(),
      ]);
      await Promise.allSettled([
        attempts.createIndex({ uid: 1, date: -1 }, { name: "uid_date_desc" }),
        attempts.createIndex({ uid: 1, key: 1 }, { name: "uid_key" }),
        sessions.createIndex({ uid: 1, updatedAt: -1 }, { name: "uid_updatedAt_desc" }),
      ]);
    })().catch((error) => {
      console.error("practice index setup failed:", error);
    });
  }
  return indexPromise;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function cleanString(value, maxLength) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanInteger(value, min, max) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function clampDate(value, fallback, maxAheadMs = DAY_MS) {
  const parsed = value ? Date.parse(value) : NaN;
  const now = Date.now();
  if (!Number.isFinite(parsed)) return new Date(fallback ?? now);
  const clamped = Math.min(Math.max(parsed, EARLIEST_DATE), now + maxAheadMs);
  return new Date(clamped);
}

/**
 * Answer maps are the only nested user input. Mongo rejects `$`-prefixed and
 * dotted keys, and a 16 MB document cap is not a validation strategy, so both
 * are handled here: unknown option values are dropped, not truncated.
 */
function cleanAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers = {};
  let stored = 0;
  for (const [key, answer] of Object.entries(value)) {
    if (stored >= MAX_ANSWERS) break;
    if (!key || key.length > 64 || key.includes(".") || key.startsWith("$")) continue;
    if (typeof answer !== "string" && typeof answer !== "number") continue;
    const cleaned = String(answer).trim().slice(0, 8);
    if (!cleaned) continue;
    answers[key] = cleaned;
    stored += 1;
  }
  return answers;
}


/**
 * Normalises a completed attempt. Returns `{ ok: false, reason }` for anything
 * that cannot be stored unambiguously (missing set identity, impossible score).
 */
export function normalizeAttempt(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "invalid_attempt" };
  }
  const key = cleanString(input.key, 120);
  const exam = cleanString(input.exam, 40);
  const subject = cleanString(input.subject, 60);
  const year = cleanString(input.year, 20);
  if (!key || !exam || !subject || !year) {
    return { ok: false, reason: "missing_set" };
  }

  const total = cleanInteger(input.total, 1, 10_000);
  const score = cleanInteger(input.score, 0, 10_000);
  if (total === null || score === null || score > total) {
    return { ok: false, reason: "invalid_score" };
  }

  const date = clampDate(input.date);
  const sessionId = cleanString(input.sessionId, 120);
  const ref = sessionId ?? `${key}|${date.toISOString()}`;

  return {
    ok: true,
    attempt: {
      ref,
      key,
      exam,
      subject,
      year,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      date,
    },
  };
}

/** Normalises a paused session (answers included, because resume needs them). */
export function normalizeSession(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "invalid_session" };
  }
  const key = cleanString(input.key, 120);
  if (!key) return { ok: false, reason: "missing_key" };

  const exam = cleanString(input.exam, 40) ?? "";
  const subject = cleanString(input.subject, 60) ?? "";
  const year = cleanString(input.year, 20) ?? "";
  const id = cleanString(input.id, 120) ?? key;
  const answers = cleanAnswers(input.answers);
  const total = cleanInteger(input.total, 1, 10_000);

  return {
    ok: true,
    session: {
      id,
      key,
      exam,
      subject,
      year,
      answers,
      answered: Object.keys(answers).length,
      total: total ?? null,
      remainingSeconds: cleanInteger(input.remainingSeconds, 0, 86_400) ?? 0,
      durationSeconds: cleanInteger(input.durationSeconds, 0, 86_400) ?? 0,
      scrollY: cleanInteger(input.scrollY, 0, 200_000) ?? 0,
      updatedAt: clampDate(input.updatedAt, Date.now(), 5 * 60 * 1000),
    },
  };
}

// ---------------------------------------------------------------------------
// Serialisation (Mongo doc -> the shape lib/types.ts expects)
// ---------------------------------------------------------------------------

function toClientAttempt(doc) {
  return {
    sessionId: doc.ref,
    key: doc.key,
    exam: doc.exam,
    subject: doc.subject,
    year: doc.year,
    score: doc.score,
    total: doc.total,
    percentage: doc.percentage,
    date: new Date(doc.date).toISOString(),
  };
}

function toClientSession(doc) {
  return {
    id: doc.id,
    key: doc.key,
    exam: doc.exam,
    subject: doc.subject,
    year: doc.year,
    answers: doc.answers ?? {},
    answered: doc.answered ?? Object.keys(doc.answers ?? {}).length,
    total: doc.total ?? undefined,
    remainingSeconds: doc.remainingSeconds ?? 0,
    durationSeconds: doc.durationSeconds ?? 0,
    scrollY: doc.scrollY ?? 0,
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Upserts one completed attempt and clears the paused session for that set.
 *
 * The write is deliberately a `$set` on a deterministic `_id`: an offline retry
 * that arrives three times still leaves exactly one row, and a later replay with
 * a corrected score updates it instead of forking history.
 */
export async function recordAttempt(uid, input) {
  const normalized = normalizeAttempt(input);
  if (!normalized.ok) return normalized;

  await ensurePracticeIndexes();
  const db = await getDb();
  const now = new Date();
  const { ref, ...fields } = normalized.attempt;

  await db.collection("practiceAttempts").updateOne(
    { _id: `${uid}:${ref}` },
    {
      $set: { uid, ref, ...fields, updatedAt: now },
      $setOnInsert: { createdAt: now, source: input?.source === "import" ? "import" : "web" },
    },
    { upsert: true }
  );

  // The client deletes the paused session on submit too; doing it here covers a
  // lost DELETE and keeps "unfinished" emails from naming a completed set.
  await db.collection("practiceSessions").deleteOne({ _id: `${uid}:${fields.key}` });
  const practice = await refreshPracticeSummary(uid, { full: true });

  return { ok: true, attempt: toClientAttempt({ ref, ...fields }), practice };
}

/**
 * Upserts a paused session. Writes that arrive out of order (a retry from an
 * older tab) are ignored instead of overwriting newer answers.
 */
export async function upsertSession(uid, input) {
  const normalized = normalizeSession(input);
  if (!normalized.ok) return normalized;

  await ensurePracticeIndexes();
  const sessions = await getPracticeSessionsCollection();
  const incoming = normalized.session;
  const _id = `${uid}:${incoming.key}`;

  const existing = await sessions.findOne(
    { _id },
    { projection: { updatedAt: 1 } }
  );
  if (existing?.updatedAt && new Date(existing.updatedAt) > incoming.updatedAt) {
    return { ok: true, stale: true };
  }

  const now = new Date();
  await sessions.updateOne(
    { _id },
    {
      $set: { uid, ...incoming, receivedAt: now },
      $setOnInsert: { createdAt: now, startedAt: now },
    },
    { upsert: true }
  );

  await refreshPracticeSummary(uid);
  return { ok: true, stale: false, session: toClientSession({ ...incoming, uid }) };
}

export async function deleteSession(uid, key) {
  const cleaned = cleanString(key, 120);
  if (!cleaned) return { ok: false, reason: "missing_key" };
  const sessions = await getPracticeSessionsCollection();
  const result = await sessions.deleteOne({ _id: `${uid}:${cleaned}` });
  await refreshPracticeSummary(uid);
  return { ok: true, deleted: result.deletedCount };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAttempts(uid, { limit = 200, before = null } = {}) {
  const attempts = await getPracticeAttemptsCollection();
  const safeLimit = Math.min(Math.max(Math.round(Number(limit) || 200), 1), 500);
  const filter = { uid };
  if (before) {
    const parsed = Date.parse(before);
    if (Number.isFinite(parsed)) filter.date = { $lt: new Date(parsed) };
  }
  const rows = await attempts
    .find(filter)
    .sort({ date: -1 })
    .limit(safeLimit)
    .toArray();
  return rows.map(toClientAttempt);
}

export async function listSessions(uid, { limit = 20 } = {}) {
  const sessions = await getPracticeSessionsCollection();
  const safeLimit = Math.min(Math.max(Math.round(Number(limit) || 20), 1), 100);
  const rows = await sessions
    .find({ uid })
    .sort({ updatedAt: -1 })
    .limit(safeLimit)
    .toArray();
  return rows.map(toClientSession);
}

export async function getSession(uid, key) {
  const cleaned = cleanString(key, 120);
  if (!cleaned) return null;
  const sessions = await getPracticeSessionsCollection();
  const doc = await sessions.findOne({ _id: `${uid}:${cleaned}` });
  return doc ? toClientSession(doc) : null;
}

// ---------------------------------------------------------------------------
// Summary (users.practice) — the only thing the email engine reads
// ---------------------------------------------------------------------------

function maxDate(...values) {
  let best = null;
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!best || date > best) best = date;
  }
  return best;
}

/**
 * Recomputes `users.practice`.
 *
 * `full` rebuilds the attempt counters and the per-subject rollup (after a
 * submit or an import). The cheaper default only refreshes the paused-session
 * list and `lastActivityAt`, which is what every autosave needs.
 */
export async function refreshPracticeSummary(uid, { full = false } = {}) {
  const db = await getDb();
  const users = db.collection("users");
  const [recentSessions, currentUser] = await Promise.all([
    db
      .collection("practiceSessions")
      .find({ uid })
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray(),
    users.findOne({ _id: uid }, { projection: { practice: 1 } }),
  ]);

  const existing = currentUser?.practice ?? {};
  const inProgress = recentSessions.map((doc) => ({
    key: doc.key,
    exam: doc.exam,
    subject: doc.subject,
    year: doc.year,
    answered: doc.answered ?? 0,
    total: doc.total ?? null,
    remainingSeconds: doc.remainingSeconds ?? 0,
    updatedAt: doc.updatedAt,
  }));

  let completedSessions = existing.completedSessions ?? 0;
  let totalQuestions = existing.totalQuestions ?? 0;
  let totalScore = existing.totalScore ?? 0;
  let averagePercentage = existing.averagePercentage ?? null;
  let lastCompletedAt = existing.lastCompletedAt ?? null;
  let bySubject = existing.bySubject ?? [];

  if (full) {
    const attempts = db.collection("practiceAttempts");
    const [totals] = await attempts
      .aggregate([
        { $match: { uid } },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            questions: { $sum: "$total" },
            score: { $sum: "$score" },
            last: { $max: "$date" },
          },
        },
      ])
      .toArray();

    completedSessions = totals?.sessions ?? 0;
    totalQuestions = totals?.questions ?? 0;
    totalScore = totals?.score ?? 0;
    averagePercentage = totalQuestions
      ? Math.round((totalScore / totalQuestions) * 100)
      : null;
    lastCompletedAt = totals?.last ?? null;

    const subjects = await attempts
      .aggregate([
        { $match: { uid } },
        {
          $group: {
            _id: { exam: "$exam", subject: "$subject" },
            sessions: { $sum: 1 },
            score: { $sum: "$score" },
            total: { $sum: "$total" },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    bySubject = subjects.map((row) => ({
      exam: row._id.exam,
      subject: row._id.subject,
      sessions: row.sessions,
      score: row.score,
      total: row.total,
    }));
  }

  const practice = {
    completedSessions,
    totalQuestions,
    totalScore,
    averagePercentage,
    lastCompletedAt: lastCompletedAt ? new Date(lastCompletedAt) : null,
    bySubject,
    inProgress,
    lastActivityAt: maxDate(
      existing.lastActivityAt,
      lastCompletedAt,
      recentSessions[0]?.updatedAt
    ),
    updatedAt: new Date(),
  };

  await users.updateOne(
    { _id: uid },
    { $set: { practice, updatedAt: new Date() } }
  );
  return practice;
}

// ---------------------------------------------------------------------------
// One-time import of records that predate server-side practice storage
// ---------------------------------------------------------------------------

export async function importPractice(uid, payload) {
  await ensurePracticeIndexes();
  const db = await getDb();
  const now = new Date();
  const attemptsInput = Array.isArray(payload?.attempts)
    ? payload.attempts.slice(0, MAX_ATTEMPTS_IMPORT)
    : [];
  const sessionsInput = Array.isArray(payload?.sessions)
    ? payload.sessions.slice(0, MAX_SESSIONS_IMPORT)
    : [];

  // Dedupe before writing: two entries for the same attempt id in one
  // unordered bulkWrite would race on the same `_id`.
  const attempts = new Map();
  let skippedAttempts = 0;
  for (const input of attemptsInput) {
    const normalized = normalizeAttempt(input);
    if (!normalized.ok) {
      skippedAttempts += 1;
      continue;
    }
    attempts.set(normalized.attempt.ref, normalized.attempt);
  }

  const attemptOps = [...attempts.values()].map((attempt) => {
    const { ref, ...fields } = attempt;
    return {
      updateOne: {
        filter: { _id: `${uid}:${ref}` },
        update: {
          $set: { uid, ref, ...fields, updatedAt: now },
          $setOnInsert: { createdAt: now, source: "import" },
        },
        upsert: true,
      },
    };
  });
  if (attemptOps.length) {
    await db
      .collection("practiceAttempts")
      .bulkWrite(attemptOps, { ordered: false })
      .catch((error) => {
        // Duplicate-key noise from a concurrent retry is not a failure: the
        // deterministic ids mean the row already holds the same attempt.
        if (error?.code !== 11000) throw error;
      });
  }

  // Sessions need per-key comparison, so they are written one at a time: only
  // replace a stored session when the imported copy is newer.
  const sessions = new Map();
  let skippedSessions = 0;
  for (const input of sessionsInput) {
    const normalized = normalizeSession(input);
    if (!normalized.ok) {
      skippedSessions += 1;
      continue;
    }
    const next = normalized.session;
    const previous = sessions.get(next.key);
    if (!previous || next.updatedAt > previous.updatedAt) {
      sessions.set(next.key, next);
    }
  }

  const sessionCollection = db.collection("practiceSessions");
  let storedSessions = 0;
  for (const session of sessions.values()) {
    const existing = await sessionCollection.findOne(
      { _id: `${uid}:${session.key}` },
      { projection: { updatedAt: 1 } }
    );
    if (existing?.updatedAt && new Date(existing.updatedAt) >= session.updatedAt) {
      continue;
    }
    await sessionCollection.updateOne(
      { _id: `${uid}:${session.key}` },
      {
        $set: { uid, ...session, receivedAt: now },
        $setOnInsert: { createdAt: now, startedAt: now },
      },
      { upsert: true }
    );
    storedSessions += 1;
  }

  await db
    .collection("users")
    .updateOne({ _id: uid }, { $set: { practiceImportedAt: now, updatedAt: now } });
  await refreshPracticeSummary(uid, { full: true });

  return {
    attempts: {
      received: attemptsInput.length,
      stored: attempts.size,
      skipped: skippedAttempts,
    },
    sessions: {
      received: sessionsInput.length,
      stored: storedSessions,
      skipped: skippedSessions,
    },
    importedAt: now.toISOString(),
  };
}

/**
 * Removes every practice record for an account. Called from `softDeleteUser`
 * so a deleted account is not left with scores, answers or paused sessions.
 */
export async function deleteAllPracticeForUser(uid) {
  const db = await getDb();
  const [attempts, sessions] = await Promise.all([
    db.collection("practiceAttempts").deleteMany({ uid }),
    db.collection("practiceSessions").deleteMany({ uid }),
  ]);
  await db
    .collection("users")
    .updateOne({ _id: uid }, { $unset: { practice: "", practiceImportedAt: "" } });
  return {
    attempts: attempts.deletedCount,
    sessions: sessions.deletedCount,
  };
}

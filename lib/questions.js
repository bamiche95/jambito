import clientPromise from "@/lib/mongodb";

/**
 * Server-side data layer for the MyQuest question provider, with a
 * MongoDB Atlas cache in front of it.
 *
 * Every read checks the `jambito.questions` collection first (source: "cache")
 * and falls back to the MyQuest API (source: "api"), persisting the result.
 */

const MYQUEST_BASE = "https://api.myquest.com.ng/api/questions";

async function callMyQuest(query, body) {
  const url = MYQUEST_BASE + (query ? `?${query}` : "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MYQUEST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(`MyQuest request failed with status ${res.status}`);
  }
  return res.json();
}

async function getQuestionsCollection() {
  const client = await clientPromise;
  return client.db("jambito").collection("questions");
}

function norm(part) {
  return String(part ?? "").toLowerCase().trim();
}

async function cachedOrFetch(cacheKey, fetchFn, normalize) {
  const collection = await getQuestionsCollection();
  const cached = await collection.findOne({ cacheKey });
  if (cached && cached.data) {
    return { data: cached.data, source: "cache" };
  }

  const raw = await fetchFn();
  if (!raw || raw.success === false) {
    throw new Error("Provider returned an unsuccessful response");
  }
  const data = normalize(raw);
  await collection.updateOne(
    { cacheKey },
    { $set: { cacheKey, data, createdAt: new Date() } },
    { upsert: true }
  );
  return { data, source: "api" };
}

// ---------------------------------------------------------------------------
// List endpoints (exam / year / subject)
// ---------------------------------------------------------------------------

export async function getExams() {
  return cachedOrFetch(
    "list_exams",
    () => callMyQuest("get=exam"),
    (raw) => raw.data ?? []
  );
}

export async function getYears(exam) {
  return cachedOrFetch(
    `list_years_${norm(exam)}`,
    () => callMyQuest("get=exam_year_id", { exam }),
    (raw) => raw.data ?? []
  );
}

export async function getSubjects(exam, year) {
  return cachedOrFetch(
    `list_subjects_${norm(exam)}_${norm(year)}`,
    () => callMyQuest("get=subject", { exam, exam_year_id: String(year) }),
    (raw) => raw.data ?? []
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function getQuestions({ exam, exam_year_id, subject, page = 1 }) {
  const cacheKey = `questions_${norm(exam)}_${norm(exam_year_id)}_${norm(
    subject
  )}_p${Number(page) || 1}`;

  const collection = await getQuestionsCollection();
  const cached = await collection.findOne({ cacheKey });
  if (cached && cached.data) {
    return { data: cached.data, source: "cache" };
  }

  const raw = await callMyQuest("", {
    exam,
    exam_year_id: Number(exam_year_id),
    subject,
    page: Number(page) || 1,
  });

  if (!raw || raw.success === false || !raw.data) {
    throw new Error("Provider returned an unsuccessful response");
  }

  const data = normalizeQuestionsResponse(raw.data);
  await collection.updateOne(
    { cacheKey },
    { $set: { cacheKey, data, createdAt: new Date() } },
    { upsert: true }
  );
  return { data, source: "api" };
}

// ---------------------------------------------------------------------------
// Normalization (defensive — the provider returns `questions` as a JSON string)
// ---------------------------------------------------------------------------

const ANSWER_LETTERS = ["A", "B", "C", "D", "E", "F"];

function normalizeQuestionsResponse(data) {
  let questions = data.questions;
  if (typeof questions === "string") {
    try {
      questions = JSON.parse(questions);
    } catch {
      questions = [];
    }
  }
  if (!Array.isArray(questions)) questions = [];

  return {
    questions: questions.map((q, index) => normalizeQuestion(q, index)),
    pagination: data.pagination ?? null,
  };
}

function normalizeQuestion(q, index) {
  const question =
    q.question ?? q.question_text ?? q.text ?? q.body ?? q.stem ?? "";

  const options = normalizeOptions(q);

  const explanation =
    q.explanation ??
    q.solution ??
    q.explain ??
    q.explanation_text ??
    q.solution_text ??
    "";

  return {
    id: q.id ?? q._id ?? q.question_id ?? q.qid ?? index + 1,
    question: String(question),
    options,
    correctAnswer: normalizeAnswer(q),
    explanation: String(explanation ?? ""),
    subject: q.subject ?? undefined,
    year: q.year ?? q.exam_year_id ?? undefined,
    exam: q.exam ?? undefined,
    image: q.image ?? q.image_url ?? undefined,
  };
}

function normalizeOptions(q) {
  const out = {};

  if (q.options && typeof q.options === "object" && !Array.isArray(q.options)) {
    const entries = Object.entries(q.options);
    entries.slice(0, ANSWER_LETTERS.length).forEach(([key, value], i) => {
      const letter = /^[a-f]$/i.test(key)
        ? key.toUpperCase()
        : ANSWER_LETTERS[i];
      if (!out[letter] && value != null && value !== "") {
        out[letter] = String(value);
      }
    });
    if (Object.keys(out).length) return out;
  }

  // Fallback: individual option fields (option_a / optionA / a / A, etc.)
  for (const letter of ANSWER_LETTERS) {
    const candidates = [
      q[`option_${letter.toLowerCase()}`],
      q[`option${letter}`],
      q[`option_${letter}`],
      q[`opt_${letter.toLowerCase()}`],
      q[letter.toLowerCase()],
      q[letter],
    ];
    for (const value of candidates) {
      if (value != null && value !== "") {
        out[letter] = String(value);
        break;
      }
    }
  }

  return out;
}

function normalizeAnswer(q) {
  const raw =
    q.correctAnswer ??
    q.correct_answer ??
    q.answer ??
    q.correct_option ??
    q.correct ??
    q.answer_key ??
    q.solution_key ??
    "";

  if (raw == null || raw === "") return "";

  const str = String(raw).trim();
  const upper = str.toUpperCase();

  // "option b" / "option_b" / "B" / "b"
  const letterMatch = upper.match(/\b([A-F])\b/);
  if (letterMatch) return letterMatch[1];

  // numeric index (0-based)
  const numeric = Number(str);
  if (!Number.isNaN(numeric) && numeric >= 0 && numeric < ANSWER_LETTERS.length) {
    return ANSWER_LETTERS[numeric];
  }

  return upper;
}

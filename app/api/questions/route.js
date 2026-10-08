import { NextResponse } from "next/server";
import {
  getExams,
  getYears,
  getSubjects,
  getQuestions,
} from "@/lib/questions";
import { requireApiUser } from "@/lib/serverAuth";
import { getRemaining, isSubscribed } from "@/lib/users";
import { TRIAL_LIMIT } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Strips a question down to what a trial-exhausted visitor may see. Built as an
 * allowlist (rather than deleting `correctAnswer`/`explanation`) so an
 * answer-bearing field added upstream can never leak through by accident.
 */
function toTeaser(question) {
  if (!question) return null;
  const { id, question: text, options, subject, year, exam, image } = question;
  return { id, question: text, options, subject, year, exam, image };
}

/**
 * Zero-cost API proxy with MongoDB caching.
 *
 * GET  /api/questions?get=exam            -> list exam bodies
 * GET  /api/questions?get=exam_year_id&exam=JAMB
 * GET  /api/questions?get=subject&exam=JAMB&exam_year_id=2001
 * POST /api/questions  { exam, exam_year_id, subject, page }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("get");
    const exam = searchParams.get("exam");
    const year = searchParams.get("exam_year_id");

    if (action === "exam") {
      const { data, source } = await getExams();
      return NextResponse.json({ success: true, data, source });
    }

    if (action === "exam_year_id") {
      if (!exam) {
        return NextResponse.json(
          { success: false, message: "Missing required query param: exam" },
          { status: 400 }
        );
      }
      const { data, source } = await getYears(exam);
      return NextResponse.json({ success: true, exam, data, source });
    }

    if (action === "subject") {
      if (!exam || !year) {
        return NextResponse.json(
          {
            success: false,
            message: "Missing required query params: exam, exam_year_id",
          },
          { status: 400 }
        );
      }
      const { data, source } = await getSubjects(exam, year);
      return NextResponse.json({ success: true, exam, year, data, source });
    }

    return NextResponse.json(
      { success: false, message: "Invalid or missing 'get' parameter" },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * Question content is paid: signed-in callers only, and a trial-exhausted
 * account gets one answer-key-stripped teaser question (HTTP 402) instead of
 * the full set. Responses are per-user decisions, so they are never cached.
 */
export async function POST(request) {
  const auth = await requireApiUser(request);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, message: auth.message },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const { exam, exam_year_id, subject, page = 1 } = body ?? {};

    if (!exam || !exam_year_id || !subject) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: exam, exam_year_id, subject",
        },
        { status: 400 }
      );
    }

    const { data, source } = await getQuestions({
      exam,
      exam_year_id,
      subject,
      page,
    });

    const entitled = isSubscribed(auth.user) || getRemaining(auth.user) > 0;

    if (!entitled) {
      const questions = (data?.questions ?? []).slice(0, 1).map(toTeaser);
      return NextResponse.json(
        {
          success: false,
          code: "trial_exhausted",
          message: `You've reached your ${TRIAL_LIMIT}-question free trial limit.`,
          trialRemaining: 0,
          teaser: {
            questions,
            pagination: data?.pagination ?? null,
            source,
          },
        },
        { status: 402, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true, data, source },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch questions from provider" },
      { status: 502 }
    );
  }
}

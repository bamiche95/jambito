import { NextResponse } from "next/server";
import {
  getExams,
  getYears,
  getSubjects,
  getQuestions,
} from "@/lib/questions";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
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

    return NextResponse.json({ success: true, data, source });
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch questions from provider" },
      { status: 502 }
    );
  }
}

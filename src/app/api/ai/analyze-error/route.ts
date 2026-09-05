import { NextRequest, NextResponse } from "next/server";
import { createAIClient, HeaderUtils, invokeStructured, aiErrorResponse } from "@/lib/ai/client";
import { ERROR_ANALYSIS_SYSTEM_PROMPT, buildErrorAnalysisPrompt } from "@/lib/ai/prompts/error-analysis";
import { getDb } from "@/storage/database/db";
import { errorBook, user, question, knowledgePoint } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";

interface ErrorAnalysisResult {
  error_analysis: string;
  knowledge_explanation: string;
  similar_questions: Array<{
    content: string;
    options: string[] | null;
    answer: string;
    analysis: string;
  }>;
  learning_suggestion: string;
  related_knowledge_ids: number[];
}

export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request, 'student');
    if (!userAuth) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { error_book_id } = body;

    if (!error_book_id) {
      return NextResponse.json(
        { error: "缺少必要参数：error_book_id" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. 获取错题信息
    const ebRows = db.select().from(errorBook).where(eq(errorBook.id, error_book_id)).limit(1).all();
    const ebData = ebRows[0] || null;

    if (!ebData) {
      return NextResponse.json({ error: "错题不存在" }, { status: 404 });
    }

    // 校验错题归属当前学生，防止越权解析/篡改他人错题（IDOR）
    if (ebData.student_id !== userAuth.userId) {
      return NextResponse.json({ error: "无权操作该错题" }, { status: 403 });
    }

    // 单独查询关联的 question 和 knowledge_point
    const questionRows = db.select().from(question).where(eq(question.id, ebData.question_id)).limit(1).all();
    const questionData = questionRows[0] || null;

    const kpRows = db.select().from(knowledgePoint).where(eq(knowledgePoint.id, ebData.knowledge_point_id)).limit(1).all();
    const kp = kpRows[0] || null;

    if (!questionData || !kp) {
      return NextResponse.json({ error: "错题关联数据不完整" }, { status: 404 });
    }

    // 2. 获取学生层级
    const studentRows = db.select({ student_level: user.student_level }).from(user).where(eq(user.id, ebData.student_id)).limit(1).all();
    const studentData = studentRows[0] || null;

    // 3. 调用 AI 错题解析
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = createAIClient(customHeaders);

    const prompt = buildErrorAnalysisPrompt({
      questionContent: questionData.content,
      studentAnswer: ebData.student_answer || "",
      correctAnswer: questionData.answer,
      errorType: ebData.error_type || "concept_confusion",
      knowledgePointName: kp.name,
      studentLevel: studentData?.student_level || "medium",
    });

    const result = await invokeStructured<ErrorAnalysisResult>(
      client,
      ERROR_ANALYSIS_SYSTEM_PROMPT,
      prompt,
      0.3
    );

    // 4. 更新错题本
    db.update(errorBook)
      .set({
        error_analysis: result.error_analysis,
        knowledge_explanation: result.knowledge_explanation,
        similar_questions: result.similar_questions,
        learning_suggestion: result.learning_suggestion,
        review_status: "reviewing",
      })
      .where(eq(errorBook.id, error_book_id))
      .run();

    // 5. 将生成的练习题存入题库
    if (result.similar_questions?.length > 0) {
      const newQuestions = result.similar_questions.map((q) => ({
        course_id: kp.course_id,
        knowledge_point_id: ebData.knowledge_point_id,
        question_type: questionData.question_type,
        difficulty: "medium" as const,
        content: q.content,
        options: q.options || null,
        answer: q.answer,
        analysis: q.analysis,
        default_score: 10,
        source: "ai_error_analysis" as const,
      }));
      db.insert(question).values(newQuestions).run();
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    console.error("Error analysis failed:", error);
    return NextResponse.json(
      { error: "错题解析失败，请稍后重试" },
      { status: 500 }
    );
  }
}

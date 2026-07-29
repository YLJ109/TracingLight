import { NextRequest, NextResponse } from "next/server";
import { createAIClient, HeaderUtils, invokeStructured } from "@/lib/ai/client";
import { GRADING_SYSTEM_PROMPT, buildGradingPrompt } from "@/lib/ai/prompts/grading";
import { getDb } from "@/storage/database/db";
import { question, answer, user, gradingTask, errorBook, knowledgePoint } from "@/storage/database/shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";

interface GradingResult {
  total_score: number;
  full_score: number;
  dimension_scores: {
    knowledge_accuracy: number;
    logic_completeness: number;
    expression_clarity: number;
    expansion: number;
  };
  annotations: Array<{
    content: string;
    type: string;
    comment: string;
    point_deduction: number;
  }>;
  unmastered_knowledge_ids: number[];
  error_type: string;
  overall_comment: string;
}

export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request, 'teacher');
    if (!userAuth) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const {
      question_id,
      student_id,
      assignment_id,
    } = body;

    if (!question_id || !student_id || !assignment_id) {
      return NextResponse.json(
        { error: "缺少必要参数：question_id, student_id, assignment_id" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. 获取题目信息
    const questionRows = db.select().from(question).where(eq(question.id, question_id)).limit(1).all();
    const questionData = questionRows[0] || null;

    if (!questionData) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 });
    }

    // 查询关联的知识点
    const kpRows = db.select().from(knowledgePoint).where(eq(knowledgePoint.id, questionData.knowledge_point_id)).limit(1).all();
    const kp = kpRows[0] || null;

    // 2. 获取学生作答
    const answerRows = db.select().from(answer).where(
      and(
        eq(answer.assignment_id, assignment_id),
        eq(answer.student_id, student_id),
        eq(answer.question_id, question_id)
      )
    ).limit(1).all();
    const answerData = answerRows[0] || null;

    const studentAnswer = answerData?.student_answer || "";

    // 3. 获取学生层级
    const studentRows = db.select({ student_level: user.student_level }).from(user).where(eq(user.id, student_id)).limit(1).all();
    const studentData = studentRows[0] || null;

    // 4. 前置检查：空答/无效答案直接给0分，跳过AI调用
    const trimmedAnswer = (studentAnswer || '').trim();
    const meaninglessAnswers = ['不知道', '不会', '不懂', '无', '...', '。', '-', '略'];
    const isMeaningless = trimmedAnswer.length <= 3 || meaninglessAnswers.includes(trimmedAnswer);

    if (isMeaningless) {
      const fullScoreVal = questionData.default_score || 10;
      const gradingResult: GradingResult = {
        total_score: 0,
        full_score: fullScoreVal,
        dimension_scores: { knowledge_accuracy: 0, logic_completeness: 0, expression_clarity: 0, expansion: 0 },
        annotations: [{ content: trimmedAnswer ? '答案无效，请认真作答' : '未作答', type: 'error', comment: '未提供有效答案', point_deduction: fullScoreVal }],
        unmastered_knowledge_ids: [questionData.knowledge_point_id],
        error_type: trimmedAnswer ? 'incomplete' : 'empty',
        overall_comment: trimmedAnswer ? '未提供有效答案，无法评分' : '未作答',
      };

      const fullScore = fullScoreVal;
      // 直接写入批改结果（跳过AI调用）
      db.insert(gradingTask).values({
        answer_id: answerData?.id || 0,
        assignment_id,
        student_id,
        question_id,
        knowledge_point_id: questionData.knowledge_point_id,
        full_score: fullScore,
        question_type: questionData.question_type,
        reference_answer: questionData.answer,
        student_answer: studentAnswer || '',
        total_score: 0,
        dimension_scores: gradingResult.dimension_scores,
        annotations: gradingResult.annotations,
        unmastered_knowledge_ids: gradingResult.unmastered_knowledge_ids,
        error_type: gradingResult.error_type,
        overall_comment: gradingResult.overall_comment,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).run();

      // 归档错题
      db.insert(errorBook).values({
        student_id,
        question_id,
        knowledge_point_id: questionData.knowledge_point_id,
        assignment_id,
        grading_task_id: 0,
        student_answer: studentAnswer || '',
        correct_answer: questionData.answer,
        error_type: trimmedAnswer ? 'incomplete' : 'empty',
        review_status: 'pending',
      }).run();

      return NextResponse.json({
        success: true,
        data: { grading_task_id: null, total_score: 0, full_score: fullScore, result: gradingResult },
      });
    }

    // 5. 调用 AI 批改
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = createAIClient(customHeaders);

    const prompt = buildGradingPrompt({
      questionContent: questionData.content,
      questionType: questionData.question_type,
      referenceAnswer: questionData.answer,
      studentAnswer: studentAnswer || "（未作答）",
      fullScore: questionData.default_score || 10,
      knowledgePointName: kp?.name || "未知知识点",
      knowledgePointId: questionData.knowledge_point_id,
    });

    const result = await invokeStructured<GradingResult>(
      client,
      GRADING_SYSTEM_PROMPT,
      prompt,
      0.2
    );

    // 6. 写入批改结果
    const inserted = db.insert(gradingTask).values({
      answer_id: answerData?.id || 0,
      assignment_id,
      student_id,
      question_id,
      knowledge_point_id: questionData.knowledge_point_id,
      full_score: questionData.default_score || 10,
      question_type: questionData.question_type,
      reference_answer: questionData.answer,
      student_answer: studentAnswer,
      total_score: result.total_score,
      dimension_scores: result.dimension_scores,
      annotations: result.annotations,
      unmastered_knowledge_ids: result.unmastered_knowledge_ids,
      error_type: result.error_type,
      overall_comment: result.overall_comment,
      status: "completed",
      completed_at: new Date().toISOString(),
    }).returning().all();
    const gradingTaskData = inserted[0] || null;

    // 7. 做错或未作答的题自动归档错题（含去重）
    if (!studentAnswer || result.total_score < (questionData.default_score || 10) || (result.annotations?.length > 0)) {
      const existingRows = db.select({ id: errorBook.id })
        .from(errorBook)
        .where(
          and(
            eq(errorBook.student_id, student_id),
            eq(errorBook.question_id, question_id),
            eq(errorBook.assignment_id, assignment_id)
          )
        )
        .limit(1).all();
      const existing = existingRows[0] || null;

      if (!existing) {
        db.insert(errorBook).values({
          student_id,
          question_id,
          knowledge_point_id: questionData.knowledge_point_id,
          assignment_id,
          grading_task_id: gradingTaskData?.id || 0,
          student_answer: studentAnswer,
          correct_answer: questionData.answer,
          error_type: result.error_type || (studentAnswer ? 'wrong' : 'empty'),
          review_status: "pending",
        }).run();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        grading_task_id: gradingTaskData?.id,
        ...result,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("AI grading error:", error);
    return NextResponse.json(
      { error: "AI批改失败：" + (error instanceof Error ? error.message : "未知错误") },
      { status: 500 }
    );
  }
}

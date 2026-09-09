import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { aiErrorResponse } from "@/lib/ai/client";
import { question, answer, user, knowledgePoint } from "@/storage/database/shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";
import { isAssignmentInTeacherScope, isStudentInTeacherScope } from "@/lib/teacher-scope";
import { gradeOneAndRecord, maybeAutoPublishGrades } from "@/services/grading.service";

export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request, 'teacher');
    if (!userAuth) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { question_id, student_id, assignment_id } = body;

    if (!question_id || !student_id || !assignment_id) {
      return NextResponse.json(
        { error: "缺少必要参数：question_id, student_id, assignment_id" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 跨租户隔离：作业必须属于当前教师，且学生在其授课范围
    if (!isAssignmentInTeacherScope(userAuth.userId, Number(assignment_id))) {
      return NextResponse.json({ error: '无权批改该作业' }, { status: 403 });
    }
    if (!isStudentInTeacherScope(userAuth.userId, Number(student_id))) {
      return NextResponse.json({ error: '无权批改该学生' }, { status: 403 });
    }

    // 1. 获取题目信息
    const questionData = (await db.select().from(question).where(eq(question.id, Number(question_id))).limit(1).execute())[0] || null;
    if (!questionData) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 });
    }

    // 2. 知识点名称（供 AI 批改提示词）
    const kp = questionData.knowledge_point_id
      ? (await db.select({ name: knowledgePoint.name }).from(knowledgePoint).where(eq(knowledgePoint.id, questionData.knowledge_point_id)).limit(1).execute())[0]
      : null;

    // 3. 获取学生作答
    const answerData = (await db.select().from(answer).where(
      and(
        eq(answer.assignment_id, Number(assignment_id)),
        eq(answer.student_id, Number(student_id)),
        eq(answer.question_id, Number(question_id))
      )
    ).limit(1).execute())[0] || null;

    // 4. 统一批改管线：计分（空答/规则引擎/AI）+ 事务落库（批改记录/错题/掌握度）+ 即时落盘
    const { result, gradingTaskId } = await gradeOneAndRecord({
      questionData,
      studentId: Number(student_id),
      assignmentId: Number(assignment_id),
      studentAnswer: answerData?.student_answer || "",
      answerId: answerData?.id || 0,
      knowledgePointName: kp?.name || "未知知识点",
      forwardHeaders: request.headers,
      notify: true,
    });

    // 单题批改完成 → 若该作业所有已提交学生全部批改完成则自动公布成绩（老师无需手动确认）
    maybeAutoPublishGrades(Number(assignment_id));

    return NextResponse.json({
      success: true,
      data: {
        grading_task_id: gradingTaskId,
        ...result,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("AI grading error:", error);
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    return NextResponse.json(
      { error: "AI批改失败，请稍后重试" },
      { status: 500 }
    );
  }
}

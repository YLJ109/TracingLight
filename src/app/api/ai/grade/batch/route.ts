import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { assignment, question, answer, knowledgePoint, user, gradingTask } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/server-auth';
import { isAssignmentInTeacherScope, isStudentInTeacherScope } from '@/lib/teacher-scope';
import { gradeOneAndRecord, notifyGraded } from '@/services/grading.service';
import { aiErrorResponse } from '@/lib/ai/client';
import { writeAudit } from '@/lib/audit';

/**
 * 批量批改（教师端主链路）：
 * 对某学生在某作业下所有未批改的作答，逐题走统一批改管线
 * （空答 0 分 → 客观题规则引擎（含数学等价/多选半对）→ 主观题 AI 四维评分），
 * 与单题批改 /api/ai/grade 完全同源，保证同一答案任何入口得分一致。
 * 每题落库（批改记录/错题/掌握度）在独立事务内完成；单题 AI 失败不中断整体，返回 partial。
 */
export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request, 'teacher');
    if (!userAuth) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { assignment_id, student_id } = body;

    if (!assignment_id || !student_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getDb();

    // 跨租户隔离：作业属于当前教师且学生在授课范围
    if (!isAssignmentInTeacherScope(userAuth.userId, Number(assignment_id))) {
      return NextResponse.json({ error: '无权批改该作业' }, { status: 403 });
    }
    if (!isStudentInTeacherScope(userAuth.userId, Number(student_id))) {
      return NextResponse.json({ error: '无权批改该学生' }, { status: 403 });
    }

    // Get assignment
    const assignmentData = db.select().from(assignment)
      .where(eq(assignment.id, Number(assignment_id))).limit(1).all()[0] || null;
    if (!assignmentData) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // Get questions（含知识点名称，供 AI 提示词）
    const questionIds = (assignmentData.question_ids as number[]) || [];
    const questions = questionIds.length > 0
      ? db.select().from(question).where(inArray(question.id, questionIds)).all()
      : [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // 知识点名称批量
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id).filter(Boolean))];
    const kpMap = new Map<number, string>();
    if (kpIds.length > 0) {
      db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint).where(inArray(knowledgePoint.id, kpIds as number[]))
        .all()
        .forEach((kp) => kpMap.set(kp.id, kp.name));
    }

    // 学生层级（保留字段语义，供扩展）
    void db.select({ student_level: user.student_level }).from(user)
      .where(eq(user.id, Number(student_id))).limit(1).all()[0];

    // Get student answers
    const answers = db.select().from(answer).where(
      and(
        eq(answer.assignment_id, Number(assignment_id)),
        eq(answer.student_id, Number(student_id))
      )
    ).all();

    if (!answers || answers.length === 0) {
      return NextResponse.json({ error: '学生未提交作业' }, { status: 400 });
    }

    // 已批改题目跳过（幂等）——但答案提交时间晚于批改完成时间的题目（退回重做后重新提交）需要重新批改
    const existingGradings = db.select({ question_id: gradingTask.question_id, completed_at: gradingTask.completed_at })
      .from(gradingTask)
      .where(
        and(
          eq(gradingTask.assignment_id, Number(assignment_id)),
          eq(gradingTask.student_id, Number(student_id))
        )
      ).all();
    const lastGradedAt = new Map<number, string>();
    for (const g of existingGradings) {
      const prev = lastGradedAt.get(g.question_id);
      if (!g.completed_at) continue;
      if (!prev || g.completed_at > prev) lastGradedAt.set(g.question_id, g.completed_at);
    }
    const answeredAlready = new Set(
      existingGradings
        .filter((g) => {
          const ans = answers.find((a) => a.question_id === g.question_id);
          const gradedAt = lastGradedAt.get(g.question_id);
          // 无作答提交时间 → 视为已批；作答晚于最近一次批改 → 需要重新批改
          if (!ans?.submitted_at) return true;
          if (!gradedAt) return false;
          return new Date(ans.submitted_at) <= new Date(gradedAt);
        })
        .map((g) => g.question_id)
    );

    // 逐题走统一管线
    const results: Array<Record<string, unknown>> = [];
    const failed: Array<{ question_id: number; error: string }> = [];

    for (const answerData of answers) {
      const qId = answerData.question_id;
      const q = questionMap.get(qId);
      if (!q) continue;
      if (answeredAlready.has(qId)) continue;

      try {
        const { result, gradingTaskId } = await gradeOneAndRecord({
          questionData: q,
          studentId: Number(student_id),
          assignmentId: Number(assignment_id),
          studentAnswer: answerData.student_answer || '',
          answerId: answerData.id,
          knowledgePointName: kpMap.get(q.knowledge_point_id) || '未知知识点',
          forwardHeaders: request.headers,
          notify: false,
        });
        results.push({
          question_id: qId,
          total_score: result.total_score,
          full_score: result.full_score,
          grading_task_id: gradingTaskId,
          error_type: result.error_type || null,
        });
      } catch (err) {
        console.error(`Batch grading failed for question ${qId}:`, err);
        failed.push({ question_id: qId, error: '批改失败' });
      }
    }

    // 成绩公布改为教师主导：批改完成仅落成绩，不自动公布；教师复核后在批改台手动「公布成绩」。
    // 不再有任何自动置 grades_published 的副作用（含纯客观题作业提交即出分的旧兜底）。

    // P1-1：批量批改完成后发一条汇总通知（避免逐题刷屏）
    if (results.length > 0) {
      notifyGraded(Number(student_id), Number(assignment_id));

      // AI 批量批改埋点（静默，失败不影响响应），批改成功后埋点一次
      try {
        writeAudit({
          operatorId: userAuth.userId,
          operatorName: userAuth.username,
          action: 'ai_batch_grade',
          targetType: 'assignment',
          targetId: Number(assignment_id),
          detail: `AI批改作业「${String(assignmentData.title).slice(0, 50)}」`,
        });
      } catch (auditErr) {
        console.error('AI batch grade audit error:', auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        graded_count: results.length,
        failed_count: failed.length,
        results,
        failed,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Batch grading error:', e);
    const cfgErr = aiErrorResponse(e);
    if (cfgErr) return cfgErr;
    return NextResponse.json({ error: '批量批改失败' }, { status: 500 });
  }
}

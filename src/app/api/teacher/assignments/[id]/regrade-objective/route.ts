import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { gradingTask, errorBook, assignment } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { and, eq } from 'drizzle-orm';
import { gradeObjectiveQuestion } from '@/lib/objective-grading';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';
import { maybeAutoPublishGrades } from '@/services/grading.service';

/** 规则引擎可「确定判定」的客观题（选择/判断），其结果非 null，可强制 0 或满分 */
const OBJ_DETERMINISTIC = new Set(['single_choice', 'judgment', 'multiple_choice', 'multi_choice']);

/**
 * 客观题批量重算（按规则引擎：全对满分、错了零分）。
 * 用于回刷历史遗留的客观题部分分成绩（改规则前 AI/教师曾给的 1/3 分等），
 * 使其与「客观题错了一律 0 分」规则对齐。仅处理确定性客观题，填空/主观不动。
 * POST body 可选 { studentId }，缺省则重算该作业全部学生的客观题。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const assignmentId = Number(request.url.split('/').filter(Boolean).pop());
    if (!Number.isFinite(assignmentId)) {
      return NextResponse.json({ error: '作业参数无效' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const studentId = body.studentId ? Number(body.studentId) : undefined;

    const db = getDb();

    // 跨租户隔离：仅作业创建教师可回刷
    const asgn = (await db.select({ teacher_id: assignment.teacher_id })
      .from(assignment).where(eq(assignment.id, assignmentId)).execute())[0];
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    if (asgn.teacher_id !== user.userId) {
      return NextResponse.json({ error: '无权操作该作业' }, { status: 403 });
    }

    // 查询作用域内的确定性客观题批改记录
    const scope = studentId
      ? and(eq(gradingTask.assignment_id, assignmentId), eq(gradingTask.student_id, studentId))
      : eq(gradingTask.assignment_id, assignmentId);
    const tasks = await db.select().from(gradingTask).where(scope).execute();

    let updated = 0;
    let correctedToFull = 0;
    let correctedToZero = 0;

    await db.transaction(async (tx) => {
      for (const task of tasks) {
        if (!OBJ_DETERMINISTIC.has(task.question_type)) continue;
        if (!task.student_answer?.trim()) continue; // 未作答不回刷，保持 0 分语义

        const r = gradeObjectiveQuestion(
          task.question_type,
          task.reference_answer ?? '',
          task.student_answer,
          Number(task.full_score) || 0
        );
        if (!r) continue;

        const ruleScore = r.total_score;
        const beforeScore = task.teacher_override_score ?? task.total_score ?? 0;
        if (Math.abs(beforeScore - ruleScore) < 1e-6) continue; // 已一致，跳过

        const isCorrect = r.is_correct;
        const kpId = task.knowledge_point_id;

        await tx.update(gradingTask)
          .set({
            total_score: ruleScore,
            teacher_override_score: ruleScore, // 最终分以规则为准
            dimension_scores: r.dimension_scores,
            error_type: isCorrect ? '' : 'wrong',
            unmastered_knowledge_ids: isCorrect ? [] : (kpId ? [kpId] : []),
            overall_comment: r.comment,
            completed_at: task.completed_at ?? new Date().toISOString(),
          })
          .where(eq(gradingTask.id, task.id))
          .execute();

        // 错题本同步：错(有作答)→若未收录则入；对→移除已收录的错题，避免回刷后残留假错题
        const eb = (await tx.select({ id: errorBook.id })
          .from(errorBook)
          .where(and(
            eq(errorBook.student_id, task.student_id),
            eq(errorBook.question_id, task.question_id),
            eq(errorBook.assignment_id, assignmentId),
          ))
          .limit(1).execute());
        if (isCorrect) {
          if (eb[0]) await tx.delete(errorBook).where(eq(errorBook.id, eb[0].id)).execute();
        } else if (!eb[0]) {
          await tx.insert(errorBook).values({
            student_id: task.student_id,
            question_id: task.question_id,
            knowledge_point_id: task.knowledge_point_id,
            assignment_id: assignmentId,
            grading_task_id: task.id,
            student_answer: task.student_answer || '',
            correct_answer: task.reference_answer ?? '',
            error_type: 'wrong',
            review_status: 'pending',
            review_count: 0,
            next_review_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
          }).execute();
        }

        // 掌握度按规则分回写，保持能力画像与最终成绩一致
        if (kpId) {
          const finalScore = ruleScore;
          const full = Number(task.full_score) || 0;
          await syncMasteryFromGrading({
            studentId: task.student_id,
            knowledgePointId: kpId,
            score: finalScore,
            fullScore: full,
            isCorrect: isCorrect,
          });
        }

        updated++;
        if (isCorrect) correctedToFull++; else correctedToZero++;
      }
    });

    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    maybeAutoPublishGrades(assignmentId);

    return NextResponse.json({ success: true, updated, correctedToFull, correctedToZero });
  } catch (e) {
    console.error('Regrade objective error:', e);
    return NextResponse.json({ error: '重算失败' }, { status: 500 });
  }
}
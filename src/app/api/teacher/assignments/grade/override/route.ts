import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { gradingTask, reviewRecord, assignment, notification, errorBook } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { htmlToPlainText } from '@/lib/rich-text';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';
import { maybeAutoPublishGrades } from '@/services/grading.service';
import { gradeObjectiveQuestion } from '@/lib/objective-grading';

/** 规则引擎可「确定判定」的客观题（选择/判断），其结果非 null，可强制 0 或满分 */
const OBJ_DETERMINISTIC = new Set(['single_choice', 'judgment', 'multiple_choice', 'multi_choice']);

/**
 * 客观题规则判定（全对满分、错了零分，不给部分分）：
 * 仅对确定性客观题生效；填空/主观返回 null（交给原 AI/教师流程）。
 */
function objectiveRuleScore(task: typeof gradingTask.$inferSelect): number | null {
  if (!OBJ_DETERMINISTIC.has(task.question_type)) return null;
  const r = gradeObjectiveQuestion(
    task.question_type,
    task.reference_answer ?? '',
    task.student_answer ?? '',
    Number(task.full_score) || 0
  );
  return r ? r.total_score : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { grading_task_id, override_score, override_comment } = body;

    const db = getDb();

    // 归属校验 + 取批改记录（含 full_score 供分数上限校验）
    const task = db.select().from(gradingTask)
      .where(eq(gradingTask.id, Number(grading_task_id))).get();
    if (!task) {
      return NextResponse.json({ error: '批改记录不存在' }, { status: 404 });
    }
    const asgn = db.select({ teacher_id: assignment.teacher_id })
      .from(assignment).where(eq(assignment.id, task.assignment_id)).get();
    // 跨租户隔离：仅作业创建教师可改分（与作业列表 `assignment.teacher_id` 归口一致）
    if (!asgn || asgn.teacher_id !== user.userId) {
      return NextResponse.json({ error: '无权修改该成绩' }, { status: 403 });
    }

    const fullScore = Number(task?.full_score) || 0;

    const data: Record<string, unknown> = {};

    // 确定性客观题（单选/判断/多选）：最终分由规则引擎强制=0或满分，
    // 忽略任何 AI 部分分 / 教师输入的部分分，杜绝「错了还给 1 分/部分分」。
    const ruleScore = objectiveRuleScore(task);
    if (ruleScore !== null) {
      data.teacher_override_score = ruleScore;
    } else if (override_score !== undefined && override_score !== null && override_score !== '') {
      const score = Number(override_score);
      // 服务端分数校验：必须是有限数字且在 [0, full_score] 区间
      if (!Number.isFinite(score)) {
        return NextResponse.json({ error: '分值必须是合法数字' }, { status: 400 });
      }
      if (score < 0 || score > fullScore) {
        return NextResponse.json({ error: `分值需在 0 ~ ${fullScore} 之间` }, { status: 400 });
      }
      data.teacher_override_score = score;
    }
    if (override_comment !== undefined) {
      data.teacher_override_comment = override_comment;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '无修改内容' }, { status: 400 });
    }

    // 评语落库前剥标签转纯文本（防存储型 XSS），并限制长度
    const safeComment = override_comment ? htmlToPlainText(String(override_comment)).trim().slice(0, 1000) : '';

    // 覆盖分 + 复核留痕在同一事务内，杜绝部分生效
    db.transaction(() => {
      db.update(gradingTask)
        .set(data)
        .where(eq(gradingTask.id, Number(grading_task_id)))
        .run();

      const finalScore = data.teacher_override_score !== undefined
        ? (data.teacher_override_score as number)
        : (task.teacher_override_score ?? task.total_score);

      db.insert(reviewRecord).values({
        grading_task_id: Number(grading_task_id),
        reviewer_id: user.userId,
        reviewer_role: 'teacher',
        action: 'modify',
        ai_score: task.total_score,
        final_score: finalScore as number,
        comment: safeComment,
      }).run();
    });

    // P1-1：教师改分/评语后通知学生（含评语摘要）
    try {
      const asgn = db.select({ title: assignment.title })
        .from(assignment).where(eq(assignment.id, task.assignment_id)).limit(1).all()[0];
      db.insert(notification).values({
        user_id: task.student_id,
        type: 'grade',
        title: '成绩已更新',
        content: `《${asgn?.title || '作业'}》教师已复核你的作答${safeComment ? `：${safeComment.slice(0, 50)}` : '，快去查看'}`,
        link: `/student/assignments/${task.assignment_id}`,
      }).run();
    } catch (notifyErr) {
      console.error('Override notify error:', notifyErr);
    }

    // 教师改分后回写掌握度：以确认后的得分为准，保持能力画像与最终成绩一致
    if (data.teacher_override_score !== undefined) {
      const finalScore = data.teacher_override_score as number;
      const full = fullScore || task.full_score || 0;
      const isCorrect = full > 0 ? finalScore / full >= 0.6 : false;
      syncMasteryFromGrading({
        studentId: task.student_id,
        knowledgePointId: task.knowledge_point_id,
        score: finalScore,
        fullScore: full,
        isCorrect,
      });

      // 错题本口径对齐（与 recordGrading / regrade-objective 一致）：
      // 改判为满分 → 移除该题错题，避免改对后废错题滞留；改判为低于满分且已作答 → 确保收录待复习。
      // 仅在有作答时收录（空答只计 0 分不进错题本）。
      if (task.question_id != null) {
        const scope = and(
          eq(errorBook.student_id, task.student_id),
          eq(errorBook.question_id, task.question_id),
          eq(errorBook.assignment_id, task.assignment_id),
        );
        const eb = db.select({ id: errorBook.id }).from(errorBook).where(scope).limit(1).all();
        if (finalScore >= full && full > 0) {
          if (eb[0]) db.delete(errorBook).where(eq(errorBook.id, eb[0].id)).run();
        } else if (task.student_answer?.trim() && !eb[0]) {
          db.insert(errorBook).values({
            student_id: task.student_id,
            question_id: task.question_id,
            knowledge_point_id: task.knowledge_point_id,
            assignment_id: task.assignment_id,
            grading_task_id: task.id,
            student_answer: task.student_answer || '',
            correct_answer: task.reference_answer ?? '',
            error_type: 'wrong',
            review_status: 'pending',
            review_count: 0,
            next_review_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
          }).run();
        }
      }
    }

    // 成功写入后必定落盘（通知失败等不影响成绩持久化）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    // 改分完成 → 若该作业所有已提交学生全部批改完成则自动公布成绩
    maybeAutoPublishGrades(task.assignment_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Grade override error:', e);
    return NextResponse.json({ error: '修改失败' }, { status: 500 });
  }
}

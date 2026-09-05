import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { gradingTask, reviewRecord, assignment, notification } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { getTeacherCourseIds } from '@/lib/teacher-scope';
import { htmlToPlainText } from '@/lib/rich-text';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';

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
    const courseOwner = db.select({ course_id: assignment.course_id })
      .from(assignment).where(eq(assignment.id, task.assignment_id)).get();
    if (!courseOwner || !getTeacherCourseIds(user.userId).includes(courseOwner.course_id)) {
      return NextResponse.json({ error: '无权修改该成绩' }, { status: 403 });
    }

    const fullScore = Number(task?.full_score) || 0;

    const data: Record<string, unknown> = {};

    if (override_score !== undefined && override_score !== null && override_score !== '') {
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
      syncMasteryFromGrading({
        studentId: task.student_id,
        knowledgePointId: task.knowledge_point_id,
        score: finalScore,
        fullScore: fullScore || task.full_score,
        isCorrect: (finalScore / (fullScore || task.full_score)) >= 0.6,
      });
    }

    // 成功写入后必定落盘（通知失败等不影响成绩持久化）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Grade override error:', e);
    return NextResponse.json({ error: '修改失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { gradingTask, reviewRecord, assignment, notification } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { getTeacherCourseIds } from '@/lib/teacher-scope';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { grading_task_id, override_score, override_comment } = body;

    const db = getDb();

    // 归属校验：批改任务需溯源到本人课程，防止越权改他人班级的成绩
    const taskOwnership = db.select({ assignment_id: gradingTask.assignment_id })
      .from(gradingTask).where(eq(gradingTask.id, Number(grading_task_id))).get();
    if (!taskOwnership) {
      return NextResponse.json({ error: '批改记录不存在' }, { status: 404 });
    }
    const courseOwner = db.select({ course_id: assignment.course_id })
      .from(assignment).where(eq(assignment.id, taskOwnership.assignment_id)).get();
    if (!courseOwner || !getTeacherCourseIds(user.userId).includes(courseOwner.course_id)) {
      return NextResponse.json({ error: '无权修改该成绩' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    if (override_score !== undefined) {
      data.teacher_override_score = Number(override_score);
    }
    if (override_comment !== undefined) {
      data.teacher_override_comment = override_comment;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '无修改内容' }, { status: 400 });
    }

    db.update(gradingTask)
      .set(data)
      .where(eq(gradingTask.id, Number(grading_task_id)))
      .run();

    // 写复核留痕（review_record）
    const task = db.select().from(gradingTask)
      .where(eq(gradingTask.id, Number(grading_task_id))).get();
    if (task) {
      db.insert(reviewRecord).values({
        grading_task_id: Number(grading_task_id),
        reviewer_id: user.userId,
        reviewer_role: 'teacher',
        action: 'modify',
        ai_score: task.total_score,
        final_score: override_score !== undefined
          ? Number(override_score)
          : (task.teacher_override_score ?? task.total_score),
        comment: override_comment || '',
      }).run();

      // P1-1：教师改分/评语后通知学生（含评语摘要）
      try {
        const asgn = db.select({ title: assignment.title })
          .from(assignment).where(eq(assignment.id, task.assignment_id)).limit(1).all()[0];
        db.insert(notification).values({
          user_id: task.student_id,
          type: 'grade',
          title: '成绩已更新',
          content: `《${asgn?.title || '作业'}》教师已复核你的作答${override_comment ? `：${override_comment.slice(0, 50)}` : '，快去查看'}`,
          link: `/student/assignments/${task.assignment_id}`,
        }).run();
        try { saveDb(); } catch { /* 定时持久化兜底 */ }
      } catch (notifyErr) {
        console.error('Override notify error:', notifyErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Grade override error:', e);
    return NextResponse.json({ error: '修改失败' }, { status: 500 });
  }
}

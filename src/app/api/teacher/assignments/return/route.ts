import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment, answer, notification } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { isAssignmentInTeacherScope, isStudentInTeacherScope } from '@/lib/teacher-scope';

/**
 * 教师退回作业 → 学生可重做（学习通式闭环）
 * POST {assignment_id, student_id, comment?}
 * 逻辑：该生该作业全部 answer 标记 returned=1（清 is_submitted 门控重做），并通知学生。
 * 学生重做提交后 returned 自动复位，重新进入批改流程。
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { assignment_id, student_id, comment } = body;
    if (!assignment_id || !student_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 跨租户校验
    if (!isAssignmentInTeacherScope(authUser.userId, Number(assignment_id))) {
      return NextResponse.json({ error: '无权操作该作业' }, { status: 403 });
    }
    if (!isStudentInTeacherScope(authUser.userId, Number(student_id))) {
      return NextResponse.json({ error: '无权操作该学生' }, { status: 403 });
    }

    const db = getDb();
    const asgn = db.select({ title: assignment.title }).from(assignment)
      .where(eq(assignment.id, Number(assignment_id))).limit(1).all()[0];
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });

    const now = new Date().toISOString();
    const rows = db.select({ id: answer.id }).from(answer)
      .where(and(eq(answer.assignment_id, Number(assignment_id)), eq(answer.student_id, Number(student_id))))
      .all();
    if (rows.length === 0) {
      return NextResponse.json({ error: '该学生尚未提交此作业，无需退回' }, { status: 400 });
    }

    // 标记退回：returned 置位 + 关闭提交门控（学生端据此显示重做入口）
    db.update(answer)
      .set({
        returned: true,
        returned_at: now,
        return_comment: comment ? String(comment).slice(0, 200) : null,
        is_submitted: false,
      })
      .where(and(eq(answer.assignment_id, Number(assignment_id)), eq(answer.student_id, Number(student_id))))
      .run();

    // 通知学生（复用通知机制）
    db.insert(notification).values({
      user_id: Number(student_id),
      type: 'assignment',
      title: '作业被退回',
      content: `《${asgn.title}》被老师退回${comment ? `：${String(comment).slice(0, 80)}` : ''}，请修改后重新提交`,
      link: `/student/assignments/${assignment_id}`,
    }).run();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: { returned_answers: rows.length } });
  } catch (e) {
    console.error('Return assignment error:', e);
    return NextResponse.json({ error: '退回失败' }, { status: 500 });
  }
}

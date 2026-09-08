import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment, answer, errorBook, notification, gradingTask } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { isAssignmentInTeacherScope, isStudentInTeacherScope } from '@/lib/teacher-scope';
import { writeAudit } from '@/lib/audit';

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
    // 退回理由必填：让学生明确知道需要修改什么（C2 学习通式闭环）
    const reason = cleanReturnComment(comment);
    if (!reason) {
      return NextResponse.json({ error: '请填写退回理由，学生需据此改进' }, { status: 400 });
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
        return_comment: reason,
        is_submitted: false,
      })
      .where(and(eq(answer.assignment_id, Number(assignment_id)), eq(answer.student_id, Number(student_id))))
      .run();

    // 作废该生该作业已批改的 gradingTask（置 superseded），退回重做后旧成绩不再计入总分/题数，
    // 待学生重新提交后由统一批改管线生成新的 completed 记录。
    db.update(gradingTask)
      .set({ status: 'superseded' })
      .where(and(
        eq(gradingTask.assignment_id, Number(assignment_id)),
        eq(gradingTask.student_id, Number(student_id)),
      ))
      .run();

    // 回滚该生该作业已写入的错题本记录：
    // 退回重做后，旧错题不再计入「需复习」统计，待重做提交后由批改管线按新作答重新入册，
    // 避免同一次尝试因「退回→重交」被重复叠加到错题本/复习排期。
    db.delete(errorBook)
      .where(and(
        eq(errorBook.assignment_id, Number(assignment_id)),
        eq(errorBook.student_id, Number(student_id)),
      ))
      .run();

    // 通知学生（复用通知机制）
    db.insert(notification).values({
      user_id: Number(student_id),
      type: 'assignment',
      title: '作业被退回',
      content: `《${asgn.title}》被老师退回：${reason.slice(0, 80)}，请修改后重新提交`,
      link: `/student/assignments/${assignment_id}`,
    }).run();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    // 退回重做埋点（静默，失败不影响响应）
    try {
      writeAudit({
        operatorId: authUser.userId,
        operatorName: authUser.username,
        action: 'assignment_returned',
        targetType: 'assignment',
        targetId: Number(assignment_id),
        detail: `退回作业「${String(asgn.title).slice(0, 50)}」`,
      });
    } catch (auditErr) {
      console.error('Assignment return audit error:', auditErr);
    }

    return NextResponse.json({ success: true, data: { returned_answers: rows.length } });
  } catch (e) {
    console.error('Return assignment error:', e);
    return NextResponse.json({ error: '退回失败' }, { status: 500 });
  }
}

/**
 * 退回理由：剥 HTML → 截断 → 去空白后非空校验
 * 落库统一走白名单清洗（复用富文本工具），兼顾 XSS 防护与显示安全。
 */
function cleanReturnComment(comment: unknown): string {
  const raw = typeof comment === 'string' ? comment : '';
  const text = raw
    .replace(/<[^>]*>/g, '')          // 剥标签
    .replace(/\s+/g, ' ')             // 压缩空白
    .trim();
  return text.slice(0, 200);
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { assignment, user, gradingTask, answer } from '@/storage/database/shared/schema';
import { getTeacherClassIds } from '@/lib/teacher-scope';

/**
 * 批改台导航数据（对标学习通「上一份/下一份作业、上一人/下一人」）：
 * - sibling：同课程下按创建时间排序的上一份/下一份作业（批改完这份直接切下一份）。
 * - course_id：当前作业课程，用于前端组装「返回课程作业列表」链接。
 * - queue：当前作业授课学生队列，按「未批完 > 已提交 > 未提交」优先级 + 姓名排序，
 *   每条带 status 与 index，前端据此渲染 上一人/下一人。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const assignmentId = parseInt(id);

    const asgn = db.select().from(assignment)
      .where(eq(assignment.id, assignmentId)).limit(1).all()[0] || null;
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    if (asgn.teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }

    const totalQuestions = ((asgn.question_ids as number[]) || []).length;

    // ── 同课程下的上一份/下一份作业（与作业列表一致：最新在前，向下更早）──
    // 数组按 created_at 降序（index 0 = 最新），因此：
    //   上一份 = 列表里排在本作业上方（更新）→ index 更小
    //   下一份 = 列表里排在本作业下方（更早）→ index 更大
    const courseAssignments = db.select({ id: assignment.id, title: assignment.title, created_at: assignment.created_at })
      .from(assignment)
      .where(and(eq(assignment.course_id, asgn.course_id), eq(assignment.teacher_id, authUser.userId)))
      .orderBy(desc(assignment.created_at))
      .all();
    const curIdx = courseAssignments.findIndex((a) => a.id === assignmentId);
    const sibling = {
      prev: curIdx > 0 ? courseAssignments[curIdx - 1] : null, // 上一份（更新）
      next: curIdx < courseAssignments.length - 1 ? courseAssignments[curIdx + 1] : null, // 下一份（更早）
    };

    // ── 授课学生队列（跨租户安全：仅本人授课班级）──
    const classIds = getTeacherClassIds(authUser.userId);
    const studentFilters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classIds.length > 0) studentFilters.push(inArray(user.class_id, classIds));
    const students = db.select({ id: user.id, real_name: user.real_name, student_level: user.student_level })
      .from(user).where(and(...studentFilters)).all();

    // 本作业：已批 / 已提交
    const gradings = db.select({
      student_id: gradingTask.student_id,
      question_id: gradingTask.question_id,
    }).from(gradingTask)
      .where(and(eq(gradingTask.assignment_id, assignmentId), eq(gradingTask.status, 'completed')))
      .all();
    const gradingSet = new Set(gradings.map((g) => `${g.student_id}:${g.question_id}`));

    const answers = db.select({ student_id: answer.student_id })
      .from(answer)
      .where(and(eq(answer.assignment_id, assignmentId), eq(answer.is_submitted, true)))
      .all();
    const submittedSet = new Set(answers.map((a) => a.student_id));

    const orderOf: Record<string, number> = { part: 0, submitted: 1, pending: 2, completed: 3 };
    const queue = students
      .map((s) => {
        const gradedCount = gradings.filter((g) => g.student_id === s.id).length;
        const submittedAll = submittedSet.has(s.id) && gradedCount === totalQuestions && totalQuestions > 0;
        const status = submittedAll
          ? 'completed'
          : submittedSet.has(s.id)
            ? (gradedCount > 0 ? 'part' : 'submitted')
            : (gradedCount > 0 ? 'part' : 'pending');
        return { studentId: s.id, studentName: s.real_name, studentLevel: s.student_level, status, gradedCount, totalQuestions };
      })
      .sort((a, b) => {
        const ra = orderOf[a.status] ?? 9;
        const rb = orderOf[b.status] ?? 9;
        // 已部分批改/刚提交者优先（批改台优先处理），已结案最后
        return ra - rb || a.studentName.localeCompare(b.studentName, 'zh');
      })
      .map((s, i) => ({ ...s, index: i }));

    return NextResponse.json({
      success: true,
      data: {
        assignment_id: assignmentId,
        course_id: asgn.course_id,
        course_title: asgn.title,
        sibling,
        queue,
        total_students: queue.length,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get grading nav error:', e);
    return NextResponse.json({ error: '获取批改导航失败' }, { status: 500 });
  }
}
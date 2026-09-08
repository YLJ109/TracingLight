import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment, answer, gradingTask, course } from '@/storage/database/shared/schema';
import { eq, desc, and, inArray, ne } from 'drizzle-orm';
import { getAccessibleCourseIds } from '@/lib/course-access';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const sid = user.userId;

    // 仅返回本班课程的作业，且隐藏 draft/closed（草稿/已关闭）
    const accessibleIds = getAccessibleCourseIds(user);
    const assignments = db.select()
      .from(assignment)
      .where(and(
        inArray(assignment.course_id, accessibleIds.length ? accessibleIds : [-1]),
        ne(assignment.status, 'draft'),
        ne(assignment.status, 'closed'),
      ))
      .orderBy(desc(assignment.created_at))
      .all();

    // Batch-get courses
    const courseIds = [...new Set(assignments.map((a) => a.course_id))];
    let courseMap = new Map<number, typeof course.$inferSelect>();
    if (courseIds.length > 0) {
      const courses = db.select().from(course).where(inArray(course.id, courseIds)).all();
      courseMap = new Map(courses.map((c) => [c.id, c]));
    }

    // For each assignment, get student answers and grading results
    const enrichedData = assignments.map((asgn) => {
      const questionCount = (asgn.question_ids as number[] || []).length;

      // Student submission status（含退回标记）
      const studentAnswers = db.select({ is_submitted: answer.is_submitted, returned: answer.returned })
        .from(answer)
        .where(and(
          eq(answer.assignment_id, asgn.id),
          eq(answer.student_id, sid)
        ))
        .all();

      const isSubmitted = studentAnswers.length > 0 && studentAnswers.every((a) => a.is_submitted);
      const isReturned = studentAnswers.length > 0 && studentAnswers.some((a) => a.returned);

      // Grading results
      const gradingTasks = db.select({
        total_score: gradingTask.total_score,
        teacher_override_score: gradingTask.teacher_override_score,
        status: gradingTask.status,
      })
        .from(gradingTask)
        .where(and(
          eq(gradingTask.assignment_id, asgn.id),
          eq(gradingTask.student_id, sid)
        ))
        .all();

      const allGraded = gradingTasks.length > 0 &&
        gradingTasks.every((g) => g.status === 'completed');

      // 成绩发布状态：老师未发布前隐藏分数
      const gradesPublished = !!Number(asgn.grades_published ?? 0);

      // 最终分：老师改分（override）优先，未改则 AI 分（仅已发布且全部批改才展示）
      const myScore = gradingTasks.reduce(
        (sum: number, g) => sum + (g.teacher_override_score ?? g.total_score ?? 0), 0
      );

      let status: string;
      if (isReturned) {
        status = 'returned';
      } else if (allGraded) {
        status = 'graded';
      } else if (isSubmitted) {
        status = 'submitted';
      } else if (asgn.end_time && new Date().toISOString() > asgn.end_time && !asgn.allow_resubmit) {
        // 已超过截止时间且未提交、未开放补交 → 已截止（只能阅读，不能作答）
        status = 'expired';
      } else {
        status = 'pending';
      }

      return {
        id: asgn.id,
        title: asgn.title,
        course_name: courseMap.get(asgn.course_id)?.name || '',
        course_id: asgn.course_id,
        total_score: asgn.total_score,
        start_time: asgn.start_time,
        end_time: asgn.end_time,
        question_count: questionCount,
        status,
        my_score: (allGraded && gradesPublished) ? myScore : undefined,
        grades_published: gradesPublished,
        is_submitted: isSubmitted,
        returned: isReturned,
      };
    });

    return NextResponse.json({ success: true, data: enrichedData });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student assignments error:', e);
    return NextResponse.json({ error: '获取作业列表失败' }, { status: 500 });
  }
}

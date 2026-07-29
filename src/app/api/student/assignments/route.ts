import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment, answer, gradingTask, course } from '@/storage/database/shared/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');

    if (!studentId) {
      return NextResponse.json({ error: '缺少student_id参数' }, { status: 400 });
    }

    const sid = parseInt(studentId);

    // Get published assignments ordered by created_at desc
    const assignments = db.select()
      .from(assignment)
      .where(eq(assignment.status, 'published'))
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

      // Student submission status
      const studentAnswers = db.select({ is_submitted: answer.is_submitted })
        .from(answer)
        .where(and(
          eq(answer.assignment_id, asgn.id),
          eq(answer.student_id, sid)
        ))
        .all();

      const isSubmitted = studentAnswers.length > 0 && studentAnswers.every((a) => a.is_submitted);

      // Grading results
      const gradingTasks = db.select({
        total_score: gradingTask.total_score,
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

      const myScore = gradingTasks.reduce(
        (sum: number, g) => sum + (g.total_score || 0), 0
      );

      let status: string;
      if (allGraded) {
        status = 'graded';
      } else if (isSubmitted) {
        status = 'submitted';
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
        my_score: allGraded ? myScore : undefined,
        is_submitted: isSubmitted,
      };
    });

    return NextResponse.json({ success: true, data: enrichedData });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student assignments error:', e);
    return NextResponse.json({ error: '获取作业列表失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and } from 'drizzle-orm';
import { assignment, user, gradingTask, answer, course, classInfo } from '@/storage/database/shared/schema';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    const status = searchParams.get('status');
    const studentId = searchParams.get('student_id');
    const classId = searchParams.get('class_id');

    // Build assignment query with optional filters
    const asgnFilters = [];
    if (courseId) asgnFilters.push(eq(assignment.course_id, parseInt(courseId)));
    if (status) asgnFilters.push(eq(assignment.status, status));

    const assignments = asgnFilters.length > 0
      ? db.select().from(assignment).where(and(...asgnFilters)).orderBy(desc(assignment.created_at)).all()
      : db.select().from(assignment).orderBy(desc(assignment.created_at)).all();

    // Get all students (filtered by class)
    const studentFilters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classId) studentFilters.push(eq(user.class_id, parseInt(classId)));

    const allStudents = db.select({
      id: user.id,
      real_name: user.real_name,
      username: user.username,
      student_level: user.student_level,
      class_id: user.class_id,
    }).from(user).where(and(...studentFilters)).all();

    // Get all grading records
    const allGradings = db.select({
      id: gradingTask.id,
      assignment_id: gradingTask.assignment_id,
      student_id: gradingTask.student_id,
      total_score: gradingTask.total_score,
      full_score: gradingTask.full_score,
      status: gradingTask.status,
    }).from(gradingTask).all();

    // Get all answer records
    const allAnswers = db.select({
      id: answer.id,
      assignment_id: answer.assignment_id,
      student_id: answer.student_id,
      is_submitted: answer.is_submitted,
    }).from(answer).all();

    // Get course list
    const courses = db.select({
      id: course.id,
      name: course.name,
    }).from(course).orderBy(course.id).all();

    // Get class list
    const classes = db.select({
      id: classInfo.id,
      name: classInfo.name,
    }).from(classInfo).orderBy(classInfo.id).all();

    // Build enriched statistics for each assignment
    const enrichedData = assignments.map((asgn) => {
      const asgnGradings = allGradings.filter((g) => g.assignment_id === asgn.id);
      const asgnAnswers = allAnswers.filter((a) => a.assignment_id === asgn.id);

      // Per-student aggregation
      const studentStats = allStudents.map((stu) => {
        const stuGradings = asgnGradings.filter((g) => g.student_id === stu.id);
        const stuAnswers = asgnAnswers.filter((a) => a.student_id === stu.id);
        const completedCount = stuGradings.filter((g) => g.status === 'completed').length;
        const totalScore = stuGradings.reduce((s, g) => s + (g.total_score || 0), 0);
        const totalFull = stuGradings.reduce((s, g) => s + (g.full_score || 0), 0);

        return {
          studentId: stu.id,
          studentName: stu.real_name,
          studentLevel: stu.student_level,
          totalQuestions: stuGradings.length,
          completedCount,
          submittedCount: stuAnswers.filter((a) => a.is_submitted).length,
          totalScore,
          totalFull,
          avgScore: totalFull > 0 ? Math.round((totalScore / totalFull) * 1000) / 10 : 0,
          status: completedCount === stuGradings.length && stuGradings.length > 0
            ? 'completed'
            : stuAnswers.some((a) => a.is_submitted) ? 'submitted' : 'pending',
        };
      });

      // Filter by student
      const filteredStudentStats = studentId
        ? studentStats.filter((s) => s.studentId === parseInt(studentId))
        : studentStats;

      // Overall stats
      const completedGradings = asgnGradings.filter((g) => g.status === 'completed');
      const submittedAnswers = asgnAnswers.filter((a) => a.is_submitted);

      return {
        ...asgn,
        question_count: ((asgn.question_ids as number[]) || []).length,
        submitted_count: submittedAnswers.length,
        graded_count: completedGradings.length,
        total_students: allStudents.length,
        avg_score: completedGradings.length > 0
          ? Math.round((completedGradings.reduce((s, g) => s + (g.total_score || 0), 0) /
              completedGradings.reduce((s, g) => s + (g.full_score || 0), 0)) * 1000) / 10
          : 0,
        student_stats: filteredStudentStats,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedData,
      courses,
      classes,
      students: allStudents,
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get assignments error:', e);
    return NextResponse.json({ error: '获取作业列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();

    const result = db.insert(assignment).values({
      course_id: body.course_id,
      teacher_id: body.teacher_id,
      title: body.title,
      description: body.description || '',
      question_ids: body.question_ids,
      total_score: body.total_score,
      start_time: body.start_time,
      end_time: body.end_time,
      status: body.status || 'published',
    }).returning().all();

    const data = result[0];

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Create assignment error:', e);
    return NextResponse.json({ error: '创建作业失败' }, { status: 500 });
  }
}

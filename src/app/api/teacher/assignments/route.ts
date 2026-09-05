import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { assignment, user, gradingTask, answer, course, classInfo, question, notification } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, getTeacherAssignmentIds, getTeacherClassIds } from '@/lib/teacher-scope';

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
    // 跨租户隔离：仅返回当前教师本人创建的作业
    const asgnFilters = [eq(assignment.teacher_id, authUser.userId)];
    if (courseId) asgnFilters.push(eq(assignment.course_id, parseInt(courseId)));
    if (status) asgnFilters.push(eq(assignment.status, status));

    const assignments = db.select().from(assignment)
      .where(and(...asgnFilters))
      .orderBy(desc(assignment.created_at))
      .all();

    // Get all students (filtered by class)
    // 跨租户隔离：仅当前教师授课班级下的学生
    const classIds = getTeacherClassIds(authUser.userId);
    const studentFilters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classIds.length > 0) studentFilters.push(inArray(user.class_id, classIds));

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

    // Get course list（跨租户：仅本人授课课程）
    const myCourseIdsDrop = getTeacherCourseIds(authUser.userId);
    const courses = myCourseIdsDrop.length > 0
      ? db.select({
          id: course.id,
          name: course.name,
        }).from(course).where(inArray(course.id, myCourseIdsDrop)).orderBy(course.id).all()
      : [];

    // Get class list（跨租户：仅本人授课班级）
    const myClassIdsDrop = getTeacherClassIds(authUser.userId);
    const classes = myClassIdsDrop.length > 0
      ? db.select({
          id: classInfo.id,
          name: classInfo.name,
        }).from(classInfo).where(inArray(classInfo.id, myClassIdsDrop)).orderBy(classInfo.id).all()
      : [];

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
    const questionIds: number[] = body.question_ids || [];

    // 判断是否含主观题（简答/编程）
    let hasSubjective = false;
    if (questionIds.length > 0) {
      const questions = db.select({ question_type: question.question_type })
        .from(question)
        .where(inArray(question.id, questionIds))
        .all();
      hasSubjective = questions.some(q => q.question_type === 'short' || q.question_type === 'code');
    }
    // 批改方式：教师显式指定 auto/teacher_review，否则按是否含主观题默认
    const reviewMode = (body.review_mode && body.review_mode !== 'auto_judge')
      ? body.review_mode
      : (hasSubjective ? 'teacher_review' : 'auto');

    // 校验课程归属，防止往其他教师的课程发布作业（跨租户）
    const teacherCourseIds = getTeacherCourseIds(authUser.userId);
    if (!body.course_id || !teacherCourseIds.includes(Number(body.course_id))) {
      return NextResponse.json({ error: '课程不存在或不在您的授课范围内' }, { status: 403 });
    }

    const result = db.insert(assignment).values({
      course_id: body.course_id,
      // 归属强制取自 token，杜绝伪造 teacher_id（IDOR）
      teacher_id: authUser.userId,
      title: body.title,
      description: body.description || '',
      question_ids: questionIds,
      total_score: body.total_score,
      start_time: body.start_time,
      end_time: body.end_time,
      status: body.status || 'published',
      review_mode: reviewMode,
      has_subjective: hasSubjective,
    }).returning().all();

    const data = result[0];

    // 发布作业时，通知该课程班级的学生
    if (body.status !== 'draft') {
      const courseRow = db.select({ class_id: course.class_id, name: course.name })
        .from(course).where(eq(course.id, body.course_id)).get();
      if (courseRow?.class_id) {
        const students = db.select({ id: user.id })
          .from(user)
          .where(and(eq(user.role, 'student'), eq(user.class_id, courseRow.class_id), eq(user.is_active, true)))
          .all();
        for (const s of students) {
          db.insert(notification).values({
            user_id: s.id,
            type: 'assignment',
            title: '新作业发布',
            content: `老师在《${courseRow.name}》发布了作业「${body.title}」`,
            link: '/student/assignments',
          }).run();
        }
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Create assignment error:', e);
    return NextResponse.json({ error: '创建作业失败' }, { status: 500 });
  }
}

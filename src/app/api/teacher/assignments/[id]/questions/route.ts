import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, inArray, and } from 'drizzle-orm';
import { assignment, question, knowledgePoint, answer, gradingTask, user, course } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, getTeacherClassIds } from '@/lib/teacher-scope';

// GET /api/teacher/assignments/[id]/questions - 获取作业包含的题目详情+学生提交情况
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { id } = await params;
    const assignmentId = parseInt(id);

    // 获取作业信息
    const asgnRows = db.select().from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1).all();
    const asgn = asgnRows[0] || null;

    if (!asgn) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // 跨租户隔离：作业必须属于本人课程
    const myCourseIds = getTeacherCourseIds(authUser.userId);
    if (!myCourseIds.includes(asgn.course_id)) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }
    const myClassIds = getTeacherClassIds(authUser.userId);

    // 获取关联的课程名称
    const courseRow = db.select({ id: assignment.course_id, name: course.name })
      .from(assignment)
      .innerJoin(course, eq(assignment.course_id, course.id))
      .where(eq(assignment.id, assignmentId))
      .limit(1).all()[0] || null;

    const assignmentWithCourse = {
      ...asgn,
      course: courseRow ? { name: courseRow.name } : null,
    };

    // 获取题目详情
    const questionIds: number[] = (asgn.question_ids as number[]) || [];
    let questions: any[] = [];
    if (questionIds.length > 0) {
      questions = db.select().from(question)
        .where(inArray(question.id, questionIds))
        .orderBy(question.id)
        .all();
    }

    // 为每道题附加知识点名称
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id).filter(Boolean))];
    const kpMap = new Map<number, string>();
    if (kpIds.length > 0) {
      const kps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds as number[]))
        .all();
      kps.forEach((kp) => kpMap.set(kp.id, kp.name));
    }
    const questionsWithKp = questions.map((q) => ({
      ...q,
      knowledge_point: kpMap.has(q.knowledge_point_id)
        ? { name: kpMap.get(q.knowledge_point_id) }
        : null,
    }));

    // 获取提交统计
    const submittedCountRows = db.select({ id: answer.id })
      .from(answer)
      .where(and(
        eq(answer.assignment_id, assignmentId),
        eq(answer.is_submitted, true),
      ))
      .all();
    const submittedCount = submittedCountRows.length;

    // 获取批改统计
    const gradedCountRows = db.select({ id: gradingTask.id })
      .from(gradingTask)
      .where(and(
        eq(gradingTask.assignment_id, assignmentId),
        eq(gradingTask.status, 'completed'),
      ))
      .all();
    const gradedCount = gradedCountRows.length;

    // 获取平均分
    const scores = db.select({ total_score: gradingTask.total_score })
      .from(gradingTask)
      .where(and(
        eq(gradingTask.assignment_id, assignmentId),
        eq(gradingTask.status, 'completed'),
      ))
      .all();

    const avgScore = scores.length > 0
      ? scores.reduce((sum, g) => sum + (g.total_score || 0), 0) / scores.length
      : 0;

    // 学生集合：仅本人授课班级的学生
    const allStudents = myClassIds.length > 0
      ? db.select({
          id: user.id,
          real_name: user.real_name,
          student_level: user.student_level,
        }).from(user)
          .where(and(
            eq(user.role, 'student'),
            eq(user.is_active, true),
            inArray(user.class_id, myClassIds)
          ))
          .all()
      : [];

    // Get all answers for this assignment
    const allAnswers = db.select({
      student_id: answer.student_id,
      is_submitted: answer.is_submitted,
    }).from(answer)
      .where(eq(answer.assignment_id, assignmentId))
      .all();

    // Get all gradings for this assignment
    const allGradings = db.select({
      student_id: gradingTask.student_id,
      total_score: gradingTask.total_score,
      status: gradingTask.status,
    }).from(gradingTask)
      .where(eq(gradingTask.assignment_id, assignmentId))
      .all();

    const submissions = allStudents.map((student) => {
      const studentAnswers = allAnswers.filter((a) => a.student_id === student.id);
      const studentGradings = allGradings.filter((g) => g.student_id === student.id);
      const completedGradings = studentGradings.filter((g) => g.status === 'completed');
      const totalScore = completedGradings.reduce((sum, g) => sum + (g.total_score || 0), 0);

      return {
        student_id: student.id,
        real_name: student.real_name,
        student_level: student.student_level,
        is_submitted: studentAnswers.length > 0 && studentAnswers.some((a) => a.is_submitted),
        total_score: totalScore,
        graded_count: completedGradings.length,
        total_questions: questionIds.length,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        ...assignmentWithCourse,
        questions: questionsWithKp,
        submissions,
        stats: {
          submitted_count: submittedCount,
          graded_count: gradedCount,
          avg_score: Math.round(avgScore * 10) / 10,
        },
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get assignment detail error:', e);
    return NextResponse.json({ error: '获取作业详情失败' }, { status: 500 });
  }
}

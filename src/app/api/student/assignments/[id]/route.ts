import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment, question, answer, gradingTask, course } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

// GET /api/student/assignments/[id] - 获取学生作业详情（含题目和作答）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { id } = await params;
    const assignmentId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');

    if (!studentId) {
      return NextResponse.json({ error: '缺少student_id参数' }, { status: 400 });
    }

    const sid = parseInt(studentId);

    // 获取作业信息
    const assignmentRows = db.select()
      .from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1)
      .all();
    const assignmentData = assignmentRows[0] || null;

    if (!assignmentData) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // 获取关联课程
    const courseRows = db.select()
      .from(course)
      .where(eq(course.id, assignmentData.course_id))
      .limit(1)
      .all();
    const courseData = courseRows[0] || null;

    // 获取题目详情
    const questionIds: number[] = assignmentData.question_ids as number[] || [];
    let questions: any[] = [];
    if (questionIds.length > 0) {
      questions = db.select()
        .from(question)
        .where(inArray(question.id, questionIds))
        .orderBy(question.id)
        .all();
    }

    // 获取学生作答
    const studentAnswers = db.select()
      .from(answer)
      .where(and(
        eq(answer.assignment_id, assignmentId),
        eq(answer.student_id, sid)
      ))
      .all();

    // 获取批改结果
    const gradingTasks = db.select()
      .from(gradingTask)
      .where(and(
        eq(gradingTask.assignment_id, assignmentId),
        eq(gradingTask.student_id, sid)
      ))
      .all();

    // 构建题目+作答+批改的合并数据
    const answerMap = new Map(studentAnswers.map((a) => [a.question_id, a]));
    const gradingMap = new Map(gradingTasks.map((g) => [g.question_id, g]));

    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      student_answer: answerMap.get(q.id)?.student_answer || null,
      is_submitted: answerMap.get(q.id)?.is_submitted || false,
      submitted_at: answerMap.get(q.id)?.submitted_at || null,
      grading: gradingMap.get(q.id) ? {
        total_score: gradingMap.get(q.id)!.total_score,
        full_score: gradingMap.get(q.id)!.full_score,
        dimension_scores: gradingMap.get(q.id)!.dimension_scores,
        annotations: gradingMap.get(q.id)!.annotations,
        status: gradingMap.get(q.id)!.status,
      } : null,
    }));

    // 计算总分
    const totalScore = gradingTasks.reduce(
      (sum: number, g) => sum + (g.total_score || 0), 0
    );
    const isSubmitted = studentAnswers.length > 0 && studentAnswers.every((a) => a.is_submitted);

    return NextResponse.json({
      success: true,
      data: {
        ...assignmentData,
        course: courseData ? { name: courseData.name } : null,
        questions: questionsWithAnswers,
        my_score: gradingTasks.length > 0 ? totalScore : null,
        is_submitted: isSubmitted,
        answers: studentAnswers.map((a) => ({
          question_id: a.question_id,
          student_answer: a.student_answer,
          is_submitted: a.is_submitted,
          grading: gradingMap.get(a.question_id) ? {
            total_score: gradingMap.get(a.question_id)!.total_score,
            full_score: gradingMap.get(a.question_id)!.full_score,
            dimension_scores: gradingMap.get(a.question_id)!.dimension_scores,
            annotations: gradingMap.get(a.question_id)!.annotations,
            status: gradingMap.get(a.question_id)!.status,
          } : null,
        })),
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student assignment detail error:', e);
    return NextResponse.json({ error: '获取作业详情失败' }, { status: 500 });
  }
}

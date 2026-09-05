import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, inArray, and } from 'drizzle-orm';
import { assignment, question, knowledgePoint, answer, gradingTask, user, course } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, isStudentInTeacherScope } from '@/lib/teacher-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const { id, studentId } = await params;
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const assignmentId = parseInt(id);
    const studentIdNum = parseInt(studentId);

    // Get assignment info
    const asgnRows = db.select().from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1).all();
    const asgn = asgnRows[0] || null;

    if (!asgn) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // 跨租户隔离：作业必须属于本人课程
    if (!getTeacherCourseIds(authUser.userId).includes(asgn.course_id)) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }
    // 学生必须在本人授课班级范围，防止越权查看他人班级学生作答详情
    if (!isStudentInTeacherScope(authUser.userId, studentIdNum)) {
      return NextResponse.json({ error: '无权查看该学生' }, { status: 403 });
    }

    // Get associated course name
    const courseRow = db.select({ name: course.name })
      .from(course)
      .where(eq(course.id, asgn.course_id))
      .limit(1).all()[0] || null;

    const assignmentWithCourse = {
      id: asgn.id,
      title: asgn.title,
      total_score: asgn.total_score,
      course: courseRow,
    };

    // Get student info
    const studentRows = db.select({
      id: user.id,
      real_name: user.real_name,
      student_level: user.student_level,
    }).from(user)
      .where(eq(user.id, studentIdNum))
      .limit(1).all();
    const student = studentRows[0] || null;

    if (!student) {
      return NextResponse.json({ error: '学生不存在' }, { status: 404 });
    }

    // Get question IDs from assignment
    const questionIds = (asgn.question_ids as number[]) || [];

    // Get questions
    let questions: any[] = [];
    if (questionIds.length > 0) {
      questions = db.select().from(question)
        .where(inArray(question.id, questionIds))
        .orderBy(question.id)
        .all();
    }

    // Enrich questions with knowledge point names
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id).filter(Boolean))];
    const kpMap = new Map<number, string>();
    if (kpIds.length > 0) {
      const kps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds as number[]))
        .all();
      kps.forEach((kp) => kpMap.set(kp.id, kp.name));
    }

    // Get student answers
    const answers = db.select().from(answer)
      .where(and(
        eq(answer.assignment_id, assignmentId),
        eq(answer.student_id, studentIdNum),
      ))
      .all();

    // Get grading tasks
    const gradings = db.select().from(gradingTask)
      .where(and(
        eq(gradingTask.assignment_id, assignmentId),
        eq(gradingTask.student_id, studentIdNum),
      ))
      .all();

    // Merge questions with answers and gradings
    const answerMap = new Map(answers.map((a) => [a.question_id, a]));
    const gradingMap = new Map(gradings.map((g) => [g.question_id, g]));

    const details = questions.map((q) => {
      const qId = q.id as number;
      const ans = answerMap.get(qId);
      const grading = gradingMap.get(qId);
      return {
        question: {
          ...q,
          knowledge_point: kpMap.has(q.knowledge_point_id)
            ? { name: kpMap.get(q.knowledge_point_id) }
            : null,
        },
        answer: ans || null,
        grading: grading || null,
      };
    });

    // Calculate total
    const totalScore = gradings.reduce(
      (sum, g) => sum + (g.total_score || 0),
      0
    );
    const gradedCount = gradings.filter(
      (g) => g.status === 'completed'
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        assignment: assignmentWithCourse,
        student,
        details,
        summary: {
          totalScore,
          fullScore: asgn.total_score,
          gradedCount,
          totalCount: questionIds.length,
        },
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student grading detail error:', e);
    return NextResponse.json({ error: '获取批改详情失败' }, { status: 500 });
  }
}

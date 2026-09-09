import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, inArray, and } from 'drizzle-orm';
import { exam, examAnswer, examGrading, examAttempt, user, course, classInfo, question, knowledgePoint } from '@/storage/database/shared/schema';
import { isStudentInTeacherScope } from '@/lib/teacher-scope';

/**
 * 学生整卷：返回某考生在指定考试的全部题目 + 作答 + 批改。
 * 供教师「查看学生卷子 / 复核单题」使用；跨租户仅考试创建教师、且学生在本人授课班级范围内可见。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const studentId = parseInt((await params).studentId);

  const row = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });
  if (!isStudentInTeacherScope(r.user.userId, studentId)) {
    return NextResponse.json({ error: '无权查看该学生' }, { status: 403 });
  }

  const courseName = db.select({ name: course.name }).from(course).where(eq(course.id, row.course_id)).get()?.name || '';
  const student = db.select({ id: user.id, real_name: user.real_name, username: user.username, class_id: user.class_id, student_level: user.student_level })
    .from(user).where(eq(user.id, studentId)).get();
  if (!student) return NextResponse.json({ error: '学生不存在' }, { status: 404 });
  const className = student.class_id ? (db.select({ name: classInfo.name }).from(classInfo).where(eq(classInfo.id, student.class_id)).get()?.name || '') : '';

  const attempt = db.select().from(examAttempt)
    .where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, studentId))).get() || null;

  const questionIds = (row.question_ids as number[]) || [];
  const questions = questionIds.length
    ? db.select().from(question).where(inArray(question.id, questionIds)).orderBy(question.id).all()
    : [];

  const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id).filter(Boolean))] as number[];
  const kpMap = new Map<number, string>();
  if (kpIds.length) {
    db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint).where(inArray(knowledgePoint.id, kpIds)).all()
      .forEach((kp) => kpMap.set(kp.id, kp.name));
  }

  const answers = db.select().from(examAnswer)
    .where(and(eq(examAnswer.exam_id, examId), eq(examAnswer.student_id, studentId))).all();
  const gradings = db.select().from(examGrading)
    .where(and(eq(examGrading.exam_id, examId), eq(examGrading.student_id, studentId))).all();

  const answerMap = new Map(answers.map((a) => [a.question_id, a]));
  const gradingMap = new Map(gradings.map((g) => [g.question_id, g]));

  const details = questions.map((q) => {
    const ans = answerMap.get(q.id) || null;
    const grading = gradingMap.get(q.id) || null;
    return {
      question: {
        id: q.id,
        question_type: q.question_type,
        content: q.content,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
        knowledge_point: kpMap.get(q.knowledge_point_id) ? { name: kpMap.get(q.knowledge_point_id)! } : null,
      },
      answer: ans ? {
        id: ans.id,
        student_answer: ans.student_answer,
        is_answered: ans.is_answered,
        marked: ans.marked,
        saved_at: ans.saved_at,
      } : null,
      grading: grading ? {
        id: grading.id,
        full_score: grading.full_score,
        total_score: grading.total_score,
        teacher_override_score: grading.teacher_override_score,
        status: grading.status,
        overall_comment: grading.overall_comment,
        error_type: grading.error_type,
        completed_at: grading.completed_at,
      } : null,
    };
  });

  const totalScore = gradings.reduce(
    (sum, g) => sum + (g.status === 'completed' ? (g.teacher_override_score ?? (g.total_score || 0)) : 0),
    0
  );
  const gradedCount = gradings.filter((g) => g.status === 'completed').length;

  return NextResponse.json({
    success: true,
    data: {
      exam: {
        id: row.id,
        title: row.title,
        course_name: courseName,
        total_score: row.total_score ?? 100,
        status: row.status,
        grades_published: !!row.grades_published,
        has_subjective: !!row.has_subjective,
      },
      student: { ...student, class_name: className },
      attempt: attempt ? {
        status: attempt.status,
        submitted_via: attempt.submitted_via,
        submitted_at: attempt.submitted_at,
      } : null,
      details,
      summary: { totalScore, fullScore: row.total_score ?? 100, gradedCount, totalCount: questionIds.length },
    },
  });
}
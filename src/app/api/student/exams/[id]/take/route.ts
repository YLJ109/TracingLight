import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { exam, examAttempt, examAnswer, examGrading, user, question, course } from '@/storage/database/shared/schema';
import { buildPaper, defaultProctorConfig, normalizeOptions } from '@/lib/exam-core';

/** 专考页数据：exam 元信息 + 学生信息 + 个人卷(乱序) + 已存作答 + 权限判定 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const ex = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!ex) return NextResponse.json({ error: '考试不存在' }, { status: 404 });

  const attempt = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).execute())[0];
  if (!attempt) return NextResponse.json({ error: '请先开始考试' }, { status: 400 });
  const finished = ['submitted', 'auto_submitted', 'terminated'].includes(attempt.status ?? '');
  if (finished) return NextResponse.json({ error: 'ALREADY_SUBMITTED', already_submitted: true, submitted_via: attempt.submitted_via }, { status: 200 });

  const student = (await db.select({ id: user.id, real_name: user.real_name, username: user.username, avatar_url: user.avatar_url }).from(user).where(eq(user.id, r.user.userId)).execute())[0];
  const courseName = ((await db.select({ name: course.name }).from(course).where(eq(course.id, ex.course_id)).execute())[0]?.name || '');

  // 题目（不含答案）
  const qids = ex.question_ids as number[];
  const qRows = await db.select({
    id: question.id, question_type: question.question_type, difficulty: question.difficulty,
    content: question.content, options: question.options, knowledge_point_id: question.knowledge_point_id,
  }).from(question).where(inArray(question.id, qids)).execute();

  const optionsByQuestion: Record<number, Array<{ key: string; text: string }>> = {};
  for (const q of qRows) optionsByQuestion[q.id] = normalizeOptions(q.options);

  const paper = buildPaper(examId, r.user.userId, qids, ex.randomized !== false, optionsByQuestion);

  // 已存作答
  const answers = await db.select().from(examAnswer).where(eq(examAnswer.attempt_id, attempt.id)).execute();

  // 每题满分（归一化）
  const scores = (ex.question_scores as Record<string, number>) || {};
  const fullByQ: Record<number, number> = {};
  for (const q of qRows) fullByQ[q.id] = scores[String(q.id)] ?? (q.difficulty === 'easy' ? 4 : q.difficulty === 'hard' ? 8 : 6);

  return NextResponse.json({
    exam: {
      id: ex.id, title: ex.title, description: ex.description, course_name: courseName,
      time_mode: ex.time_mode, start_at: ex.start_at, end_at: ex.end_at, duration: ex.duration,
      deadline: attempt.deadline, has_subjective: ex.has_subjective, grades_published: ex.grades_published,
      status: ex.status,
    },
    student: student ? { id: student.id, real_name: student.real_name, username: student.username, avatar_url: student.avatar_url } : null,
    attempt: { id: attempt.id, started_at: attempt.started_at, deadline: attempt.deadline, face_verified: attempt.face_verified, face_strategy: attempt.face_strategy },
    proctor_config: ex.proctor_config ?? defaultProctorConfig(),
    paper,
    questions: qRows.map((q) => ({ ...q, options: optionsByQuestion[q.id] || [], full_score: fullByQ[q.id] })),
    answers: answers.map((a) => ({ question_id: a.question_id, student_answer: a.student_answer, marked: a.marked, revise_count: a.revise_count })),
  });
}
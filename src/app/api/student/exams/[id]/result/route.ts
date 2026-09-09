import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { exam, examAttempt, examAnswer, examGrading, examAppeal, question, course, knowledgePoint } from '@/storage/database/shared/schema';
import { buildPaper, normalizeOptions } from '@/lib/exam-core';

/** 考试结果/复盘页：成绩 + 逐题判分 + 参考/解析 + AI 评语 + 申诉状态 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const ex = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!ex) return NextResponse.json({ error: '考试不存在' }, { status: 404 });

  const attempt = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).execute())[0];
  if (!attempt) return NextResponse.json({ error: '未参加考试' }, { status: 403 });
  const finished = ['submitted', 'auto_submitted', 'terminated'].includes(attempt.status ?? '');
  if (!finished) return NextResponse.json({ can_view: false, reason: 'not_finished' });
  // 成绩公布前不得查看参考答案/评分（教师批改复核并手动公布后才可复盘）
  if (finished && !ex.grades_published) return NextResponse.json({ can_view: false, reason: 'not_published' });

  const courseName = ((await db.select({ name: course.name }).from(course).where(eq(course.id, ex.course_id)).execute())[0]?.name || '');

  const answers = await db.select().from(examAnswer).where(eq(examAnswer.attempt_id, attempt.id)).execute();
  const myAnswerIds = answers.map((a) => a.id);
  // 只取本学生自己的判分，避免多学生共享同一 exam 时串行错乱
  const gradings = myAnswerIds.length
    ? await db.select().from(examGrading).where(and(eq(examGrading.exam_id, examId), inArray(examGrading.answer_id, myAnswerIds))).execute()
    : [];
  const appeals = await db.select().from(examAppeal).where(eq(examAppeal.exam_id, examId)).execute();
  const qids = ex.question_ids as number[];
  const qRows = await db.select({
    id: question.id, question_type: question.question_type, difficulty: question.difficulty,
    content: question.content, options: question.options, answer: question.answer, analysis: question.analysis,
    knowledge_point_id: question.knowledge_point_id,
  }).from(question).where(inArray(question.id, qids)).execute();
  const qMap = new Map(qRows.map((q) => [q.id, q]));

  const kpIdSet = new Set(qRows.map((q) => q.knowledge_point_id));
  const kpNameMap = new Map<string, string>();
  if (kpIdSet.size) {
    const kps = await db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint).where(inArray(knowledgePoint.id, [...kpIdSet])).execute();
    for (const k of kps) kpNameMap.set(String(k.id), k.name);
  }

  const optionsByQuestion: Record<number, Array<{ key: string; text: string }>> = {};
  for (const q of qRows) optionsByQuestion[q.id] = normalizeOptions(q.options);

  // 同一份个人卷布局，保证复盘顺序与作答一致
  const paper = buildPaper(examId, r.user.userId, qids, ex.randomized !== false, optionsByQuestion);

  const scores = (ex.question_scores as Record<string, number>) || {};
  const gradingByQ = new Map(gradings.map((g) => [g.question_id, g]));
  const appealByQ = new Map(appeals.filter((a) => a.question_id).map((a) => [a.question_id, a]));

  const items = paper.map((p) => {
    const q = qMap.get(p.id);
    const ans = answers.find((a) => a.question_id === p.id);
    const g = gradingByQ.get(p.id);
    const ap = appealByQ.get(p.id);
    const unmastered = (g?.unmastered_knowledge_ids as number[] | null) || [];
    return {
      question: q ? { ...q, options: optionsByQuestion[p.id] || [], full_score: scores[String(p.id)] ?? (q.difficulty === 'easy' ? 4 : q.difficulty === 'hard' ? 8 : 6) } : null,
      knowledge_point_name: q ? kpNameMap.get(String(q.knowledge_point_id)) || '' : '',
      student_answer: ans?.student_answer ?? '',
      is_answered: ans?.is_answered ?? false,
      grading: g ? {
        total_score: g.total_score, full_score: g.full_score, overall_comment: g.overall_comment,
        status: g.status, teacher_override_score: g.teacher_override_score,
        dimension_scores: g.dimension_scores, annotations: g.annotations,
        unmastered_knowledge_ids: unmastered,
        unmastered_knowledge_names: unmastered.map((id: number) => kpNameMap.get(String(id)) || '').filter(Boolean),
        error_type: g.error_type, ai_generated_probability: g.ai_generated_probability,
      } : null,
      appeal: ap ? { id: ap.id, reason: ap.reason, status: ap.status, teacher_comment: ap.teacher_comment } : null,
    };
  });

  // 汇总成绩
  let got = 0;
  let full = 0;
  for (const g of gradings) {
    if (g.total_score != null && g.full_score) { got += g.total_score; full += g.full_score; }
  }
  // 待批主观题不计入可得满分（避免误判未公布仍显示满分）
  const pendingCount = gradings.filter((g) => g.status === 'pending' || g.total_score == null).length;

  return NextResponse.json({
    can_view: true,
    exam: { id: ex.id, title: ex.title, course_name: courseName, grades_published: ex.grades_published, total_score: ex.total_score, has_subjective: ex.has_subjective, status: ex.status, submitted_via: attempt.submitted_via, submitted_at: attempt.submitted_at },
    summary: { got_score: got, full_score: full, pending_count: pendingCount },
    items,
  });
}
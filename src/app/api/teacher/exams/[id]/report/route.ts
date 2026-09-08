import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, inArray } from 'drizzle-orm';
import { exam, examEnroll, examAttempt, examGrading, examAnswer, user, classInfo, course, question, knowledgePoint } from '@/storage/database/shared/schema';

/** 成绩报表统计：客观分 + 已批主观分，按学生汇总；跨租户仅本人考试可见 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const courseName = db.select({ name: course.name }).from(course).where(eq(course.id, row.course_id)).get()?.name || '';
  const enrolls = db.select().from(examEnroll).where(eq(examEnroll.exam_id, examId)).all();
  const studentIds = enrolls.map((e) => e.student_id);
  const studentsByName = new Map<number, { id: number; real_name: string; username: string; class_id: number | null }>();
  if (studentIds.length) {
    db.select({ id: user.id, real_name: user.real_name, username: user.username, class_id: user.class_id })
      .from(user).where(inArray(user.id, studentIds)).all().forEach((s) => studentsByName.set(s.id, s));
  }
  const classNames = new Map<number, string>();
  db.select({ id: classInfo.id, name: classInfo.name }).from(classInfo).all().forEach((c) => classNames.set(c.id, c.name));

  const attempts = db.select().from(examAttempt).where(eq(examAttempt.exam_id, examId)).all();
  const attemptBySid = new Map(attempts.map((a) => [a.student_id, a]));
  const gradings = db.select().from(examGrading).where(eq(examGrading.exam_id, examId)).all();
  const gradingsBySid = new Map<number, typeof gradings>();
  for (const g of gradings) {
    if (!gradingsBySid.has(g.student_id)) gradingsBySid.set(g.student_id, []);
    gradingsBySid.get(g.student_id)!.push(g);
  }

  const full = row.total_score ?? 100;
  const students = enrolls.map((en) => {
    const stu = studentsByName.get(en.student_id);
    const att = attemptBySid.get(en.student_id) || null;
    const rows = gradingsBySid.get(en.student_id) || [];
    const submitted = !!att && ['submitted', 'auto_submitted', 'terminated'].includes(String(att.status));
    // 得分为已批（completed）题目合计；主观题待批不计分
    const score = rows.reduce((s, g) => s + (g.status === 'completed' && g.total_score != null ? g.total_score : 0), 0);
    const subjective_pending = rows.filter((g) => g.status === 'pending').length;
    const graded = submitted && subjective_pending === 0 && rows.length > 0;
    let state: string;
    if (submitted) state = 'submitted';
    else if (en.enroll_status === 'absent') state = 'absent';
    else if (att && att.status === 'in_progress') state = 'active';
    else state = 'pending';
    const percent = submitted ? Math.round((score / full) * 1000) / 10 : null;
    return {
      student: { id: stu?.id || en.student_id, real_name: stu?.real_name || '', username: stu?.username || '', class_name: classNames.get(stu?.class_id ?? 0) || '' },
      state, score: submitted ? Math.round(score) : null, full, graded, subjective_pending,
      percent,
      submitted_via: att?.submitted_via || null,
      submitted_at: att?.submitted_at || null,
    };
  });

  const submittedRows = students.filter((s) => s.state === 'submitted');
  const gradedRows = submittedRows.filter((s) => s.graded);
  const avg_percent = gradedRows.length
    ? Math.round((gradedRows.reduce((sum, s) => sum + (s.percent || 0), 0) / gradedRows.length) * 10) / 10
    : null;

  // —— 题目诊断：按题统计作答人数/得分率/正确率 ——
  const qids = (row.question_ids as number[]) || [];
  const qRows = qids.length
    ? new Map(db.select({ id: question.id, question_type: question.question_type, content: question.content, knowledge_point_id: question.knowledge_point_id })
        .from(question).where(inArray(question.id, qids)).all().map((q) => [q.id, q]))
    : new Map();
  const answersByQ = new Map<number, Array<{ student_id: number }>>();
  if (studentIds.length) {
    db.select({ question_id: examAnswer.question_id, student_id: examAnswer.student_id })
      .from(examAnswer).where(inArray(examAnswer.exam_id, [examId])).all()
      .forEach((a) => { if (!answersByQ.has(a.question_id)) answersByQ.set(a.question_id, []); answersByQ.get(a.question_id)!.push(a); });
  }
  const fullScoreOf = (qid: number): number => {
    const scores = (row.question_scores as Record<string, number>) || {};
    return Number(scores[String(qid)]) || 10;
  };
  const questionStats = qids.map((qid) => {
    const q = qRows.get(qid);
    const answered = (answersByQ.get(qid) || []).length;
    const gs = gradings.filter((g) => g.question_id === qid && g.status === 'completed' && g.total_score != null);
    const sum = gs.reduce((s, g) => s + (g.total_score || 0), 0);
    const full = gs.length ? gs.reduce((s, g) => s + (g.full_score || 0), 0) : (fullScoreOf(qid) * answered);
    const avgRate = gs.length ? Math.round((sum / (gs.reduce((s, g) => s + (g.full_score || 0), 0) || 1)) * 1000) / 10 : null;
    const wrong = gs.filter((g) => (g.full_score || 0) > 0 && (g.total_score || 0) < (g.full_score || 0)).length;
    return {
      question_id: qid,
      question_type: q?.question_type || '',
      content: q?.content || '',
      knowledge_point_id: q?.knowledge_point_id || 0,
      answered, graded: gs.length, wrong,
      avg_rate: avgRate, // 已批题目的平均得分率（%）
    };
  });

  // —— 薄弱知识点：聚合已批错题的未掌握知识点（含 AI 归因）TopN ——
  const weakKpCount = new Map<number, { count: number }>();
  for (const g of gradings) {
    if (g.status !== 'completed' || g.total_score == null) continue;
    if ((g.full_score || 0) > 0 && (g.total_score || 0) >= (g.full_score || 0)) continue; // 只统计答错
    const ids = (g.unmastered_knowledge_ids as number[] | null) || [];
    (ids.length ? ids : [g.knowledge_point_id]).forEach((kid) => {
      const rec = weakKpCount.get(kid) || { count: 0 };
      rec.count += 1;
      weakKpCount.set(kid, rec);
    });
  }
  const kpRows = [...weakKpCount.keys()].length
    ? new Map(db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint).where(inArray(knowledgePoint.id, [...weakKpCount.keys()])).all().map((k) => [k.id, k]))
    : new Map();
  const weakKnowledgePoints = [...weakKpCount.entries()]
    .map(([kid, v]) => ({ id: kid, name: kpRows.get(kid)?.name || `知识点${kid}`, wrong_count: v.count }))
    .sort((a, b) => b.wrong_count - a.wrong_count)
    .slice(0, 8);

  return NextResponse.json({
    exam: { id: row.id, title: row.title, course_name: courseName, status: row.status, grades_published: !!row.grades_published, has_subjective: !!row.has_subjective, total_score: full },
    students,
    summary: { total: students.length, submitted: submittedRows.length, graded: gradedRows.length, avg_percent },
    question_stats: questionStats,
    weak_knowledge_points: weakKnowledgePoints,
  });
}
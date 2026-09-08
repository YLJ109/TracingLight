import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { exam, examGrading, question, user, errorBook, knowledgePoint } from '@/storage/database/shared/schema';
import { computeGrade } from '@/services/grading.service';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';
import { recordErrorBook, type GradableQuestion } from '@/lib/exam-grading';
import { saveDb } from '@/storage/database/db';

/** 教师：获取待批主观题（按题聚合学生作答） / 提交单题评分 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const pending = db.select().from(examGrading).where(and(eq(examGrading.exam_id, examId), eq(examGrading.status, 'pending'))).all();
  const qids = pending.map((p) => p.question_id);
  const questions = qids.length
    ? new Map(db.select().from(question).where(inArray(question.id, qids)).all().map((q) => [q.id, q]))
    : new Map();
  const stuIds = pending.map((p) => p.student_id);
  const students = stuIds.length
    ? new Map(db.select({ id: user.id, real_name: user.real_name, username: user.username }).from(user).where(inArray(user.id, stuIds)).all().map((s) => [s.id, s]))
    : new Map();

  const grouped: Array<any> = [];
  const byQ = new Map<number, Array<any>>();
  for (const p of pending) {
    if (!byQ.has(p.question_id)) byQ.set(p.question_id, []);
    byQ.get(p.question_id)!.push(p);
  }
  for (const [qid, rows] of byQ) {
    const q = questions.get(qid);
    grouped.push({
      question_id: qid,
      question_type: q?.question_type || '',
      content: q?.content || '',
      answer: q?.answer || '',
      analysis: q?.analysis || '',
      options: q?.options || null,
      rows: rows.map((g) => ({
        grading_id: g.id, student_id: g.student_id,
        student_name: students.get(g.student_id)?.real_name || students.get(g.student_id)?.username || '',
        student_answer: g.student_answer, full_score: g.full_score, status: g.status,
        ai_total_score: g.total_score,                 // AI 初评建议分
        ai_overall_comment: g.overall_comment,          // AI 评语
        ai_dimension_scores: g.dimension_scores,        // AI 维度分
        ai_annotations: g.annotations,                  // AI 逐行批注
        ai_unmastered_ids: g.unmastered_knowledge_ids,
        ai_generated_probability: g.ai_generated_probability,
      })),
    });
  }

  return NextResponse.json({ exam: { id: row.id, title: row.title }, pending_count: pending.length, grouped });
}

/** 提交评分：更新 -> 联动错题本（扣分/答错） + 掌握度 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  // AI 批量批改：对 pending 主观题逐题调 AI 生成「建议分/评语/批注/薄弱点」，
  // 仅写为建议（status 仍 pending），教师复核后「采纳 AI 分」或手动改分，再手动公布成绩。
  if (body.action === 'ai_batch') {
    const pend = db.select().from(examGrading).where(and(eq(examGrading.exam_id, examId), eq(examGrading.status, 'pending'))).all();
    const qids = [...new Set(pend.map((p) => p.question_id))];
    const qMap = qids.length
      ? new Map(db.select().from(question).where(inArray(question.id, qids)).all().map((q) => [q.id, q]))
      : new Map();
    const kpName = async (id: number) =>
      db.select({ name: knowledgePoint.name }).from(knowledgePoint).where(eq(knowledgePoint.id, id)).get()?.name || '';
    let done = 0;
    let fail = 0;
    for (const g of pend) {
      const q = qMap.get(g.question_id);
      if (!q) continue;
      try {
        const full = g.full_score || q.default_score || 10;
        const res = await computeGrade(q as any, g.student_answer || '', await kpName(g.knowledge_point_id), undefined, null, full);
        const totalScore = typeof res.total_score === 'number' ? res.total_score : null;
        const correct = totalScore != null && totalScore >= full;
        db.update(examGrading).set({
          total_score: totalScore,
          overall_comment: res.overall_comment || null,
          dimension_scores: res.dimension_scores ?? null,
          annotations: res.annotations ?? null,
          unmastered_knowledge_ids: correct ? (res.unmastered_knowledge_ids?.length ? res.unmastered_knowledge_ids : []) : (res.unmastered_knowledge_ids?.length ? res.unmastered_knowledge_ids : [g.knowledge_point_id]),
          error_type: res.error_type || null,
          ai_generated_probability: res.ai_generated_probability ?? null,
        }).where(eq(examGrading.id, g.id)).run();
        done++;
      } catch (e) {
        console.error('Exam AI batch grading failed', g.id, e);
        fail++;
      }
    }
    try { saveDb(); } catch { /* 兜底 */ }
    return NextResponse.json({ ok: true, done, fail });
  }

  if (!body.items) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const now = new Date().toISOString();
  for (const it of body.items) {
    const g = db.select().from(examGrading).where(eq(examGrading.id, it.grading_id)).get();
    if (!g || g.exam_id !== examId) continue;
    const score = Number(it.score);
    const comment = it.comment || g.overall_comment; // 未填评语则保留 AI 评语
    const correct = score >= (g.full_score || 1);
    db.update(examGrading).set({
      total_score: score, status: 'completed', overall_comment: comment, completed_at: now,
    }).where(eq(examGrading.id, g.id)).run();

    // 统一掌握度回写（与作业/申诉同一口径：指数平滑，按得分率计，答错累计错误计数）
    syncMasteryFromGrading({ studentId: g.student_id, knowledgePointId: g.knowledge_point_id, score, fullScore: g.full_score || 0, isCorrect: correct });

    // 错题本联动：答错且非空答 → 入错题本（幂等，经统一入口 recordErrorBook 写入真实 AI 归因）；答对 → 仅当已有错题记录时标记已掌握并清除复习排期。
    // 与考试客观题共用同一入口（exam-grading.recordErrorBook）：新题调用 error-analysis 生成 error_analysis/knowledge_explanation/learning_suggestion，
    // AI 失败静默落 null，学生端由 /api/ai/analyze-error 兜底补全，不阻塞批改主流程。
    const exist = db.select().from(errorBook)
      .where(and(eq(errorBook.student_id, g.student_id), eq(errorBook.question_id, g.question_id))).get();
    if (!correct && (g.student_answer || '').trim() && !exist) {
      const q = db.select().from(question).where(eq(question.id, g.question_id)).get();
      if (q) {
        const gradable: GradableQuestion = {
          id: q.id,
          question_type: q.question_type,
          content: q.content || '',
          answer: q.answer || '',
          knowledge_point_id: q.knowledge_point_id,
          default_score: q.default_score || 10,
        };
        await recordErrorBook(g.exam_id || examId, g.student_id, gradable, g.student_answer || '', g.error_type || 'subjective');
      }
    } else if (correct && exist) {
      db.update(errorBook).set({ review_status: 'mastered', next_review_at: null, reviewed_at: now }).where(eq(errorBook.id, exist.id)).run();
    }
  }
  try { saveDb(); } catch { /* 定时持久化兜底 */ }
  return NextResponse.json({ ok: true });
}
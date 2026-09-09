import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, inArray, and } from 'drizzle-orm';
import { exam, examAppeal, examGrading, question, user, errorBook } from '@/storage/database/shared/schema';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';

/** 教师：申诉列表 + 处理申诉（改分/驳回） */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const appeals = await db.select().from(examAppeal).where(eq(examAppeal.exam_id, examId)).execute();
  const stuIds = appeals.map((a) => a.student_id);
  const students = stuIds.length
    ? new Map((await db.select({ id: user.id, real_name: user.real_name, username: user.username }).from(user).where(inArray(user.id, stuIds)).execute()).map((s) => [s.id, s]))
    : new Map();
  const qids = appeals.map((a) => a.question_id);
  const questions = qids.length
    ? new Map((await db.select({ id: question.id, content: question.content }).from(question).where(inArray(question.id, qids)).execute()).map((q) => [q.id, q]))
    : new Map();

  return NextResponse.json({
    exam: { id: row.id, title: row.title },
    appeals: appeals.map((a) => ({
      id: a.id, student_id: a.student_id, student_name: students.get(a.student_id)?.real_name || students.get(a.student_id)?.username || '',
      question_id: a.question_id, question_content: questions.get(a.question_id)?.content || '',
      reason: a.reason, status: a.status, teacher_comment: a.teacher_comment, handled_at: a.handled_at, grading_id: a.grading_id,
    })),
  });
}

/** 处理申诉 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.appeal_id) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const appeal = (await db.select().from(examAppeal).where(eq(examAppeal.id, body.appeal_id)).execute())[0];
  if (!appeal || appeal.exam_id !== examId) return NextResponse.json({ error: '申诉不存在' }, { status: 404 });

  const status = body.status === 'resolved' ? 'resolved' : 'rejected';
  const now = new Date().toISOString();

  // 通过且给了新分 → 更新判分，并统一联动掌握度与错题本
  if (status === 'resolved' && body.override_score != null && appeal.grading_id) {
    const g = (await db.select().from(examGrading).where(eq(examGrading.id, appeal.grading_id)).execute())[0];
    if (g) {
      const full = g.full_score || 0;
      // 分值范围钳制，避免超满分/负分造成总分与掌握度越界
      const newScore = Math.max(0, Math.min(Number(body.override_score) || 0, full));
      await db.update(examGrading).set({
        total_score: newScore, teacher_override_score: newScore, status: 'completed', completed_at: now,
      }).where(eq(examGrading.id, appeal.grading_id)).execute();

      const isCorrect = full > 0 && newScore >= full;
      // 掌握度回写（与批改/作业同一口径：指数平滑，对题不计错，错题计错）
      await syncMasteryFromGrading({ studentId: appeal.student_id, knowledgePointId: (g.knowledge_point_id as number | null) ?? null, score: newScore, fullScore: full, isCorrect });

      // 错题本联动：判对 → 标记已掌握并移除复习排期；判错 → 重置 pending 排期
      // 仅 reconcile 已存在的错题行（该题原始判错时已由提交落库进入错题本），不做部分字段的新增插入
      const eb = (await db.select().from(errorBook)
        .where(and(eq(errorBook.student_id, appeal.student_id), eq(errorBook.question_id, g.question_id))).execute())[0];
      if (eb) {
        const next = !isCorrect
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
          : null;
        await db.update(errorBook).set({ review_status: isCorrect ? 'mastered' : 'pending', next_review_at: next }).where(eq(errorBook.id, eb.id)).execute();
      }
    }
  }

  await db.update(examAppeal).set({ status, teacher_comment: body.teacher_comment || appeal.teacher_comment, handled_at: now }).where(eq(examAppeal.id, appeal.id)).execute();
  return NextResponse.json({ ok: true });
}
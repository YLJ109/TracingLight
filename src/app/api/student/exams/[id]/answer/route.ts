import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { exam, examAttempt, examAnswer } from '@/storage/database/shared/schema';

interface SaveAnswerItem {
  question_id: number;
  student_answer?: string | null;
  marked?: boolean;
  duration_ms?: number;
  revise_count?: number;
}

/** 保存作答（草稿，仅进行中的 attempt；提交后只读禁止修改） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const attempt = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).execute())[0];
  if (!attempt) return NextResponse.json({ error: '请先开始考试' }, { status: 403 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ error: '考试已结束，无法修改作答' }, { status: 403 });
  // 服务器权威 deadline 校验
  if (new Date(attempt.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: '考试超时，作答已锁定' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.answers)) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const now = new Date().toISOString();
  for (const item of body.answers as SaveAnswerItem[]) {
    if (!item.question_id) continue;
    const existing = (await db.select().from(examAnswer)
      .where(and(eq(examAnswer.attempt_id, attempt.id), eq(examAnswer.question_id, item.question_id))).execute())[0];
    const studentAnswer = (item.student_answer ?? '').trim();
    if (existing) {
      await db.update(examAnswer).set({
        student_answer: item.student_answer ?? existing.student_answer,
        is_answered: studentAnswer.length > 0,
        marked: item.marked ?? existing.marked,
        revise_count: (item.revise_count ?? 0) + (existing.revise_count || 0),
        duration_ms: (item.duration_ms ?? 0) + (existing.duration_ms || 0),
        saved_at: now,
      }).where(eq(examAnswer.id, existing.id)).execute();
    } else {
      await db.insert(examAnswer).values({
        attempt_id: attempt.id, exam_id: examId, student_id: r.user.userId, question_id: item.question_id,
        student_answer: item.student_answer ?? '', is_answered: studentAnswer.length > 0,
        marked: item.marked ?? false, revise_count: item.revise_count ?? 0, duration_ms: item.duration_ms ?? 0,
        saved_at: now,
      }).execute();
    }
  }

  return NextResponse.json({ ok: true, saved_at: now });
}
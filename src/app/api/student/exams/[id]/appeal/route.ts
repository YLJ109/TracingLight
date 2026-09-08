import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { examAppeal, examGrading } from '@/storage/database/shared/schema';

/** 学生对单题发起成绩申诉（仅已公布成绩时允许） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const { question_id, grading_id, reason } = body || {};
  if (!question_id || !reason?.trim()) return NextResponse.json({ error: '请填写申诉原因' }, { status: 400 });

  // 校验该题确属于本考生
  const g = db.select().from(examGrading)
    .where(and(eq(examGrading.exam_id, examId), eq(examGrading.student_id, r.user.userId), eq(examGrading.question_id, question_id))).get();
  if (!g) return NextResponse.json({ error: '无权对该题申诉' }, { status: 403 });

  // 是否已有未处理申诉
  const exist = db.select().from(examAppeal)
    .where(and(eq(examAppeal.exam_id, examId), eq(examAppeal.student_id, r.user.userId), eq(examAppeal.question_id, question_id), eq(examAppeal.status, 'pending'))).get();
  if (exist) return NextResponse.json({ error: '该题已有待处理申诉' }, { status: 400 });

  const ins = db.insert(examAppeal).values({
    exam_id: examId, student_id: r.user.userId, question_id, grading_id: grading_id || g.id, reason: reason.trim(),
  }).returning({ id: examAppeal.id }).get();

  return NextResponse.json({ ok: true, appeal_id: ins.id });
}
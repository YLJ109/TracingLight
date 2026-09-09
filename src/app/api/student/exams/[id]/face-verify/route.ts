import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { examAttempt } from '@/storage/database/shared/schema';

/** 人脸识别通过（开考即验）：记录验证时间与策略 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const attempt = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).execute())[0];
  if (!attempt) return NextResponse.json({ error: '请先开始考试' }, { status: 403 });

  await db.update(examAttempt).set({
    face_verified: true,
    face_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).where(eq(examAttempt.id, attempt.id)).execute();

  return NextResponse.json({ ok: true, verified_at: new Date().toISOString() });
}
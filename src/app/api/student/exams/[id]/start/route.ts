import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { exam, examEnroll, examAttempt } from '@/storage/database/shared/schema';
import { canStart, computeDeadline, defaultProctorConfig } from '@/lib/exam-core';

/** 开始/恢复考试：校验开考时间与报名，创建或续用 attempt，返回服务器权威 deadline */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const ex = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!ex) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (ex.status === 'draft') return NextResponse.json({ error: '考试尚未发布' }, { status: 403 });
  if (ex.status === 'closed') return NextResponse.json({ error: '考试已结束' }, { status: 403 });

  const enroll = db.select().from(examEnroll).where(and(eq(examEnroll.exam_id, examId), eq(examEnroll.student_id, r.user.userId))).get();
  if (!enroll || enroll.allow === false) return NextResponse.json({ error: '你不在本次考试名单中' }, { status: 403 });
  if (enroll.enroll_status === 'absent') return NextResponse.json({ error: '你已被登记缺考' }, { status: 403 });

  const nowMs = Date.now();
  const start = canStart(ex, nowMs);
  if (!start.ok) {
    if (start.reason === 'not_started') return NextResponse.json({ error: '考试尚未开始' }, { status: 400 });
    return NextResponse.json({ error: '考试已过截止时间' }, { status: 400 });
  }

  let attempt = db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).get();
  if (attempt && (attempt.status === 'submitted' || attempt.status === 'auto_submitted' || attempt.status === 'terminated')) {
    return NextResponse.json({ error: '你已交卷，无法再次进入' }, { status: 400 });
  }

  const proctor = (ex.proctor_config ?? defaultProctorConfig()) as ReturnType<typeof defaultProctorConfig>;

  if (!attempt) {
    const { deadline } = computeDeadline(ex, nowMs);
    const deviceFp = (await request.json().catch(() => null))?.device_fp || '';
    attempt = db.insert(examAttempt).values({
      exam_id: examId, enroll_id: enroll.id, student_id: r.user.userId,
      started_at: new Date().toISOString(), deadline,
      device_fp: deviceFp, ip: request.headers.get('x-forwarded-for') || '',
      face_strategy: proctor.face_strategy || 'once',
    }).returning().get();
  } else {
    // 续考：读已存的 deadline（服务器权威，不重置）
    attempt = db.select().from(examAttempt).where(eq(examAttempt.id, attempt.id)).get();
  }

  return NextResponse.json({ attempt, proctor_config: proctor });
}
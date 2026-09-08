import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { exam, examAttempt, examProctorEvent } from '@/storage/database/shared/schema';
import { defaultProctorConfig } from '@/lib/exam-core';
import { finalizeExamSubmission } from '@/lib/exam-submit';

interface ProctorEventItem {
  type: string;
  severity?: string;
  detail?: Record<string, unknown>;
}

/** 上报防作弊事件 + 同步尝试计数；超限时服务端权威触发自动交卷 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const attempt = db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).get();
  if (!attempt || attempt.status !== 'in_progress') return NextResponse.json({ ok: true, finished: true });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const events: ProctorEventItem[] = Array.isArray(body.events) ? body.events : [];
  const config = (db.select().from(exam).where(eq(exam.id, examId)).get()?.proctor_config ?? defaultProctorConfig()) as ReturnType<typeof defaultProctorConfig>;
  const now = new Date().toISOString();

  // 写事件
  for (const ev of events) {
    if (ev.type === 'heartbeat') continue; // 心跳不进事件表
    db.insert(examProctorEvent).values({
      exam_id: examId, attempt_id: attempt.id, student_id: r.user.userId,
      type: ev.type, severity: ev.severity || 'warn', detail: ev.detail || {},
      created_at: now,
    }).run();
  }

  // 同步服务端累计计数（取更大值防绕过）
  const switchCount = Math.max(attempt.switch_count || 0, Number(body.switch_count) || 0);
  const feCount = Math.max(attempt.fullscreen_exit_count || 0, Number(body.fullscreen_exit_count) || 0);
  const riskScore = Math.min(100, Math.round(
    switchCount * 20 + feCount * 15 + (Number(body.extra_risk) || 0)
  ));

  const clickRiskTypes = ['fullscreen_exit', 'switch_away', 'devtools', 'copy', 'paste', 'blur'];
  const flags = (attempt.risk_flags as any as string[]) || [];
  for (const ev of events) {
    if (clickRiskTypes.includes(ev.type) && !flags.includes(ev.type)) flags.push(ev.type);
  }

  db.update(examAttempt).set({
    switch_count: switchCount, fullscreen_exit_count: feCount, risk_score: riskScore,
    risk_flags: flags, device_fp: body.device_fp || attempt.device_fp, updated_at: now,
  }).where(eq(examAttempt.id, attempt.id)).run();

  // 超限 → 服务端权威自动交卷
  const maxSwitch = Number(config.max_switch) || 3;
  if (switchCount > maxSwitch) {
    await finalizeExamSubmission(attempt.id, 'exceed');
    return NextResponse.json({ ok: true, auto_submitted: true, reason: 'switch_overflow' });
  }

  return NextResponse.json({ ok: true, risk_score: riskScore, switch_count: switchCount });
}
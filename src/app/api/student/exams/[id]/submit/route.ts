import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { examAttempt } from '@/storage/database/shared/schema';
import { finalizeExamSubmission } from '@/lib/exam-submit';
import { writeAudit } from '@/lib/audit';

/** 学生交卷：保存剩余作答并最终化成绩（手动交卷） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const attempt = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).execute())[0];
  if (!attempt) return NextResponse.json({ error: '请先开始考试' }, { status: 403 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ error: '考试已交卷' }, { status: 400 });

  const res = await finalizeExamSubmission(attempt.id, 'manual');
  if (!res.submitted) return NextResponse.json({ error: res.reason || '交卷失败' }, { status: 400 });

  // 学生交卷埋点（静默，失败不影响响应）
  try {
    writeAudit({
      operatorId: r.user.userId,
      operatorName: r.user.username,
      action: 'exam_submit',
      targetType: 'exam',
      targetId: examId,
      detail: '学生提交考试答卷',
    });
  } catch (auditErr) {
    console.error('Exam submit audit error:', auditErr);
  }

  return NextResponse.json({ ok: true, submitted_at: new Date().toISOString() });
}
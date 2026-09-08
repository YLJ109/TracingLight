import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { exam, examEnroll, examAttempt, course } from '@/storage/database/shared/schema';
import { canStart, defaultProctorConfig } from '@/lib/exam-core';

/** 进入考试前置页信息：考试元信息 + 防作弊策略 + 报名状态（不创建 attempt） */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);

  const ex = db.select().from(exam).where(eq(exam.id, examId)).get();
  if (!ex) return NextResponse.json({ error: '考试不存在' }, { status: 404 });

  const enroll = db.select().from(examEnroll).where(and(eq(examEnroll.exam_id, examId), eq(examEnroll.student_id, r.user.userId))).get();
  const courseName = db.select({ name: course.name }).from(course).where(eq(course.id, ex.course_id)).get()?.name || '';
  const existing = db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, r.user.userId))).get();
  const start = canStart(ex, Date.now());

  return NextResponse.json({
    exam: {
      id: ex.id, title: ex.title, description: ex.description, course_name: courseName,
      exam_type: ex.exam_type, time_mode: ex.time_mode, start_at: ex.start_at, end_at: ex.end_at,
      duration: ex.duration, total_score: ex.total_score, has_subjective: ex.has_subjective,
      grades_published: ex.grades_published, status: ex.status, randomized: ex.randomized,
    },
    enroll: enroll ? { allow: enroll.allow, enroll_status: enroll.enroll_status } : null,
    proctor_config: ex.proctor_config ?? defaultProctorConfig(),
    can_start: start.ok,
    can_start_reason: start.reason || null,
    existing_attempt: existing ? { status: existing.status, deadline: existing.deadline, face_verified: existing.face_verified } : null,
  });
}
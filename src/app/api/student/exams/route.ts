import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, inArray, ne, and } from 'drizzle-orm';
import { exam, examEnroll, examAttempt, course } from '@/storage/database/shared/schema';

/** 学生「我的考试」列表：展示本届学生的报考考试与状态 */
export async function GET(request: NextRequest) {
  const r = await requireAuthWithStatus(request, 'student');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();

  const enrolls = db.select({ exam_id: examEnroll.exam_id, enroll: examEnroll.id, allow: examEnroll.allow, enroll_status: examEnroll.enroll_status })
    .from(examEnroll).where(eq(examEnroll.student_id, r.user.userId)).all();
  if (enrolls.length === 0) return NextResponse.json({ exams: [] });

  // 向学生隐藏未发布的草稿考试
  const list = db.select().from(exam)
    .where(and(inArray(exam.id, enrolls.map((e) => e.exam_id)), ne(exam.status, 'draft'))).all();
  const attempts = db.select().from(examAttempt).where(eq(examAttempt.student_id, r.user.userId)).all();
  const courseNames = new Map<number, string>();
  db.select({ id: course.id, name: course.name }).from(course).all().forEach((c) => courseNames.set(c.id, c.name));

  const nowMs = Date.now();
  const exams = list.map((e) => {
    const attempt = attempts.find((a) => a.exam_id === e.id) || null;
    return {
      ...e,
      course_name: courseNames.get(e.course_id) || '',
      attempt_status: attempt?.status || null,
      attempt_deadline: attempt?.deadline || null,
      total_score: e.total_score,
      state: computeExamState(e, attempt, nowMs),
    };
  });
  return NextResponse.json({ exams });
}

function computeExamState(e: any, attempt: any | null, nowMs: number): string {
  if (attempt && (attempt.status === 'submitted' || attempt.status === 'auto_submitted' || attempt.status === 'terminated')) {
    return e.grades_published ? 'result' : 'submitted';
  }
  if (attempt && attempt.status === 'in_progress') return 'in_progress';
  if (nowMs < new Date(e.start_at).getTime()) return 'upcoming';
  return 'open';
}
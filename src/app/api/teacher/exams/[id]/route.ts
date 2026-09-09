import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { exam, examEnroll, user, classInfo, course, question } from '@/storage/database/shared/schema';
import { normalizeScores, defaultProctorConfig, normalizeOptions } from '@/lib/exam-core';
import { writeAudit } from '@/lib/audit';

async function getExam(db: any, id: number) {
  return (await db.select().from(exam).where(eq(exam.id, id)).execute())[0];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const id = parseInt((await params).id);
  const row = await getExam(db, id);
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const enrolls = await db.select({
    student_id: examEnroll.student_id, class_id: examEnroll.class_id, enroll_status: examEnroll.enroll_status,
  }).from(examEnroll).where(eq(examEnroll.exam_id, id)).execute();
  const studentIds = enrolls.map((e: any) => e.student_id);
  const students = studentIds.length
    ? await db.select({ id: user.id, real_name: user.real_name, username: user.username, class_id: user.class_id }).from(user).where(inArray(user.id, studentIds)).execute()
    : [];
  const classNames = new Map<number, string>();
  (await db.select({ id: classInfo.id, name: classInfo.name }).from(classInfo).execute()).forEach((c: any) => classNames.set(c.id, c.name));

  const courseName = (await db.select({ name: course.name }).from(course).where(eq(course.id, row.course_id)).execute())[0]?.name || '';

  const questions: any[] = [];
  for (const qid of (row.question_ids as number[])) {
    const q = (await db.select({ id: question.id, question_type: question.question_type, difficulty: question.difficulty, content: question.content, options: question.options, knowledge_point_id: question.knowledge_point_id }).from(question).where(eq(question.id, qid)).execute())[0];
    if (q) questions.push({ ...q, options: normalizeOptions(q.options) });
  }

  return NextResponse.json({
    exam: { ...row, course_name: courseName },
    students: students.map((s: any) => ({ ...s, class_name: classNames.get(s.class_id) || '' })),
    questions,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const id = parseInt((await params).id);
  const row = await getExam(db, id);
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });
  if (row.status !== 'draft') return NextResponse.json({ error: '已发布考试不可编辑，只能调整时间或公布开关' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const patch: Record<string, unknown> = {
    title: body.title?.trim() ?? row.title,
    description: body.description ?? row.description,
    exam_type: body.exam_type ?? row.exam_type,
    course_id: body.course_id ?? row.course_id,
    class_ids: body.class_ids,
    time_mode: body.time_mode ?? row.time_mode,
    start_at: body.start_at ?? row.start_at,
    end_at: body.end_at ?? row.end_at,
    duration: body.duration ?? row.duration,
    auto_submit: body.auto_submit ?? row.auto_submit,
    allow_resubmit: body.allow_resubmit ?? row.allow_resubmit,
    publish_mode: body.publish_mode ?? row.publish_mode,
    publish_at: body.publish_at ?? row.publish_at,
    proctor_config: body.proctor_config ?? row.proctor_config,
    randomized: body.randomized ?? row.randomized,
    updated_at: new Date().toISOString(),
  };

  // 题目变更则重算分值
  if (body.question_ids?.length) {
    const teacherCourseIds = new Set((await db.select({ id: course.id }).from(course).where(eq(course.teacher_id, r.user.userId)).execute()).map((c: any) => c.id));
    const qs = await db.select({ id: question.id, question_type: question.question_type, difficulty: question.difficulty })
      .from(question).where(inArray(question.id, body.question_ids)).execute();
    if (qs.length !== body.question_ids.length) return NextResponse.json({ error: '部分题目不存在' }, { status: 400 });
    for (const q of qs) {
      const qrow = (await db.select({ course_id: question.course_id }).from(question).where(eq(question.id, q.id)).execute())[0];
      if (qrow && !teacherCourseIds.has(qrow.course_id)) return NextResponse.json({ error: '含无权题目' }, { status: 403 });
    }
    patch.question_ids = body.question_ids;
    patch.question_scores = normalizeScores(qs);
    patch.has_subjective = qs.some((q: any) => !['single_choice', 'multi_choice', 'judgment', 'fill_blank'].includes(q.question_type));
  }

  await db.update(exam).set(patch).where(eq(exam.id, id)).execute();

  // 名单重建（仅 draft）：先清后建
  await db.delete(examEnroll).where(eq(examEnroll.exam_id, id)).execute();
  if (patch.course_id) {
    const classIds = body.class_ids ?? [];
    if (classIds.length) {
      const students = await db.select({ id: user.id, class_id: user.class_id }).from(user)
        .where(and(eq(user.role, 'student'), eq(user.is_active, true), inArray(user.class_id, classIds))).execute();
      for (const s of students) await db.insert(examEnroll).values({ exam_id: id, student_id: s.id, class_id: s.class_id }).execute();
    }
  }

  // 更新考试埋点（静默，失败不影响响应）
  try {
    writeAudit({
      operatorId: r.user.userId,
      operatorName: r.user.username,
      action: 'exam_update',
      targetType: 'exam',
      targetId: id,
      detail: `更新考试「${String(row.title).slice(0, 50)}」`,
    });
  } catch (auditErr) {
    console.error('Exam update audit error:', auditErr);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const id = parseInt((await params).id);
  const row = await getExam(db, id);
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });
  await db.delete(exam).where(eq(exam.id, id)).execute();

  // 删除考试埋点（静默，失败不影响响应）
  try {
    writeAudit({
      operatorId: r.user.userId,
      operatorName: r.user.username,
      action: 'exam_delete',
      targetType: 'exam',
      targetId: id,
      detail: `删除考试「${String(row.title).slice(0, 50)}」`,
    });
  } catch (auditErr) {
    console.error('Exam delete audit error:', auditErr);
  }

  return NextResponse.json({ ok: true });
}
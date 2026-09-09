import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { exam, examEnroll, examAttempt, examProctorEvent, user, classInfo } from '@/storage/database/shared/schema';
import { finalizeExamSubmission } from '@/lib/exam-submit';

/** 实时监考墙：学生 × 尝试 × 事件（含人脸/设备/风险），供教师轮询 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const enrolls = await db.select().from(examEnroll).where(eq(examEnroll.exam_id, examId)).execute();
  const studentIds = enrolls.map((e) => e.student_id);
  const students = studentIds.length
    ? await db.select({ id: user.id, real_name: user.real_name, username: user.username, class_id: user.class_id }).from(user).where(inArray(user.id, studentIds)).execute()
    : [];
  const classNames = new Map<number, string>();
  (await db.select({ id: classInfo.id, name: classInfo.name }).from(classInfo).execute()).forEach((c) => classNames.set(c.id, c.name));
  const attempts = await db.select().from(examAttempt).where(eq(examAttempt.exam_id, examId)).execute();
  const events = await db.select().from(examProctorEvent).where(eq(examProctorEvent.exam_id, examId)).execute();

  const attemptBySid = new Map(attempts.map((a) => [a.student_id, a]));
  const eventsBySid = new Map<number, typeof events>();
  for (const ev of events) {
    const key = ev.student_id;
    if (!eventsBySid.has(key)) eventsBySid.set(key, []);
    eventsBySid.get(key)!.push(ev);
  }

  const nowMs = Date.now();
  const list = enrolls.map((en) => {
    const stu = students.find((s) => s.id === en.student_id);
    const att = attemptBySid.get(en.student_id) || null;
    const evs = (eventsBySid.get(en.student_id) || []).sort((a, b) => (a.created_at || '') > (b.created_at || '') ? 1 : -1);
    const recent = evs[evs.length - 1] || null;
    let state: string;
    if (att && ['submitted', 'auto_submitted', 'terminated'].includes(att.status ?? '')) state = 'submitted';
    else if (att && att.status === 'in_progress') state = nowMs > new Date(att.deadline).getTime() ? 'expired' : 'active';
    else if (en.enroll_status === 'absent') state = 'absent';
    else state = att ? 'paused' : 'pending';
    return {
      student: stu ? { id: stu.id, real_name: stu.real_name, username: stu.username, class_name: stu.class_id != null ? (classNames.get(stu.class_id) || '') : '' } : { id: en.student_id, real_name: '', username: '', class_name: '' },
      enroll_status: en.enroll_status, allow: en.allow,
      state,
      attempt: att ? { id: att.id, started_at: att.started_at, deadline: att.deadline, submitted_at: att.submitted_at, status: att.status, risk_score: att.risk_score, risk_flags: att.risk_flags, switch_count: att.switch_count, fullscreen_exit_count: att.fullscreen_exit_count, face_verified: att.face_verified, face_strategy: att.face_strategy, submitted_via: att.submitted_via, device_fp: att.device_fp } : null,
      events: evs.slice(-20).map((ev) => ({ id: ev.id, type: ev.type, severity: ev.severity, detail: ev.detail, created_at: ev.created_at })),
      recent_event: recent ? { type: recent.type, severity: recent.severity, created_at: recent.created_at } : null,
    };
  });

  return NextResponse.json({ exam: { id: row.id, title: row.title, status: row.status, start_at: row.start_at, end_at: row.end_at, config: row.proctor_config }, rows: list });
}

/** 监考动作：终止考试 / 延长时限 / 发起提醒 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const examId = parseInt((await params).id);
  const row = (await db.select().from(exam).where(eq(exam.id, examId)).execute())[0];
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const studentIds: number[] = Array.isArray(body.student_ids) ? body.student_ids : [];
  const action = body.action; // terminate / extend / remind

  if (!studentIds.length) return NextResponse.json({ error: '请选择考生' }, { status: 400 });

  let gaveExtend = 0;
  for (const sid of studentIds) {
    const att = (await db.select().from(examAttempt).where(and(eq(examAttempt.exam_id, examId), eq(examAttempt.student_id, sid))).execute())[0];
    if (!att) continue;
    if (action === 'terminate') {
      await db.update(examAttempt).set({ updated_at: new Date().toISOString() }).where(eq(examAttempt.id, att.id)).execute();
      await finalizeExamSubmission(att.id, 'terminate');
    } else if (action === 'extend') {
      const extraMin = Number(body.extra_minutes) || 5;
      const base = new Date(att.deadline).getTime();
      const newDeadline = new Date(base + extraMin * 60000).toISOString();
      await db.update(examAttempt).set({ deadline: newDeadline, updated_at: new Date().toISOString() }).where(eq(examAttempt.id, att.id)).execute();
      gaveExtend += 1;
    }
  }

  return NextResponse.json({ ok: true, action, terminated: studentIds.length, extended: gaveExtend });
}
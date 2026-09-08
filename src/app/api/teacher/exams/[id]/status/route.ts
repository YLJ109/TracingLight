import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { exam, examEnroll, notification } from '@/storage/database/shared/schema';

/** 发布/激活/关闭考试（draft→scheduled/active，或手动 active/closed） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const id = parseInt((await params).id);
  const row = db.select().from(exam).where(eq(exam.id, id)).get();
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const action = body?.action || 'publish'; // publish / activate / close

  const nowMs = Date.now();
  let status = row.status;
  if (action === 'publish') {
    if (row.status !== 'draft') return NextResponse.json({ error: '仅草稿可发布' }, { status: 400 });
    const enr = db.select({ id: examEnroll.id }).from(examEnroll).where(eq(examEnroll.exam_id, id)).all();
    if (enr.length === 0) return NextResponse.json({ error: '请先选择考试班级（至少1人）' }, { status: 400 });
    status = nowMs >= new Date(row.start_at).getTime() ? 'active' : 'scheduled';
  } else if (action === 'activate') {
    status = 'active';
  } else if (action === 'close') {
    status = 'closed';
  } else if (action === 'revert_draft') {
    status = 'draft';
  }

  db.update(exam).set({ status, updated_at: new Date().toISOString() }).where(eq(exam.id, id)).run();

  // 发布 → 站内通知开考提醒
  if (action === 'publish') {
    const enrolls = db.select({ student_id: examEnroll.student_id }).from(examEnroll).where(eq(examEnroll.exam_id, id)).all();
    for (const enr of enrolls) {
      db.insert(notification).values({
        user_id: enr.student_id, type: 'exam', title: `${row.title} 已发布`, content: `《${row.title}》开考时间：${row.start_at}，请准时参考。`,
        link: '/student/exams',
      }).run();
    }
  }

  return NextResponse.json({ status });
}
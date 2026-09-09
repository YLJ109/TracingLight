import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { exam } from '@/storage/database/shared/schema';
import { writeAudit } from '@/lib/audit';

/** 手动公布成绩（发布模式=按时间/手动时触发） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const id = parseInt((await params).id);
  const row = (await db.select().from(exam).where(eq(exam.id, id)).execute())[0];
  if (!row) return NextResponse.json({ error: '考试不存在' }, { status: 404 });
  if (row.teacher_id !== r.user.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  await db.update(exam).set({ grades_published: true, updated_at: new Date().toISOString() }).where(eq(exam.id, id)).execute();

  // 考试公布成绩埋点（静默，失败不影响响应）
  writeAudit({
    operatorId: r.user.userId,
    operatorName: r.user.username,
    action: 'exam_grades_published',
    targetType: 'exam',
    targetId: id,
    detail: `公布考试「${row.title}」成绩`,
  });

  return NextResponse.json({ ok: true, grades_published: true });
}
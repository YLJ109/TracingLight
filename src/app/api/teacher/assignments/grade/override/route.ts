import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { gradingTask } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { grading_task_id, override_score, override_comment } = body;

    const db = getDb();
    const data: Record<string, unknown> = {};

    if (override_score !== undefined) {
      data.teacher_override_score = Number(override_score);
    }
    if (override_comment !== undefined) {
      data.teacher_override_comment = override_comment;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '无修改内容' }, { status: 400 });
    }

    db.update(gradingTask)
      .set(data)
      .where(eq(gradingTask.id, Number(grading_task_id)))
      .run();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Grade override error:', e);
    return NextResponse.json({ error: '修改失败' }, { status: 500 });
  }
}

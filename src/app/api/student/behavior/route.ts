import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { learningBehaviorLog } from '@/storage/database/shared/schema';

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const materialId = Number(body.material_id);
    const watchDuration = Number(body.watch_duration) || 0; // 本次停留秒数
    const progress = Number(body.progress) || 0; // 本次进度 0-100
    const isCompleted = !!body.is_completed;

    if (!materialId) return NextResponse.json({ error: '缺少 material_id' }, { status: 400 });

    const existing = db.select().from(learningBehaviorLog)
      .where(and(
        eq(learningBehaviorLog.student_id, authUser.userId),
        eq(learningBehaviorLog.material_id, materialId),
      ))
      .all()[0];

    if (existing) {
      db.update(learningBehaviorLog).set({
        watch_duration: (existing.watch_duration || 0) + watchDuration,
        progress: Math.max(existing.progress || 0, progress),
        review_count: (existing.review_count || 0) + 1,
        is_completed: !!(existing.is_completed || isCompleted),
        last_watched_at: new Date().toISOString(),
      }).where(eq(learningBehaviorLog.id, existing.id)).run();
    } else {
      db.insert(learningBehaviorLog).values({
        student_id: authUser.userId,
        material_id: materialId,
        watch_duration: watchDuration,
        progress,
        review_count: 1,
        is_completed: isCompleted,
        last_watched_at: new Date().toISOString(),
      }).run();
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Report behavior error:', e);
    return NextResponse.json({ error: '上报学习行为失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { user } from '@/storage/database/shared/schema';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    const filters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (level && level !== 'all') {
      filters.push(eq(user.student_level, level));
    }

    const data = db.select().from(user)
      .where(and(...filters))
      .orderBy(user.id)
      .all();

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get students error:', e);
    return NextResponse.json({ error: '获取学生列表失败' }, { status: 500 });
  }
}

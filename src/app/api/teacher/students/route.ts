import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { user } from '@/storage/database/shared/schema';
import { getTeacherClassIds } from '@/lib/teacher-scope';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    // 跨租户隔离：仅返回当前教师授课班级下的学生
    const classIds = getTeacherClassIds(authUser.userId);
    const filters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classIds.length > 0) {
      filters.push(inArray(user.class_id, classIds));
    } else {
      // 该教师无授课班级，返回空列表而非全部学生
      return NextResponse.json({ success: true, data: [] });
    }
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

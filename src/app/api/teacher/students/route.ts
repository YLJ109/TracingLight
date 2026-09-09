import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { user } from '@/storage/database/shared/schema';
import { getTeacherClassIds } from '@/lib/teacher-scope';

export async function GET(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    // 跨租户隔离：仅返回当前教师授课班级下的学生
    const classIds = await getTeacherClassIds(authUser.userId);
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

    // 显式列选择，绝不返回 password 哈希
    const data = await db.select({
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      class_id: user.class_id,
      student_level: user.student_level,
      avatar_url: user.avatar_url,
      is_active: user.is_active,
      created_at: user.created_at,
    }).from(user)
      .where(and(...filters))
      .orderBy(user.id)
      .execute();

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get students error:', e);
    return NextResponse.json({ error: '获取学生列表失败' }, { status: 500 });
  }
}

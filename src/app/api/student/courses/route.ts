import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { course, user } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

/** 学生端课程列表（本班级课程） */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const stu = (await db.select({ class_id: user.class_id }).from(user)
      .where(eq(user.id, authUser.userId)).limit(1).execute())[0];
    if (!stu?.class_id) return NextResponse.json({ success: true, data: [] });
    const list = await db.select({ id: course.id, name: course.name }).from(course)
      .where(eq(course.class_id, stu.class_id)).execute();
    return NextResponse.json({ success: true, data: list });
  } catch (e) {
    console.error('Student courses error:', e);
    return NextResponse.json({ error: '获取课程失败' }, { status: 500 });
  }
}

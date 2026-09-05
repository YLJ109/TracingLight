import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { course } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getDb();
    // 仅返回当前教师所授课程，杜绝越权查看他人课程
    const courses = db.select().from(course).where(eq(course.teacher_id, user.userId)).all();

    return NextResponse.json({ success: true, data: courses });
  } catch (e) {
    console.error('Get courses error:', e);
    return NextResponse.json({ error: '获取课程列表失败' }, { status: 500 });
  }
}

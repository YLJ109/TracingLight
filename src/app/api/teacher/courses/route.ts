import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { course } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getDb();
    const courses = db.select().from(course).all();

    return NextResponse.json({ success: true, data: courses });
  } catch (e) {
    console.error('Get courses error:', e);
    return NextResponse.json({ error: '获取课程列表失败' }, { status: 500 });
  }
}

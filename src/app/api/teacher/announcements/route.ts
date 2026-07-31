import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { announcement } from '@/storage/database/shared/schema';

// GET /api/teacher/announcements - 获取公告列表
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

    const filters = [eq(announcement.teacher_id, authUser.userId)];
    if (courseId) {
      filters.push(eq(announcement.course_id, Number(courseId)));
    }

    const data = db.select().from(announcement)
      .where(and(...filters))
      .orderBy(announcement.created_at)
      .all();

    // Reverse to get descending order (newest first)
    data.reverse();

    return NextResponse.json({ data });
  } catch (e: any) {
    console.error('Get announcements error:', e);
    return NextResponse.json({ error: '获取公告列表失败' }, { status: 500 });
  }
}

// POST /api/teacher/announcements - 发布新公告
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { title, content, course_id, teacher_id } = body;

    if (!title || !content) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const result = db.insert(announcement).values({
      teacher_id: teacher_id || authUser.userId,
      title,
      content,
      course_id: course_id || null,
      is_pinned: false,
      target_type: 'all',
    }).returning().all();

    return NextResponse.json({ data: result[0] || null });
  } catch (e: any) {
    console.error('Create announcement error:', e);
    return NextResponse.json({ error: '发布公告失败' }, { status: 500 });
  }
}

// PUT /api/teacher/announcements - 更新公告
export async function PUT(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { id, title, content, is_pinned } = body;
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;

    db.update(announcement).set(updates).where(eq(announcement.id, id)).run();

    const data = db.select().from(announcement)
      .where(eq(announcement.id, id))
      .get();

    return NextResponse.json({ data });
  } catch (e: any) {
    console.error('Update announcement error:', e);
    return NextResponse.json({ error: '更新公告失败' }, { status: 500 });
  }
}

// DELETE /api/teacher/announcements - 删除公告
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    db.delete(announcement).where(eq(announcement.id, Number(id))).run();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete announcement error:', e);
    return NextResponse.json({ error: '删除公告失败' }, { status: 500 });
  }
}

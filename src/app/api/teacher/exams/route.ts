import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { examSchedule } from '@/storage/database/shared/schema';

// GET /api/teacher/exams - 考试列表
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

    let data;
    if (courseId) {
      data = db.select().from(examSchedule)
        .where(eq(examSchedule.course_id, Number(courseId)))
        .orderBy(examSchedule.exam_date)
        .all();
    } else {
      data = db.select().from(examSchedule)
        .orderBy(examSchedule.exam_date)
        .all();
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('Get exams error:', e);
    return NextResponse.json({ error: '获取考试列表失败' }, { status: 500 });
  }
}

// POST /api/teacher/exams - 创建考试
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { exam_name, course_id, class_id, exam_date, start_time, end_time, knowledge_scope } = body;

    if (!exam_name || !course_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const result = db.insert(examSchedule).values({
      course_id,
      class_id: class_id || 1,
      exam_name,
      exam_date: exam_date || new Date().toISOString().split('T')[0],
      start_time: start_time || '09:00',
      end_time: end_time || '11:00',
      knowledge_scope: knowledge_scope || [],
    }).returning().all();

    return NextResponse.json({ success: true, data: result[0] || null });
  } catch (e: any) {
    console.error('Create exam error:', e);
    return NextResponse.json({ error: '创建考试失败' }, { status: 500 });
  }
}

// PUT /api/teacher/exams - 更新考试
export async function PUT(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    db.update(examSchedule).set(updates).where(eq(examSchedule.id, id)).run();

    const data = db.select().from(examSchedule)
      .where(eq(examSchedule.id, id))
      .get();

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('Update exam error:', e);
    return NextResponse.json({ error: '更新考试失败' }, { status: 500 });
  }
}

// DELETE /api/teacher/exams - 删除考试
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    db.delete(examSchedule).where(eq(examSchedule.id, Number(id))).run();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete exam error:', e);
    return NextResponse.json({ error: '删除考试失败' }, { status: 500 });
  }
}

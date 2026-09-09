import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { knowledgePoint } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { isCourseInTeacherScope } from '@/lib/teacher-scope';

/**
 * 教师新建知识点（供 AI 出题等场景快捷创建）
 * POST {course_id, name, description?}
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const course_id = Number(body?.course_id);
    const name = String(body?.name || '').trim();
    if (!course_id || !name) {
      return NextResponse.json({ success: false, error: '缺少课程或知识点名称' }, { status: 400 });
    }
    if (!await isCourseInTeacherScope(authUser.userId, course_id)) {
      return NextResponse.json({ success: false, error: '无权在该课程下创建知识点' }, { status: 403 });
    }

    // 同课程下重名校验
    const allKps = await db.select({ id: knowledgePoint.id, course_id: knowledgePoint.course_id, name: knowledgePoint.name }).from(knowledgePoint)
      .where(eq(knowledgePoint.course_id, course_id)).execute();
    const exists = allKps.find((k) => k.name === name);
    if (exists) {
      return NextResponse.json({ success: false, error: '该课程下已存在同名知识点' }, { status: 409 });
    }

    const result = await db.insert(knowledgePoint).values({
      course_id,
      name: name.slice(0, 50),
      description: body?.description ? String(body.description).slice(0, 200) : null,
    }).returning().execute();

    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true, data: result[0] });
  } catch (e) {
    console.error('Create knowledge point error:', e);
    return NextResponse.json({ success: false, error: '创建知识点失败' }, { status: 500 });
  }
}

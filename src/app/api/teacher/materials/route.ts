import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, inArray } from 'drizzle-orm';
import { learningMaterial, learningBehaviorLog } from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';

// GET /api/teacher/materials?course_id=N - 列出指定课程的学习材料
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const raw = request.nextUrl.searchParams.get('course_id');
    const courseId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return NextResponse.json({ error: '课程参数无效' }, { status: 400 });
    }
    // 权限：仅能查看自己授课课程的材料，杜绝越权查看他人课程
    if (!(await getTeacherCourseIds(user.userId)).includes(courseId)) {
      return NextResponse.json({ error: '无权查看该课程材料' }, { status: 403 });
    }

    const data = await db.select().from(learningMaterial)
      .where(eq(learningMaterial.course_id, courseId))
      .orderBy(learningMaterial.created_at)
      .execute();

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get teacher materials error:', e);
    return NextResponse.json({ error: '获取学习材料失败' }, { status: 500 });
  }
}

// PUT /api/teacher/materials - 批量保存材料（编辑标题 / 切换必学标记）
// body: { items: [{ id, title?, is_required? }] }
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const items: Array<{ id: number; title?: string; is_required?: boolean }> = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '没有需要保存的材料' }, { status: 400 });
    }

    const ids = items.map((i) => Number(i.id));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      return NextResponse.json({ error: '材料 ID 无效' }, { status: 400 });
    }

    // 一次性取出目标材料，校验归属：材料所属课程必须在本教师授课课程内（防 IDOR）
    const found = await db.select({ id: learningMaterial.id, course_id: learningMaterial.course_id })
      .from(learningMaterial)
      .where(inArray(learningMaterial.id, ids))
      .execute();
    const scopeCourses = await getTeacherCourseIds(user.userId);
    const foundIds = new Set(found.map((r) => r.id));
    if (found.some((r) => !scopeCourses.includes(r.course_id))) {
      return NextResponse.json({ error: '无权操作该课程材料' }, { status: 403 });
    }

    const updated: number[] = [];
    for (const item of items) {
      const id = Number(item.id);
      const curr = found.find((r) => r.id === id);
      // 跳过不存在的（已在上面校验，此处兜底）
      if (!curr) continue;
      const patch: Partial<typeof learningMaterial.$inferSelect> = {};
      if (typeof item.title === 'string') {
        const t = item.title.trim();
        if (!t) return NextResponse.json({ error: `材料 #${id} 标题不能为空` }, { status: 400 });
        patch.title = t;
      }
      if (typeof item.is_required === 'boolean') patch.is_required = item.is_required;
      if (Object.keys(patch).length > 0) {
        await db.update(learningMaterial).set(patch).where(eq(learningMaterial.id, id)).execute();
        updated.push(id);
      }
    }

    return NextResponse.json({ success: true, updated });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Save teacher materials error:', e);
    return NextResponse.json({ error: '保存学习材料失败' }, { status: 500 });
  }
}

// DELETE /api/teacher/materials?id=N - 删除单条学习材料
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: '材料 ID 无效' }, { status: 400 });
    }

    // 校验归属：材料所属课程必须在本教师授课课程内（防越权删除他人材料 / IDOR）
    const target = await db.select({ id: learningMaterial.id, course_id: learningMaterial.course_id })
      .from(learningMaterial)
      .where(eq(learningMaterial.id, id))
      .limit(1)
      .execute();
    if (!target[0] || !(await getTeacherCourseIds(user.userId)).includes(target[0].course_id)) {
      return NextResponse.json({ error: '无权删除该材料' }, { status: 403 });
    }

    // 先清掉关联的学习行为日志，再删材料，避免因外键约束而失败
    await db.delete(learningBehaviorLog).where(eq(learningBehaviorLog.material_id, id)).execute();
    await db.delete(learningMaterial).where(eq(learningMaterial.id, id)).execute();

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Delete teacher material error:', e);
    return NextResponse.json({ error: '删除学习材料失败' }, { status: 500 });
  }
}
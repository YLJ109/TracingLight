import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { learningMaterial, learningBehaviorLog, course } from '@/storage/database/shared/schema';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const sp = request.nextUrl.searchParams;
    const courseId = sp.get('course_id') ? Number(sp.get('course_id')) : null;
    const kpId = sp.get('knowledge_point_id') ? Number(sp.get('knowledge_point_id')) : null;

    const materials = courseId
      ? db.select().from(learningMaterial).where(eq(learningMaterial.course_id, courseId)).all()
      : db.select().from(learningMaterial).all();

    // 按知识点过滤：knowledge_point_ids（JSON）
    const materialsFiltered = kpId
      ? materials.filter((m) => {
          const kpIdsRaw = m.knowledge_point_ids;
          let kpIds: number[] = Array.isArray(kpIdsRaw) ? kpIdsRaw as number[] : [];
          if (!Array.isArray(kpIdsRaw) && typeof kpIdsRaw === 'string') {
            try { const p = JSON.parse(kpIdsRaw); kpIds = Array.isArray(p) ? p : []; } catch { kpIds = []; }
          }
          return kpIds.includes(kpId!);
        })
      : materials;

    // 当前学生的行为日志
    const logs = db.select().from(learningBehaviorLog)
      .where(eq(learningBehaviorLog.student_id, authUser.userId)).all();
    const logMap = new Map(logs.map((l) => [l.material_id, l]));

    // 课程名映射
    const courses = db.select({ id: course.id, name: course.name }).from(course).all();
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));

    const data = materialsFiltered.map((m) => {
      const behavior = logMap.get(m.id) || null;
      return {
        id: m.id,
        course_id: m.course_id,
        course_name: courseMap.get(m.course_id) || '',
        title: m.title,
        type: m.type,
        content: m.content,
        url: m.url,
        duration_minutes: m.duration_minutes,
        knowledge_point_ids: m.knowledge_point_ids,
        chapter: m.chapter,
        is_required: m.is_required,
        behavior: behavior
          ? {
              watch_duration: behavior.watch_duration,
              progress: behavior.progress,
              review_count: behavior.review_count,
              is_completed: behavior.is_completed,
              last_watched_at: behavior.last_watched_at,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get materials error:', e);
    return NextResponse.json({ error: '获取学习材料失败' }, { status: 500 });
  }
}

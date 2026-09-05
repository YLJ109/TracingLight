import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { examSchedule } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, getTeacherClassIds } from '@/lib/teacher-scope';

// 写接口输入校验：类型错误返回 400（而非落库时 500）
const examCreateSchema = z.object({
  exam_name: z.string().trim().min(1, '考试名称不能为空').max(200),
  course_id: z.coerce.number().int().positive('course_id 必须为正整数'),
  class_id: z.coerce.number().int().positive().optional(),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'exam_date 需为 YYYY-MM-DD').optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'start_time 需为 HH:MM').optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'end_time 需为 HH:MM').optional(),
  knowledge_scope: z.array(z.any()).optional(),
});
const examUpdateSchema = z.object({
  exam_name: z.string().trim().min(1).max(200).optional(),
  course_id: z.coerce.number().int().positive().optional(),
  class_id: z.coerce.number().int().positive().optional(),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'exam_date 需为 YYYY-MM-DD').optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  knowledge_scope: z.array(z.any()).optional(),
});

function zodErrorResponse(err: z.ZodError): NextResponse {
  const first = err.issues[0];
  return NextResponse.json(
    { error: `参数错误：${first?.path?.join('.') || ''} ${first?.message || '不合法'}`.trim() },
    { status: 400 }
  );
}

/** 校验课程/班级是否属于当前教师；越权返回 null，正常返回 true */
function scopeCheck(authUser: { userId: number }, courseId?: number | null, classId?: number | null): boolean {
  if (courseId != null && !isNaN(courseId)) {
    if (!getTeacherCourseIds(authUser.userId).includes(courseId)) return false;
  }
  if (classId != null && !isNaN(classId)) {
    if (!getTeacherClassIds(authUser.userId).includes(classId)) return false;
  }
  return true;
}

// GET /api/teacher/exams - 考试列表（仅本人授课课程的考试）
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

    const myCourseIds = getTeacherCourseIds(authUser.userId);
    if (myCourseIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    let data;
    if (courseId && Number(courseId)) {
      // 越权指定课程 → 403
      if (!myCourseIds.includes(Number(courseId))) {
        return NextResponse.json({ error: '无权访问该课程' }, { status: 403 });
      }
      data = db.select().from(examSchedule)
        .where(and(
          eq(examSchedule.course_id, Number(courseId)),
          inArray(examSchedule.course_id, myCourseIds)
        ))
        .orderBy(examSchedule.exam_date)
        .all();
    } else {
      data = db.select().from(examSchedule)
        .where(inArray(examSchedule.course_id, myCourseIds))
        .orderBy(examSchedule.exam_date)
        .all();
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('Get exams error:', e);
    return NextResponse.json({ error: '获取考试列表失败' }, { status: 500 });
  }
}

// POST /api/teacher/exams - 创建考试（须归属本人课程/班级）
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const raw = await request.json();
    const parsed = examCreateSchema.safeParse(raw);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const { exam_name, course_id, class_id, exam_date, start_time, end_time, knowledge_scope } = parsed.data;

    if (!scopeCheck(authUser, course_id, class_id ?? null)) {
      return NextResponse.json({ error: '无权在该课程/班级创建考试' }, { status: 403 });
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

    // 关键写路径即时落盘（T-2）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: result[0] || null });
  } catch (e: any) {
    console.error('Create exam error:', e);
    return NextResponse.json({ error: '创建考试失败' }, { status: 500 });
  }
}

// 按考试 id 查询其归属课程，校验是否本人课程；返回课程id或null
function resolveOwnedCourseId(authUser: { userId: number }, examId: number): number | null {
  const db = getDb();
  const row = db.select({ course_id: examSchedule.course_id })
    .from(examSchedule).where(eq(examSchedule.id, examId)).get();
  if (!row) return null;
  if (!getTeacherCourseIds(authUser.userId).includes(row.course_id)) return null;
  return row.course_id;
}

// PUT /api/teacher/exams - 更新考试（归属校验，防越权改他人考试）
export async function PUT(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const raw = await request.json();
    const { id, ...rawUpdates } = raw;
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    // zod 校验：类型错误 → 400（而非落库 500）
    const parsed = examUpdateSchema.safeParse(rawUpdates);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const updates = parsed.data;

    const cid = Number(id);
    if (!resolveOwnedCourseId(authUser, cid)) {
      return NextResponse.json({ error: '无权修改该考试' }, { status: 403 });
    }
    // 白名单即 schema 字段（updates 已过滤），杜绝 mass assignment
    const clean: Record<string, unknown> = { ...updates };
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: '无有效修改字段' }, { status: 400 });
    }
    // 若试图把考试迁移到他人课程/班级，也拦截
    if (clean.course_id != null && !getTeacherCourseIds(authUser.userId).includes(Number(clean.course_id))) {
      return NextResponse.json({ error: '无权将该考试迁移至该课程' }, { status: 403 });
    }
    if (clean.class_id != null && !getTeacherClassIds(authUser.userId).includes(Number(clean.class_id))) {
      return NextResponse.json({ error: '无权将该考试关联至该班级' }, { status: 403 });
    }

    db.update(examSchedule).set(clean).where(eq(examSchedule.id, cid)).run();

    const data = db.select().from(examSchedule)
      .where(eq(examSchedule.id, cid))
      .get();

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('Update exam error:', e);
    return NextResponse.json({ error: '更新考试失败' }, { status: 500 });
  }
}

// DELETE /api/teacher/exams - 删除考试（归属校验）
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    if (!resolveOwnedCourseId(authUser, Number(id))) {
      return NextResponse.json({ error: '无权删除该考试' }, { status: 403 });
    }
    db.delete(examSchedule).where(eq(examSchedule.id, Number(id))).run();

    // 关键写路径即时落盘（T-2）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete exam error:', e);
    return NextResponse.json({ error: '删除考试失败' }, { status: 500 });
  }
}

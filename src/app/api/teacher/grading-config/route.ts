import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { gradingConfig, course } from '@/storage/database/shared/schema';
import { eq, desc } from 'drizzle-orm';
import { isCourseInTeacherScope } from '@/lib/teacher-scope';

interface GradeLevel { min: number; label: string }

/** 校验等级划分：min 为 0-100 数值、降序排列、覆盖 0 分档 */
function validateGradeLevels(levels: unknown): { ok: boolean; error?: string; parsed?: GradeLevel[] } {
  if (!Array.isArray(levels) || levels.length === 0) return { ok: true, parsed: [] };
  const parsed: GradeLevel[] = [];
  for (const l of levels) {
    const min = Number((l as GradeLevel).min);
    const label = String((l as GradeLevel).label || '').trim();
    if (isNaN(min) || min < 0 || min > 100) return { ok: false, error: '等级分数下限需在 0-100 之间' };
    if (!label) return { ok: false, error: '等级名称不能为空' };
    parsed.push({ min, label: label.slice(0, 10) });
  }
  // 必须按 min 降序且最低档 min=0
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].min >= parsed[i - 1].min) return { ok: false, error: '等级分数下限必须从高到低排列' };
  }
  if (parsed[parsed.length - 1].min !== 0) return { ok: false, error: '最低等级的下限必须为 0 分' };
  return { ok: true, parsed };
}

/** GET：教师批改规则列表 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const rules = await db.select().from(gradingConfig)
      .where(eq(gradingConfig.teacher_id, authUser.userId))
      .orderBy(desc(gradingConfig.updated_at))
      .execute();
    // 附课程名
    const courseIds = [...new Set(rules.map((r) => r.course_id).filter(Boolean))] as number[];
    const courseMap = new Map<number, string>();
    if (courseIds.length > 0) {
      (await db.select({ id: course.id, name: course.name }).from(course)
        .where(eq(course.teacher_id, authUser.userId)).execute())
        .forEach((c) => courseMap.set(c.id, c.name));
    }
    return NextResponse.json({
      success: true,
      data: rules.map((r) => ({ ...r, course_name: r.course_id ? courseMap.get(r.course_id) || '' : '' })),
    });
  } catch (e) {
    console.error('Get grading configs error:', e);
    return NextResponse.json({ error: '获取规则失败' }, { status: 500 });
  }
}

/** POST：创建规则 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ success: false, error: '规则名称不能为空' }, { status: 400 });

    const course_id = body?.course_id ? Number(body.course_id) : null;
    if (course_id && !await isCourseInTeacherScope(authUser.userId, course_id)) {
      return NextResponse.json({ success: false, error: '无权为该课程配置规则' }, { status: 403 });
    }

    const lv = validateGradeLevels(body?.grade_levels);
    if (!lv.ok) return NextResponse.json({ success: false, error: lv.error }, { status: 400 });

    const result = await db.insert(gradingConfig).values({
      teacher_id: authUser.userId,
      name: name.slice(0, 40),
      course_id,
      question_type: body?.question_type ? String(body.question_type) : null,
      scoring_criteria: body?.scoring_criteria ? String(body.scoring_criteria).slice(0, 2000) : null,
      deduction_rules: body?.deduction_rules ? String(body.deduction_rules).slice(0, 2000) : null,
      comment_style: body?.comment_style ? String(body.comment_style).slice(0, 200) : null,
      grade_levels: lv.parsed ?? [],
      is_active: body?.is_active === false ? false : true,
      updated_at: new Date().toISOString(),
    }).returning().execute();

    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true, data: result[0] });
  } catch (e) {
    console.error('Create grading config error:', e);
    return NextResponse.json({ success: false, error: '创建规则失败' }, { status: 500 });
  }
}

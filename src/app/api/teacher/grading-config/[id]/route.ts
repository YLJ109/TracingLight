import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { gradingConfig } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

/** 校验等级划分（同主路由） */
function validateGradeLevels(levels: unknown): { ok: boolean; error?: string; parsed?: Array<{ min: number; label: string }> } {
  if (!Array.isArray(levels) || levels.length === 0) return { ok: true, parsed: [] };
  const parsed: Array<{ min: number; label: string }> = [];
  for (const l of levels) {
    const min = Number((l as { min: number }).min);
    const label = String((l as { label: string }).label || '').trim();
    if (isNaN(min) || min < 0 || min > 100) return { ok: false, error: '等级分数下限需在 0-100 之间' };
    if (!label) return { ok: false, error: '等级名称不能为空' };
    parsed.push({ min, label: label.slice(0, 10) });
  }
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].min >= parsed[i - 1].min) return { ok: false, error: '等级分数下限必须从高到低排列' };
  }
  if (parsed[parsed.length - 1].min !== 0) return { ok: false, error: '最低等级的下限必须为 0 分' };
  return { ok: true, parsed };
}

/** PUT：编辑规则 / 启用停用 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await params;
    const db = getDb();

    const target = (await db.select().from(gradingConfig)
      .where(eq(gradingConfig.id, Number(id))).limit(1).execute())[0];
    if (!target || target.teacher_id !== authUser.userId) {
      return NextResponse.json({ success: false, error: '规则不存在或无权操作' }, { status: 403 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ success: false, error: '规则名称不能为空' }, { status: 400 });
      update.name = name.slice(0, 40);
    }
    if (body?.scoring_criteria !== undefined) update.scoring_criteria = String(body.scoring_criteria).slice(0, 2000) || null;
    if (body?.deduction_rules !== undefined) update.deduction_rules = String(body.deduction_rules).slice(0, 2000) || null;
    if (body?.comment_style !== undefined) update.comment_style = String(body.comment_style).slice(0, 200) || null;
    if (body?.is_active !== undefined) update.is_active = !!body.is_active;
    if (body?.grade_levels !== undefined) {
      const lv = validateGradeLevels(body.grade_levels);
      if (!lv.ok) return NextResponse.json({ success: false, error: lv.error }, { status: 400 });
      update.grade_levels = lv.parsed ?? [];
    }

    await db.update(gradingConfig).set(update).where(eq(gradingConfig.id, Number(id))).execute();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    const updated = (await db.select().from(gradingConfig).where(eq(gradingConfig.id, Number(id))).limit(1).execute())[0];
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error('Update grading config error:', e);
    return NextResponse.json({ success: false, error: '更新规则失败' }, { status: 500 });
  }
}

/** DELETE：删除规则（归属校验） */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await params;
    const db = getDb();

    const target = (await db.select().from(gradingConfig)
      .where(eq(gradingConfig.id, Number(id))).limit(1).execute())[0];
    if (!target || target.teacher_id !== authUser.userId) {
      return NextResponse.json({ success: false, error: '规则不存在或无权操作' }, { status: 403 });
    }

    await db.delete(gradingConfig).where(eq(gradingConfig.id, Number(id))).execute();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Delete grading config error:', e);
    return NextResponse.json({ success: false, error: '删除规则失败' }, { status: 500 });
  }
}

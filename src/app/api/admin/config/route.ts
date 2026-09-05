import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { systemConfig, auditLog } from '@/storage/database/shared/schema';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const configs = db.select().from(systemConfig).all();
    return NextResponse.json({ success: true, data: configs });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get config error:', e);
    return NextResponse.json({ error: '获取配置失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const { key, value } = body;
    if (!key) return NextResponse.json({ error: '缺少 key' }, { status: 400 });

    const existing = db.select().from(systemConfig).where(eq(systemConfig.key, key)).all();
    if (existing.length > 0) {
      db.update(systemConfig).set({ value: String(value), updated_at: new Date().toISOString() })
        .where(eq(systemConfig.key, key)).run();
    } else {
      db.insert(systemConfig).values({ key, value: String(value), updated_at: new Date().toISOString() }).run();
    }

    db.insert(auditLog).values({
      operator_id: authUser.userId,
      operator_name: authUser.username,
      action: 'update_config',
      target_type: 'system_config',
      target_id: key,
      detail: `更新配置 ${key}`,
    }).run();
    saveDb();

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Update config error:', e);
    return NextResponse.json({ error: '更新配置失败' }, { status: 500 });
  }
}

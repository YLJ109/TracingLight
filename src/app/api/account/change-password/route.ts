import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { user as userTable } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, hashPassword } from '@/lib/password';

/**
 * 修改密码
 * POST /api/account/change-password  body: { old_password, new_password }
 * 校验原密码 → 写入新 bcrypt 哈希 → 递增 token_version 使旧 token 立即失效
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const { old_password, new_password } = await request.json().catch(() => ({}));
    if (!old_password) return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
    if (!new_password || String(new_password).length < 6) {
      return NextResponse.json({ error: '新密码至少 6 位' }, { status: 400 });
    }

    const my = db.select().from(userTable).where(eq(userTable.id, authUser.userId)).limit(1).all()[0];
    if (!my) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    if (!verifyPassword(old_password, my.password || '')) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 400 });
    }

    const newHash = hashPassword(String(new_password));
    db.update(userTable)
      .set({
        password: newHash,
        token_version: ((my as unknown as { token_version?: number }).token_version ?? 0) + 1,
      })
      .where(eq(userTable.id, my.id))
      .run();

    // 改密后旧 token 已失效，前端应引导重新登录
    return NextResponse.json({ success: true, message: '密码修改成功，请重新登录' });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Change password error:', e);
    return NextResponse.json({ error: '修改密码失败' }, { status: 500 });
  }
}
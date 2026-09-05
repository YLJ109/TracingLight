import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { user, auditLog } from '@/storage/database/shared/schema';
import { hashPassword } from '@/lib/password';

// GET - 获取用户列表（管理端）
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();
    const users = db.select({
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      role: user.role,
      class_id: user.class_id,
      student_level: user.student_level,
      is_active: user.is_active,
      created_at: user.created_at,
    }).from(user).all();

    return NextResponse.json({ success: true, data: users });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Admin list users error:', e);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const action = body.action;

    const writeAudit = (action: string, targetId: string, detail: string) => {
      db.insert(auditLog).values({
        operator_id: authUser.userId,
        operator_name: authUser.username,
        action,
        target_type: 'user',
        target_id: String(targetId),
        detail,
      }).run();
    };

    if (action === 'create') {
      const { username, real_name, role, password } = body;
      if (!username || !real_name || !role) return NextResponse.json({ error: '参数不完整' }, { status: 400 });
      const exists = db.select().from(user).where(eq(user.username, username)).all();
      if (exists.length > 0) return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
      const pwd = password || username;
      const inserted = db.insert(user).values({
        username,
        real_name,
        role,
        password: hashPassword(pwd),
        is_active: true,
      }).returning().get();
      writeAudit('create_user', String(inserted.id), `新增账号 ${username}（${role}）`);
      return NextResponse.json({ success: true, id: inserted.id });
    }

    const userId = Number(body.user_id);
    if (!userId) return NextResponse.json({ error: '缺少 user_id' }, { status: 400 });

    if (action === 'disable' || action === 'enable') {
      db.update(user).set({ is_active: action === 'enable' }).where(eq(user.id, userId)).run();
      writeAudit(action === 'disable' ? 'disable_user' : 'enable_user', String(userId), `${action === 'disable' ? '禁用' : '启用'}用户 ${userId}`);
    } else if (action === 'reset_password') {
      const pwd = body.password || '123456';
      db.update(user).set({ password: hashPassword(pwd) }).where(eq(user.id, userId)).run();
      writeAudit('reset_password', String(userId), `重置用户 ${userId} 密码`);
    } else if (action === 'change_role') {
      const role = body.role;
      if (!role) return NextResponse.json({ error: '缺少 role' }, { status: 400 });
      db.update(user).set({ role }).where(eq(user.id, userId)).run();
      writeAudit('change_role', String(userId), `将用户 ${userId} 角色改为 ${role}`);
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Admin user action error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

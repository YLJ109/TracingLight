import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSqlite, saveDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { user, auditLog } from '@/storage/database/shared/schema';
import { hashPassword } from '@/lib/password';

// 允许的角色白名单
const ALLOWED_ROLES = ['admin', 'teacher', 'student'] as const;

function countAdmins(db: ReturnType<typeof getDb>): number {
  return db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).all().length;
}

// 使该用户的旧 token 全部失效（物理表经迁移已含 token_version 列）
function bumpTokenVersion(userId: number): void {
  getSqlite().prepare('UPDATE user SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?').run(userId);
}

// GET - 获取用户列表（管理端）
export async function GET(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'admin');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
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
    const { user: authUser, status } = await requireAuthWithStatus(request, 'admin');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
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
      if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: '非法角色' }, { status: 400 });
      if (password !== undefined && password !== '' && password.length < 6) {
        return NextResponse.json({ error: '密码长度不能少于 6 位' }, { status: 400 });
      }
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

    // 取出目标用户，用于最后 admin 保护及 token_version 递增
    const targetRow = db.select().from(user).where(eq(user.id, userId)).limit(1).all()[0];
    if (!targetRow) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    const adminCount = countAdmins(db);

    if (action === 'disable' || action === 'enable') {
      // 禁止禁用最后一个 admin
      if (action === 'disable' && targetRow.role === 'admin' && adminCount <= 1) {
        return NextResponse.json({ error: '不能禁用最后一个管理员' }, { status: 400 });
      }
      db.update(user).set({ is_active: action === 'enable' }).where(eq(user.id, userId)).run();
      // 禁用使旧 token 失效
      if (action === 'disable') {
        bumpTokenVersion(userId);
      }
      writeAudit(action === 'disable' ? 'disable_user' : 'enable_user', String(userId), `${action === 'disable' ? '禁用' : '启用'}用户 ${userId}`);
    } else if (action === 'reset_password') {
      const pwd = body.password || '123456';
      if (pwd.length < 6) {
        return NextResponse.json({ error: '密码长度不能少于 6 位' }, { status: 400 });
      }
      db.update(user).set({ password: hashPassword(pwd) }).where(eq(user.id, userId)).run();
      // 改密使旧 token 全部失效
      bumpTokenVersion(userId);
      writeAudit('reset_password', String(userId), `重置用户 ${userId} 密码`);
    } else if (action === 'change_role') {
      const role = body.role;
      if (!role) return NextResponse.json({ error: '缺少 role' }, { status: 400 });
      if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: '非法角色' }, { status: 400 });
      // 禁止把最后一个 admin 降级
      if (targetRow.role === 'admin' && role !== 'admin' && adminCount <= 1) {
        return NextResponse.json({ error: '不能降级最后一个管理员' }, { status: 400 });
      }
      db.update(user).set({ role }).where(eq(user.id, userId)).run();
      // 角色变更使旧 token 失效（角色会写入 token，必须重签）
      bumpTokenVersion(userId);
      writeAudit('change_role', String(userId), `将用户 ${userId} 角色改为 ${role}`);
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    saveDb();

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Admin user action error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

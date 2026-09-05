import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { user as userTable } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { verifyPassword } from '@/lib/password';

// 内存级登录限流，防止暴力破解（演示/单机场景够用，生产可换 Redis）
const MAX_ATTEMPTS = 5;             // 每窗口最多失败 5 次
const WINDOW_MS = 5 * 60 * 1000;    // 5 分钟窗口
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function hitLimit(key: string): boolean {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

function clearLimit(key: string): void {
  loginAttempts.delete(key);
}

function clientKey(request: NextRequest, username: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  return `${ip}:${username}`;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username) {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 暴力破解防护：同一 IP+账号 5 分钟内失败超过 5 次则拒绝
    const key = clientKey(request, username);
    if (hitLimit(key)) {
      return NextResponse.json({ error: '尝试次数过多，请稍后再试' }, { status: 429 });
    }

    const db = getDb();
    const rows = db.select()
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1)
      .all();

    if (rows.length === 0) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const userData = rows[0];
    if (!userData.is_active) {
      return NextResponse.json({ error: '用户已被禁用' }, { status: 403 });
    }

    // 校验密码
    if (!verifyPassword(password, userData.password || '')) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    // 登录成功，清除限流计数
    clearLimit(key);

    // 生成 JWT token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return NextResponse.json({ error: '服务器未配置 JWT_SECRET' }, { status: 500 });
    }

    const token = jwt.sign(
      {
        userId: userData.id,
        username: userData.username,
        role: userData.role,
        studentLevel: userData.student_level,
        classId: userData.class_id,
      },
      secret,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        username: userData.username,
        real_name: userData.real_name,
        role: userData.role,
        class_id: userData.class_id,
        student_level: userData.student_level,
      },
      token,
    });
  } catch (e: unknown) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Login error:', e);
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}

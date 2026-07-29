import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { user as userTable } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    if (!username) {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
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

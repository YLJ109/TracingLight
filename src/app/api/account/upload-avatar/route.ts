import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { user as userTable } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/**
 * 上传并设置头像
 * POST /api/account/upload-avatar  (multipart/form-data: file)
 * 保存到 public/uploads/avatars/{userId}-{ts}{ext}，更新 user.avatar_url
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    const f = file as File;
    const ext = (extname(f.name) || '.png').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: '仅支持图片格式（png/jpg/gif/webp）' }, { status: 400 });
    }
    if (f.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: '头像大小不能超过 2MB' }, { status: 400 });
    }

    const buf = Buffer.from(await f.arrayBuffer());
    const filename = `${authUser.userId}-${Date.now()}${ext}`;
    const dir = join(process.cwd(), 'public', 'uploads', 'avatars');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), buf);

    const avatarUrl = `/uploads/avatars/${filename}`;
    getDb().update(userTable)
      .set({ avatar_url: avatarUrl })
      .where(eq(userTable.id, authUser.userId))
      .run();

    return NextResponse.json({ success: true, avatar_url: avatarUrl });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Upload avatar error:', e);
    return NextResponse.json({ error: '上传头像失败' }, { status: 500 });
  }
}
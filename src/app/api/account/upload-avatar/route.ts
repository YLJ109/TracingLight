import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, extname, resolve, sep } from 'path';
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
    // L3：内容魔数校验，防止仅伪造扩展名的非图片（如图片马）落盘
    const sig = buf.subarray(0, 12);
    const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
    const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
    const isGif = sig.subarray(0, 3).toString('ascii') === 'GIF';
    const isWebp = sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isPng && !isJpeg && !isGif && !isWebp) {
      return NextResponse.json({ error: '文件内容不是有效图片' }, { status: 400 });
    }
    const filename = `${authUser.userId}-${Date.now()}${ext}`;
    const dir = join(process.cwd(), 'public', 'uploads', 'avatars');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), buf);

    const avatarUrl = `/uploads/avatars/${filename}`;
    await getDb().update(userTable)
      .set({ avatar_url: avatarUrl })
      .where(eq(userTable.id, authUser.userId))
      .execute();

    // L4：清理旧头像文件，避免磁盘无限堆积（仅删除 avatars 目录内的旧文件，防路径穿越）
    const prev = (await getDb().select({ avatar_url: userTable.avatar_url })
      .from(userTable).where(eq(userTable.id, authUser.userId)).execute())[0];
    if (prev?.avatar_url && prev.avatar_url !== avatarUrl && prev.avatar_url.startsWith('/uploads/avatars/')) {
      try {
        const oldPath = resolve(process.cwd(), 'public', '.' + prev.avatar_url);
        const avatarsDir = resolve(process.cwd(), 'public', 'uploads', 'avatars') + sep;
        if (oldPath.startsWith(avatarsDir) && existsSync(oldPath)) unlinkSync(oldPath);
      } catch { /* 旧文件删除失败不影响头像更新 */ }
    }

    return NextResponse.json({ success: true, avatar_url: avatarUrl });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Upload avatar error:', e);
    return NextResponse.json({ error: '上传头像失败' }, { status: 500 });
  }
}
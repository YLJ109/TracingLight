import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, join, extname } from 'path';
import { requireAuth } from '@/lib/server-auth';

/**
 * 教师上传学习材料文件接口
 * - 教师上传到 /uploads/materials/
 * - 单文件 ≤20MB，每次 ≤1 个
 * - 白名单扩展名（视频 / 文档 / 图片 / 课件等）
 */
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 1;

const ALLOWED_EXT = new Set([
  '.mp4', '.avi', '.mov', '.mkv', '.webm',
  '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
  '.pdf', '.txt', '.md', '.csv', '.json', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
  '.zip', '.rar', '.7z',
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: '上传总大小超出限制（≤20MB）' }, { status: 413 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: '上传文件解析失败' }, { status: 400 });
    }

    const uploads = (formData.getAll('files') || []).filter((f): f is File => f instanceof File);
    if (uploads.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 });
    if (uploads.length > MAX_FILES) return NextResponse.json({ error: '每次最多上传 1 个文件' }, { status: 400 });

    const file = uploads[0];
    const originalName = String(file.name || '');
    if (file.size <= 0) return NextResponse.json({ error: '文件为空' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `文件「${originalName}」超过 20MB 限制` }, { status: 413 });
    }
    const ext = extname(originalName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `不支持的文件类型「${ext || '无扩展名'}」` }, { status: 415 });
    }

    const uploadDir = resolve(process.cwd(), 'public', 'uploads', 'materials');
    await mkdir(uploadDir, { recursive: true });

    const randomName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, randomName), buf);

    return NextResponse.json({
      success: true,
      data: { name: originalName, path: `uploads/materials/${randomName}`, size: file.size, mime: file.type || 'application/octet-stream' },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Teacher material upload error:', e);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}
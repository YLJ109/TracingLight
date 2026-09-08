import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, join, extname } from 'path';
import { requireAuth } from '@/lib/server-auth';

/**
 * 附件题（实验题）上传接口
 * - 仅学生角色可上传
 * - 单文件 ≤20MB，每请求 ≤5 个文件
 * - 仅允许白名单扩展名（docx/xlsx/pptx/pdf/zip/图片/文本/代码等）
 * - 文件写入 public/uploads/（server.ts 已流式静态托管 /uploads/*），随机文件名保留原扩展名
 */
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 5;

const ALLOWED_EXT = new Set([
  '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
  '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.py', '.java',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sql',
  '.sh', '.php', '.go', '.rs', '.rb', '.css', '.yaml', '.yml',
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    // 依据 Content-Length 预检总大小（防超大上传占用内存），上限 = 5*20MB + 一些余量
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_FILES * MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json(
        { error: `上传总大小超出限制（单文件≤20MB，最多${MAX_FILES}个）` },
        { status: 413 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: '上传文件解析失败' }, { status: 400 });
    }

    const uploads = (formData.getAll('files') || []).filter((f): f is File => f instanceof File);
    if (uploads.length === 0) {
      return NextResponse.json({ error: '未选择文件' }, { status: 400 });
    }
    if (uploads.length > MAX_FILES) {
      return NextResponse.json({ error: `每次最多上传 ${MAX_FILES} 个文件` }, { status: 400 });
    }

    const uploadDir = resolve(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const saved: Array<{ name: string; path: string; size: number; mime: string }> = [];
    for (const file of uploads) {
      const originalName = String(file.name || '');
      if (file.size <= 0) continue;
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `文件「${originalName}」超过 20MB 限制` },
          { status: 413 }
        );
      }
      const ext = extname(originalName).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { error: `不支持的文件类型${ext ? `「${ext}」` : '（无扩展名）'}` },
          { status: 415 }
        );
      }
      const randomName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(join(uploadDir, randomName), buf);
      saved.push({
        name: originalName,
        path: `uploads/${randomName}`,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      });
    }

    if (saved.length === 0) {
      return NextResponse.json({ error: '未保存任何有效文件' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Upload error:', e);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}
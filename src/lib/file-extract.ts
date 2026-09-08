import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';

/**
 * 附件题（实验题）文档文本提取 —— 轻量、尽力而为、永不抛错
 *
 * - txt/md/csv/json/xml/html/log 及常见源代码文件扩展名：直接以 utf8 读取文本
 * - 其他（docx/xlsx/pptx/pdf/zip/图片等）二进制：返回「无法直接提取文本」的非致命提示，
 *   文件仍完整落盘供教师下载复核
 * - pdf-parse 若已安装，则对 .pdf 尽力用其提取文本（try/catch 包裹，失败回退提示）
 * - 本模块导出 extractFilesText(files:{path}[]) => Promise<string>，批改管线据此注入 AI 提示词
 */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.py', '.java',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sql',
  '.sh', '.php', '.go', '.rs', '.rb', '.css', '.yaml', '.yml',
]);

const UPLOAD_ROOT = resolve(process.cwd(), 'public', 'uploads');

/** 单文件提取文本的上限（避免超大文件/超长文本撑爆提示词） */
const PER_FILE_LIMIT = 30000;

/** 将学生提交路径（uploads/<name>）解析为磁盘绝对路径，防空穿越 */
function resolveUploadPath(rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const name = rawPath.split('/').pop()?.trim();
  if (!name || name === '.' || name === '..') return null;
  const abs = resolve(UPLOAD_ROOT, name);
  if (!abs.startsWith(UPLOAD_ROOT)) return null;
  return abs;
}

export async function extractFilesText(files: Array<{ path?: string }>): Promise<string> {
  const parts: string[] = [];
  for (const f of files || []) {
    const rawPath = String(f?.path || '');
    const name = rawPath.split('/').pop() || rawPath || '附件';
    const ext = extname(name).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        const abs = resolveUploadPath(rawPath);
        if (!abs) throw new Error('非法路径');
        const buf = await readFile(abs);
        parts.push(`\n【${name}】\n${buf.toString('utf8').slice(0, PER_FILE_LIMIT)}`);
      } catch {
        parts.push(`\n【${name}】(无法读取文本，可能已被删除，供教师下载复核)`);
      }
      continue;
    }

    // 二进制类：PDF 尽力解析，其余返回提示
    if (ext === '.pdf') {
      try {
        const abs = resolveUploadPath(rawPath);
        if (!abs) throw new Error('非法路径');
        // 动态引入避免在生产打包时被树摇/打包原生依赖；仅当依赖存在时启用
        const pdfModule: unknown = await import('pdf-parse');
        const pdfParse = (pdfModule as { default?: unknown })?.default ?? pdfModule;
        const data = await (pdfParse as (data: Buffer) => Promise<unknown>)(await readFile(abs));
        const text = String((data && (data as { text?: string }).text) || '').trim();
        if (text) {
          parts.push(`\n【${name}】\n${text.slice(0, PER_FILE_LIMIT)}`);
          continue;
        }
      } catch {
        /* pdf 解析失败 → 走下方提示 */
      }
      parts.push(`\n【${name}】(二进制文件：PDF 文本提取失败，供教师下载复核)`);
      continue;
    }

    parts.push(`\n【${name}】(二进制文件：无法直接提取文本，供教师下载复核)`);
  }
  return parts.join('\n').trim();
}
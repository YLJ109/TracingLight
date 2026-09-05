/**
 * AI 答疑 · 附件处理
 * 图片 → 多模态（切视觉模型）；文本文件 → 提取文字注入当前轮上下文。
 * 附件仅用于「当前一轮」问答，持久化时只存回显所需元数据，避免膨胀数据库。
 */

export const VISION_MODEL = 'glm-4v-flash'; // 智谱免费视觉模型（图片理解）

export interface IncomingAttachment {
  type: 'image' | 'file';
  name: string;
  size?: number;
  /** 图片：data:image/... 的 dataURL；文件：解码后的纯文本 */
  dataUrl?: string;
  text?: string;
}

export interface PersistAttachment {
  type: 'image' | 'file';
  name: string;
  size?: number;
  dataUrl?: string; // 仅图片存，供会话回显缩略图
}

export interface BuiltUserMessage {
  /** 单段文本或多模态数组（含图片时） */
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  /** 是否含图片（用于切换视觉模型） */
  hasImage: boolean;
  /** 持久化用的附件元数据（可回显）；无附件为 null */
  persist: PersistAttachment | null;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 图片 dataURL ≤ 3MB
const MAX_FILE_CHARS = 15000; // 每文件注入 token 上限（约 4-5k tokens）
const MAX_FILES_PER_MSG = 2; // 每轮最多附件数

/** 依据上传附件构造本轮的 user message（含图片多模态 / 文件文本注入），并产出持久化元数据 */
export function buildUserContent(text: string, rawAttachments?: IncomingAttachment[]): BuiltUserMessage {
  const atts = Array.isArray(rawAttachments) ? rawAttachments.slice(0, MAX_FILES_PER_MSG) : [];
  const images = atts.filter((a) => a.type === 'image' && typeof a.dataUrl === 'string' && a.dataUrl!.startsWith('data:image/'));
  const files = atts.filter((a) => a.type === 'file' && typeof a.text === 'string' && a.text.trim());

  const persist: PersistAttachment | null =
    images.length > 0 && files.length === 0
      ? { type: 'image', name: images[0].name || 'image', dataUrl: images[0].dataUrl }
      : files.length > 0 && images.length === 0
        ? { type: 'file', name: files[0].name || 'file', size: files[0].size }
        : null;

  // 纯文本：保持字符串（向后兼容 original 逻辑）
  if (images.length === 0 && files.length === 0) {
    return { content: text, hasImage: false, persist: null };
  }

  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
  if (text.trim()) parts.push({ type: 'text', text });
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: img.dataUrl as string } });
  }
  for (const f of files) {
    const body = (f.text as string).slice(0, MAX_FILE_CHARS);
    parts.push({ type: 'text', text: `\n\n--- 用户上传文件《${f.name || '未命名'}》内容 ---\n${body}\n--- 文件内容结束 ---` });
  }

  return { content: parts, hasImage: images.length > 0, persist };
}

/** 校验图片大小（dataURL 字符串字节数） */
export function isImageTooLarge(dataUrl: string): boolean {
  // base64 长度 ≈ 字节数 * 4/3，粗略换算 + 前导 `data:...;base64,` 头
  const header = dataUrl.indexOf('base64,');
  const b64Len = header >= 0 ? dataUrl.length - (header + 7) : dataUrl.length;
  return Math.floor((b64Len * 3) / 4) > MAX_IMAGE_BYTES;
}

/** 校验文件文本长度，超限则截断并提示 */
export function normalizeFileText(text: string): string {
  if (!text || !text.trim()) return '';
  return text.trim().slice(0, MAX_FILE_CHARS);
}
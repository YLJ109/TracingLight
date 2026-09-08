/**
 * 统一时间格式化工具。
 * 目标：全站所有 ISO 时间统一渲染为可读的中文习惯格式，杜绝裸输出
 * `2026-08-10T08:00:00+08:00` 这类 ISO 串。默认按北京时间显示。
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 跳过 actually-invalid / 空值，返回原始串兜底 */
function toDate(input?: string | null | number): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-08-10 08:00`（年月日 + 时分，最常用） */
export function formatDateTime(input?: string | null | number): string {
  const d = toDate(input);
  if (!d) return String(input ?? '');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `2026-08-10`（仅日期） */
export function formatDate(input?: string | null | number): string {
  const d = toDate(input);
  if (!d) return String(input ?? '');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `2026年8月10日 08:00`（中文长格式，适合标题/卡片头） */
export function formatDateTimeZh(input?: string | null | number): string {
  const d = toDate(input);
  if (!d) return String(input ?? '');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 命中输出格式，如 `2026-08-10 08:00 ~ 2026-08-17 23:59` */
export function formatDateRange(start?: string | null, end?: string | null): string {
  return `${formatDateTime(start)} ~ ${formatDateTime(end)}`;
}

/** 友好相对时间：刚刚 / N分钟前 / N小时前 / N天前，用于动态/通知 */
export function formatRelative(input?: string | null | number): string {
  const d = toDate(input);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return formatDate(input);
}

/** 时钟格式：`HH:mm:ss`，用于答题用时等 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}
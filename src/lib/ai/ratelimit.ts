/**
 * AI 接口轻量限流（内存级，单机演示够用；生产多实例建议换 Redis）。
 * 防止学生无限制调用 AI 答疑/批改烧 API 费用。
 * 采用滑动窗口：窗口内超过配额即拒绝；过期条目随访问顺带清理，避免内存无限增长。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
// 默认：每 60 秒最多 20 次 AI 调用
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * 检查并记录一次调用。
 * @returns true=放行；false=已超限，应拒绝
 */
export function aiRateLimit(key: string, limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS): boolean {
  const now = Date.now();
  const rec = buckets.get(key);

  // 清理过期条目：每次访问时顺带删除该 key 的过期桶
  if (rec && now > rec.resetAt) {
    buckets.delete(key);
  }

  const fresh = buckets.get(key);
  if (!fresh) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (fresh.count >= limit) return false;
  fresh.count += 1;
  return true;
}

/** 清理所有限流状态（测试用） */
export function resetAiRateLimits(): void {
  buckets.clear();
}
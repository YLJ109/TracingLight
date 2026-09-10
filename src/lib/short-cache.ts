/**
 * 极简短 TTL 内存缓存。
 * 用于高频只读聚合接口（如学生学情）削峰：在 TTL 内直接返回缓存，TTL 过后回源重建。
 * 不跨进程/实例共享，仅作单实例节流；可安全关闭并默认极小 TTL，避免脏数据。
 */

interface CacheEntry {
  exp: number;
  body: string;
}

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 3000;

export const DEFAULT_TTL_MS = 8000;

/** 读取缓存 TTL（毫秒），支持 PROFILE_CACHE_TTL 环境变量覆盖（0 表示关闭缓存） */
export function cacheTtlMs(): number {
  const raw = process.env.CACHE_TTL_MS;
  if (raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(n, 60000));
  }
  return DEFAULT_TTL_MS;
}

export function cacheGet(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    cache.delete(key);
    return null;
  }
  return entry.body;
}

export function cacheSet(key: string, body: string, ttlMs = cacheTtlMs()): void {
  if (ttlMs <= 0) return; // 0 = 关闭缓存
  cache.set(key, { exp: Date.now() + ttlMs, body });
  if (cache.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.exp) cache.delete(k);
    }
  }
}

/** 显式清空某个 key（写入数据后调用，保证读到的不是旧缓存） */
export function cacheInvalidate(key: string): void {
  cache.delete(key);
}
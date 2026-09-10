/**
 * 数据库客户端 - PostgreSQL via node-postgres(pg) + Drizzle ORM
 * 使用 globalThis 共享实例，避免 tsup 和 Next.js 模块隔离问题。
 * 连接串从 DATABASE_URL 读取（未设置时回退到本地 dev 默认值）。
 * 表结构由 drizzle-kit 管理（pnpm db:push:pg），启动时只校验连接（SELECT 1）。
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './shared/schema';
import * as relations from './shared/relations';

// 全局共享状态（tsup bundle 和 .next chunks 共享同一个实例）
const g = globalThis as unknown as {
  __TL_DB?: ReturnType<typeof drizzle>;
  __TL_POOL?: Pool;
  __TL_INIT_PROMISE?: Promise<ReturnType<typeof drizzle>>;
};

function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight'
  );
}

/**
 * 外链云数据库（如 Supabase / Neon 的池化端点）常使用自签证书，
 * node-postgres 的新版会把 `sslmode=require` 当 verify-full 处理而拒连。
 * 故对外链统一走「关闭证书校验」的 SSL；本地 localhost 保持无 SSL 原状。
 */
function resolveSsl(): { rejectUnauthorized: boolean } | undefined {
  const url = getDatabaseUrl();
  if (/^postgres(ql)?:\/\//.test(url) && !/localhost|127\.0\.0\.1|::1/.test(new URL(url).hostname)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getDb() {
  if (!g.__TL_DB) throw new Error('Database not initialized. Call initDb() first.');
  return g.__TL_DB;
}

/**
 * 初始化 PostgreSQL 连接池并包装 Drizzle 实例。
 * 幂等：重复调用返回同一个实例。
 */
export async function initDb(): Promise<ReturnType<typeof drizzle>> {
  if (g.__TL_DB) return g.__TL_DB;
  if (g.__TL_INIT_PROMISE) return g.__TL_INIT_PROMISE;

  g.__TL_INIT_PROMISE = (async () => {
    const pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: resolveSsl(),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    g.__TL_POOL = pool;

    // 只校验连接；表结构与索引由 drizzle-kit push/migrate 保证
    await pool.query('SELECT 1');

    g.__TL_DB = drizzle(pool, { schema: { ...schema, ...relations } });
    return g.__TL_DB;
  })();

  return g.__TL_INIT_PROMISE;
}

export async function closeDb(): Promise<void> {
  if (g.__TL_POOL) {
    try { await g.__TL_POOL.end(); } catch { /* 忽略关闭异常 */ }
  }
  g.__TL_POOL = undefined;
  g.__TL_DB = undefined;
  g.__TL_INIT_PROMISE = undefined;
}

/**
 * 兼容保留：PostgreSQL 每次写事务即提交，无需手动落盘，函数保留为 no-op。
 */
export function saveDb(): void { /* no-op: PG 事务自动提交 */ }

export { schema };
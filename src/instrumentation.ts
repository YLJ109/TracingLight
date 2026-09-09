/**
 * Next.js 启动钩子（instrumentation）
 * 作用：在任何 Server Runtime 下于进程启动时初始化 PostgreSQL 连接，确保
 * 「直接用 next start / 任意 Next 部署入口」时 DB 也已被 initDb() 初始化，
 * 避免出现 "Database not initialized. Call initDb() first."。
 * initDb 幂等：自定义 server（src/server.ts）同时也会调用，二者不会重复初始化。
 * 说明：仅在 nodejs runtime 下初始化，Edge 不建立连接池。
 */
export async function register(): Promise<void> {
  if (typeof process === 'undefined') return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { initDb } = await import('./storage/database/db');
  await initDb();
}
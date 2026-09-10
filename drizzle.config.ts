import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * PostgreSQL 迁移工具配置。
 * - schema 为 src/storage/database/shared/schema.ts（pgTable）。
 * - 通过 `pnpm db:push:pg` 把表结构推入 PG 实例。
 * 全项目统一使用 src/storage/database/shared/db.ts（PG 驱动）。
 */
function dbUrl(): string {
  return (
    process.env.DATABASE_URL ||
    'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight'
  );
}

/** 外链云库（Supabase/Neon 池化端点）为自签证书，需关闭证书校验；本地 localhost 不加 SSL */
function dbSsl(): { rejectUnauthorized: boolean } | boolean | undefined {
  const url = dbUrl();
  if (/^postgres(ql)?:\/\//.test(url) && !/localhost|127\.0\.0\.1|::1/.test(new URL(url).hostname)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/storage/database/shared/schema.ts',
  out: './drizzle/pg',
  dbCredentials: {
    url: dbUrl(),
    ssl: dbSsl(),
  },
});
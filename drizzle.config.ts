import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * PostgreSQL 迁移工具配置。
 * - schema 为 src/storage/database/shared/schema.ts（pgTable）。
 * - 通过 `pnpm db:push:pg` 把表结构推入 PG 实例。
 * 全项目统一使用 src/storage/database/db.ts（PG 驱动）。
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/storage/database/shared/schema.ts',
  out: './drizzle/pg',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight',
  },
});
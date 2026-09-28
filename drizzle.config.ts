import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// SQLite（sql.js）schema 推送配置：npx drizzle-kit generate --config drizzle.config.ts
// 生成的 SQL 已嵌入 src/storage/database/db.ts 的 getCreateTableSQL()，此处仅供增量迁移时重新生成。
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/storage/database/shared/schema.ts',
  out: './drizzle-sqlite',
});

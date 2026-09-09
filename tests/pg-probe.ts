/**
 * PG 数据层冒烟验证：连接 → 插入 → 查询 → 关闭。
 * 仅用于渐进迁移验证 PG 可选档，不影响 SQLite 默认运行。
 * 运行：pnpm tsx tests/pg-probe.ts
 */
import 'dotenv/config';
import { initDb, getDb, closeDb } from '../src/storage/database/db.pg';
import { school, user, question } from '../src/storage/database/shared/schema.pg';
import { eq } from 'drizzle-orm';

async function main() {
  await initDb();
  const db = getDb();

  // 1) 插入 school
  const insSchool = await db.insert(school).values({ name: '福州理工学院', short_name: 'FIT' }).returning({ id: school.id });
  console.log('[PG] insert school -> id', insSchool[0].id);

  // 2) 插入 user（teacher）
  const insUser = await db.insert(user).values({
    username: 'pg_probe_teacher',
    real_name: '探查教师',
    role: 'teacher',
    password: 'x',
    is_active: true,
  }).returning({ id: user.id });
  console.log('[PG] insert user -> id', insUser[0].id);

  // 3) 查询回读 + 布尔/文本核对
  const row = (await db.select().from(user).where(eq(user.username, 'pg_probe_teacher'))).at(0);
  console.log('[PG] select user ->', row?.id, row?.role, 'is_active=', row?.is_active);

  // 4) 查询 jsonb 缺省可用
  const q = db.select({ n: question.id }).from(question).limit(1);
  console.log('[PG] question table reachable (len', (await q).length, ')');

  console.log('[PG] ROUND-TRIP OK');
  await closeDb();
}

main().catch((e) => { console.error('[PG] FAIL:', e); process.exit(1); });
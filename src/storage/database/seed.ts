/**
 * 溯光 TracingLight — 种子数据协调器（确定性可复现，模块化）
 * 运行: npx tsx src/storage/database/seed.ts
 * 说明：清空 PostgreSQL 全表后按模块依次重建，id 由 createCtx().nextId() 全局统一递增，
 *       完成后同步 serial 序列，保证运行时无显式 id 的插入不会与种子 id 冲突。
 */
import { initDb, getDb } from './db';
import * as schema from './shared/schema';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createCtx } from './seed/ctx';
import { seedOrg } from './seed/org';
import { seedKnowledge } from './seed/knowledge';
import { seedQuestions } from './seed/questions';
import { seedAssignments, flushMastery } from './seed/assignments';
import { seedExams } from './seed/exams';
import { seedSocial } from './seed/social';
import { DEMO_COUNTS } from '../../lib/demo-accounts';

/** 演示账号台账冒烟断言：种子生成的账号数必须与登录抽屉台账严格一致 */
function assertDemoCounts(ctx: {
  teachers: unknown[];
  students: unknown[];
  admins: unknown[];
}): void {
  if (ctx.teachers.length !== DEMO_COUNTS.teachers) {
    throw new Error(`[冒烟] 教师数不一致：种子 ${ctx.teachers.length} ≠ 台账 ${DEMO_COUNTS.teachers}`);
  }
  if (ctx.students.length !== DEMO_COUNTS.students) {
    throw new Error(`[冒烟] 学生数不一致：种子 ${ctx.students.length} ≠ 台账 ${DEMO_COUNTS.students}`);
  }
  if (ctx.admins.length !== DEMO_COUNTS.admin) {
    throw new Error(`[冒烟] 管理员数不一致：种子 ${ctx.admins.length} ≠ 台账 ${DEMO_COUNTS.admin}`);
  }
  console.log(`  ✅ [冒烟] 演示账号台账自洽：教师 ${ctx.teachers.length} / 学生 ${ctx.students.length} / 管理员 ${ctx.admins.length}`);
}

/** 从 schema 导出枚举所有 pgTable 表名 */
function listTableNames(): string[] {
  const names: string[] = [];
  for (const k of Object.keys(schema)) {
    const t = (schema as unknown as Record<string, unknown>)[k];
    try {
      const cfg = getTableConfig(t as never);
      if (cfg && cfg.name) names.push(cfg.name);
    } catch { /* 非表导出，跳过 */ }
  }
  return names;
}

async function main() {
  await initDb();
  const db = getDb();

  // —— PostgreSQL 清库：TRUNCATE 全部数据表（CASCADE 处理外键）——
  const tables = listTableNames();
  console.log(`🧹 清空 PostgreSQL 表（${tables.length} 张）...`);
  await db.execute(sql`TRUNCATE TABLE ${sql.raw(tables.map((t) => `"${t}"`).join(', '))} CASCADE`);

  // 默认确定性种子（可复现）；带 --random 时使用随机盐，生成每次不同的数据
  const random = process.argv.includes('--random');
  const salt = random
    ? `tracinglight-random-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    : 'tracinglight-seed-v1';
  const ctx = createCtx(salt);

  console.log(random ? '\n🎲 开始生成随机种子数据（每次不同）...\n' : '\n🌱 开始生成确定性种子数据（可复现）...\n');

  console.log('📚 [1/6] 组织架构 / 用户 / 课程 ...');
  await seedOrg(db, ctx);
  console.log(`  ✅ 学校 ${ctx.schoolId} · 班级 ${ctx.classId.length} · 教师 ${ctx.teachers.length} · 学生 ${ctx.students.length} · 课程 ${ctx.courseIds.length}`);
  assertDemoCounts(ctx);

  console.log('🧠 [2/6] 知识点 / 知识图谱 ...');
  await seedKnowledge(db, ctx);
  console.log(`  ✅ 知识点末位 ${ctx.lastKpId} · 图谱节点 ${ctx.graphNodes.length} · 前置边 ${ctx.graphEdges.length}`);

  console.log('❓ [3/6] 题库 ...');
  await seedQuestions(db, ctx);
  console.log(`  ✅ 题目累计 ${ctx.questionKp.size}`);

  console.log('📝 [4/6] 作业闭环（作答/批改/错题/掌握度） ...');
  await seedAssignments(db, ctx);
  await flushMastery(db, ctx);
  console.log(`  ✅ 掌握度记录 ${ctx.masteryAcc.size}`);

  console.log('🎯 [5/6] 考试闭环（名单/监考/申诉） ...');
  await seedExams(db, ctx);

  console.log('💬 [6/6] 互动管理层（讨论/答疑/公告/积分/计划/审计等） ...');
  await seedSocial(db, ctx);

  // —— 同步 serial 序列：种子显式 id 不会推进序列，需置为当前最大 id，防止运行时无显式 id 插入冲突 ——
  console.log('🔁 同步自增序列 ...');
  await db.execute(sql`
    DO $$
    DECLARE t text; s text;
    BEGIN
      FOR t IN
        SELECT c.relname FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id'
        WHERE c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          AND (a.attidentity <> '' OR EXISTS (
                SELECT 1 FROM pg_attrdef d WHERE d.adrelid = c.oid AND d.adnum = a.attnum
                  AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'))
      LOOP
        s := pg_get_serial_sequence('"' || t || '"', 'id');
        IF s IS NOT NULL THEN
          EXECUTE 'SELECT setval(''' || s || ''', COALESCE((SELECT MAX(id)::bigint FROM "' || t || '"), 1), true)';
        END IF;
      END LOOP;
    END $$;
  `);

  console.log('\n✅ 种子数据生成完成。\n');
}

main().catch((err) => { console.error('❌ 种子生成失败:', err); process.exit(1); });
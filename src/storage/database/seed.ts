/**
 * 溯光 TracingLight — 种子数据协调器（确定性可复现，模块化）
 * 运行: npx tsx src/storage/database/seed.ts
 * 说明：删库重建，按模块依次生成，id 由 createCtx().nextId() 全局统一递增。
 */
import { initDb, getDb } from './db';
import * as fs from 'fs';
import * as path from 'path';
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

async function main() {
  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  await initDb();
  const db = getDb();

  // 默认确定性种子（可复现）；带 --random 时使用随机盐，生成每次不同的数据
  const random = process.argv.includes('--random');
  const salt = random
    ? `tracinglight-random-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    : 'tracinglight-seed-v1';
  const ctx = createCtx(salt);

  console.log(random ? '\n🎲 开始生成随机种子数据（每次不同）...\n' : '\n🌱 开始生成确定性种子数据（可复现）...\n');

  console.log('📚 [1/6] 组织架构 / 用户 / 课程 ...');
  seedOrg(db, ctx);
  console.log(`  ✅ 学校 ${ctx.schoolId} · 班级 ${ctx.classId.length} · 教师 ${ctx.teachers.length} · 学生 ${ctx.students.length} · 课程 ${ctx.courseIds.length}`);
  assertDemoCounts(ctx);

  console.log('🧠 [2/6] 知识点 / 知识图谱 ...');
  seedKnowledge(db, ctx);
  console.log(`  ✅ 知识点末位 ${ctx.lastKpId} · 图谱节点 ${ctx.graphNodes.length} · 前置边 ${ctx.graphEdges.length}`);

  console.log('❓ [3/6] 题库 ...');
  seedQuestions(db, ctx);
  console.log(`  ✅ 题目累计 ${ctx.questionKp.size}`);

  console.log('📝 [4/6] 作业闭环（作答/批改/错题/掌握度） ...');
  seedAssignments(db, ctx);
  flushMastery(db, ctx);
  console.log(`  ✅ 掌握度记录 ${ctx.masteryAcc.size}`);

  console.log('🎯 [5/6] 考试闭环（名单/监考/申诉） ...');
  seedExams(db, ctx);

  console.log('💬 [6/6] 互动管理层（讨论/答疑/公告/积分/计划/审计等） ...');
  seedSocial(db, ctx);

  console.log('\n✅ 种子数据生成完成。\n');
}

main().catch((err) => { console.error('❌ 种子生成失败:', err); process.exit(1); });
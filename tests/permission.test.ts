/**
 * 权限 / 跨租户隔离自动化测试（PG 版）
 *
 * 验证教师数据归属范围校验是否真正隔离：
 * 教师① 只能见自己授课的课程/班级/学生/作业，不能越权到教师②的数据。
 *
 * 运行：pnpm test 或 tsx tests/permission.test.ts
 * 说明：PostgreSQL 迁移后废弃 SQLite 内存库方案。本测试改为：
 *       1) 在目标 PG 实例上创建一次性临时库 tracinglight_test_<pid>
 *       2) drizzle-kit push 建表
 *       3) drizzle 播种 + 异步断言
 *       4) 结束后销毁临时库，不触碰真实业务数据。
 *   需要：目标 PG 实例中的登录角色具备 CREATEDB 权限（部署的 tracinglight 角色即超级用户）。
 */
import assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Pool } from 'pg';

import { initDb, closeDb, getDb } from '../src/storage/database/db';
import { school, college, major, classInfo, user, course, assignment } from '../src/storage/database/shared/schema';
import {
  isAssignmentInTeacherScope,
  isStudentInTeacherScope,
  isCourseInTeacherScope,
  isClassInTeacherScope,
  getTeacherStudentIds,
  getTeacherAssignmentIds,
} from '../src/lib/teacher-scope';

const ROOT = path.join(__dirname, '..');
const ADMIN_URL =
  process.env.DATABASE_URL || 'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight';
const TEST_DB = `tracinglight_test_${process.pid}`;
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${(e as Error)?.message}`); failed++; }
}

/** 在目标 PG 实例上创建一次性临时测试库 */
async function createTempDb(): Promise<Pool> {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  return admin;
}

/** drizzle-kit push 建表 */
function pushSchema() {
  execSync('npx --no-install drizzle-kit push --force', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'pipe',
    shell: true,
  });
}

async function seed() {
  const db = getDb();
  const [sch] = await db.insert(school).values({ name: '北工大' }).returning({ id: school.id });
  const [col] = await db.insert(college).values({ school_id: sch.id, name: '信息学院' }).returning({ id: college.id });
  const [maj] = await db.insert(major).values({ college_id: col.id, name: '软件工程' }).returning({ id: major.id });

  const cA = await db.insert(classInfo).values({ major_id: maj.id, name: '计科一班' }).returning({ id: classInfo.id });
  const cB = await db.insert(classInfo).values({ major_id: maj.id, name: '计科二班' }).returning({ id: classInfo.id });
  const classIdA = cA[0].id;
  const classIdB = cB[0].id;

  const tA = await db.insert(user).values({ username: 'teacherA', real_name: '教师A', role: 'teacher' }).returning({ id: user.id });
  const tB = await db.insert(user).values({ username: 'teacherB', real_name: '教师B', role: 'teacher' }).returning({ id: user.id });
  const sA = await db.insert(user).values({ username: 'studentA', real_name: '学生A', role: 'student', class_id: classIdA }).returning({ id: user.id });
  const sB = await db.insert(user).values({ username: 'studentB', real_name: '学生B', role: 'student', class_id: classIdB }).returning({ id: user.id });

  const teacherA = tA[0].id, teacherB = tB[0].id, studentA = sA[0].id, studentB = sB[0].id;

  const coA = await db.insert(course).values({ name: '数据结构A', teacher_id: teacherA, class_id: classIdA }).returning({ id: course.id });
  const coB = await db.insert(course).values({ name: '操作系统B', teacher_id: teacherB, class_id: classIdB }).returning({ id: course.id });
  const courseIdA = coA[0].id, courseIdB = coB[0].id;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const asA = await db.insert(assignment).values({
    course_id: courseIdA, teacher_id: teacherA, title: 'A班作业',
    question_ids: [], total_score: 100, start_time: now, end_time: now, status: 'published',
  }).returning({ id: assignment.id });
  const asB = await db.insert(assignment).values({
    course_id: courseIdB, teacher_id: teacherB, title: 'B班作业',
    question_ids: [], total_score: 100, start_time: now, end_time: now, status: 'published',
  }).returning({ id: assignment.id });

  return {
    teacherA, teacherB, studentA, studentB,
    courseIdA, courseIdB, classIdA, classIdB,
    asgnA: asA[0].id, asgnB: asB[0].id,
  };
}

async function main() {
  // 在 initDb 之前指向一次性临时库
  process.env.DATABASE_URL = TEST_URL;
  const admin = await createTempDb();
  try {
    pushSchema();
  } catch (e) {
    console.error('建表失败（drizzle-kit push）:', (e as Error).message);
    process.exit(1);
  }

  await initDb();
  const ids = await seed();

  console.log('\n=== 教师数据可见范围（隔离）===');
  await test('教师A 可见自己的课程', async () => {
    assert.ok(await isCourseInTeacherScope(ids.teacherA, ids.courseIdA));
    assert.ok(!(await isCourseInTeacherScope(ids.teacherA, ids.courseIdB)));
  });
  await test('教师A 不可越权访问教师B的课程', async () => {
    assert.strictEqual(await isCourseInTeacherScope(ids.teacherA, ids.courseIdB), false);
  });
  await test('教师B 对称可见自己的课程', async () => {
    assert.ok(await isCourseInTeacherScope(ids.teacherB, ids.courseIdB));
    assert.ok(!(await isCourseInTeacherScope(ids.teacherB, ids.courseIdA)));
  });

  console.log('\n=== 作业归属校验 ===');
  await test('教师A 可见自己的作业', async () => {
    assert.ok(await isAssignmentInTeacherScope(ids.teacherA, ids.asgnA));
  });
  await test('教师A 不可操作教师B的作业（越权）', async () => {
    assert.strictEqual(await isAssignmentInTeacherScope(ids.teacherA, ids.asgnB), false);
  });
  await test('作业 ID 列表与归属一致', async () => {
    const idsA = await getTeacherAssignmentIds(ids.teacherA);
    assert.ok(idsA.includes(ids.asgnA)); assert.ok(!idsA.includes(ids.asgnB));
  });

  console.log('\n=== 学生归属校验（班级穿透）===');
  await test('教师A 可管辖本班学生A', async () => {
    assert.ok(await isStudentInTeacherScope(ids.teacherA, ids.studentA));
  });
  await test('教师A 不可查看其他班学生B', async () => {
    assert.strictEqual(await isStudentInTeacherScope(ids.teacherA, ids.studentB), false);
  });
  await test('学生ID列表仅含本人班级学生', async () => {
    const students = await getTeacherStudentIds(ids.teacherA);
    assert.ok(students.includes(ids.studentA)); assert.ok(!students.includes(ids.studentB));
  });

  console.log('\n=== 班级归属校验 ===');
  await test('教师A 属于一班、不属于二班', async () => {
    assert.ok(await isClassInTeacherScope(ids.teacherA, ids.classIdA));
    assert.ok(!(await isClassInTeacherScope(ids.teacherA, ids.classIdB)));
  });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);

  await closeDb();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('seed/test failure:', e);
  process.exit(1);
});
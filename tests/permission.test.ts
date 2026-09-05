/**
 * 权限 / 跨租户隔离自动化测试（E2）
 *
 * 验证教师数据归属范围校验是否真正隔离：
 * 教师① 只能见自己授课的课程/班级/学生/作业，不能越权到教师②的数据。
 *
 * 运行：pnpm test 或 tsx tests/permission.test.ts
 * 说明：使用临时 DATABASE_PATH 构造独立内存库，不触碰真实的 data/tracinglight.db。
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// 必须在 initDb 前设置，防止写入真实数据库
process.env.DATABASE_PATH = path.join(os.tmpdir(), `tl-perm-test-${process.pid}.db`);

import { initDb, getSqlite, closeDb } from '../src/storage/database/db';
import {
  isAssignmentInTeacherScope,
  isStudentInTeacherScope,
  isCourseInTeacherScope,
  isClassInTeacherScope,
  getTeacherStudentIds,
  getTeacherAssignmentIds,
} from '../src/lib/teacher-scope';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${(e as Error)?.message}`); failed++; }
}

/** 从表里按 name 取第一条 id */
function paste(sqlite: ReturnType<typeof getSqlite>, table: string, name: string): number {
  const r = sqlite.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: number } | undefined;
  if (!r) throw new Error(`seed row not found: ${table} ${name}`);
  return r.id;
}
function uid(sqlite: ReturnType<typeof getSqlite>, username: string): number {
  const r = sqlite.prepare(`SELECT id FROM user WHERE username = ?`).get(username) as { id: number } | undefined;
  return r ? r.id : 0;
}
function asgnId(sqlite: ReturnType<typeof getSqlite>, title: string): number {
  const r = sqlite.prepare(`SELECT id FROM assignment WHERE title = ?`).get(title) as { id: number } | undefined;
  if (!r) throw new Error(`assignment not found: ${title}`);
  return r.id;
}

function seed() {
  const sqlite = getSqlite();
  const run = (sqlStr: string) => sqlite.prepare(sqlStr).run();
  run(`INSERT INTO school(name) VALUES('北工大')`);
  run("INSERT INTO college(school_id,name) VALUES((SELECT id FROM school LIMIT 1),'信息学院')");
  run("INSERT INTO major(college_id,name) VALUES((SELECT id FROM college LIMIT 1),'软件工程')");
  run("INSERT INTO class(major_id,name) VALUES((SELECT id FROM major LIMIT 1),'计科一班')");
  run("INSERT INTO class(major_id,name) VALUES((SELECT id FROM major LIMIT 1),'计科二班')");
  run("INSERT INTO user(username,real_name,role) VALUES('teacherA','教师A','teacher')");
  run("INSERT INTO user(username,real_name,role) VALUES('teacherB','教师B','teacher')");
  run("INSERT INTO user(username,real_name,role,class_id) VALUES('studentA','学生A','student',(SELECT id FROM class WHERE name='计科一班'))");
  run("INSERT INTO user(username,real_name,role,class_id) VALUES('studentB','学生B','student',(SELECT id FROM class WHERE name='计科二班'))");
  run("INSERT INTO course(name,teacher_id,class_id) VALUES('数据结构A',(SELECT id FROM user WHERE username='teacherA'),(SELECT id FROM class WHERE name='计科一班'))");
  run("INSERT INTO course(name,teacher_id,class_id) VALUES('操作系统B',(SELECT id FROM user WHERE username='teacherB'),(SELECT id FROM class WHERE name='计科二班'))");

  const courseIdA = paste(sqlite, 'course', '数据结构A');
  const courseIdB = paste(sqlite, 'course', '操作系统B');

  // 两道作业分属两门课程
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  run(`INSERT INTO assignment(course_id,teacher_id,title,question_ids,total_score,start_time,end_time,status) VALUES(${courseIdA},${uid(sqlite, 'teacherA')},'A班作业','[]',100,'${now}','${now}','published')`);
  run(`INSERT INTO assignment(course_id,teacher_id,title,question_ids,total_score,start_time,end_time,status) VALUES(${courseIdB},${uid(sqlite, 'teacherB')},'B班作业','[]',100,'${now}','${now}','published')`);

  return {
    teacherA: uid(sqlite, 'teacherA'),
    teacherB: uid(sqlite, 'teacherB'),
    studentA: uid(sqlite, 'studentA'),
    studentB: uid(sqlite, 'studentB'),
    courseIdA, courseIdB,
    classIdA: paste(sqlite, 'class', '计科一班'),
    classIdB: paste(sqlite, 'class', '计科二班'),
    asgnA: asgnId(sqlite, 'A班作业'),
    asgnB: asgnId(sqlite, 'B班作业'),
  };
}

async function main() {
  await initDb();
  const ids = seed();

  console.log('\n=== 教师数据可见范围（隔离）===');
  test('教师A 可见自己的课程', () => {
    assert.ok(isCourseInTeacherScope(ids.teacherA, ids.courseIdA));
    assert.ok(!isCourseInTeacherScope(ids.teacherA, ids.courseIdB));
  });
  test('教师A 不可越权访问教师B的课程', () => {
    assert.strictEqual(isCourseInTeacherScope(ids.teacherA, ids.courseIdB), false);
  });
  test('教师B 对称可见自己的课程', () => {
    assert.ok(isCourseInTeacherScope(ids.teacherB, ids.courseIdB));
    assert.ok(!isCourseInTeacherScope(ids.teacherB, ids.courseIdA));
  });

  console.log('\n=== 作业归属校验 ===');
  test('教师A 可见自己的作业', () => {
    assert.ok(isAssignmentInTeacherScope(ids.teacherA, ids.asgnA));
  });
  test('教师A 不可操作教师B的作业（越权）', () => {
    assert.strictEqual(isAssignmentInTeacherScope(ids.teacherA, ids.asgnB), false);
  });
  test('作业 ID 列表与归属一致', () => {
    const idsA = getTeacherAssignmentIds(ids.teacherA);
    assert.ok(idsA.includes(ids.asgnA)); assert.ok(!idsA.includes(ids.asgnB));
  });

  console.log('\n=== 学生归属校验（班级穿透）===');
  test('教师A 可管辖本班学生A', () => {
    assert.ok(isStudentInTeacherScope(ids.teacherA, ids.studentA));
  });
  test('教师A 不可查看其他班学生B', () => {
    assert.strictEqual(isStudentInTeacherScope(ids.teacherA, ids.studentB), false);
  });
  test('学生ID列表仅含本人班级学生', () => {
    const students = getTeacherStudentIds(ids.teacherA);
    assert.ok(students.includes(ids.studentA)); assert.ok(!students.includes(ids.studentB));
  });

  console.log('\n=== 班级归属校验 ===');
  test('教师A 属于一班、不属于二班', () => {
    assert.ok(isClassInTeacherScope(ids.teacherA, ids.classIdA));
    assert.ok(!isClassInTeacherScope(ids.teacherA, ids.classIdB));
  });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  closeDb();
  try { fs.unlinkSync(process.env.DATABASE_PATH!); } catch { /* 清理临时库 */ }
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('seed/test failure:', e); process.exit(1); });
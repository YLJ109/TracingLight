/**
 * 模块1：组织架构 + 用户 + 课程
 * 覆盖：school / college / major / class / user(教师·助教·管理员·学生) / course
 *
 * 满足要求：2 班级 × 10 学生 = 20 学生，2 教师（各负责 1 个班级 10 名学生、2 门课程），1 管理员。
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';
import { hashPassword } from '../../../lib/password';
import { generateChineseName, PHONE_PREFIX } from '../../../lib/seed/rng';

/** 每班课程（①教师[0]负责班级0，②教师[1]负责班级1；每人 2 门课） */
const COURSES_BY_CLASS: Array<Array<{ name: string; short: string; desc: string }>> = [
  [
    { name: 'Python程序设计', short: 'python', desc: 'Python 语言基础与程序设计思想' },
    { name: '数据结构与算法', short: 'dstruct', desc: '常用线性/树形/图形数据结构与经典算法' },
  ],
  [
    { name: '数据库原理与应用', short: 'db', desc: '关系模型、SQL 与数据库设计' },
    { name: '操作系统原理', short: 'os', desc: '进程、内存、文件系统与并发' },
  ],
];

const TEACHER_TITLES = ['讲师', '副教授', '教授'] as const;

export async function seedOrg(db: Drizzle, ctx: SeedCtx) {
  const { rng, nextId } = ctx;

  // ========== 学校 ==========
  const schoolId = nextId();
  ctx.schoolId = schoolId;
  await db.insert(schema.school).values({ id: schoolId, name: '福州理工学院', short_name: '福理', logo_url: null }).execute();

  // ========== 学院 / 专业 / 班级 ==========
  const collegeId = nextId();
  ctx.collegeIds = [collegeId];
  await db.insert(schema.college).values({ id: collegeId, school_id: schoolId, name: '计算机与信息工程学院', short_name: '计信学院' }).execute();
  const majorIds: number[] = [];
  const classIdByTeacher = new Map<number, number>(); // teacherIdx -> classId
  const classMajorId: number[] = [];

  const buildClass = async (majorName: string, majorShort: string, grade: string, suffix: string) => {
    const mid = nextId();
    majorIds.push(mid);
    await db.insert(schema.major).values({ id: mid, college_id: collegeId, name: majorName, short_name: majorShort }).execute();
    const clsId = nextId();
    const name = `${majorShort}${String(grade).slice(2)}${suffix}`;
    await db.insert(schema.classInfo).values({ id: clsId, major_id: mid, name, grade }).execute();
    ctx.classId.push(clsId);
    ctx.classMajor.set(clsId, mid);
    ctx.classGrade.set(clsId, grade);
    classMajorId.push(mid);
    return clsId;
  };

  // 班级0（计科2501） + 班级1（软工2501）
  const class0 = await buildClass('计算机科学与技术', '计科', '2025', '1');
  const class1 = await buildClass('软件工程', '软工', '2025', '1');
  ctx.majorIds = majorIds;
  const clsIds = [class0, class1];

  // ========== 用户 ==========
  const insertUser = async (u: { username: string; role: string; class_id?: number | null; student_level?: string | null; title?: string | null; student_no?: string | null }) => {
    const id = nextId();
    const gender: 'male' | 'female' = rng.bool(0.55) ? 'male' : 'female';
    const realName = generateChineseName(rng, gender);
    const pwd = hashPassword(u.username === 'admin' ? '123456' : u.username);
    const entranceYear = u.class_id ? Number(ctx.classGrade.get(u.class_id)) ?? null : null;
    await db.insert(schema.user).values({
      id, username: u.username, real_name: realName, role: u.role,
      password: pwd, class_id: u.class_id ?? null, student_level: u.student_level ?? null,
      title: u.title ?? null, student_no: u.student_no ?? null,
      gender,
      phone: `${rng.pick(PHONE_PREFIX)}${String(rng.int(10000000, 100000000))}`,
      email: `${u.username}@fit.edu.cn`,
      birth_date: `${rng.int(2004, 2007)}-${String(rng.int(1, 13)).padStart(2, '0')}-${String(rng.int(1, 29)).padStart(2, '0')}`,
      entrance_year: entranceYear,
      bio: u.role === 'teacher' ? '从事相关课程教学与科研工作。' : null,
      is_active: true, token_version: 0,
    } as any).execute();
    ctx.classMap.set(u.username, id);
    ctx.userName.set(id, realName);
    return id;
  };

  const admins: number[] = [];
  const assistants: number[] = [];
  const teachers: number[] = [];
  const students: number[] = [];

  admins.push(await insertUser({ username: 'admin', role: 'admin' }));
  assistants.push(await insertUser({ username: 'assistant1', role: 'assistant' }));

  // 2 名教师：teacher_0_0 → 班级0，teacher_0_1 → 班级1
  for (let t = 0; t < 2; t++) {
    const tid = await insertUser({ username: `teacher_0_${t}`, role: 'teacher', title: TEACHER_TITLES[t] });
    teachers.push(tid);
    ctx.teacherMajor.set(tid, t);
    classIdByTeacher.set(t, clsIds[t]);
  }

  // 每个班级 10 名学生（学霸层3 / 勤奋中等层5 / 提升层2，正态分布）
  for (let ci = 0; ci < clsIds.length; ci++) {
    const clsId = clsIds[ci];
    for (let s = 0; s < 10; s++) {
      const username = `stu_${ci}_${s}`;
      const z = rng.clampedNormal(0, 1, -2.5, 2.5);
      const level: string = z >= 0.5 ? 'top' : z >= -0.9 ? 'medium' : 'weak';
      const sid = await insertUser({
        username, role: 'student', class_id: clsId, student_level: level,
        student_no: String(20250000 + ci * 1000 + s * 3 + rng.int(0, 2)),
      });
      students.push(sid);
      ctx.userClass.set(sid, clsId);
      ctx.levelOf.set(sid, level);
      if (!ctx.classStudents.has(clsId)) ctx.classStudents.set(clsId, []);
      ctx.classStudents.get(clsId)!.push(sid);
    }
  }

  ctx.admins = admins;
  ctx.assistants = assistants;
  ctx.teachers = teachers;
  ctx.students = students;

  // ========== 课程：每教师 2 门，绑定其负责班级 ==========
  const semester = '2025-2026-2';
  const courseIds: number[] = [];
  for (const [clsIdx, courses] of COURSES_BY_CLASS.entries()) {
    const bindCls = clsIds[clsIdx];
    const teacherId = teachers[clsIdx];
    for (const cName of courses) {
      const cid = nextId();
      await db.insert(schema.course).values({
        id: cid, name: cName.name, short_name: cName.short, description: cName.desc,
        teacher_id: teacherId, class_id: bindCls, semester,
      }).execute();
      courseIds.push(cid);
      ctx.courseTeacher.set(cid, teacherId);
      ctx.courseClass.set(cid, bindCls);
      ctx.courseSemester.set(cid, semester);
      ctx.courseName.set(cid, cName.name);
    }
  }
  ctx.courseIds = courseIds;
}
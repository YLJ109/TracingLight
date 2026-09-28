/** 按演示账号台账（demo-accounts.ts）补齐缺失用户：教师 2 + 学生 20（密码=用户名，admin 已存在） */
import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { user } from '../src/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/lib/password';
import { DEMO_TEACHERS, DEMO_STUDENTS, demoPassword } from '../src/lib/demo-accounts';

const LEVEL_MAP: Record<string, string> = {
  '学霸层': 'top',
  '勤奋中等层': 'medium',
  '提升层': 'weak',
};

async function main() {
  await initDb();
  const db = getDb();
  const existing = new Set(db.select({ u: user.username }).from(user).all().map((x) => x.u));
  let inserted = 0;

  // 教师（title 占位）
  for (const t of DEMO_TEACHERS) {
    if (existing.has(t.username)) continue;
    db.insert(user).values({
      username: t.username,
      real_name: t.real_name,
      role: 'teacher',
      password: hashPassword(demoPassword(t.username)),
      title: '讲师',
    }).run();
    inserted++;
  }

  // 学生：stu_{class}_{idx} → class 1/2（计科2401 / 计科2402）
  for (const stu of DEMO_STUDENTS) {
    if (existing.has(stu.username)) continue;
    const classIdx = Number(stu.username.split('_')[1]); // 0 / 1
    const classId = classIdx === 0 ? 1 : 2;
    const studentNo = `2024${String(classId).padStart(2, '0')}${String(Number(stu.username.split('_')[2]) + 1).padStart(2, '0')}`;
    db.insert(user).values({
      username: stu.username,
      real_name: stu.real_name,
      role: 'student',
      password: hashPassword(demoPassword(stu.username)),
      class_id: classId,
      student_level: LEVEL_MAP[stu.level || '勤奋中等层'] || 'medium',
      student_no: studentNo,
    }).run();
    inserted++;
  }

  console.log(`inserted ${inserted} users`);
  const all = db.select({ u: user.username, r: user.role }).from(user).all();
  console.log('total users:', all.length);
  saveDb();
  process.exit(0);
}
main();

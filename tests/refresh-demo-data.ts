/**
 * 演示数据保鲜：
 * 1. 作业/考试时间窗动态化——最新一批设为"进行中"，历史批保持已截止（演示永远新鲜）
 * 2. 旧演示学生（stu_zhang 等 10 人）的作答/批改/错题/掌握度/积分/答疑/通知 重映射到新台账学生（stu_0_0~stu_0_9）
 * 幂等可重复执行。⚠️ 必须在 server 停止时运行（防 30s 落盘覆盖）。
 */
import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { assignment, exam, user } from '../src/storage/database/shared/schema';
import { eq, asc } from 'drizzle-orm';

const dayOffset = (days: number, hour = '08:00') => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.toISOString().slice(0, 10)}T${hour}:00+08:00`;
};
const dayOffsetLocal = (days: number, time: string) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${time}`;
};

async function main() {
  await initDb();
  const db = getDb();

  // ---------- 1. 作业时间窗 ----------
  const asgns = db.select().from(assignment).orderBy(asc(assignment.id)).all();
  const n = asgns.length;
  const inProgressCount = Math.min(6, n);          // 最近 6 个 = 进行中
  const upcomingCount = Math.min(4, n);            // 其后 4 个 = 未来将开
  asgns.forEach((a, i) => {
    const fromEnd = n - 1 - i;                      // 距最后一个作业的位置
    let start: string, end: string;
    if (fromEnd < inProgressCount) {
      // 进行中：起点过去 (fromEnd+1) 天，截止未来 (inProgressCount - fromEnd) * 3 天
      start = dayOffset(-(fromEnd + 1));
      end = dayOffset(inProgressCount - fromEnd === 0 ? 1 : (inProgressCount - fromEnd) * 2, '23:59').replace('T', ' ').slice(0, 19);
      start = start.replace('T', ' ').slice(0, 19);
    } else if (fromEnd < inProgressCount + upcomingCount) {
      // 未来将开
      start = dayOffset(3, '08:00').replace('T', ' ').slice(0, 19);
      end = dayOffset(30, '23:59').replace('T', ' ').slice(0, 19);
    } else {
      // 历史作业：保持过去（结束=过去）
      start = dayOffset(-(fromEnd + 3), '08:00').replace('T', ' ').slice(0, 19);
      end = dayOffset(-(fromEnd + 1), '23:59').replace('T', ' ').slice(0, 19);
    }
    db.update(assignment).set({ start_time: start, end_time: end })
      .where(eq(assignment.id, a.id)).run();
  });
  console.log(`作业时间窗刷新: ${n} 个（进行中 ${inProgressCount} / 将开 ${upcomingCount} / 历史 ${n - inProgressCount - upcomingCount}）`);

  // ---------- 2. 考试时间窗（如存在） ----------
  try {
    const exams = db.select().from(exam).all();
    for (const e of exams) {
      const cols = Object.keys(e);
      const patch: Record<string, string> = {};
      for (const k of cols) {
        if (/start/.test(k) && typeof (e as any)[k] === 'string') patch[k] = dayOffsetLocal(-1, '08:00');
        if (/end/.test(k) && typeof (e as any)[k] === 'string') patch[k] = dayOffsetLocal(14, '23:59');
      }
      if (Object.keys(patch).length && (e as any).id != null) {
        const tbl = exam as unknown as { [k: string]: never };
        db.update(exam).set(patch as never).where(eq((exam as any).id ?? undefined, (e as any).id)).run();
      }
    }
    console.log(`考试时间窗刷新: ${exams.length} 个`);
  } catch (e) {
    console.log('考试表跳过:', (e as Error).message?.slice(0, 60));
  }

  // ---------- 3. 旧学生数据 → 新台账重映射 ----------
  const users = db.select().from(user).all();
  const oldStudents = users.filter((u) => u.role === 'student' && /^(stu_zhang|stu_li|stu_wang|stu_zhao|stu_chen|stu_liu|stu_yang|stu_huang|stu_zhou|stu_wu)$/.test(u.username))
    .sort((a, b) => a.id - b.id);
  const newStudents = users.filter((u) => /^stu_[01]_\d$/.test(u.username)).sort((a, b) => a.username.localeCompare(b.username));

  const idMap = new Map<number, number>();
  oldStudents.forEach((old, i) => {
    const target = newStudents[i % Math.max(1, newStudents.length)];
    if (target) idMap.set(old.id, target.id);
  });
  console.log('重映射:', [...idMap.entries()].map(([o, nw]) => {
    const ou = users.find((u) => u.id === o)?.username;
    const nu = users.find((u) => u.id === nw)?.username;
    return `${ou}(id${o})→${nu}(id${nw})`;
  }).join(' '));

  // 各表按 student_id / author_id / user_id 重映射（逐表安全执行）
  const remap = (table: string, col: string) => {
    for (const [oldId, newId] of idMap) {
      try {
        db.run(`UPDATE ${table} SET ${col} = ${newId} WHERE ${col} = ${oldId}`);
      } catch (e) {
        console.log(`  跳过 ${table}.${col}:`, (e as Error).message?.slice(0, 50));
      }
    }
  };

  remap('answer', 'student_id');
  remap('grading_task', 'student_id');
  remap('error_book', 'student_id');
  remap('knowledge_mastery_log', 'student_id');
  remap('points_account', 'user_id');
  remap('points_ledger', 'user_id');
  remap('sign_in_record', 'user_id');
  remap('sign_in_summary', 'user_id');
  remap('qa_session', 'user_id');
  remap('notification', 'user_id');
  remap('study_plan', 'student_id');
  remap('discussion_post', 'author_id');
  remap('discussion_reply', 'author_id');
  remap('user_decoration', 'user_id');

  // 掌握度唯一键可能冲突（新旧学生同一知识点都有记录）——冲突行合并：取 max
  try {
    db.run(`DELETE FROM knowledge_mastery_log WHERE id NOT IN (
      SELECT MAX(id) FROM knowledge_mastery_log GROUP BY student_id, knowledge_point_id)`);
  } catch { /* 无冲突则跳过 */ }

  saveDb();
  console.log('✅ 演示数据保鲜完成');
  process.exit(0);
}
main();

/**
 * 查找「已提交但未批改」的作业+学生组合，并输出其客观题答案（供 batch API 验证）
 */
import { initDb, getDb } from '../src/storage/database/db';
import { answer, gradingTask, assignment, question } from '../src/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

async function main() {
  await initDb();
  const db = getDb();
  const assignments = db.select().from(assignment).all();
  const found: Array<{ aid: number; sid: number; answers: Array<{ qid: number; type: string; ans: string; ref: string }> }> = [];
  for (const a of assignments) {
    const qIds = (a.question_ids as number[]) || [];
    if (qIds.length === 0) continue;
    const ans = db.select().from(answer).where(and(eq(answer.assignment_id, a.id), eq(answer.is_submitted, true))).all();
    if (ans.length === 0) continue;
    const studentIds = [...new Set(ans.map((x) => x.student_id))];
    for (const sid of studentIds) {
      const graded = db.select({ qid: gradingTask.question_id }).from(gradingTask)
        .where(and(eq(gradingTask.assignment_id, a.id), eq(gradingTask.student_id, sid))).all();
      const gradedSet = new Set(graded.map((g) => g.qid));
      const ungraded = ans.filter((x) => x.student_id === sid && !gradedSet.has(x.question_id));
      if (ungraded.length === 0) continue;
      const qs = db.select().from(question).where(inArray(question.id, ungraded.map((u) => u.question_id))).all();
      const qMap = new Map(qs.map((q) => [q.id, q]));
      found.push({
        aid: a.id,
        sid,
        answers: ungraded.slice(0, 6).map((u) => ({
          qid: u.question_id,
          type: qMap.get(u.question_id)?.question_type || '?',
          ans: (u.student_answer || '').slice(0, 30),
          ref: (qMap.get(u.question_id)?.answer || '').slice(0, 30),
        })),
      });
      if (found.length >= 3) break;
    }
    if (found.length >= 3) break;
  }
  console.log(JSON.stringify(found, null, 2));
  process.exit(0);
}
main();

import { initDb, getDb } from '../src/storage/database/db';
import { question } from '../src/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { computeGrade } from '../src/services/grading.service';
async function main() {
  await initDb();
  const db = getDb();
  const q = db.select().from(question).where(eq(question.id, 10)).limit(1).all()[0];
  console.log('题10 类型:', q.question_type, '| 参考答案:', q.answer);
  const r = await computeGrade(q, 'AB', '内置数据类型', undefined);
  console.log('computeGrade("AB") →', JSON.stringify({
    total_score: r.total_score,
    full_score: r.full_score,
    comment: r.annotations?.[0]?.comment,
  }));
  const r2 = await computeGrade(q, 'ABD', '内置数据类型', undefined);
  console.log('computeGrade("ABD") →', r2.total_score, '/', r2.full_score);
  process.exit(0);
}
main();

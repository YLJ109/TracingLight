import { initDb, getDb } from '../src/storage/database/db';
import { question } from '../src/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
async function main() {
  await initDb();
  const db = getDb();
  const rows = db.select().from(question).where(eq(question.question_type, 'multiple_choice')).all();
  rows.slice(0, 8).forEach((q) => console.log(q.id, '| course', q.course_id, '| answer:', (q.answer || '').slice(0, 20), '|', (q.content || '').slice(0, 25)));
  process.exit(0);
}
main();

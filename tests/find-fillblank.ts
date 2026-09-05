import { initDb, getDb } from '../src/storage/database/db';
import { question } from '../src/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
async function main() {
  await initDb();
  const db = getDb();
  const rows = db.select().from(question).where(eq(question.question_type, 'fill_blank')).all();
  rows.slice(0, 10).forEach((q) => console.log(q.id, '|', (q.answer || '').slice(0, 20), '|', (q.content || '').slice(0, 30)));
  process.exit(0);
}
main();

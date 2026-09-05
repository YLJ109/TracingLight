/** 存量错题回填：未掌握的错题 next_review_at 设为立即到期（纳入间隔复习体系） */
import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { errorBook } from '../src/storage/database/shared/schema';
import { isNull, ne } from 'drizzle-orm';
async function main() {
  await initDb();
  const db = getDb();
  const all = db.select().from(errorBook).all();
  const need = all.filter((e) => e.review_status !== 'mastered' && !e.next_review_at);
  const now = new Date(Date.now() - 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  let updated = 0;
  for (const e of need) {
    db.update(errorBook).set({ next_review_at: now, review_count: e.review_count ?? 0 }).run();
    updated++;
  }
  console.log('backfilled:', updated);
  saveDb();
  process.exit(0);
}
main();

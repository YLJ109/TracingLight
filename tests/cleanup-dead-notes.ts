import { initDb, getDb, saveDb } from '../src/storage/database/db';
import { notification } from '../src/storage/database/shared/schema';
import { inArray } from 'drizzle-orm';
async function main() {
  await initDb();
  const db = getDb();
  const all = db.select().from(notification).all();
  const dead = all.filter((n) => /\/student\/assignments\/(25|26|27)\b/.test(n.link || ''));
  if (dead.length) db.delete(notification).where(inArray(notification.id, dead.map((n) => n.id))).run();
  console.log('dead-link notifications deleted:', dead.length);
  saveDb();
  process.exit(0);
}
main();

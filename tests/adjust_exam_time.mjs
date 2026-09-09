import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('d:/front-back/suguang_projects/data/tracinglight.db');

// Adjust exam 5819 to be open now: start_at 1 hour ago, end_at 2 hours later
const now = new Date();
const start = new Date(now.getTime() - 60*60*1000);
const end = new Date(now.getTime() + 2*60*60*1000);

// Update to now accessible window
const res = db.prepare(`UPDATE exam 
  SET start_at=?, end_at=?, status='published' 
  WHERE id=5819`).run(start.toISOString(), end.toISOString());

console.log('Updated exam 5819 status: start=', start, 'end=', end, 'changes', res.changes);
console.log('Current row:', db.prepare('SELECT id,title,start_at,end_at,status FROM exam WHERE id=5819').get());
db.close();
console.log('Done');

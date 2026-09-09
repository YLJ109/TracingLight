import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('d:/front-back/suguang_projects/data/tracinglight.db');
// restore exam 5819 original definition
db.prepare("UPDATE exam SET start_at='2026-09-22T09:00:00.000Z', end_at='2026-09-22T10:00:00.000Z', status='scheduled' WHERE id=5819").run();
console.log('restored exam5819:', db.prepare('SELECT id,start_at,end_at,status FROM exam WHERE id=5819').get());
db.close();
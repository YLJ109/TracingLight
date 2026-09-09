import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('d:/front-back/suguang_projects/data/tracinglight.db');
db.pragma('foreign_keys = ON');
const delAtt = db.prepare('DELETE FROM exam_attempt WHERE exam_id=5819 AND student_id=12').run();
const delEb  = db.prepare('DELETE FROM error_book WHERE student_id=12 AND exam_id=5819').run();
for(const kp of [91,95,129]) db.prepare('DELETE FROM knowledge_mastery_log WHERE student_id=12 AND knowledge_point_id=?').run(kp);
db.prepare('UPDATE knowledge_mastery_log SET mastery_rate=100, error_count=0 WHERE student_id=12 AND knowledge_point_id IN (89,105,125)').run();
const now=new Date();
db.prepare("UPDATE exam SET start_at=?, end_at=?, status='published' WHERE id=5819").run(
  new Date(now.getTime()-60*60*1000).toISOString(), new Date(now.getTime()+2*60*60*1000).toISOString());
console.log('reset done. attempt del', delAtt.changes, 'error_book del', delEb.changes);
const c2=db.prepare('SELECT COUNT(*) c FROM exam_answer WHERE exam_id=5819 AND student_id=12').get().c;
const c3=db.prepare('SELECT COUNT(*) c FROM exam_grading WHERE exam_id=5819 AND student_id=12').get().c;
console.log('remaining answer/grading rows:', c2, c3);
db.close();
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
console.log('students:', dbl.prepare("SELECT id,username,real_name FROM user WHERE role='student' AND id<>12 LIMIT 5").all());
console.log('teachers:', dbl.prepare("SELECT id,username,real_name FROM user WHERE role='teacher' AND id<>9 LIMIT 5").all());
console.log('exam5819 enroll:', dbl.prepare("SELECT * FROM exam_enroll WHERE exam_id=5819").all());
console.log('kp names:', dbl.prepare("SELECT id,name FROM knowledge_point WHERE id IN (89,129,105,125,95,91)").all());
dbl.close();
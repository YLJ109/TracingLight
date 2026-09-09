import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
for (const eid of [5261,5272,5819,5830]) {
  const ex = dbl.prepare("SELECT id,title,exam_type,time_mode,start_at,end_at,duration,status,has_subjective,teacher_id,randomized FROM exam WHERE id=?").get(eid);
  const qids = JSON.parse(dbl.prepare("SELECT question_ids FROM exam WHERE id=?").get(eid).question_ids);
  const types = dbl.prepare("SELECT id,question_type,difficulty,knowledge_point_id,answer,length(options) optlen FROM question WHERE id IN ("+qids.join(',')+")").all();
  console.log(`=== exam ${eid} ${ex.title} status=${ex.status} tm=${ex.time_mode} teacher=${ex.teacher_id}`);
  for (const q of types) console.log(`  q${q.id} ${q.question_type} kp=${q.knowledge_point_id} opt=${q.optlen} ans=${String(q.answer).slice(0,20)}`);
}
dbl.close();
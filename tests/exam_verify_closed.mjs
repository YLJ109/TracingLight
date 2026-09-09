import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
const EXA=5819, STU=12;
console.log('=== exam def ===');
console.log('total_score=', dbl.prepare('SELECT total_score,question_scores,has_subjective FROM exam WHERE id=?').get(EXA));
const qs=JSON.parse(dbl.prepare('SELECT question_scores FROM exam WHERE id=?').get(EXA).question_scores);
const sumQS=Object.values(qs).reduce((a,b)=>a+Number(b),0);
console.log('sum(question_scores)=', sumQS);

console.log('=== exam_grading full_score detail ===');
const g=dbl.prepare('SELECT question_id,full_score,total_score,status,teacher_override_score FROM exam_grading WHERE exam_id=? AND student_id=? ORDER BY question_id').all(EXA,STU);
for(const x of g) console.log(`  q${x.question_id} full=${x.full_score} got=${x.total_score} st=${x.status} ovr=${x.teacher_override_score}`);
const sumFull=g.reduce((a,x)=>a+(x.full_score||0),0);
const sumGot=g.reduce((a,x)=>a+(x.total_score||0),0);
console.log('sumFull=',sumFull,' sumGot=',sumGot,' count=',g.length);

console.log('=== error_book after teacher grading (exam) ===');
const eb=dbl.prepare('SELECT question_id,error_type,review_status FROM error_book WHERE student_id=? AND exam_id=? ORDER BY question_id').all(STU,EXA);
for(const e of eb) console.log(`  q${e.question_id} err=${e.error_type} rev=${e.review_status}`);
console.log('  count=', eb.length);

console.log('=== mastery all affected kps ===');
const kps=dbl.prepare('SELECT DISTINCT knowledge_point_id FROM exam_grading WHERE exam_id=? AND student_id=?').all(EXA,STU).map(r=>r.knowledge_point_id);
for(const kp of kps){
  const m=dbl.prepare('SELECT mastery_rate,error_count FROM knowledge_mastery_log WHERE student_id=? AND knowledge_point_id=?').get(STU,kp);
  console.log(`  kp${kp} -> ${m?`${m.mastery_rate}/${m.error_count}`:'(none)'}`);
}
dbl.close();
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
const BASE='http://localhost:5000';
async function call(method,path,token,body){const h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j};}
const tea=await (async()=>{const r=await call('POST','/api/auth/login',null,{username:'teacher_0_0',password:'teacher_0_0'});return r.json.token;})();
const EXA=5819, STU=12;
const kp=(id)=>{const m=dbl.prepare('SELECT mastery_rate,error_count FROM knowledge_mastery_log WHERE student_id=? AND knowledge_point_id=?').get(STU,id);return m?`${m.mastery_rate}/${m.error_count}`:'(none)'};
const ebq=()=>dbl.prepare('SELECT COUNT(*) c FROM error_book WHERE student_id=? AND exam_id=?').get(STU,EXA).c;
console.log('BEFORE regrade: kp89',kp(89),'kp129',kp(129),'kp113',kp(113),'kp127',kp(127),'error_book',ebq());
// re-grade same subjective items (same scores) a 2nd time
const g=dbl.prepare('SELECT g.id grading_id,g.question_id,g.full_score FROM exam_grading g JOIN exam_answer a ON a.id=g.answer_id JOIN question q ON q.id=g.question_id WHERE g.exam_id=? AND g.student_id=? AND (g.question_id IN (411,417,420,425,430))').all(EXA,STU);
const body={items:g.map(x=>({grading_id:x.grading_id, score:Math.round(x.full_score*0.8), comment:'re-grade test'}))};
const r=await call('POST',`/api/teacher/exams/${EXA}/grading`,tea,body);
console.log('regrade POST status',r.status, JSON.stringify(r.json));
console.log('AFTER regrade: kp89',kp(89),'kp129',kp(129),'kp113',kp(113),'kp127',kp(127),'error_book',ebq());
dbl.close();
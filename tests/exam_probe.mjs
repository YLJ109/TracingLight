import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
const BASE='http://localhost:5000';
async function call(method,path,token,body){const h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j};}
async function login(u,p){const r=await call('POST','/api/auth/login',null,{username:u,password:p});return r.json?.token;}

// student
const stu = await login('stu_0_1','stu_0_1');
const tea = await login('teacher_0_0','teacher_0_0');
const stuInfo = dbl.prepare("SELECT id,real_name,username FROM user WHERE username='stu_0_1'").get();
const teaInfo = dbl.prepare("SELECT id,real_name,username FROM user WHERE username='teacher_0_0'").get();
console.log('STUDENT', stuInfo, 'hasToken', !!stu, 'TEACHER', teaInfo, 'hasToken', !!tea);

const exL = await call('GET','/api/student/exams', stu);
console.log('=== STUDENT EXAMS status', exL.status);
for (const e of (exL.json?.exams||[])) {
  console.log(`id=${e.id} title=${e.title} status=${e.status} attempt=${e.attempt_status} state=${e.state} grades_pub=${e.grades_published} start=${e.start_at} end=${e.end_at} type=${e.exam_type} tm=${e.time_mode} dur=${e.duration} qids=${JSON.stringify(e.question_ids)} qscores=${JSON.stringify(e.question_scores)} subj=${e.has_subjective}`);
}
console.log('=== TEACHER EXAMS ===');
const tL = await call('GET','/api/teacher/exams', tea);
console.log('status', tL.status, JSON.stringify(tL.json)?.slice(0,800));
dbl.close();
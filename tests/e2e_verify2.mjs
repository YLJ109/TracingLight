import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
const BASE='http://localhost:5000';
async function call(method,path,token,body){const h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j};}
async function login(u,p){const r=await call('POST','/api/auth/login',null,{username:u,password:p});return r.json?.token;}
const stu=await login('stu_0_1','stu_0_1');
const tea=await login('teacher_0_0','teacher_0_0');

// 学生端作业列表确认
const al=await call('GET','/api/student/assignments',stu);
const a=al.json?.data?.find(x=>x.id===1516);
console.log('=== 学生端 1516 === status', al.status);
console.log('title',a?.title,'status',a?.status,'my_score',a?.my_score,'pub',a?.grades_published);

// 教师端题目/提交详情
const pd=await call('GET','/api/teacher/assignments/1516/students/12',tea);
console.log('=== 教师端学生批改详情 summary ===');
console.log(pd.json?.data?.summary);
console.log('details:');
for(const dd of pd.json?.data?.details){
  console.log(`q${dd.question.id} ${dd.question.question_type} ans=${JSON.stringify(dd.answer?.student_answer?.slice(0,20))} total=${dd.grading?.total_score}/${dd.grading?.full_score} override=${dd.grading?.teacher_override_score??'-'} err=${dd.grading?.error_type??'-'}`);
}

// 错题本当前（q359 在改分前）
const eb1=dbl.prepare('SELECT id,question_id,knowledge_point_id,error_type,review_status FROM error_book WHERE student_id=12 AND assignment_id=1516 AND question_id=359').all();
console.log('=== 改分前 q359 错题本 ===', JSON.stringify(eb1));

// 教师将 q359 改满 16 分（改分路径只走 syncMasteryFromGrading）
const ov=await call('POST','/api/teacher/assignments/grade/override',tea,{grading_task_id:4323,override_score:16,override_comment:'复核通过'});
console.log('=== override q359 → 16 === status', ov.status, JSON.stringify(ov.json));

// 改分后：错题本是否仍残留 q359
const eb2=dbl.prepare('SELECT id,question_id,knowledge_point_id,error_type,review_status FROM error_book WHERE student_id=12 AND assignment_id=1516 AND question_id=359').all();
console.log('=== 改分后 q359 错题本 ===', JSON.stringify(eb2), eb2.length===0?'(已移除)':'(仍残留!)');

// 掌握度 kp79
const m=dbl.prepare('SELECT mastery_rate,error_count FROM knowledge_mastery_log WHERE student_id=12 AND knowledge_point_id=79').get();
console.log('=== kp79 掌握度 改分后 ===', JSON.stringify(m));

// 学生端改分后分数
const al2=await call('GET','/api/student/assignments',stu);
const a2=al2.json?.data?.find(x=>x.id===1516);
console.log('=== 改分后学生端 my_score', a2?.my_score, 'status', a2?.status, 'pub', a2?.grades_published);
dbl.close();
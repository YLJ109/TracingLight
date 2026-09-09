import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const BASE='http://localhost:5000';
async function call(method,path,token,body){const h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j};}
async function login(u,p){const r=await call('POST','/api/auth/login',null,{username:u,password:p});return r.json?.token;}
const OK='\x1b[32m', NO='\x1b[31m', RC='\x1b[0m';
const note=(name,res,expectReject)=>console.log(`${(res.status>=400)===expectReject?OK:NO}(${res.status})${RC} ${name}${expectReject?' [期望拒绝]':''} ${(res.json?.error||res.json?.reason||'').toString().slice(0,60)}`);

const otherStu=await login('stu_0_2','stu_0_2');   // id 13, enrolled but allow=0 defer
const otherTea=await login('teacher_0_1','teacher_0_1'); // id 10, not owner
const st12=await login('stu_0_1','stu_0_1');
const noAuth=null;

const EXAM=5819;
// student accessing result for exam (stu 12 already)
note('RB_INVALID other student /result of exam5819', await call('GET',`/api/student/exams/${EXAM}/result`,otherStu), true);
note('RB_INVALID student->teacher grading GET', await call('GET',`/api/teacher/exams/${EXAM}/grading`,otherStu), true);
note('RB teacher-nonowner->grading GET', await call('GET',`/api/teacher/exams/${EXAM}/grading`,otherTea), true);
note('RB teacher-nonowner->publish GET', await call('POST',`/api/teacher/exams/${EXAM}/publish-grades`,otherTea), true);
note('RB teacher-nonowner->grading POST', await call('POST',`/api/teacher/exams/${EXAM}/grading`,otherTea,{items:[]}), true);
note('RB teacher->student start', await call('POST',`/api/student/exams/${EXAM}/start`,otherTea,{}), true);
note('RB student->submit again (already submitted)', await call('POST',`/api/student/exams/${EXAM}/submit`,st12), true);
note('RB no-token student exams', await call('GET',`/api/student/exams`,noAuth), true);
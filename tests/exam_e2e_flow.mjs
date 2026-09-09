import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const dbl = new Database('d:/front-back/suguang_projects/data/tracinglight.db', { readonly: true });
const BASE='http://localhost:5000';
async function call(method,path,token,body){const h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j};}
async function login(u,p){const r=await call('POST','/api/auth/login',null,{username:u,password:p});return r.json?.token;}
const OK='\x1b[32m', NO='\x1b[31m', RC='\x1b[0m';
const line=(name,res)=>console.log(`${res.status<400?OK:NO}(${res.status})${RC} ${name} ${res.json?.error?('→ '+(res.json.error+'').slice(0,120)):''}`);

const EXAM=5819, STU=12;
const stu=await login('stu_0_1','stu_0_1');
const tea=await login('teacher_0_0','teacher_0_0');

// ---- 1. start ----
let r=await call('POST',`/api/student/exams/${EXAM}/start`,stu,{device_fp:'e2e-probe'});
line('START', r);
const attempt=r.json?.attempt;
console.log('  attempt.status=',attempt?.status,'deadline=',attempt?.deadline);

// ---- 2. answer (batch) ----
const answers=[
  {question_id:372, student_answer:'D', duration_ms:5000},       // single correct
  {question_id:378, student_answer:'B', duration_ms:6000},       // single WRONG (ok=A)
  {question_id:392, student_answer:'AD',duration_ms:7000},       // multi correct
  {question_id:403, student_answer:'抽象数据类型', duration_ms:8000}, // fill correct
  {question_id:383, student_answer:'对', duration_ms:9000},      // judgment WRONG (ok=错)
  {question_id:389, student_answer:'对', duration_ms:3000},      // judgment WRONG (ok=错)
  {question_id:390, student_answer:'错', duration_ms:4000},      // judgment correct
  {question_id:411, student_answer:'动态规划的状态转移方程核心在于子问题重叠与最优子结构', duration_ms:12000},
  {question_id:417, student_answer:'分治与动态规划的区别在于后者依赖重叠子问题的备忘化', duration_ms:13000},
  {question_id:420, student_answer:'贪心算法在每一步选取当前最优解，局部最优需证明全局最优', duration_ms:14000},
  {question_id:425, student_answer:'def fib(n):\n  dp=[0]*(n+1)\n  dp[1]=1\n  for i in range(2,n+1): dp[i]=dp[i-1]+dp[i-2]\n  return dp[n]', duration_ms:15000},
  {question_id:430, student_answer:'二分查找需有序数组，每轮将区间折半，复杂度为 O(log n)', duration_ms:16000},
];
r=await call('POST',`/api/student/exams/${EXAM}/answer`,stu,{answers});
line('ANSWER(batch 12)', r);

// ---- pre-mastery snapshot ----
const preKp={};
for(const kp of [89,129,105,125,95,91]){
  const m=dbl.prepare('SELECT mastery_rate,error_count FROM knowledge_mastery_log WHERE student_id=? AND knowledge_point_id=?').get(STU,kp);
  preKp[kp]=m?`${m.mastery_rate}/${m.error_count}`:'(none)';
}
console.log('  pre-mastery kp89/129/105/125/95/91 =', JSON.stringify(preKp));
const preErr=dbl.prepare('SELECT COUNT(*) c FROM error_book WHERE student_id=? AND exam_id=?').get(STU,EXAM).c;
console.log('  pre error_book(exam) count=', preErr);

// ---- 3. submit ----
r=await call('POST',`/api/student/exams/${EXAM}/submit`,stu);
line('SUBMIT', r);

// ---- DB checks after submit (objective graded) ----
const grad=dbl.prepare('SELECT g.question_id,g.question_type,g.total_score,g.full_score,g.status,g.error_type FROM exam_grading g JOIN exam_answer a ON a.id=g.answer_id WHERE a.attempt_id=? ORDER BY g.question_id').all(attempt?.id);
console.log('  exam_grading rows=', grad.length);
for(const g of grad) console.log(`    q${g.question_id} ${g.question_type} ${g.total_score}/${g.full_score} status=${g.status} err=${g.error_type}`);
const objWrong=dbl.prepare('SELECT question_id,error_type,review_status FROM error_book WHERE student_id=? AND exam_id=?').all(STU,EXAM);
console.log('  error_book exam rows=', objWrong.length);
for(const e of objWrong) console.log(`    q${e.question_id} err=${e.error_type} rev=${e.review_status}`);

// ---- 4. teacher grading (GET pending then POST scores) ----
r=await call('GET',`/api/teacher/exams/${EXAM}/grading`,tea);
line('GRADING(teacher GET)', r);
const grouped=r.json?.grouped||[];
let items=[];
for(const grp of grouped){
  const full=grp.rows[0]?.full_score;
  const gid=grp.rows[0]?.grading_id;
  const score=Math.round(full*0.8); // 给 80%：改分不影响满分判定仍为错（进错题本）
  items.push({grading_id:gid, score, comment:'教师复核：基本正确，补充展开更佳'});
  console.log(`  grading q${grp.question_id} gid=${gid} full=${full} -> set ${score}`);
}
r=await call('POST',`/api/teacher/exams/${EXAM}/grading`,tea,{items});
line('GRADING(teacher POST '+items.length+' items)', r);

// re-read subjective grading status
const pend=dbl.prepare('SELECT question_id,total_score,status FROM exam_grading WHERE exam_id=? AND status=?').all(EXAM,'pending');
console.log('  remaining pending=', pend.length);

// ---- publish ----
r=await call('POST',`/api/teacher/exams/${EXAM}/publish-grades`,tea);
line('PUBLISH-GRADES', r);

// ---- 5. student result ----
r=await call('GET',`/api/student/exams/${EXAM}/result`,stu);
line('RESULT(student GET)', r);
const sum=r.json?.summary;
console.log('  summary=', JSON.stringify(sum));

// ---- post-mastery ----
for(const kp of [89,129,105,125,95,91]){
  const m=dbl.prepare('SELECT mastery_rate,error_count FROM knowledge_mastery_log WHERE student_id=? AND knowledge_point_id=?').get(STU,kp);
  console.log(`  kp${kp} post-mastery = ${m?`${m.mastery_rate}/${m.error_count}`:'(none)'}  [pre ${preKp[kp]}]`);
}

// ---- attempt status ----
const att=dbl.prepare('SELECT status,submitted_via,submitted_at FROM exam_attempt WHERE id=?').get(attempt?.id);
console.log('  attempt final=', att);

dbl.close();
console.log('DONE');
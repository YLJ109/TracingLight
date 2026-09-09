/* 端到端写链路验证：学生提交 → 教师批改 → 掌握度/错题本回写 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const BASE = 'http://localhost:5000';
const DB = 'd:/front-back/suguang_projects/data/tracinglight.db';
const STUDENT_ID = 12;   // stu_0_1 赵妍
const ASSIGNMENT_ID = 1516; // 综合作业5（未提交）
const dbl = new Database(DB, { readonly: true });

function esc(s){ return String(s); }

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(u,p){ const r=await call('POST','/api/auth/login',null,{username:u,password:p}); return {token:r.json?.token, raw:r}; }

// —— 读库快照 ——
function masteryLogs(studentId) {
  return dbl.prepare('SELECT knowledge_point_id, mastery_rate, error_count, recorded_at FROM knowledge_mastery_log WHERE student_id=? ORDER BY knowledge_point_id').all(studentId);
}
function kpOfQuestion() {
  const kps = [];
  for (const qid of [317,321,323,333,334,359,360,365]) {
    const r = dbl.prepare('SELECT id,knowledge_point_id,question_type,default_score FROM question WHERE id=?').get(qid);
    kps.push({ qid, ...r });
  }
  return kps;
}
function errors(studentId, asgnId) {
  return dbl.prepare('SELECT id,question_id,knowledge_point_id,error_type,review_status FROM error_book WHERE student_id=? AND assignment_id=? ORDER BY question_id').all(studentId, asgnId);
}
function gradings(studentId, asgnId) {
  return dbl.prepare('SELECT question_id,total_score,full_score,teacher_override_score,status,error_type FROM grading_task WHERE student_id=? AND assignment_id=? ORDER BY question_id').all(studentId, asgnId);
}

console.log('=== 准备 ===');
const qk = kpOfQuestion();
const beforeMastery = masteryLogs(STUDENT_ID);
const out = {};

// Step 1: 登录
const stu = await login('stu_0_1','stu_0_1');
const tea = await login('teacher_0_0','teacher_0_0');
console.log('stu login', stu.raw.status, '| tea login', tea.raw.status);

// Step 3: 提交作业
console.log('\n=== Step3 学生提交作业 1516 ===');
const answers = [
  { question_id: 317, student_answer: 'D' },        // 对 kp63
  { question_id: 321, student_answer: '对' },       // 对 kp83
  { question_id: 323, student_answer: '错' },       // 错 kp75
  { question_id: 333, student_answer: 'A,B' },      // 错 kp71 (正确A,D)
  { question_id: 334, student_answer: 'B,D' },      // 对 kp57
  { question_id: 359, student_answer: '<p>正则表达式用于字符串模式匹配，可做验证、提取、替换；注意贪婪与非贪婪模式的区别、转义字符的使用以及正则引擎性能问题。实际开发中常用于表单校验、日志分析和数据清洗，是处理文本数据的重要工具。</p>' },
  { question_id: 360, student_answer: '<p>函数式编程强调纯函数、不可变数据、高阶函数与lambda表达式，适合数据处理与并发场景。它通过避免副作用和共享状态来降低复杂度，常用map、filter、reduce等操作组合业务逻辑，使代码更可读、更易测试。</p>' },
  { question_id: 365, student_answer: '<p>综合项目实践：设计一个完整的文件读写与处理系统，包含异常处理、模块化封装与主流程测试。首先定义文件输入输出模块，其次实现数据清洗与统计函数，再通过异常处理保证健壮性，最后编写单元测试验证各模块功能正确并满足业务需求。</p>' },
];
const sub = await call('POST', '/api/student/assignments/submit', stu.token, { assignment_id: ASSIGNMENT_ID, answers });
console.log('submit status', sub.status);
if (sub.json?.error) console.log('submit error:', sub.json.error);
console.log('objectiveGrades:', JSON.stringify(sub.json?.objectiveGrades, null, 2));
out.submit = { status: sub.status, objective_summary: sub.json?.objective_summary, count: sub.json?.count };

// 提交后客观题立即判分
console.log('\n--- 提交后 grading_task (自动预判客观题) ---');
const gradAfterSubmit = gradings(STUDENT_ID, ASSIGNMENT_ID);
console.log(gradAfterSubmit.map(g=>`q${g.question_id} ${g.total_score}/${g.full_score} status=${g.status} err=${g.error_type||'-'}`).join('\n'));

// Step 4a: 教师批量批改（主观题）—— 尝试调用
console.log('\n=== Step4a 教师 AI 批量批改 ===');
const batch = await call('POST', '/api/ai/grade/batch', tea.token, { assignment_id: ASSIGNMENT_ID, student_id: STUDENT_ID });
console.log('batch status', batch.status);
console.log(JSON.stringify(batch.json, null, 2));
out.batch = { status: batch.status, body: batch.json };

// 批改后 grading_task
const gradAfterBatch = gradings(STUDENT_ID, ASSIGNMENT_ID);
console.log('\n--- 批量批改后 grading_task ---');
console.log(gradAfterBatch.map(g=>`q${g.question_id} ${g.total_score}/${g.full_score} status=${g.status} err=${g.error_type||'-'}`).join('\n'));

// Step 4b: 发布成绩
console.log('\n=== Step4b 发布成绩 ===');
const pub = await call('POST', `/api/teacher/assignments/${ASSIGNMENT_ID}/publish-grades`, tea.token);
console.log('publish status', pub.status, JSON.stringify(pub.json));

// Step 5: 校验
console.log('\n=== Step5 校验 ===');
const gradFinal = gradings(STUDENT_ID, ASSIGNMENT_ID);
const errFinal = errors(STUDENT_ID, ASSIGNMENT_ID);
const masteryAfter = masteryLogs(STUDENT_ID);
console.log('--- 最终 grading_task ---');
console.log(gradFinal.map(g=>`q${g.question_id} ${g.total_score}/${g.full_score} override=${g.teacher_override_score??'-'}`).join('\n'));
console.log('--- 该作业错题本 ---');
console.log(errFinal.map(e=>`e${e.id} q${e.question_id} kp${e.knowledge_point_id} type=${e.error_type} status=${e.review_status}`).join('\n'));
console.log('--- 掌握度 before → after ---');
const bm = new Map(beforeMastery.map(r=>[r.knowledge_point_id, r.mastery_rate]));
for (const k of qk) {
  const kp = k.knowledge_point_id;
  console.log(`kp${kp}(q${k.qid} ${k.question_type}): before=${bm.get(kp)??'∅'} after=${masteryAfter.find(m=>m.knowledge_point_id===kp)?.mastery_rate??'∅'} err=${masteryAfter.find(m=>m.knowledge_point_id===kp)?.error_count??'-'}`);
}
out.final = { gradFinal, errFinal, masteryAfter };
dbl.close();
console.log('\nDONE');
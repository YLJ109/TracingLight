const BASE = 'http://localhost:5000';
async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(u, p) { const r = await call('POST','/api/auth/login',null,{username:u,password:p}); return r.json?.token; }
const stu = await login('stu_0_1','stu_0_1');
const tea = await login('teacher_0_0','teacher_0_0');

const AR = 1516;
const q = await call('GET', `/api/teacher/assignments/${AR}/questions`, tea);
console.log('=== assignment', AR, 'details status', q.status);
const d = q.json?.data;
if (d) {
  console.log('id/title/review/has_subj:', d.id, d.title, d.review_mode, d.has_subjective);
  console.log('question_scores:', JSON.stringify(d.question_scores));
  for (const qq of d.questions) {
    console.log(JSON.stringify({
      id: qq.id, type: qq.question_type, kp: qq.knowledge_point_id,
      kpname: qq.knowledge_point?.name, answer: qq.answer, default_score: qq.default_score,
      content: (qq.content||'').slice(0,40),
    }));
  }
}
console.log('=== teacher exams raw ===');
const te = await call('GET','/api/teacher/exams', tea);
console.log('status', te.status, JSON.stringify(te.json).slice(0,800));

console.log('=== student errors before ===');
const se = await call('GET','/api/student/errors', stu);
console.log('status', se.status, 'count', se.json?.data?.length);
console.log(JSON.stringify(se.json?.data?.slice(0,5).map(e=>({id:e.id,q:e.question_id,kp:e.knowledge_point_id,status:e.review_status,asgn:e.assignment_id})), null, 2));

// 掌握度现状 for these KPs (via error list only). Let's also hit knowledge-graph to see mastery per kp
const kg = await call('GET','/api/student/knowledge-graph', stu);
console.log('knowledge-graph status', kg.status, 'nodes', kg.json?.data?.nodes?.length);
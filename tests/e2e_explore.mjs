/* 探索：登录学生/教师，拉取作业/考试数据结构 */
const BASE = 'http://localhost:5000';
async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function login(u, p) {
  const r = await call('POST', '/api/auth/login', null, { username: u, password: p });
  return { status: r.status, token: r.json?.token, ...r.json };
}

const stu = await login('stu_0_1', 'stu_0_1');
const tea = await login('teacher_0_0', 'teacher_0_0');
console.log('=== stu login ===', stu.status, 'token_len', stu.token?.length);
console.log('=== tea login ===', tea.status, 'token_len', tea.token?.length);

const stuAsgn = await call('GET', '/api/student/assignments', stu.token);
console.log('=== student assignments ===  status', stuAsgn.status);
console.log(JSON.stringify(stuAsgn.json?.data?.map(a => ({id:a.id,title:a.title,course:a.course_name,status:a.status,total:a.total_score,qc:a.question_count,my_score:a.my_score,pub:a.grades_published})), null, 2));

const stuExams = await call('GET', '/api/student/exams', stu.token);
console.log('=== student exams ===  status', stuExams.status);
console.log(JSON.stringify(stuExams.json?.exams?.map(e=>({id:e.id,title:e.title,state:e.state,attempt:e.attempt_status,status:e.status})), null, 2));

const teaAsgn = await call('GET', '/api/teacher/assignments', tea.token);
console.log('=== teacher assignments ===  status', teaAsgn.status);
const tas = teaAsgn.json?.data;
console.log(JSON.stringify(tas?.map(a=>({id:a.id,title:a.title,status:a.status,course_id:a.course_id,qc:a.question_count,review:a.review_mode,submit:a.submitted_count,graded:a.graded_count,pub:a.grades_published})), null, 2));
console.log('students:', JSON.stringify(teaAsgn.json?.students, null, 2));

const teaExams = await call('GET', '/api/teacher/exams', tea.token);
console.log('=== teacher exams ===  status', teaExams.status);
console.log(JSON.stringify(teaExams.json?.data?.map(e=>({id:e.id,title:e.title,status:e.status,qc:e.question_count,submit:e.submitted_count})), null, 2));
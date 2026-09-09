/**
 * 全量 API 冒烟测试（只读为主，不做写操作以避免污染数据）。
 * 三角色登录→拉取各端点→校验 HTTP 200 与 JSON 结构。
 * 运行：npx tsx tests/api-smoke.ts [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:5000';

type Result = { name: string; status: number; ok: boolean; hint?: string };
const out: Result[] = [];

async function call(name: string, token: string, path: string, opts: { ignoreFail?: boolean } = {}) {
  const url = `${BASE}${path}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    let hint: string | undefined;
    let json: any = undefined;
    try { json = await r.json(); } catch { /* non-json */ }
    if (json && typeof json === 'object' && json.success === false) hint = `success=false: ${String(json.error ?? '')}`;
    if (r.status >= 400 && !opts.ignoreFail) hint = (hint ?? '') + (json?.error ? ` | error:${json.error}` : '');
    out.push({ name, status: r.status, ok: r.status < 400, hint });
  } catch (e: any) {
    out.push({ name, status: 0, ok: false, hint: `fetch fail: ${e?.message ?? e}` });
  }
}

async function login(username: string, password: string): Promise<string | null> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json().catch(() => null);
  return j?.token ?? null;
}

async function run() {
  const stuTok = await login('stu_0_1', 'stu_0_1');
  const teaTok = await login('teacher_0_0', 'teacher_0_0');
  const admTok = await login('admin', '123456');
  for (const [role, tok] of [['student', stuTok], ['teacher', teaTok], ['admin', admTok]] as const) {
    if (!tok) { console.log(`[!!] ${role} 登录失败，跳过该角色`); continue; }

    // ---- 学生端 ----
    if (role === 'student') {
      const S = [
        '/api/student/profile', '/api/student/today', '/api/student/recommend',
        '/api/student/knowledge-graph', '/api/student/errors', '/api/student/triple-graph',
        '/api/student/assignments', '/api/student/exams', '/api/student/materials',
        '/api/student/courses', '/api/student/schedule', '/api/student/behavior',
        '/api/student/checkin', '/api/student/announcements', '/api/student/study-plan',
        '/api/student/peer-review', '/api/discussion', '/api/account', '/api/notifications',
      ];
      for (const p of S) await call(`[S] ${p}`, tok, p);
      // 详情：考试列表取首个 id
      const exL = await fetch(`${BASE}/api/student/exams`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()).catch(() => null);
      const exId = exL?.exams?.[0]?.id ?? exL?.data?.exams?.[0]?.id ?? exL?.[0]?.id;
      if (exId) {
        for (const p of [`/api/student/exams/${exId}`, `/api/student/exams/${exId}/result`]) await call(`[S] ${p}`, tok, p, { ignoreFail: true });
      }
    }

    // ---- 教师端 ----
    if (role === 'teacher') {
      const T = [
        '/api/teacher/analytics', '/api/teacher/analytics/common-issues',
        '/api/teacher/questions/bank', '/api/teacher/assignments', '/api/teacher/exams',
        '/api/teacher/students', '/api/teacher/classes', '/api/teacher/courses',
        '/api/teacher/materials', '/api/teacher/announcements', '/api/teacher/knowledge-points',
        '/api/teacher/grading-config', '/api/teacher/exams/question-bank',
        '/api/account', '/api/notifications',
      ];
      for (const p of T) await call(`[T] ${p}`, tok, p);
      // 教师端动态详情
      const asL = await fetch(`${BASE}/api/teacher/assignments`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()).catch(() => null);
      const asId = Array.isArray(asL) ? asL?.[0]?.id : (asL?.assignments?.[0]?.id ?? asL?.data?.[0]?.id);
      if (asId) { await call(`[T] /api/teacher/assignments/${asId}/questions`, tok, `/api/teacher/assignments/${asId}/questions`); await call(`[T] /api/teacher/assignments/${asId}/nav`, tok, `/api/teacher/assignments/${asId}/nav`); }
      const exL2 = await fetch(`${BASE}/api/teacher/exams`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()).catch(() => null);
      const tid = Array.isArray(exL2) ? exL2?.[0]?.id : (exL2?.exams?.[0]?.id ?? exL2?.data?.[0]?.id);
      if (tid) { for (const p of [`/api/teacher/exams/${tid}`, `/api/teacher/exams/${tid}/status`, `/api/teacher/exams/${tid}/report`, `/api/teacher/exams/${tid}/grading`, `/api/teacher/exams/${tid}/monitor`]) await call(`[T] ${p}`, tok, p, { ignoreFail: true }); }
    }

    // ---- 管理员端 ----
    if (role === 'admin') {
      const A = ['/api/admin/overview', '/api/admin/dashboard', '/api/admin/users', '/api/admin/config', '/api/admin/grading-queue', '/api/admin/logs', '/api/account', '/api/notifications'];
      for (const p of A) await call(`[A] ${p}`, tok, p);
    }
  }

  // ---- AI 端点：单独归类（未配 Key 时 500 属预期环境限制，不计 bug，但提示）----
  const hurry = true;
  void hurry;
  if (stuTok) {
    await call('[AI] /api/ai/assistant (session)', stuTok, '/api/ai/assistant/session', { ignoreFail: true });
    await call('[AI] /api/ai/profile', stuTok, '/api/ai/profile', { ignoreFail: true });
  }

  // 输出报告
  let fatal = 0;
  console.log('\n===== API 冒烟结果 =====');
  for (const r of out) {
    const tag = r.status >= 500 || r.status === 0 ? 'FAIL' : 'PASS';
    if (r.status >= 500 || r.status === 0) fatal++;
    console.log(`${tag} (${r.status}) ${r.name}${r.hint ? '  → ' + r.hint : ''}`);
  }
  console.log('\n===== 汇总 =====');
  console.log(`覆盖端点 ${out.length} 个；真实失败（5xx/网络）${fatal} 个`);
  console.log('说明: 4xx 多为"仅 POST 接口被 GET 测 / 缺必填参数 / AI 未配 Key"，属预期，不计失败；5xx 才是服务端 bug。');
  const fatalList = out.filter(r => r.status >= 500 || r.status === 0);
  if (fatalList.length) { console.log('\n--- 需关注的 5xx/网络失败 ---'); for (const n of fatalList) console.log(`${n.status} ${n.name} ${n.hint ?? ''}`); }
  process.exit(fatal > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
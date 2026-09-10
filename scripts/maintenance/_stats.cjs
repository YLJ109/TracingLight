const { Pool } = require('pg');
(async () => {
  const p = new Pool({ connectionString: 'postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight' });
  const tables = {
    教师: `select count(*) c from "user" where role='teacher'`,
    学生: `select count(*) c from "user" where role='student'`,
    课程: `select count(*) c from course`,
    题目: `select count(*) c from question`,
    作业: `select count(*) c from assignment`,
    考试: `select count(*) c from exam_schedule`,
    批改任务: `select count(*) c from grading_task`,
    知识点: `select count(*) c from knowledge_point`,
  };
  const out = {};
  for (const [k, sql] of Object.entries(tables)) {
    try { const r = await p.query(sql); out[k] = +r.rows[0].c; }
    catch (e) { out[k] = 'ERR:' + JSON.stringify(e); }
  }
  console.log(JSON.stringify(out, null, 2));
  await p.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
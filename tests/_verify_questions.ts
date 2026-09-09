import { initDb, getDb } from '../src/storage/database/db';
async function main() {
  await initDb();
  const db = getDb();
  const q = db.$client;
  const byCourse = q
    .prepare(`select c.name as c, count(*) n, count(distinct q.content) dq,
      sum(case when length(q.analysis)<8 then 1 else 0 end) short,
      sum(case when q.question_type in ('single_choice','multi_choice') and q.options is null then 1 else 0 end) noopt
      from question q join course c on c.id=q.course_id group by c.id`)
    .all() as any[];
  console.log('\n== 每题库统计 ==');
  console.table(byCourse);
  const dup = q.prepare('select content,count(*) n from question group by content having n>1').all() as any[];
  console.log('\n重复题干数:', dup.length);
  const badOpt = q
    .prepare(`select count(*) as cnt from question
      where question_type='single_choice' and json_array_length(options)<4`)
    .get() as { cnt: number };
  console.log('单选选项<4 的题数:', badOpt.cnt);
  const noAnalysis = q.prepare(`select count(*) as cnt from question where length(coalesce(analysis,''))<8`).get() as { cnt: number };
  console.log('解析过短(<8字)题数:', noAnalysis.cnt);
  const subj = q
    .prepare(`select question_type, count(*) n from question group by question_type`)
    .all() as any[];
  console.log('\n== 题型分布 ==');
  console.table(subj);
  const sample = q
    .prepare(`select q.content c, q.answer a, substr(q.analysis,1,28) an, k.name kp
      from question q join knowledge_point k on k.id=q.knowledge_point_id
      where q.course_id=(select id from course order by id limit 1) limit 3`)
    .all() as any[];
  console.log('\n== 样例 ==');
  console.table(sample);
  const refBad = q.prepare(`select count(*) as cnt from grading_task where reference_answer='参考答案'`).get() as { cnt: number };
  const subjStu = q.prepare(`select count(*) as cnt from grading_task gt join question qq on qq.id=gt.question_id where qq.question_type in ('short_answer','programming') and gt.student_answer like '%理解存在偏差%'`).get() as { cnt: number };
  console.log('\n占位参考答案(reference_answer=\'参考答案\') 数:', refBad.cnt);
  console.log('主观题占位作答(含“理解存在偏差”) 数:', subjStu.cnt);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
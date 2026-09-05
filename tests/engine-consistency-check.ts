/**
 * 引擎一致性对比：ai/grade 管线(objective-grading.ts) vs ai/grade/batch 内置逻辑
 * batch 逻辑复刻自 src/app/api/ai/grade/batch/route.ts L86-114
 */
import { gradeObjectiveQuestion } from '../src/lib/objective-grading';

function batchEngine(qtype: string, ref: string, stu: string, full: number) {
  const sa = stu.trim().toLowerCase();
  const ca = ref.toLowerCase();
  if (!sa || sa === '___') return { score: 0, note: '未作答' };
  if (!['single_choice', 'multiple_choice', 'multi_choice', 'judgment', 'fill_blank'].includes(qtype))
    return { score: -1, note: '走启发式(长度比+词重合)' };
  if (sa === ca) return { score: full, note: '精确匹配满分' };
  if (qtype === 'fill_blank' && ca.includes(sa) && sa.length >= ca.length * 0.5)
    return { score: Math.floor(full * 0.5), note: '包含即半分' };
  return { score: 0, note: '不匹配零分' };
}

const CASES: Array<[string, string, string, number]> = [
  ['fill_blank', '0.25', '4分之1', 10],
  ['fill_blank', '0.25', '四分之一', 10],
  ['fill_blank', '0.25', '25%', 10],
  ['fill_blank', '0.25', '0.250', 10],
  ['single_choice', 'A', 'a', 5],
];

console.log('题目类型 | 参考答案 | 学生答案 | ai/grade引擎 | batch内置引擎 | 一致?');
let diverge = 0;
for (const [t, ref, stu, full] of CASES) {
  const g = gradeObjectiveQuestion(t, ref, stu, full);
  const gScore = g ? g.total_score : 'null(交AI)';
  const b = batchEngine(t, ref, stu, full);
  const same = String(gScore) === String(b.score);
  if (!same) diverge++;
  const mark = same ? 'OK' : '不一致';
  console.log(t + ' | ' + ref + ' | ' + stu + ' | ' + gScore + ' | ' + b.score + '(' + b.note + ') | ' + mark);
}
console.log('');
console.log('结论: ' + diverge + ' 项分歧 / ' + CASES.length + ' 用例');

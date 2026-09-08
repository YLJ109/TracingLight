/**
 * 统一题型排序（作业/考试/答题卡/结果页/批改台共用一份权威顺序）
 *
 * 规则：客观题全部在前、主观题全部在后；组内按题型连续排列（同一题型的所有题目聚在一起），
 * 题型内部保持题目原顺序（稳定排序）。客观题内部、主观题内部再按下方定义的题型次序细分。
 */

/** 客观题题型次序（由前到后）：单选 → 判断 → 多选 → 填空 */
export const OBJECTIVE_ORDER: string[] = [
  'single_choice',
  'judgment',
  'multiple_choice',
  'multi_choice',
  'fill_blank',
];

/** 主观题题型次序（由前到后）：简答 → 编程 → 论述 → 实验/附件 */
export const SUBJECTIVE_ORDER: string[] = [
  'short_answer',
  'programming',
  'essay',
  'attachment',
];

const OBJ_RANK: Record<string, number> = Object.fromEntries(OBJECTIVE_ORDER.map((t, i) => [t, i]));
const SUBJ_RANK: Record<string, number> = Object.fromEntries(SUBJECTIVE_ORDER.map((t, i) => [t, i]));

/**
 * 判断是否客观题（单选/判断/多选/填空）。
 * 兼容调用处，与 lib/objective-grading 一致但避免循环依赖。
 */
export function isObjectiveType(t?: string | null): boolean {
  return !!t && OBJ_RANK[t] !== undefined;
}

/** 排序：先客观后主观，区内按题型聚合、类型内稳定 */
export function orderQuestions<T extends { question_type?: string | null }>(items: T[]): T[] {
  return [...items].slice().sort((a, b) => {
    const ao = isObjectiveType(a.question_type) ? 0 : 1;
    const bo = isObjectiveType(b.question_type) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ra = ao === 0 ? (OBJ_RANK[a.question_type || ''] ?? 99) : (SUBJ_RANK[a.question_type || ''] ?? 99);
    const rb = ao === 0 ? (OBJ_RANK[b.question_type || ''] ?? 99) : (SUBJ_RANK[b.question_type || ''] ?? 99);
    return ra - rb;
  });
}

/** 将题目按「客观题区 + 主观题区」分段，供正文分区渲染与答题卡分区展示统一使用 */
export function groupQuestionsBySection<T extends { question_type?: string | null }>(items: T[]): Array<{ key: string; title: string; items: T[] }> {
  const sorted = orderQuestions(items);
  const obj = sorted.filter((i) => isObjectiveType(i.question_type));
  const sub = sorted.filter((i) => !isObjectiveType(i.question_type));
  const res: Array<{ key: string; title: string; items: T[] }> = [];
  if (obj.length) res.push({ key: 'objective', title: '客观题', items: obj });
  if (sub.length) res.push({ key: 'subjective', title: '主观题', items: sub });
  return res;
}
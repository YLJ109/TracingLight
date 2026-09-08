import { isObjectiveType } from './objective-grading';

/**
 * 100 分自动计分分配器
 * 规则：按「题型 + 难度」给定原始分，整卷等比缩放到合计 = 100。
 * - 客观题（判断/单选/多选/填空）：易 4 / 中 6 / 难 8
 * - 主观题（简答/编程）：易 10 / 中 15 / 难 20
 * 缩放：原始分求和后等比缩放为 100，四舍五入为整数，尾差修正到分值最大的题目，每题保底 1 分。
 */

export interface ScoreAllocQuestion {
  id: number;
  question_type: string;
  difficulty: string;
}

const DIFF_WEIGHT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2 };
const OBJ_BASE = 4;   // 客观题基础分（易）
const SUBJ_BASE = 10; // 主观题基础分（易）
const TARGET = 100;

export function rawBaseScore(q: ScoreAllocQuestion): number {
  const base = isObjectiveType(q.question_type) ? OBJ_BASE : SUBJ_BASE;
  const w = DIFF_WEIGHT[(q.difficulty || 'medium').toLowerCase()] ?? 1.5;
  return base * w;
}

/**
 * @param questions 作业题目（含 id/type/difficulty）
 * @returns { scores: { [questionId]: number }, total: 100 }
 */
export function allocateScores(questions: ScoreAllocQuestion[]): { scores: Record<number, number>; total: number } {
  const scores: Record<number, number> = {};
  const raw = questions.map((q) => [q.id, rawBaseScore(q)] as const);

  const rawSum = raw.reduce((s, [, v]) => s + v, 0);
  if (raw.length === 0 || rawSum <= 0) return { scores, total: 0 };

  // 等比缩放到整数分（向下取整，每题保底 1）
  const scaled = raw.map(([id, v]) => [id, Math.max(1, Math.floor((v / rawSum) * TARGET))] as [number, number]);
  // 把舍入缺口 diff（含正负）均匀分配到各题，单题不低于 1，保证合计=100
  let diff = TARGET - scaled.reduce((s, [, v]) => s + v, 0);
  let k = 0;
  while (diff !== 0 && k < scaled.length * 4) {
    const idx = k % scaled.length;
    const cur = scaled[idx][1];
    if (diff > 0) { scaled[idx][1] = cur + 1; diff--; }
    else if (cur > 1) { scaled[idx][1] = cur - 1; diff++; }
    k++;
  }
  for (const [id, v] of scaled) scores[id] = v;
  return { scores, total: Object.values(scores).reduce((a, b) => a + b, 0) };
}
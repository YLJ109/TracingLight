/**
 * 班级内查重（轻量 shingle + Jaccard 相似度）
 * 用于简答/编程题：对学生两两作答（或与参考答案）计算相似度，
 * 高于阈值的标注「疑似抄袭」，结果供批改台/监控面板展示。
 */

/** 归一化文本：去空白、转小写、去常见标点，便于短句切分 */
function normalize(s: string): string {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：""''（）()\[\]{},.!?;:'"]/g, '')
    .toLowerCase();
}

/** 抽取中文短句 n-gram（chunk），保证跨复制粘贴的语义片段可命中 */
function buildShingles(text: string, shingleLen = 4): Set<string> {
  const t = normalize(text);
  const set = new Set<string>();
  if (t.length <= shingleLen) {
    if (t) set.add(t);
    return set;
  }
  for (let i = 0; i + shingleLen <= t.length; i++) {
    set.add(t.slice(i, i + shingleLen));
  }
  return set;
}

/** Jaccard 相似度（0~1），任一为空返回 0 */
export function similarity(a: string, b: string, shingleLen = 4): number {
  const sa = buildShingles(a, shingleLen);
  const sb = buildShingles(b, shingleLen);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface PlagiarismPair {
  a_student_id: number;
  b_student_id: number;
  a_name?: string;
  b_name?: string;
  similarity: number;
  question_id: number;
}

export interface PlagiarismResult {
  pairs: PlagiarismPair[];        // 升序排列的高相似对
  max_similarity: number;         // 与该生最高相似度
  flags: number[];                // 建议标记疑似抄袭的 student_id
}

/**
 * 计算一批作答中的高相似对。
 * @param answers [{ student_id, text }] 某题考全班提交（或某学生的多题）
 * @param threshold 视为可疑的相似度阈值（默认 0.7）
 */
export function computePlagiarism(
  answers: Array<{ student_id: number; text: string }>,
  threshold = 0.7,
  shingleLen = 4
): PlagiarismResult {
  const list = answers.filter((a) => normalize(a.text).length >= 8); // 太短不作比对
  const pairs: PlagiarismPair[] = [];
  const maxBy = new Map<number, number>();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const sim = similarity(list[i].text, list[j].text, shingleLen);
      if (sim >= threshold) {
        const pair: PlagiarismPair = {
          a_student_id: list[i].student_id,
          b_student_id: list[j].student_id,
          similarity: Math.round(sim * 1000) / 1000,
          question_id: -1,
        };
        pairs.push(pair);
        maxBy.set(list[i].student_id, Math.max(maxBy.get(list[i].student_id) ?? 0, sim));
        maxBy.set(list[j].student_id, Math.max(maxBy.get(list[j].student_id) ?? 0, sim));
      }
    }
  }

  const flags = [...maxBy.entries()]
    .filter(([, v]) => v >= threshold)
    .map(([id]) => id);

  return {
    pairs: pairs.sort((a, b) => b.similarity - a.similarity),
    max_similarity: Math.max(0, ...[...maxBy.values()]),
    flags,
  };
}

/** 判定某生是否该系统判疑（极短用时 / 高相似 / 高切屏） */
export function assessSuspicious(input: {
  time_spent_seconds: number;
  min_time_seconds?: number;
  blur_count: number;
  max_blur?: number;
  max_similarity?: number;
  similar_threshold?: number;
}): { flag: boolean; reason?: string } {
  const reasons: string[] = [];
  if (input.min_time_seconds && input.min_time_seconds > 0 && input.time_spent_seconds < input.min_time_seconds) {
    reasons.push(`用时过短（${input.time_spent_seconds}s < 最低 ${input.min_time_seconds}s）`);
  }
  if (input.max_blur != null && input.blur_count > input.max_blur) {
    reasons.push(`切屏/失焦次数过多（${input.blur_count} 次）`);
  }
  if (input.max_similarity != null && input.similar_threshold != null && input.max_similarity >= input.similar_threshold) {
    reasons.push(`与他班同学答案相似度过高（${Math.round(input.max_similarity * 100)}%）`);
  }
  return { flag: reasons.length > 0, reason: reasons.join('；') || undefined };
}
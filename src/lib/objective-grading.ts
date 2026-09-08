/**
 * 客观题规则引擎（全对满分、错了零分，不给部分分）：
 * 单选题/判断题精确匹配、多选题需「全部选对且无错选」才满分（漏选/错选一律 0 分）、填空题容错。
 * 返回 null 表示非客观题（应走 AI 批改）。
 */

export interface ObjectiveGradeResult {
  total_score: number;
  is_correct: boolean;
  comment: string;
  dimension_scores: {
    knowledge_accuracy: number;
    logic_completeness: number;
    expression_clarity: number;
    expansion: number;
  };
}

const OBJECTIVE_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'multi_choice',
  'fill_blank',
  'judgment',
]);

// 归一化：去空白、转小写、去括号全半角差异、统一除号
function normalize(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .replace(/[／]/g, '/');
}

// 中文数字 → 阿拉伯数字（支持 0-99 及简单整数，如「四」「二十五」「十」）
function chineseToNumber(s: string): number | null {
  const map: Record<string, number> = {
    '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };
  const str = (s || '').trim();
  if (str === '') return null;
  if (str.length === 1) return map[str] ?? null;

  // 含「十」：十五=15、二十=20、二十五=25、十=10
  if (str.includes('十')) {
    const [left, right] = str.split('十');
    const tens = left ? (map[left] ?? null) : 1;
    const ones = right ? (map[right] ?? null) : 0;
    if (tens == null || ones == null) return null;
    return tens * 10 + ones;
  }

  // 简单多字（如「十二」以外的一般不会到这），返回 null 交给上层
  return null;
}

// 解析阿拉伯数字（整数/小数/负数）或中文数字
function parseNumeric(s: string): number | null {
  const str = (s || '').trim();
  if (str === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  if (/^\.\d+$/.test(str)) return parseFloat(str); // .25 → 0.25
  return chineseToNumber(str);
}

// 解析数学表达为统一数值：百分比/分数/中文分之/小数。失败返回 null。
function parseMathValue(s: string): number | null {
  const str = normalize(s);
  if (!str) return null;

  // 百分比：25% 或 百分之25 或 百分之二十五
  let m = str.match(/^(.+)%$/);
  if (m) {
    const n = parseNumeric(m[1]);
    return n != null ? n / 100 : null;
  }
  m = str.match(/^百分之(.+)$/);
  if (m) {
    const n = parseNumeric(m[1]);
    return n != null ? n / 100 : null;
  }

  // 分数：a/b 或 a÷b
  m = str.match(/^(.+)[/÷](.+)$/);
  if (m) {
    const num = parseNumeric(m[1]);
    const den = parseNumeric(m[2]);
    return num != null && den != null && den !== 0 ? num / den : null;
  }

  // 中文分数：X分之Y → Y/X（「4分之1」= 1/4）
  m = str.match(/^(.+)分之(.+)$/);
  if (m) {
    const den = parseNumeric(m[1]);
    const num = parseNumeric(m[2]);
    return num != null && den != null && den !== 0 ? num / den : null;
  }

  // 纯数值
  return parseNumeric(str);
}

// 两边是否数学等价（容差 1e-6）
function areNumericEqual(a: string, b: string): boolean {
  const va = parseMathValue(a);
  const vb = parseMathValue(b);
  if (va == null || vb == null) return false;
  return Math.abs(va - vb) < 1e-6;
}

export function isObjectiveType(questionType: string): boolean {
  return OBJECTIVE_TYPES.has(questionType);
}

export function gradeObjectiveQuestion(
  questionType: string,
  referenceAnswer: string,
  studentAnswer: string,
  fullScore: number
): ObjectiveGradeResult | null {
  if (!isObjectiveType(questionType)) return null;

  const ref = normalize(referenceAnswer);
  const stu = normalize(studentAnswer);
  const full = fullScore || 10;

  const result = (total_score: number, is_correct: boolean, comment: string): ObjectiveGradeResult => ({
    total_score: Math.round(total_score * 10) / 10,
    is_correct,
    comment,
    dimension_scores: {
      knowledge_accuracy: is_correct ? 100 : total_score >= full ? 100 : Math.round((total_score / full) * 100),
      logic_completeness: is_correct ? 100 : total_score >= full ? 100 : Math.round((total_score / full) * 100),
      expression_clarity: 100,
      expansion: 0,
    },
  });

  // 单选 / 判断：精确匹配
  if (questionType === 'single_choice' || questionType === 'judgment') {
    if (!stu) return result(0, false, '未作答');
    if (stu === ref) return result(full, true, '回答正确');
    return result(0, false, `回答错误（参考答案：${referenceAnswer}）`);
  }

  // 多选：全对才满分（需全部选对且无错选）；漏选/错选/多选一律 0 分，不给部分分
  if (questionType === 'multiple_choice' || questionType === 'multi_choice') {
    const refSet = new Set(ref.split('').filter((c) => /[a-z]/.test(c)));
    const stuSet = new Set(stu.split('').filter((c) => /[a-z]/.test(c)));
    if (stuSet.size === 0) return result(0, false, '未作答');

    const correctPicks = [...stuSet].filter((c) => refSet.has(c)).length;
    const wrongPicks = stuSet.size - correctPicks; // 学生选中但不在正确答案中的选项数

    // 唯一得分情形：与正确答案完全一致（不漏、不多、不错）
    if (correctPicks === refSet.size && wrongPicks === 0 && stuSet.size === refSet.size) {
      return result(full, true, '回答正确');
    }
    if (correctPicks === 0) {
      return result(0, false, `未选对任何正确选项（正确答案：${referenceAnswer}）`);
    }
    // 漏选或错选：均为错误，本题不得分
    return result(0, false, wrongPicks > 0
      ? `选择错误（含 ${wrongPicks} 项错误选项，正确答案：${referenceAnswer}），本题不得分`
      : `漏选（正确答案：${referenceAnswer}），本题不得分`);
  }

  // 填空：文本精确匹配 → 数值等价匹配 → 无法确定交 AI 语义判定（返回 null）
  if (questionType === 'fill_blank') {
    if (!stu) return result(0, false, '未作答');
    if (stu === ref) return result(full, true, '回答正确');
    // 数学等价：分数/小数/百分比/中文数字（如 4分之1 = 0.25）
    if (areNumericEqual(referenceAnswer, studentAnswer)) {
      return result(full, true, `回答正确（与参考答案 ${referenceAnswer} 等价）`);
    }
    // 规则引擎无法确定 → 交给 AI 做语义判定，避免误杀等价表达
    return null;
  }

  return null;
}

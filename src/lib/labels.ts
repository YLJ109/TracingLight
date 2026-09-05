/**
 * 集中化标签映射 - 全项目统一引用
 * 修改说明：消除 5+ 文件中重复定义的 typeLabels/difficultyLabels/errorTypeLabels
 */

/** 题型标签映射（英文 → 中文） */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  multi_choice: "多选题",
  fill_blank: "填空题",
  short_answer: "简答题",
  judgment: "判断题",
  programming: "编程题",
  code: "编程题",
  essay: "论述题",
};

/** 难度标签映射（英文 → 中文） */
export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

/** 错因类型标签映射（英文 → 中文，覆盖库中全部实际值与别名） */
export const ERROR_TYPE_LABELS: Record<string, string> = {
  concept_confusion: "概念混淆",
  calculation_error: "计算错误",
  calculation: "计算错误",
  logic_error: "逻辑错误",
  logic: "逻辑错误",
  expression: "表达问题",
  expression_clarity: "表达问题",
  knowledge: "知识缺失",
  knowledge_gap: "知识盲区",
  knowledge_missing: "知识缺失",
  method_error: "方法错误",
  method_unknown: "方法不会",
  step_missing: "步骤缺失",
  incomplete: "未答完整",
  wrong: "答案错误",
  empty: "未作答",
  careless: "粗心大意",
  typo: "书写错误",
  other: "其他",
};

/** 带兜底的取值：未知枚举不再显示英文 */
export function errorTypeLabel(t?: string | null): string {
  if (!t) return "未作答";
  return ERROR_TYPE_LABELS[t] || "其他错误";
}

/** 带兜底的题型/难度取值 */
export function questionTypeLabel(t?: string | null): string {
  if (!t) return "未知题型";
  return QUESTION_TYPE_LABELS[t] || "题目";
}

export function difficultyLabel(t?: string | null): string {
  if (!t) return "中等";
  return DIFFICULTY_LABELS[t] || "中等";
}

/** 学生分层标签映射 */
export const STUDENT_LEVEL_LABELS: Record<string, string> = {
  top: "学霸层",
  medium: "勤奋层",
  weak: "提升层",
};

/** 学生分层颜色映射 */
export const STUDENT_LEVEL_COLORS: Record<string, string> = {
  top: "bg-amber-100 text-amber-700 border-amber-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  weak: "bg-red-100 text-red-700 border-red-200",
};

/** 作业状态标签映射 */
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  pending: "待提交",
  submitted: "已提交",
  graded: "已批改",
  completed: "已完成",
  partial: "部分完成",
};

/**
 * 安全获取标签值，未匹配时返回原值或默认值
 */
export function getLabel(map: Record<string, string>, key: string | undefined | null, fallback?: string): string {
  if (!key) return fallback || "未知";
  return map[key] || fallback || key;
}

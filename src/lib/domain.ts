/**
 * 领域口径 · 单一事实源
 * ---------------------------------------------------------------
 * 全项目（前端 + 后端 + 种子数据）共用同一套分级/单位/量纲阈值，
 * 禁止在任何一处再用写死的 <60/<70/<80 等 magic number，避免口径漂移。
 */

/** 掌握度分级（量纲 0–100）：null 未学 / <60 薄弱 / <80 基本 / >=80 掌握 */
export const MASTERY_UNLEARNED_TH = 30; // 未学阈值（含 null）
export const MASTERY_WEAK_TH = 60; // 薄弱阈值（[30,60) 未学之上但薄弱，实际薄弱判定见 isWeak）
export const MASTERY_BASIC_TH = 80; // 基本阈值（[60,80) 基本，>=80 掌握）

export type MasteryLevel = 'unlearned' | 'weak' | 'basic' | 'mastered';

/** 掌握度归类（与知识图谱 catOf 口径一致，统一引用，消除 profile/graph 两处漂移） */
export function classifyMastery(m: number | null | undefined): MasteryLevel {
  if (m == null || m < MASTERY_UNLEARNED_TH) return 'unlearned';
  if (m < MASTERY_WEAK_TH) return 'weak';
  if (m < MASTERY_BASIC_TH) return 'basic';
  return 'mastered';
}

/** 是否薄弱：有掌握度且 <薄弱阈值（60）。null/未学不算“薄弱”，单独归“未学” */
export function isWeakMastery(m: number | null | undefined): boolean {
  return m != null && m >= MASTERY_UNLEARNED_TH && m < MASTERY_WEAK_TH;
}

/** 薄弱最宽口径（含未学）——用于“待复习/待加强”类统计时需显式选择，默认用窄口径 */
export function isBelowWeak(m: number | null | undefined): boolean {
  return m == null || m < MASTERY_WEAK_TH;
}

/** 各层级中文名（对齐侧栏/学情/资料面板） */
export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  unlearned: '未学',
  weak: '薄弱',
  basic: '基本',
  mastered: '掌握',
};

/** 及格线（教师端报告/驾驶舱统一） */
export const PASS_THRESHOLD = 60;

/** 学习时长单位：minutes（考试 duration_minutes、教材时长统一） */
export const DURATION_UNIT = 'minutes';

/** 日期/时间统一使用 UTC(ISO 8601) 持久化，禁止本地时区 naive 比较 */
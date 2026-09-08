/**
 * 生生互评（peer review）路由逻辑：纯函数，供学生端/服务端确定性地分配互评对象。
 *
 * 分配原则（round-robin / 按提交序号取最近邻）：
 * - 以「被评者 revieweeId」为中心，从「已提交学生」中剔除被评者本人与已排除项（excludeIds），
 * - 按学生 id 排序后，从围绕被评者序号的位置起循环取 count 名同学作为其互评人，
 * - 结果在给定输入下确定（同一提交集合 → 同一分配），可重复计算不漂移。
 *
 * 互评只作「互评参考」信号，绝不改变官方成绩。
 */

export interface PickPeersParams {
  /** 被评同学（学生） */
  revieweeId: number;
  /** 已提交该作业的学生 id 集合 */
  submittedStudentIds: number[];
  /** 每份被评作业期望的互评人数（配置 count，默认 2） */
  count: number;
  /** 需排除的学生 id（例如：该题已互评过、或需避开的学生） */
  excludeIds?: Set<number> | number[];
}

/**
 * 返回围绕 revieweeId 分配的「互评人」学生 id 列表（不含被评者本人）。
 * 优先级：剔除本人与 exclude 后，从被评者序号起按循环下标取 count 名。
 */
export function pickPeers({
  revieweeId,
  submittedStudentIds,
  count,
  excludeIds = new Set<number>(),
}: PickPeersParams): number[] {
  const excluded = new Set<number>(
    Array.isArray(excludeIds) ? excludeIds : Array.from(excludeIds)
  );
  const sorted = [...new Set(submittedStudentIds.filter((id) => Number.isFinite(id)))].sort((a, b) => a - b);
  if (sorted.length <= 1 || count <= 0) return [];

  // 从被评者序号附近开始，跳过本人与被排除项收集互评人
  const idx = sorted.indexOf(revieweeId);
  const start = Math.max(0, idx); // 被评者不存在时从 0 开始
  const result: number[] = [];
  for (let i = 0; i < sorted.length && result.length < count; i++) {
    const candidate = sorted[(start + i) % sorted.length];
    if (candidate === revieweeId || excluded.has(candidate)) continue;
    result.push(candidate);
  }
  return result;
}

/** 盲评匿名标签：把 id 按稳定序映射到 同学A / 同学B / ...（用于默认匿名展示） */
export function peerBlindLabel(index: number): string {
  // 26 个字母用光后回退为 同学1 / 同学2 ...
  if (index < 26) return `同学${String.fromCharCode(65 + index)}`;
  return `同学${index + 1}`;
}

/** 是否「盲评打开名字」（配置说开才显示真实姓名，默认匿名） */
export function isPeerRevealName(config: unknown): boolean {
  if (config && typeof config === 'object') {
    return !!(config as { reveal_name?: boolean }).reveal_name;
  }
  return false;
}

/** 解析 assignment.peer_review 配置（容错返回默认 { enabled:false, count:2, reveal_name:false }） */
export function parsePeerConfig(raw: unknown): { enabled: boolean; count: number; reveal_name: boolean } {
  const enabled = !!(
    raw && typeof raw === 'object' && (raw as { enabled?: boolean }).enabled
  );
  let count = 2;
  if (raw && typeof raw === 'object') {
    const n = Number((raw as { count?: number }).count);
    if (Number.isFinite(n) && n > 0) count = Math.min(10, Math.max(1, Math.round(n)));
  }
  const reveal_name = !!(raw && typeof raw === 'object' && (raw as { reveal_name?: boolean }).reveal_name);
  return { enabled, count, reveal_name };
}

/** 构建互评提示（题干 + 参考答案 + 学生作答），供需要 AI 生成评语的场景使用 */
export function buildPeerPrompt(question: {
  content: string;
  question_type?: string;
  answer?: string;
}, studentAnswerPlain: string): string {
  const lines: string[] = [];
  lines.push('【题目】');
  lines.push(question.content || '');
  if (question.answer) {
    lines.push('');
    lines.push('【参考答案】');
    lines.push(question.answer);
  }
  lines.push('');
  lines.push('【同学作答】');
  lines.push(studentAnswerPlain || '（未作答）');
  return lines.join('\n');
}
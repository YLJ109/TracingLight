/**
 * 考试系统 · 核心逻辑（无状态/纯函数，供各 API 复用）
 * - 个人卷构建：题目顺序 + 客观题选项顺序的确定性乱序（按学生种子），防邻座对齐
 * - 满分归一化：复用 allocateScores，整卷满分恒为 100
 * - 防作弊默认策略与分级处置配置
 * - 服务器权威 deadline 计算
 */
import { allocateScores } from './score-allocator';
import { isObjectiveType } from './objective-grading';

export interface ExamPaperQuestion {
  id: number;
  question_type: string;
  order: number;                 // 呈现顺序（乱序后）
  optionLayout?: string[];       // 客观题：展示顺序对应的原始选项 key（students 以原始 key 作答）
}

/** 确定性乘子（生成稳定伪随机流，同一学生重进/恢复得到相同"个人卷"） */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 学生个人卷种子：由 examId + studentId 派生，保证确定性与防对齐 */
export function examSeed(examId: number, studentId: number): number {
  return (examId * 2654435761 + studentId * 97) >>> 0;
}

/**
 * 把题库选项标准化为 {key, text}。
 * 题库中客观题选项常见存储为平铺字符串数组（如 ["A. 整数", ...]），
 * 统一解析出字母 key 与纯文本，供个人卷乱序与前端渲染使用。
 */
export function normalizeOptions(raw: unknown): Array<{ key: string; text: string }> {
  let arr: unknown = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((o, i) => {
    if (o && typeof o === 'object' && 'key' in o && 'text' in o) {
      return { key: String((o as any).key), text: String((o as any).text) };
    }
    const s = String(o ?? '');
    const m = s.match(/^\s*([A-Za-z])\s*[.、,，:：)）]\s*(.*)$/);
    const key = m ? m[1].toUpperCase() : String.fromCharCode(65 + i);
    const text = (m ? m[2] : s).trim();
    return { key, text: text || key };
  });
}

/**
 * 构建个人卷：返回题目呈现顺序 + 客观题选项乱序布局。
 * students 以「原始选项 key」作答，批改直接比对，不受展示顺序影响。
 */
export function buildPaper(
  examId: number,
  studentId: number,
  questionIds: number[],
  randomized: boolean,
  optionsByQuestion: Record<number, Array<{ key: string; text: string }>>
): ExamPaperQuestion[] {
  const seed = examSeed(examId, studentId);
  let ordered = questionIds.map((id) => id);
  if (randomized && ordered.length > 1) ordered = seededShuffle(ordered, seed);

  return ordered.map((id, idx) => {
    const q: ExamPaperQuestion = { id, question_type: '', order: idx + 1 };
    const opts = optionsByQuestion[id];
    if (randomized && opts && opts.length > 1) {
      // 只乱序展示顺序，仍按原始 key 作答
      q.optionLayout = seededShuffle(opts, seed + id).map((o) => o.key);
    }
    return q;
  });
}

/** 默认防作弊策略 + 开考策略 + 分级处置阈值 */
export function defaultProctorConfig() {
  return {
    require_face: true,          // 是否必须人脸识别开考
    face_strategy: 'once',       // once=开考即验 / continuous=全程在场
    fullscreen_locked: true,     // 强制全屏（退出记录+拉回）
    max_switch: 3,               // 切屏/退全屏累计超限 → 自动交卷
    disable_copy: true,          // 禁复制
    disable_paste: true,         // 禁粘贴
    disable_devtools: true,      // 禁 F12/开发者工具
    disable_zoom: true,          // 禁缩放
    watermark: true,             // 答题区个人水印
    heartbeat_seconds: 15,       // 心跳节流
    warn_first: true,            // 分级：首次警示
  };
}

/** 服务器权威 deadline：fixed=start + duration；window=min(start+时长, 窗口内且进入即计时) */
export function computeDeadline(
  exam: { time_mode: string | null; start_at: string | null; end_at?: string | null; duration: number | null },
  nowMs: number
): { deadline: string; submitted_via: string } {
  const durationMs = (exam.duration || 60) * 60 * 1000;
  if (exam.time_mode === 'window') {
    // 开放窗口：进入即开始个人倒计时，deadline = start + duration
    const startMs = new Date(exam.start_at ?? '').getTime();
    const endMs = exam.end_at ? new Date(exam.end_at).getTime() : startMs + durationMs;
    const dl = Math.min(startMs + durationMs, endMs);
    return { deadline: new Date(dl).toISOString(), submitted_via: 'exceed' };
  }
  // fixed：定时开考，进入后限时 duration
  const base = Math.max(nowMs, new Date(exam.start_at ?? '').getTime());
  const dl = base + durationMs;
  return { deadline: new Date(dl).toISOString(), submitted_via: 'exceed' };
}

/** 是否已过窗口/开考可进入 */
export function canStart(raw: { time_mode: string | null; start_at: string | null; end_at?: string | null }, nowMs: number): { ok: boolean; reason?: string } {
  const startMs = new Date(raw.start_at ?? '').getTime();
  if (nowMs < startMs) return { ok: false, reason: 'not_started' };
  if (raw.time_mode === 'window' && raw.end_at) {
    if (nowMs > new Date(raw.end_at).getTime()) return { ok: false, reason: 'closed' };
  }
  if (raw.time_mode === 'fixed' && raw.end_at) {
    if (nowMs > new Date(raw.end_at).getTime()) return { ok: false, reason: 'closed' };
  }
  return { ok: true };
}

/** 满分归一化：分配每题分值并保证整卷合计 = 100 */
export function normalizeScores(questions: Array<{ id: number; question_type: string; difficulty: string }>): Record<number, number> {
  return allocateScores(questions).scores;
}

/** 判断客观题（复用规则引擎判型） */
export function isObj(qtype: string): boolean {
  return isObjectiveType(qtype);
}
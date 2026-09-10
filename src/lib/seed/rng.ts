/**
 * 统一确定性随机源与真实感工具（数据种子专用）
 * -------------------------------------------------
 * - 所有随机一律通过 makeRng('<命名空间>') 获得的实例产生，同一命名空间每次结果完全一致（可复现）。
 * - 提供正态分布（学业分层）、加权抽样、日期区间、中文字段池等，杜绝“取模臆造 / 随机贴标”的脏数据手法。
 */

/** mulberry32 确定性 PRNG：同一初始种子产生同一序列 */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把任意字符串哈希成 32 位整数种子（稳定） */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  /** [0,1) */
  rand(): number;
  /** [min, max) 整数 */
  int(min: number, maxExcl: number): number;
  /** [min, max] 浮点 */
  range(min: number, max: number): number;
  /** 等概率抽一个 */
  pick<T>(arr: readonly T[]): T;
  /** 按权重抽一个（items: [值, 权重][]）*/
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T;
  /** 概率命中 */
  chance(p: number): boolean;
  /** 布尔 */
  bool(trueP: number): boolean;
  /** 正态分布（Box–Muller），默认均值0方差1 */
  normal(mu: number, sd: number): number;
  /** 截断正态，落在 [min,max] 内 */
  clampedNormal(mu: number, sd: number, min: number, max: number): number;
  /** 打乱数组（原地）并返回 */
  shuffle<T>(arr: T[]): T[];
}

export function makeRng(namespace: string): Rng {
  const next = mulberry32(hashSeed(namespace));
  const rand = () => next();
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return {
    rand,
    int: (min, maxExcl) => Math.floor(rand() * (maxExcl - min)) + min,
    range: (min, max) => rand() * (max - min) + min,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    weighted: (items) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = rand() * total;
      for (const [v, w] of items) {
        r -= w;
        if (r <= 0) return v;
      }
      return items[items.length - 1][0];
    },
    chance: (p) => rand() < p,
    bool: (trueP = 0.5) => rand() < trueP,
    normal: (mu = 0, sd = 1) => {
      let u = 0;
      let v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    clampedNormal(mu, sd, min, max) {
      let v = this.normal(mu, sd);
      if (v < min) v = min;
      if (v > max) v = max;
      return v;
    },
    shuffle,
  };
}

// ============ 中文字段数据池（虚构、规避真实人物） ============

export const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '高', '罗', '郑', '梁', '谢', '宋', '唐', '许', '邓', '冯', '曹', '彭', '曾', '萧', '田', '董', '袁', '潘', '蒋', '许', '杜', '苏'];

export const GIVEN_MALE = ['伟', '强', '磊', '洋', '勇', '军', '杰', '涛', '超', '明', '刚', '平', '辉', '鹏', '华', '飞', '宇', '浩', '凯', '松', '远', '波', '斌', '旭', '晨', '帅', '棋', '峰', '翔', '俊', '锐', '哲', '涵', '泽', '博', '铭', '睿', '谦', '昊', '宸'];

export const GIVEN_FEMALE = ['芳', '敏', '静', '丽', '燕', '玲', '婷', '雪', '琳', '晨', '思', '欣', '悦', '彤', '妍', '倩', '婷', '媛', '梦', '璐', '娜', '萌', '琪', '慧', '丹', '琴', '红', '玲', '婧', '莹', '洁', '蕾', '蕾', '露', '萱', '然', '怡', '沛', '诺', '桐'];

/** 手机号前 3 位（中国大陆主流号段） */
export const PHONE_PREFIX = ['138', '139', '137', '136', '135', '188', '187', '186', '185', '158', '157', '156', '150', '151', '153', '133', '173', '177', '176', '182', '183', '132', '189', '159', '155'];

export function generateChineseName(rng: Rng, gender: 'male' | 'female'): string {
  const surname = rng.pick(SURNAMES);
  const given = gender === 'male' ? rng.pick(GIVEN_MALE) : rng.pick(GIVEN_FEMALE);
  const second = rng.bool(0.35) ? (gender === 'male' ? rng.pick(GIVEN_MALE) : rng.pick(GIVEN_FEMALE)) : '';
  return surname + given + second;
}

// ============ 日期/时间工具（统一 UTC，对齐业务 toISOString/YYYY-MM-DD） ============

/** 每个字符转为本课程月份-日偏移，生成一个日期时间的 ISO 字符串 */
export function datePlus(base: Date, days: number, hours = 9, minutes = 0): string {
  const d = new Date(base.getTime() + days * 86400000);
  d.setUTCHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** YYYY-MM-DD（UTC） */
export function dateStrPlus(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 当前“时间轴”基准：业务以今天为锚点，让过期的作业/考试、进行中的状态全部真实成立 */
export function todayBase(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ============ 分值归一（企业级口径：作业/考试满分恒为 100） ============

/**
 * 分值归一：把原始分值按比例缩放为整数，合计恒为 100。
 * 返回以 String(qid) 为 key 的分数表，保证 sum === 100。
 * 同时用于 assignments / exams 的 question_scores、grading.full_score，杜绝「满分≠100」。
 */
export function normalizeScores(qids: number[], scoreOf: (qid: number) => number): Record<string, number> {
  const raw = qids.map((qid) => ({ qid, s: Math.max(1, scoreOf(qid)) }));
  const rawSum = raw.reduce((sum, r) => sum + r.s, 0);
  const scale = 100 / rawSum;
  const scaled = raw.map((r) => ({ qid: r.qid, v: Math.max(1, Math.round(r.s * scale)) }));
  const assigned = scaled.reduce((s, r) => s + r.v, 0);
  // 四舍五入带来的 ± 差异，按原始分值降序用最大题吸收，保证合计恰为 100
  let diff = 100 - assigned;
  if (diff !== 0) {
    const sorted = [...scaled].sort((x, y) => (scoreOf(y.qid) - scoreOf(x.qid)) || (y.qid - x.qid));
    for (const it of sorted) {
      if (diff === 0) break;
      const next = it.v + diff;
      if (next >= 1) { it.v = next; diff = 0; break; }
    }
    if (diff !== 0) scaled[scaled.length - 1].v += diff;
  }
  const out: Record<string, number> = {};
  for (const r of scaled) out[String(r.qid)] = r.v;
  return out;
}
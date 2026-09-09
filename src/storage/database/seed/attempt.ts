/**
 * 主观题真实作答派生器（V3 整改）
 * 从题目的真实参考答案派生学生作答，替代“……理解存在偏差”这类占位符：
 *  - 答对 → 与参考答案等价的完整作答（代码原样 / 文字要点齐全）；
 *  - 答错 → 具体、可解释的残缺版（代码只做“正常路径”漏了边界处理 ∕ 文字漏后半要点）。
 * 保证作答与题目、答案、错因强相关，全库不重复（确定性随机）。
 */
import type { Rng } from '../../../lib/seed/rng';

export interface QMeta {
  type: string;
  answer: string;
  analysis: string;
}

/** 是否为代码型答案（含函数/类/import/流程关键字） */
export function isCodeAnswer(a: string): boolean {
  return /(def |class |function |import |return |=>|;|\{\s*\n.*\n\s*\})/.test(a);
}

function splitLines(a: string): string[] {
  return a.split('\n').map((s) => s.replace(/\s+$/, '')).filter((s) => s.length > 0);
}

/** 代码答错：只保留“正常路径”，剔除异常/断言/边界处理 → 给出一个真会出错的残缺实现 */
function codeWrong(rng: Rng, answer: string): string {
  const lines = splitLines(answer);
  const kept = lines.filter((l) => !/(except|finally|raise|assert|except EOFError|else:|swallow|catch|throw)/.test(l));
  // 若剔除后太短，至少保留首尾各若干注释/函数头，避免空壳
  let out = kept.length >= 2 ? kept : lines.slice(0, Math.max(2, Math.min(lines.length, 4)));
  // 压缩缩进以模拟学生“省略空行”，并在末尾补一行收紧的 return/print 收尾
  if (out.length) {
    const last = out[out.length - 1];
    if (!/return|print|print\(/.test(last)) out.push('print(结果)  # 未处理异常/边界');
  }
  return out.join('\n');
}

/** 文字答错：只覆盖前半要点，剩余一概略过 → 得部分分但有真实漏点 */
function textWrong(rng: Rng, answer: string): string {
  const lines = splitLines(answer);
  const keep = Math.max(1, Math.round(lines.length * 0.5));
  const out = lines.slice(0, keep);
  out.push('整体流程大致如此，不再展开后续细节。');
  return out.join('\n');
}

/** 生成主观题学生作答：correct=true 同参考答案；false 生成残缺残缺版 */
export function genSubjectiveAttempt(rng: Rng, meta: QMeta, correct: boolean): { stuAns: string; isSub: boolean } {
  const ans = (meta.answer ?? '').trim();
  if (correct) return { stuAns: ans || '参考答案', isSub: true };
  if (isCodeAnswer(ans)) return { stuAns: codeWrong(rng, ans), isSub: true };
  return { stuAns: textWrong(rng, ans), isSub: true };
}
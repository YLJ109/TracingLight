import { getDb } from '@/storage/database/db';
import { knowledgeMasteryLog } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * 作业批改结果 → 知识点掌握度回写
 *
 * 学生端练习提交与 AI 一键批改已会将掌握度写回 knowledge_mastery_log（指数平滑 0.7/0.3）。
 * 本工具补充「教师改分/确认」这一入口：教师以确认后的得分为准再次回写，
 * 使掌握度/弱项/能力画像与最终成绩一致。
 */

/** 单题得分 → 掌握度百分比（0~100） */
export function scoreToMastery(score: number, fullScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(fullScore) || fullScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / fullScore) * 100)));
}

/** 指数平滑：历史掌握度占 (1-weight)，本次表现占 weight（默认与练习口径 0.7/0.3 一致） */
export function blendRate(oldRate: number, thisRate: number, weight = 0.3): number {
  return Math.round((oldRate || 0) * (1 - weight) + thisRate * weight);
}

/**
 * 幂等回写：以某次（确认后的）得分率平滑进该学生该知识点的历史掌握度。
 * 仅在批改完成后调用即可，无需额外调度；内部不做 saveDb，交由调用方统一落库。
 */
export function syncMasteryFromGrading(opts: {
  studentId: number;
  knowledgePointId: number | null | undefined;
  score: number;
  fullScore: number;
  isCorrect: boolean;
}): void {
  if (!opts.knowledgePointId) return;
  if (!Number.isFinite(opts.score) || !Number.isFinite(opts.fullScore)) return;

  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const thisRate = scoreToMastery(opts.score, opts.fullScore);

  const row = db
    .select({
      id: knowledgeMasteryLog.id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
      error_count: knowledgeMasteryLog.error_count,
    })
    .from(knowledgeMasteryLog)
    .where(and(
      eq(knowledgeMasteryLog.student_id, opts.studentId),
      eq(knowledgeMasteryLog.knowledge_point_id, opts.knowledgePointId),
    ))
    .limit(1)
    .all()[0];

  try {
    if (row) {
      // 与练习口径一致：历史占 0.7，本次表现占 0.3
      const newRate = blendRate(row.mastery_rate || 0, thisRate);
      db.update(knowledgeMasteryLog)
        .set({
          mastery_rate: newRate,
          error_count: (row.error_count || 0) + (opts.isCorrect ? 0 : 1),
          recorded_at: today,
        })
        .where(eq(knowledgeMasteryLog.id, row.id))
        .run();
    } else {
      db.insert(knowledgeMasteryLog).values({
        student_id: opts.studentId,
        knowledge_point_id: opts.knowledgePointId,
        mastery_rate: thisRate,
        error_count: opts.isCorrect ? 0 : 1,
        recorded_at: today,
      }).run();
    }
  } catch (err) {
    // 掌握度回写失败不应阻断批改主流程
    console.error('syncMasteryFromGrading error:', err);
  }
}
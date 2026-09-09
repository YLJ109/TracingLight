/**
 * 考试交卷 · 最终化（手动/自动/监考终止/超时共用同一入口，保证口径一致）
 * - 客观题交卷同步判分；主观题标记待批
 * - 联动错题本 + 掌握度
 * - 主=0 判分完成后按 publish_mode 自动公布（无主观题时）
 */
import { getDb } from '@/storage/database/db';
import { eq, and, inArray } from 'drizzle-orm';
import { examAttempt, exam, examAnswer, question } from '@/storage/database/shared/schema';
import { gradeExamQuestion, isExamAnswerEmpty } from './exam-grading';

export async function finalizeExamSubmission(attemptId: number, via: string): Promise<{ submitted: boolean; reason?: string }> {
  const db = getDb();
  const attempt = (await db.select().from(examAttempt).where(eq(examAttempt.id, attemptId)).execute())[0];
  if (!attempt) return { submitted: false, reason: 'no_attempt' };
  if (attempt.status !== 'in_progress') return { submitted: true }; // 已交卷
  const ex = (await db.select().from(exam).where(eq(exam.id, attempt.exam_id)).execute())[0];
  if (!ex) return { submitted: false, reason: 'no_exam' };

  const now = new Date().toISOString();
  // 快照最终作答
  const answers = await db.select().from(examAnswer).where(eq(examAnswer.attempt_id, attemptId)).execute();
  const qids = (ex.question_ids as number[]) || [];
  const questions = await db.select().from(question).where(inArray(question.id, qids)).execute();
  const scores = (ex.question_scores as Record<string, number>) || {};
  const qMap = new Map(questions.map((q) => [q.id, q]));

  // 客观题即时判分 / 主观题待批
  for (const ans of answers) {
    const q = qMap.get(ans.question_id);
    if (!q) continue;
    const full = scores[String(ans.question_id)] ?? q.default_score ?? 10;
    await gradeExamQuestion(ex.id, attempt.student_id, {
      id: q.id, question_type: q.question_type, content: q.content, answer: q.answer,
      knowledge_point_id: q.knowledge_point_id, default_score: q.default_score ?? 0,
    }, ans.student_answer || '', full);
  }

  await db.update(examAttempt).set({ status: via === 'terminate' ? 'terminated' : (via === 'exceed' ? 'auto_submitted' : 'submitted'), submitted_at: now, submitted_via: via, updated_at: now })
    .where(eq(examAttempt.id, attemptId)).execute();

  // 成绩公布改为教师主导：交卷只完成客观题预判分，**不自动公布**成绩/答案。
  // 教师在批改台（objective 复核/主观题 AI 批量批改）复核后，手动「公布成绩」学生才可见。

  return { submitted: true };
}
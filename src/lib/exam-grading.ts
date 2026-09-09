/**
 * 考试批改 · 共享逻辑
 * - 客观题交卷同步判定（对满分/错零分，复用规则引擎 + AI 语义二值化）
 * - 主观题标记 pending(待批)，教师/后台补批
 * - 联动错题本(exam_id) 与 掌握度日志
 */
import { getDb } from '@/storage/database/db';
import { gradeObjectiveQuestion, isObjectiveType } from './objective-grading';
import { computeGrade } from '@/services/grading.service';
import { syncMasteryFromGrading } from '@/lib/mastery-sync';
import { generateErrorAnalysis } from '@/lib/error-analysis';
import { examAnswer, examGrading, exam, errorBook, knowledgePoint } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';

export interface GradableQuestion {
  id: number;
  question_type: string;
  content: string;
  answer: string;
  knowledge_point_id: number;
  default_score: number;
  options?: unknown;
}

/** 单题作答过滤判空 */
export function isExamAnswerEmpty(answer: string | null | undefined): boolean {
  const t = (answer || '').trim();
  return !t;
}

/**
 * 判分客观题，写入 exam_grading（同步），并联动错题本 + 掌握度。
 * @returns gradeExpanded 前端可直接展示的判分结果
 */
export async function gradeExamQuestion(
  examId: number,
  studentId: number,
  question: GradableQuestion,
  studentAnswer: string,
  fullScore: number
): Promise<{ graded: boolean; total_score: number | null; is_correct: boolean | null; error_type: string | null }> {
  if (isExamAnswerEmpty(studentAnswer)) {
    // 空答：0 分记录（不进错题本）
    await insertGradingRow(examId, studentId, question, studentAnswer, fullScore, 0, false, null, 'empty');
    return { graded: true, total_score: 0, is_correct: false, error_type: 'empty' };
  }

  if (isObjectiveType(question.question_type)) {
    // 客观题：规则引擎优先（对满分/错零分），文字填空等未命中则交 AI 语义二值化
    const result = await computeGrade(question as any, studentAnswer, (await kpName(question.knowledge_point_id)), undefined, null, fullScore);
    const correct = result.total_score >= fullScore;
    const errorType = correct ? null : (result.error_type || 'wrong');
    await insertGradingRow(examId, studentId, question, studentAnswer, fullScore, result.total_score, correct, result.unmastered_knowledge_ids, errorType);
    // 掌握度回写（与作业口径一致：指数平滑，对题不增错，错题计错）
    await syncMasteryFromGrading({ studentId, knowledgePointId: question.knowledge_point_id, score: result.total_score, fullScore, isCorrect: correct });
    if (!correct && result.total_score < fullScore && !isEmptyAnswer(studentAnswer)) {
      await recordErrorBook(examId, studentId, question, studentAnswer, result.error_type || 'wrong');
    }
    return { graded: true, total_score: result.total_score, is_correct: correct, error_type: errorType };
  }

  // 主观题：提交时**不自动 AI 批改**，仅落一条 pending 待批记录（总分暂空）。
  // AI 批改由教师在批改台「AI 批量批改」触发，生成建议分后教师复核采纳，最后手动「公布成绩」学生才可见。
  await insertGradingRow(examId, studentId, question, studentAnswer, fullScore, null, null, [question.knowledge_point_id], null, 'pending');
  return { graded: false, total_score: null, is_correct: null, error_type: null };
}

async function insertGradingRow(
  examId: number, studentId: number, question: GradableQuestion, studentAnswer: string,
  fullScore: number, score: number | null, correct: boolean | null,
  unmasteredIds: number[] | null, errorType: string | null, status: string = 'completed',
  aiInfo?: { dimension_scores?: unknown; annotations?: unknown; overall_comment?: string | null; ai_generated_probability?: number | null }
) {
  const db = getDb();
  const ansRow = (await db.select().from(examAnswer)
    .where(and(eq(examAnswer.exam_id, examId), eq(examAnswer.student_id, studentId), eq(examAnswer.question_id, question.id)))
    .execute())[0];
  if (!ansRow) return;
  const vals = {
    exam_id: examId, student_id: studentId, question_id: question.id,
    knowledge_point_id: question.knowledge_point_id, full_score: fullScore, question_type: question.question_type,
    reference_answer: question.answer, student_answer: studentAnswer,
    total_score: score, dimension_scores: aiInfo?.dimension_scores ?? null, annotations: aiInfo?.annotations ?? null,
    unmastered_knowledge_ids: unmasteredIds,
    error_type: errorType, overall_comment: aiInfo?.overall_comment ?? null,
    status, completed_at: status === 'completed' ? new Date().toISOString() : null,
    ai_generated_probability: aiInfo?.ai_generated_probability ?? null,
  };
  // answer_id 非唯一索引，不能依赖 ON CONFLICT，改为显式存在检查（避免 SQLite 报错）
  const existing = (await db.select().from(examGrading).where(eq(examGrading.answer_id, ansRow.id)).execute())[0];
  if (existing) {
    await db.update(examGrading).set(vals).where(eq(examGrading.id, existing.id)).execute();
  } else {
    await db.insert(examGrading).values({ answer_id: ansRow.id, ...vals }).execute();
  }
}

async function kpName(kpId: number): Promise<string> {
  const s = (await getDb().select({ name: knowledgePoint.name }).from(knowledgePoint).where(eq(knowledgePoint.id, kpId)).limit(1).execute())[0];
  return s?.name || '';
}

function isEmptyAnswer(a: string): boolean {
  const t = (a || '').trim();
  return t === '' || ['不知道', '不会', '不懂', '无', '略', '-'].includes(t);
}

/**
 * 错题进错题本（考试统一入口：考试客观题 gradeExamQuestion 与 考试主观题批改路由共用）。
 * 来源设置 exam_id；新题调用大模型生成错因 AI 归因（error-analysis 真实归因，best-effort，
 * 失败静默返回 null，由 /api/ai/analyze-error 兜底），绝不阻断批改主流程。
 */
export async function recordErrorBook(examId: number, studentId: number, question: GradableQuestion, studentAnswer: string, errorType: string, attribution?: { error_analysis?: string | null; knowledge_explanation?: string | null; learning_suggestion?: string | null }) {
  const db = getDb();
  const exist = (await db.select().from(errorBook)
    .where(and(eq(errorBook.student_id, studentId), eq(errorBook.question_id, question.id))).limit(1).execute())[0];
  if (exist) {
    await db.update(errorBook).set({
      student_answer: studentAnswer, error_type: errorType, exam_id: examId,
      error_analysis: attribution?.error_analysis || exist.error_analysis,
      knowledge_explanation: attribution?.knowledge_explanation || exist.knowledge_explanation,
      learning_suggestion: attribution?.learning_suggestion || exist.learning_suggestion,
    }).where(eq(errorBook.id, exist.id)).execute();
    return;
  }

  // 新错题：调用大模型生成真正的错因归因（失败静默返回 null，不影响入库）
  const analysis = attribution?.error_analysis
    ? { error_analysis: attribution.error_analysis, knowledge_explanation: attribution.knowledge_explanation, learning_suggestion: attribution.learning_suggestion }
    : await generateErrorAnalysis({
        content: question.content,
        questionType: question.question_type,
        referenceAnswer: question.answer,
        studentAnswer,
        errorType,
        knowledgePointName: await kpName(question.knowledge_point_id),
      }).catch(() => null);

  await db.insert(errorBook).values({
    student_id: studentId, question_id: question.id, knowledge_point_id: question.knowledge_point_id,
    content: question.content, student_answer: studentAnswer, correct_answer: question.answer,
    error_type: errorType, review_status: 'pending', exam_id: examId,
    // 首次进本即进入间隔复习排期：明天需复习（今日任务据此调度，第1/3/7天遗忘曲线）
    next_review_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
    error_analysis: analysis?.error_analysis || null,
    knowledge_explanation: analysis?.knowledge_explanation || null,
    learning_suggestion: analysis?.learning_suggestion || null,
  }).execute();
}
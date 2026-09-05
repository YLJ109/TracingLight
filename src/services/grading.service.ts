/**
 * 统一批改管线（service 层）
 *
 * 所有批改入口（ai/grade 单题、ai/grade/batch 批量）必须经由本模块，确保：
 * 1. 同一份答案无论从哪个入口批改，得分一致（空答/客观题规则引擎/主观题 AI 分层）；
 * 2. 批改三表写（gradingTask + errorBook + knowledgeMasteryLog）在同一个事务内，杜绝不一致中间态；
 * 3. 关键写路径完成后即时落盘（T-2），把崩溃丢失窗口从 30 秒缩到接近零。
 */
import { getDb, saveDb } from "@/storage/database/db";
import { question, gradingTask, errorBook, knowledgeMasteryLog, assignment, notification } from "@/storage/database/shared/schema";
import { gradeObjectiveQuestion, isObjectiveType } from "@/lib/objective-grading";
import { createAIClient, HeaderUtils, invokeStructured } from "@/lib/ai/client";
import { GRADING_SYSTEM_PROMPT, buildGradingPrompt } from "@/lib/ai/prompts/grading";
import { eq, and } from "drizzle-orm";
import { gradingConfig, assignment as assignmentTable } from "@/storage/database/shared/schema";
import { htmlToPlainText } from "@/lib/rich-text";

export interface GradingResult {
  total_score: number;
  full_score: number;
  dimension_scores: {
    knowledge_accuracy: number;
    logic_completeness: number;
    expression_clarity: number;
    expansion: number;
  };
  annotations: Array<{
    content: string;
    type: string;
    comment: string;
    point_deduction: number;
  }>;
  unmastered_knowledge_ids: number[];
  error_type: string;
  overall_comment: string;
}

type QuestionRow = typeof question.$inferSelect;

const MEANINGLESS_ANSWERS = ['不知道', '不会', '不懂', '无', '...', '。', '-', '略'];

/** 空答/无意义作答判定（客观题短作答如 "ABD"/"25%" 是合法答案，不做长度判定） */
function isMeaninglessAnswer(studentAnswer: string, questionType: string): boolean {
  const trimmed = (studentAnswer || '').trim();
  if (!trimmed) return true;
  if (MEANINGLESS_ANSWERS.includes(trimmed)) return true;
  if (isObjectiveType(questionType)) return false;
  // 仅主观题：极短作答视为无效，跳过 AI
  return trimmed.length <= 3;
}

function zeroResult(questionData: QuestionRow, hasAnswer: boolean): GradingResult {
  const fullScore = questionData.default_score || 10;
  return {
    total_score: 0,
    full_score: fullScore,
    dimension_scores: { knowledge_accuracy: 0, logic_completeness: 0, expression_clarity: 0, expansion: 0 },
    annotations: [{
      content: hasAnswer ? '答案无效，请认真作答' : '未作答',
      type: 'error',
      comment: '未提供有效答案',
      point_deduction: fullScore,
    }],
    unmastered_knowledge_ids: [questionData.knowledge_point_id],
    error_type: hasAnswer ? 'incomplete' : 'empty',
    overall_comment: hasAnswer ? '未提供有效答案，无法评分' : '未作答',
  };
}

/**
 * 计分（不写库）：空答/无意义 → 0 分；客观题 → 规则引擎（含数学等价）；主观题 → AI 兜底。
 * @param forwardHeaders 用于 AI 客户端透传（批量批改时传 undefined 复用默认客户端）
 */
export interface GradingRules {
  scoring_criteria?: string | null;
  deduction_rules?: string | null;
  comment_style?: string | null;
  grade_levels?: Array<{ min: number; label: string }> | null;
}

/** 匹配教师自定义批改规则：course+type > course > type > 通用，取最具体的一条 */
export function getActiveGradingRules(
  teacherId: number,
  courseId: number | null,
  questionType: string
): GradingRules | null {
  const db = getDb();
  const rules = db.select().from(gradingConfig)
    .where(and(eq(gradingConfig.teacher_id, teacherId), eq(gradingConfig.is_active, true)))
    .all();
  if (rules.length === 0) return null;
  const score = (r: typeof rules[number]) =>
    (r.course_id === courseId ? 2 : r.course_id == null ? 1 : -10) +
    (r.question_type === questionType ? 2 : r.question_type == null ? 1 : -10);
  const best = rules
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)[0];
  if (!best) return null;
  return {
    scoring_criteria: best.r.scoring_criteria,
    deduction_rules: best.r.deduction_rules,
    comment_style: best.r.comment_style,
    grade_levels: (best.r.grade_levels as GradingRules['grade_levels']) || null,
  };
}

export async function computeGrade(
  questionData: QuestionRow,
  rawStudentAnswer: string,
  knowledgePointName: string,
  forwardHeaders?: Headers,
  configRules?: GradingRules | null
): Promise<GradingResult> {
  // 富文本作答（简答题 HTML）→ 纯文本用于判分与 AI 提示词
  let studentAnswer = rawStudentAnswer || '';
  if (/<(img|table|p|div|pre|ul|ol|h\d|br)[\s>]/i.test(studentAnswer)) {
    studentAnswer = htmlToPlainText(studentAnswer);
  }
  // 1. 空答/无意义直接 0 分，跳过 AI
  if (isMeaninglessAnswer(studentAnswer, questionData.question_type)) {
    return zeroResult(questionData, !!studentAnswer?.trim());
  }

  // 2. 客观题规则引擎（单选/多选/判断/填空，含数学等价判定）
  if (isObjectiveType(questionData.question_type)) {
    const objectiveResult = gradeObjectiveQuestion(
      questionData.question_type,
      questionData.answer,
      studentAnswer,
      questionData.default_score || 10
    );
    if (objectiveResult) {
      const fullScore = questionData.default_score || 10;
      return {
        total_score: objectiveResult.total_score,
        full_score: fullScore,
        dimension_scores: objectiveResult.dimension_scores,
        annotations: [{
          content: objectiveResult.comment,
          type: objectiveResult.is_correct ? 'correct' : 'error',
          comment: objectiveResult.comment,
          point_deduction: objectiveResult.is_correct ? 0 : fullScore - objectiveResult.total_score,
        }],
        unmastered_knowledge_ids: objectiveResult.is_correct ? [] : [questionData.knowledge_point_id],
        error_type: objectiveResult.is_correct ? '' : 'wrong',
        overall_comment: objectiveResult.comment,
      };
    }
    // 规则引擎返回 null（如文字型填空）→ 交给 AI 语义判定
  }

  // 3. 主观题 AI 批改
  const client = createAIClient(forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders) : undefined);
  const prompt = buildGradingPrompt({
    questionContent: questionData.content,
    questionType: questionData.question_type,
    referenceAnswer: questionData.answer,
    studentAnswer: studentAnswer || "（未作答）",
    fullScore: questionData.default_score || 10,
    knowledgePointName,
    knowledgePointId: questionData.knowledge_point_id,
  });

  // 教师自定义批改规则注入（评分标准/扣分规则/评语风格）
  const rulesBlock = configRules ? [
    configRules.scoring_criteria ? `【教师评分标准（必须遵守）】\n${configRules.scoring_criteria}` : '',
    configRules.deduction_rules ? `【扣分规则】\n${configRules.deduction_rules}` : '',
    configRules.comment_style ? `【评语风格要求】${configRules.comment_style}` : '',
  ].filter(Boolean).join('\n\n') : '';
  const result = await invokeStructured<GradingResult>(client, GRADING_SYSTEM_PROMPT, rulesBlock ? `${prompt}\n\n${rulesBlock}` : prompt, 0.2);
  return result;
}

/** 批改完成 → 通知学生（闭环 P1-1：学生收到通知可直达作业详情） */
export function notifyGraded(studentId: number, assignmentId: number): void {
  try {
    const db = getDb();
    const asgn = db.select({ title: assignment.title })
      .from(assignment).where(eq(assignment.id, assignmentId)).limit(1).all()[0];
    db.insert(notification).values({
      user_id: studentId,
      type: 'grade',
      title: '作业已批改',
      content: `《${asgn?.title || '作业'}》批改完成，快去查看得分与 AI 解析吧`,
      link: `/student/assignments/${assignmentId}`,
    }).run();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }
  } catch (e) {
    console.error('notifyGraded error:', e);
  }
}

/**
 * 批改结果落库（事务）：gradingTask + 错题归档（去重）+ 掌握度更新，三表同事务。
 * 事务提交后立即静默落盘（T-2）。
 * @param notify 单题批改入口传 true（发学生通知）；批量批改传 false，由调用方汇总发一条
 */
export function recordGrading(params: {
  questionData: QuestionRow;
  studentId: number;
  assignmentId: number;
  studentAnswer: string;
  answerId: number;
  result: GradingResult;
  notify?: boolean;
}): number | null {
  const db = getDb();
  const { questionData, studentId, assignmentId, studentAnswer, answerId, result, notify = false } = params;

  const gradingTaskId = db.transaction(() => {
    const inserted = db.insert(gradingTask).values({
      answer_id: answerId || 0,
      assignment_id: assignmentId,
      student_id: studentId,
      question_id: questionData.id,
      knowledge_point_id: questionData.knowledge_point_id,
      full_score: result.full_score,
      question_type: questionData.question_type,
      reference_answer: questionData.answer,
      student_answer: studentAnswer || '',
      total_score: result.total_score,
      dimension_scores: result.dimension_scores,
      annotations: result.annotations,
      unmastered_knowledge_ids: result.unmastered_knowledge_ids,
      error_type: result.error_type || null,
      overall_comment: result.overall_comment,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).returning().all();
    const taskId = inserted[0]?.id ?? null;

    // 非满分自动归档错题（含去重）
    const fullScore = result.full_score || questionData.default_score || 10;
    if (!studentAnswer?.trim() || result.total_score < fullScore) {
      const existing = db.select({ id: errorBook.id })
        .from(errorBook)
        .where(and(
          eq(errorBook.student_id, studentId),
          eq(errorBook.question_id, questionData.id),
          eq(errorBook.assignment_id, assignmentId),
        ))
        .limit(1).all();
      if (!existing[0]) {
        db.insert(errorBook).values({
          student_id: studentId,
          question_id: questionData.id,
          knowledge_point_id: questionData.knowledge_point_id,
          assignment_id: assignmentId,
          grading_task_id: taskId || 0,
          student_answer: studentAnswer || '',
          correct_answer: questionData.answer,
          error_type: result.error_type || (studentAnswer?.trim() ? 'wrong' : 'empty'),
          review_status: 'pending',
          review_count: 0,
          next_review_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        }).run();
      }
    }

    // 掌握度更新（单题粒度，指数平滑避免覆盖历史）
    const kpId = questionData.knowledge_point_id;
    if (kpId) {
      const isCorrect = result.total_score >= fullScore * 0.6;
      const thisRate = isCorrect ? 100 : 0;
      const existingLog = db.select({
        id: knowledgeMasteryLog.id,
        mastery_rate: knowledgeMasteryLog.mastery_rate,
        error_count: knowledgeMasteryLog.error_count,
      })
        .from(knowledgeMasteryLog)
        .where(and(
          eq(knowledgeMasteryLog.student_id, studentId),
          eq(knowledgeMasteryLog.knowledge_point_id, kpId),
        ))
        .limit(1).all();
      const row = existingLog[0];
      if (row) {
        const oldRate = row.mastery_rate || 0;
        const newRate = Math.round(oldRate * 0.7 + thisRate * 0.3);
        db.update(knowledgeMasteryLog)
          .set({
            mastery_rate: newRate,
            error_count: (row.error_count || 0) + (isCorrect ? 0 : 1),
            recorded_at: new Date().toISOString().split('T')[0],
          })
          .where(eq(knowledgeMasteryLog.id, row.id))
          .run();
      } else {
        db.insert(knowledgeMasteryLog).values({
          student_id: studentId,
          knowledge_point_id: kpId,
          mastery_rate: thisRate,
          error_count: isCorrect ? 0 : 1,
          recorded_at: new Date().toISOString().split('T')[0],
        }).run();
      }
    }

    return taskId;
  });

  // T-2：关键写路径即时落盘（静默，失败不影响响应）
  try { saveDb(); } catch { /* 定时持久化兜底 */ }

  // P1-1：单题批改入口直接通知学生（批量入口由调用方汇总通知）
  if (notify) notifyGraded(studentId, assignmentId);

  return gradingTaskId;
}

/**
 * 单题批改 + 落库（对外统一入口）。
 * 供 ai/grade（单题）与 ai/grade/batch（批量循环）共用。
 */
export async function gradeOneAndRecord(params: {
  questionData: QuestionRow;
  studentId: number;
  assignmentId: number;
  studentAnswer: string;
  answerId: number;
  knowledgePointName: string;
  forwardHeaders?: Headers;
  notify?: boolean;
}): Promise<{ result: GradingResult; gradingTaskId: number | null }> {
  // 教师自定义批改规则：按作业归属教师与课程匹配（实时查库，配置修改立即生效）
  const db = getDb();
  let configRules: GradingRules | null = null;
  try {
    const asgn = db.select({ teacher_id: assignmentTable.teacher_id, course_id: assignmentTable.course_id })
      .from(assignmentTable).where(eq(assignmentTable.id, params.assignmentId)).limit(1).all()[0];
    if (asgn) {
      configRules = getActiveGradingRules(asgn.teacher_id, asgn.course_id, params.questionData.question_type);
    }
  } catch { /* 规则匹配失败不阻塞批改 */ }

  const result = await computeGrade(
    params.questionData,
    params.studentAnswer,
    params.knowledgePointName,
    params.forwardHeaders,
    configRules
  );

  // 成绩等级映射（教师配置的等级划分）：overall_comment 前缀等级标签
  if (configRules?.grade_levels?.length && result.overall_comment) {
    const full = params.questionData.default_score || 10;
    const pct = Math.round(((result.total_score ?? 0) / full) * 100);
    const level = configRules.grade_levels.find((g) => pct >= g.min);
    if (level) result.overall_comment = `【${level.label}】${result.overall_comment}`;
  }
  const gradingTaskId = recordGrading({
    questionData: params.questionData,
    studentId: params.studentId,
    assignmentId: params.assignmentId,
    studentAnswer: params.studentAnswer,
    answerId: params.answerId,
    result,
    notify: params.notify,
  });
  return { result, gradingTaskId };
}

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
import { scoreToMastery } from "@/lib/mastery-sync";
import { extractFilesText } from "@/lib/file-extract";

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
  ai_generated_probability?: number | null; // 疑似 AI 生成概率 0~1（仅主观题由 AI 评估，客观题/空答为 null）
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

function zeroResult(questionData: QuestionRow, hasAnswer: boolean, scoreOverride?: number): GradingResult {
  const fullScore = scoreOverride ?? (questionData.default_score || 10);
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
    ai_generated_probability: null,
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

/* ─────────────────── 实验题/附件题批改 ─────────────────── */

interface AttachmentFileMeta {
  name?: string;
  path?: string;
  size?: number;
  mime?: string;
}

interface AttachmentTemplate {
  experiment_name?: string;
  materials?: string;
  purpose?: string;
  steps?: string;
  data_record?: string;
  result_analysis?: string;
  conclusion?: string;
}

interface AttachmentAnswer {
  files?: AttachmentFileMeta[];
  template?: AttachmentTemplate | null;
}

const ATTACHMENT_TEMPLATE_FIELDS: Array<{ key: keyof AttachmentTemplate; label: string }> = [
  { key: 'experiment_name', label: '实验名称' },
  { key: 'materials', label: '实验材料及器材' },
  { key: 'purpose', label: '实验目的' },
  { key: 'steps', label: '实验步骤' },
  { key: 'data_record', label: '数据记录' },
  { key: 'result_analysis', label: '结果与分析' },
  { key: 'conclusion', label: '实验结论' },
];

function truncate(s: string, max: number): string {
  const v = String(s || '');
  return v.length > max ? v.slice(0, max) + '\n…(已截断)' : v;
}

/**
 * 实验题/附件题批改：解析 student_answer JSON（{ files, template }），提取附件文本，
 * 按实验模板字段 + 附件内容走专属 AI 提示词。解析/提取失败均不阻断（回退模板与文件名）。
 */
async function gradeAttachmentQuestion(
  questionData: QuestionRow,
  rawStudentAnswer: string,
  plainStudentAnswer: string,
  baseFull: number,
  knowledgePointName: string,
  configRules?: GradingRules | null,
  forwardHeaders?: Headers,
): Promise<GradingResult> {
  const client = createAIClient(forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders) : undefined);

  // 解析作答 JSON（失败则回退为原始文本兜底）
  let files: AttachmentFileMeta[] = [];
  let template: AttachmentTemplate | null = null;
  try {
    const parsed = JSON.parse(rawStudentAnswer || '{}') as AttachmentAnswer;
    if (parsed && Array.isArray(parsed.files)) files = parsed.files;
    if (parsed && parsed.template && typeof parsed.template === 'object') template = parsed.template;
  } catch { /* JSON 解析失败 → 按原始文本兜底 */ }

  // 空作答判定：无附件且实验模板全空 → 0 分（不调用 AI）
  const hasTemplateContent = template != null && ATTACHMENT_TEMPLATE_FIELDS.some(({ key }) => (template[key] || '').trim());
  if (files.length === 0 && !hasTemplateContent) {
    return zeroResult(questionData, !!plainStudentAnswer?.trim(), baseFull);
  }

  // 提取附件文本（尽力而为，失败不阻断）
  let extractedText = '';
  try {
    extractedText = await extractFilesText(files.map((f) => ({ path: f.path })));
  } catch { extractedText = ''; }

  const fileNames = files.map((f) => f.name || f.path).filter(Boolean);
  const filesDesc = fileNames.length
    ? fileNames.map((n) => `- ${n}`).join('\n')
    : '（学生未上传附件）';

  const templateBlocks = ATTACHMENT_TEMPLATE_FIELDS
    .map(({ key, label }) => {
      const v = template?.[key] ? String(template[key]).trim() : '';
      return v ? `- ${label}：${v}` : '';
    })
    .filter(Boolean);

  const prompt = `请批改以下【实验报告/附件题】学生作答：

【题目信息】
- 题目内容：${questionData.content || '（未填写）'}
- 题目类型：实验报告/附件题（实验题）
- 关联知识点：${knowledgePointName || '—'}
- 满分：${baseFull}分
- 实验要求/参考答案：${questionData.answer || '（未提供）'}

【学生提交的附件】
${filesDesc}
${extractedText ? `\n【附件提取文本】\n${truncate(extractedText, 12000)}\n` : '\n（附件为二进制文件或无法提取文本，请依据实验模板填写情况与文件名进行合理评估，不要因此过度扣分）'}

【学生填写的实验报告】
${templateBlocks.length ? templateBlocks.join('\n') : '（学生未填写实验模板字段）'}

请从实验报告的完整性、实验原理与步骤是否正确、数据记录与分析是否合理、结论是否严谨、附件内容与报告是否一致等方面综合评分。严格按 JSON 输出批改结果。`;

  const rulesBlock = configRules ? [
    configRules.scoring_criteria ? `【教师评分标准（必须遵守）】\n${configRules.scoring_criteria}` : '',
    configRules.deduction_rules ? `【扣分规则】\n${configRules.deduction_rules}` : '',
    configRules.comment_style ? `【评语风格要求】${configRules.comment_style}` : '',
  ].filter(Boolean).join('\n\n') : '';

  const result = await invokeStructured<GradingResult>(
    client,
    GRADING_SYSTEM_PROMPT,
    rulesBlock ? `${prompt}\n\n${rulesBlock}` : prompt,
    0.2
  );
  // 归一化 AI 生成概率（0~1 内/越界/缺失均兜底）
  if (typeof result.ai_generated_probability === 'number' && Number.isFinite(result.ai_generated_probability)) {
    result.ai_generated_probability = Math.min(1, Math.max(0, result.ai_generated_probability));
  } else {
    result.ai_generated_probability = null;
  }
  return result;
}

export async function computeGrade(
  questionData: QuestionRow,
  rawStudentAnswer: string,
  knowledgePointName: string,
  forwardHeaders?: Headers,
  configRules?: GradingRules | null,
  scoreOverride?: number // 布置时按难度/题型分配的本题满分（未分配时回退 default_score）
): Promise<GradingResult> {
  // 满分：优先作业分配的分数，其次题目 default_score
  const baseFull = scoreOverride ?? questionData.default_score ?? 10;
  // 富文本作答（简答题 HTML）→ 纯文本用于判分与 AI 提示词
  let studentAnswer = rawStudentAnswer || '';
  if (/<(img|table|p|div|pre|ul|ol|h\d|br)[\s>]/i.test(studentAnswer)) {
    studentAnswer = htmlToPlainText(studentAnswer);
  }
  // 1. 空答/无意义直接 0 分，跳过 AI
  if (isMeaninglessAnswer(studentAnswer, questionData.question_type)) {
    return zeroResult(questionData, !!studentAnswer?.trim(), scoreOverride);
  }

  // 2. 客观题规则引擎（单选/多选/判断/填空，含数学等价判定）
  if (isObjectiveType(questionData.question_type)) {
    const objectiveResult = gradeObjectiveQuestion(
      questionData.question_type,
      questionData.answer,
      studentAnswer,
      baseFull
    );
    if (objectiveResult) {
      const fullScore = baseFull;
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
        ai_generated_probability: null, // 客观题不评估 AI 率
      };
    }
    // 规则引擎返回 null（如文字型填空）→ 交给 AI 语义判定
  }

  // 2.5 实验题/附件题：解析 JSON 作答（附件 + 实验模板字段），提取附件文本走专属批次
  if (questionData.question_type === 'attachment') {
    return await gradeAttachmentQuestion(
      questionData,
      rawStudentAnswer,
      studentAnswer,
      baseFull,
      knowledgePointName,
      configRules,
      forwardHeaders
    );
  }

  // 3. 主观题 AI 批改
  const client = createAIClient(forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders) : undefined);
  const prompt = buildGradingPrompt({
    questionContent: questionData.content,
    questionType: questionData.question_type,
    referenceAnswer: questionData.answer,
    studentAnswer: studentAnswer || "（未作答）",
    fullScore: baseFull,
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
  // 归一化 AI 生成概率（0~1 内/越界/缺失均兜底），确保 DB 存储与前端展示安全
  if (typeof result.ai_generated_probability === 'number' && Number.isFinite(result.ai_generated_probability)) {
    result.ai_generated_probability = Math.min(1, Math.max(0, result.ai_generated_probability));
  } else {
    result.ai_generated_probability = null;
  }

  // 客观题（如文字型填空）交 AI 语义判定后，仍需遵循「全对满分、否则零分」：
  // 仅当 AI 评为满分才给满分，其余一律 0 分（不给部分分），并与能力维度保持一致。
  if (isObjectiveType(questionData.question_type)) {
    if (result.total_score >= baseFull) {
      result.total_score = baseFull;
    } else {
      result.total_score = 0;
      result.dimension_scores = {
        knowledge_accuracy: 0,
        logic_completeness: 0,
        expression_clarity: 0,
        expansion: 0,
      };
    }
  }
  return result;
}

/**
 * 原「批改完即自动公布」已废弃：成绩公布改为教师主导——教师批改/复核后可随时调用
 * publish-grades 接口手动公布，公布前学生端一律只显示「成绩待批改公布」。
 * 保留此占位仅避免逐点删除调用点；不再有任何自动置 grades_published 的副作用。
 * @returns 恒 false（从不自动发布）
 */
export function maybeAutoPublishGrades(_assignmentId: number): boolean {
  return false;
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
    // 防重复累计：同一 (assignment, student, question) 此前若已批改（含退回后重批），旧行置 superseded 作废，
    // 各汇总只认最新一条 completed，避免总分/题数因行数叠加而膨胀。
    db.update(gradingTask)
      .set({ status: 'superseded' })
      .where(and(
        eq(gradingTask.assignment_id, assignmentId),
        eq(gradingTask.student_id, studentId),
        eq(gradingTask.question_id, questionData.id),
      ))
      .run();

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
      ai_generated_probability: result.ai_generated_probability ?? null,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).returning().all();
    const taskId = inserted[0]?.id ?? null;

    // 非满分错题归档（含去重）。空答/未作答只计 0 分但不进错题本，避免"未作答"污染错题复习队列
    const fullScore = result.full_score || questionData.default_score || 10;
    if (studentAnswer?.trim() && result.total_score < fullScore) {
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
    // 口径统一：掌握度=本次得分率（比例制，与 lib/mastery-sync、practice 一致），纠错计数按是否过半判对
    const kpId = questionData.knowledge_point_id;
    if (kpId) {
      const isCorrect = result.total_score >= fullScore * 0.6;
      const thisRate = scoreToMastery(result.total_score, fullScore);
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
  let scoreOverride: number | undefined;
  try {
    const asgn = db.select({
      teacher_id: assignmentTable.teacher_id,
      course_id: assignmentTable.course_id,
      question_scores: assignmentTable.question_scores,
    })
      .from(assignmentTable).where(eq(assignmentTable.id, params.assignmentId)).limit(1).all()[0];
    if (asgn) {
      configRules = getActiveGradingRules(asgn.teacher_id, asgn.course_id, params.questionData.question_type);
      const qs = (asgn.question_scores as Record<number, number> | null | undefined) ?? {};
      if (typeof qs[params.questionData.id] === 'number') scoreOverride = Number(qs[params.questionData.id]);
    }
  } catch { /* 规则匹配失败不阻塞批改 */ }

  const result = await computeGrade(
    params.questionData,
    params.studentAnswer,
    params.knowledgePointName,
    params.forwardHeaders,
    configRules,
    scoreOverride
  );

  // 成绩等级映射（教师配置的等级划分）：overall_comment 前缀等级标签
  if (configRules?.grade_levels?.length && result.overall_comment) {
    const full = scoreOverride ?? (params.questionData.default_score || 10);
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

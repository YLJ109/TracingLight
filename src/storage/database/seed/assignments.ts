/**
 * 模块4：作业 + 作答 + 批改 + 错题 + 掌握度（数据驱动闭环，覆盖全生命周期状态）
 * 覆盖：assignment / answer / grading_task / error_book / knowledge_mastery_log
 *
 * 每门课固定 6 份作业：
 *  1-2 已批改并公布成绩（closed + 成绩已公布，含作答/批改/错题/掌握度）
 *  3-4 学生已作答、待教师批改（published，作答存在、grading 状态 pending，成绩未公布）
 *  5-6 待作答（published、截止时间在未来，尚无作答）
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';
import { datePlus, normalizeScores } from '../../../lib/seed/rng';
import { genSubjectiveAttempt, type QMeta } from './attempt';

const today = () => new Date();
const dPlus = (days: number) => datePlus(today(), days);

export function seedAssignments(db: Drizzle, ctx: SeedCtx) {
  const { rng, nextId } = ctx;
  const titleOf = (i: number) => `${i <= 2 ? '单元' : '综合'}作业${i}`;

  for (const cid of ctx.courseIds) {
    const teacherId = ctx.courseTeacher.get(cid)!;
    const classId = ctx.courseClass.get(cid)!;
    const students = ctx.classStudents.get(classId) ?? [];
    const courseQ = ctx.questionsByCourse.get(cid) ?? [];
    if (courseQ.length === 0 || students.length === 0) continue;

    for (let a = 1; a <= 6; a++) {
      const aId = nextId();
      const graded = a <= 2;          // 已批改并公布
      const answeredPending = a >= 3 && a <= 4; // 已作答待批改
      const future = a >= 5;          // 待作答

      const select = pickSet(rng, ctx, courseQ, rng.int(8, 14));
      // 每题分值归一化为整数且合计恰为 100（企业级口径：作业满分恒为 100）
      const qscores: Record<string, number> = normalizeScores(select, (qid) => ctx.questionMeta.get(qid)!.score);
      const total = 100;

      let start: string, end: string;
      if (graded) { start = dPlus(-(10 + a)); end = dPlus(-(8 + a)); }
      else if (answeredPending) { start = dPlus(-(5 + a)); end = dPlus(-(3 + a)); }
      else { start = dPlus(a); end = dPlus(a + 5); }

      db.insert(schema.assignment).values({
        id: aId, course_id: cid, teacher_id: teacherId, title: titleOf(a),
        description: `请按时完成本份${titleOf(a)}，客观题直接作答，主观题需完整作答并注明解题过程。`,
        question_ids: select, total_score: total,
        start_time: start, end_time: end,
        status: graded ? 'closed' : 'published',
        allow_resubmit: false, review_mode: 'auto',
        has_subjective: select.some((q) => { const t = ctx.questionMeta.get(q)!.type; return t === 'short_answer' || t === 'programming'; }),
        grades_published: graded,
        question_scores: qscores,
        monitor_config: { copyDisable: true, fullscreen: false, minDurationSec: 300 },
        peer_review: { enabled: false },
      } as any).run();

      const answers: any[] = [];
      const gradings: any[] = [];
      const errors: any[] = [];

      // 待作答（5-6）：学生尚未开始，不生成作答
      if (future) continue;

      for (const sid of students) {
        // 作答时间落在窗口内
        const submittedAt = dPlus(a <= 2 ? -(9 + a) : -(4 + a) + rng.int(0, 2));
        for (let qi = 0; qi < select.length; qi++) {
          const qid = select[qi];
          const meta = ctx.questionMeta.get(qid)!;
          const ansId = nextId();
          const correct = rng.chance(correctProb(ctx, sid, qid));
          const { stuAns, isSub } = genStudentAnswer(rng, meta, correct);
          const refAnswer = meta.answer; // 真实参考答案（与题库一致）
          answers.push({
            id: ansId, assignment_id: aId, student_id: sid, question_id: qid,
            student_answer: isSub ? stuAns : null, is_submitted: true, submitted_at: submittedAt, returned: false,
          });

          const gtId = nextId();
          const full = qscores[String(qid)];
          if (graded) {
            const score = correct ? full : rng.int(0, Math.max(1, Math.round(full * 0.6)));
            gradings.push({
              id: gtId, answer_id: ansId, assignment_id: aId, student_id: sid, question_id: qid,
              knowledge_point_id: meta.kpId, full_score: full, question_type: meta.type,
              reference_answer: refAnswer, student_answer: stuAns,
              total_score: score, status: 'completed',
              error_type: !correct ? '概念理解偏差' : null,
              overall_comment: correct ? '作答正确，掌握较好。' : '作答存在缺陷，建议对照参考答案补齐要点并回看该知识点。',
              completed_at: submittedAt, teacher_override_score: undefined, teacher_override_comment: null, ai_generated_probability: 0,
            });
            if (isSub && !correct) {
              errors.push({
                id: nextId(), student_id: sid, question_id: qid, knowledge_point_id: meta.kpId,
                assignment_id: aId, grading_task_id: gtId, exam_id: null,
                content: meta.answer ? `作业#${aId} 错题ID#${qid}` : `作业#${aId} 错题ID#${qid}`, student_answer: stuAns, correct_answer: refAnswer,
                error_type: score / full < 0.3 ? '概念性错误' : '部分失分',
                error_analysis: '作答要点不全或边界处理缺失，与参考答案存在偏差。',
                knowledge_explanation: meta.analysis || '该知识点为章节核心，需反复练习巩固。',
                learning_suggestion: '建议对照真实参考答案逐点核对，并完成课后练习定时复习。',
                review_status: 'pending', next_review_at: dPlus(1), review_count: 0,
              });
            }
            masteryUpdate(ctx, sid, meta.kpId, score, full);
          } else {
            // 已作答待批改：仅登记作答，批改任务挂起（status pending），成绩未公布
            gradings.push({
              id: gtId, answer_id: ansId, assignment_id: aId, student_id: sid, question_id: qid,
              knowledge_point_id: meta.kpId, full_score: full, question_type: meta.type,
              reference_answer: refAnswer, student_answer: stuAns,
              total_score: null, status: 'pending',
              error_type: null, overall_comment: null, completed_at: null,
              teacher_override_score: undefined, teacher_override_comment: null, ai_generated_probability: 0,
            });
          }
        }
      }
      if (answers.length) insertChunked(db, schema.answer, answers);
      if (gradings.length) insertChunked(db, schema.gradingTask, gradings);
      if (errors.length) insertChunked(db, schema.errorBook, errors);
    }
  }
}

/** 组卷：随机取若干题，若含主观题类型则保证至少 1 道主观题（与真实作答一致） */
function pickSet(rng: SeedCtx['rng'], ctx: SeedCtx, bank: number[], n: number): number[] {
  const shuffled = [...bank];
  rng.shuffle(shuffled);
  const sel = shuffled.slice(0, Math.min(n, bank.length));
  const isSubjective = (qid: number) => { const t = ctx.questionMeta.get(qid)?.type; return t === 'short_answer' || t === 'programming'; };
  if (!sel.some(isSubjective)) {
    const sub = bank.find(isSubjective);
    if (sub != null) sel[sel.length - 1] = sub;
  }
  return sel;
}

/** 掌握度：knowledge_mastery_log 有 (sid, kp, recorded_at) 唯一约束，按学生+知识点累加，最后统一 flush */
function masteryUpdate(ctx: SeedCtx, sid: number, kpid: number, score: number, full: number) {
  const key = `${sid}_${kpid}`;
  const rate = full ? (score / full) * 100 : 0;
  const cur = ctx.masteryAcc.get(key);
  if (cur) { cur.sum += rate; cur.cnt += 1; }
  else ctx.masteryAcc.set(key, { sum: rate, cnt: 1, kpid });
}

export function flushMastery(db: Drizzle, ctx: SeedCtx) {
  const { nextId } = ctx;
  const rows: any[] = [];
  for (const [key, v] of ctx.masteryAcc) {
    const sidStr = key.split('_')[0];
    const avg = v.sum / v.cnt;
    rows.push({
      id: nextId(), student_id: Number(sidStr), knowledge_point_id: v.kpid,
      mastery_rate: Math.min(100, Math.max(0, Math.round(avg))),
      error_count: avg < 60 ? 1 : 0,
      recorded_at: datePlus(today(), 0, 0, 0).slice(0, 10),
    });
  }
  insertChunked(db, schema.knowledgeMasteryLog, rows);
}

/** SQLite 默认变量上限约 999：将批量插入按 400 行 / 批切分，避免 too many SQL variables */
export function insertChunked(db: Drizzle, table: any, rows: any[], batchSize = 400) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    db.insert(table).values(rows.slice(i, i + batchSize)).run();
  }
}

function correctProb(ctx: SeedCtx, sid: number, qid: number): number {
  const level = ctx.levelOf.get(sid) ?? 'medium';
  const diff = ctx.questionMeta.get(qid)?.difficulty ?? 'medium';
  const base: Record<string, number> = { easy: 0.82, medium: 0.66, hard: 0.45 };
  const lv: Record<string, number> = { top: 0.16, medium: 0, weak: -0.18 };
  const combined = base[diff] + lv[level];
  return Math.min(0.96, Math.max(0.2, combined));
}

/** 生成学生作答：客观题随机，主观题由真实参考答案派生 */
function genStudentAnswer(rng: SeedCtx['rng'], meta: QMeta, correct: boolean): { stuAns: string; isSub: boolean } {
  const type = meta.type;
  if (['single_choice', 'judgment', 'multi_choice', 'fill_blank'].includes(type)) {
    if (!correct && ['single_choice', 'judgment'].includes(type)) {
      const wrongIdx = rng.int(0, 4);
      return { stuAns: type === 'judgment' ? (wrongIdx % 2 === 0 ? '错' : '对') : 'ABCD'[wrongIdx], isSub: true };
    }
    if (type === 'single_choice') return { stuAns: rng.pick(['A', 'B', 'C', 'D']), isSub: true };
    if (type === 'judgment') return { stuAns: rng.bool(0.5) ? '对' : '错', isSub: true };
    if (type === 'multi_choice') return { stuAns: rng.pick(['AB', 'ACD', 'ABCD', 'BC', 'AD']), isSub: true };
    return { stuAns: '', isSub: true };
  }
  // 主观题（short_answer/programming）：由真实参考答案派生具体作答
  return genSubjectiveAttempt(rng, meta, correct);
}
/**
 * 模块5：考试 + 名单 + 尝试 + 作答 + 批改 + 监考 + 申诉（全覆盖生命周期状态）
 * 覆盖：exam / exam_enroll / exam_attempt / exam_answer / exam_grading /
 *       exam_proctor_event / exam_appeal / exam_schedule
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';
import { insertChunked } from './assignments';
import { genSubjectiveAttempt, type QMeta } from './attempt';
import { datePlus, normalizeScores } from '../../../lib/seed/rng';

const now = () => new Date();

export async function seedExams(db: Drizzle, ctx: SeedCtx) {
  const { rng, nextId } = ctx;

  for (const cid of ctx.courseIds) {
    const teacherId = ctx.courseTeacher.get(cid)!;
    const classId = ctx.courseClass.get(cid)!;
    const students = ctx.classStudents.get(classId) ?? [];
    const courseQ = ctx.questionsByCourse.get(cid) ?? [];
    if (courseQ.length < 6 || students.length === 0) continue;

    // 每课程 6 场考试（教师端口径）：
    //  1-2 已批改完并公布（closed·成绩公布·有 completed 批改）
    //  3-4 待批改（学生已交卷·成绩未公布·批改 pending 等待教师）
    //  5-6 待考（scheduled·未来）
    for (let e = 1; e <= 6; e++) {
      const examId = nextId();
      const gradedE = e <= 2;            // 已批改完并公布
      const awaitingE = e >= 3 && e <= 4; // 待批改（已交未批、成绩未公布）
      const futureE = e >= 5;            // 待考
      const finishedE = gradedE || awaitingE; // 时间上已结束（已考完）
      const select = rng.shuffle([...courseQ]).slice(0, rng.int(8, 16));
      const qscores: Record<string, number> = normalizeScores(select, (qid) => ctx.questionMeta.get(qid)!.score);
      const examType = e === 6 ? 'final' : e === 5 ? 'midterm' : 'unit';
      const dayOff = futureE ? 4 + e * 3 : -(e * 5); // 待考在未来，已考完在过去（近→远）
      const startAt = datePlus(now(), dayOff, 9, 0);
      const endAt = datePlus(now(), dayOff, futureE ? 10 : 11, 0);
      const title = e === 6 ? '期末考试' : e === 5 ? '期中考试' : `单元测验${e}`;

      await db.insert(schema.exam).values({
        id: examId, course_id: cid, teacher_id: teacherId,
        title, description: '请在规定时间内独立完成，遵守考试纪律。', exam_type: examType,
        time_mode: rng.pick(['fixed', 'window'] as const),
        start_at: startAt, end_at: endAt, duration: rng.pick([45, 60, 90, 120]),
        auto_submit: true, allow_resubmit: false,
        publish_mode: 'manual', grades_published: gradedE,
        question_ids: select, question_scores: qscores, total_score: 100,
        has_subjective: select.some((q) => { const t = ctx.questionMeta.get(q)!.type; return t === 'short_answer' || t === 'programming'; }),
        proctor_config: { faceCheck: rng.bool(0.8), fullscreen: true, forbidCopy: true, switchLimit: rng.int(3, 6) },
        randomized: true,
        status: futureE ? 'scheduled' : 'closed',
      } as any).execute();

      // 名单（含缺考/缓考标记）
      const enrolls: any[] = [];
      for (const sid of students) {
        const enrollStatus = rng.weighted([
          ['normal', 0.9], ['absent', 0.04], ['deferred', 0.06],
        ] as const);
        enrolls.push({
          id: nextId(), exam_id: examId, student_id: sid, class_id: classId,
          allow: enrollStatus === 'normal', enroll_status: enrollStatus,
        });
      }
      await db.insert(schema.examEnroll).values(enrolls).execute();
      const enrollIdByStudent = new Map<number, number>();
      enrolls.forEach((en) => { if (en.enroll_status === 'normal') enrollIdByStudent.set(en.student_id, en.id); });

      // 待考考试：仅登记名单，尚无作答
      if (futureE) continue;

      // 已结束考试：生成作答与批改（含风险/申诉）
      const attempts: any[] = [];
      const ansRows: any[] = [];
      const gradingRows: any[] = [];
      const errRows: any[] = [];
      const appealRows: any[] = [];
      const proctorRows: any[] = [];
      for (const sid of students) {
        const enrollId = enrollIdByStudent.get(sid);
        if (enrollId == null) continue;
        if (rng.chance(0.1)) continue; // 缺考不答
        const attemptId = nextId();
        const risk = rng.normal(25, 20);
        const riskScore = Math.min(100, Math.max(0, Math.round(risk)));
        const submitAt = datePlus(now(), dayOff, rng.int(9, 11), rng.int(0, 60));
        attempts.push({
          id: attemptId, exam_id: examId, enroll_id: enrollId, student_id: sid,
          started_at: datePlus(now(), dayOff, 9, 0), deadline: endAt,
          submitted_at: submitAt, status: rng.pick(['submitted', 'submitted', 'auto_submitted', 'terminated'] as const),
          device_fp: `fp_${sid}_${e}`, ip: `192.168.${rng.int(0, 255)}.${rng.int(1, 254)}`,
          face_verified: rng.bool(0.95), risk_score: riskScore,
          risk_flags: riskScore >= 80 ? ['switch_away', 'fullscreen_exit'] : riskScore >= 50 ? ['blur'] : [],
          switch_count: rng.int(0, 6), fullscreen_exit_count: rng.int(0, 4),
          submitted_via: rng.pick(['manual', 'auto'] as const),
        });

        for (const qid of select) {
          const meta = ctx.questionMeta.get(qid)!;
          const answerId = nextId();
          const correct = rng.chance(correctP(ctx, sid, qid));
          const stuAns = genExamAnswer(rng, meta, correct);
          const refAnswer = meta.answer; // 真实参考答案（与题库一致）
          ansRows.push({
            id: answerId, attempt_id: attemptId, exam_id: examId, student_id: sid, question_id: qid,
            student_answer: stuAns, is_answered: true, revise_count: rng.int(0, 2),
            duration_ms: rng.int(20000, 180000), marked: rng.chance(0.1),
          });
          const gId = nextId();
          const full = qscores[String(qid)];
          // 已批改完→给出分并 completed；待批改→批改挂起（pending），成绩不落定、不公布
          const score = gradedE ? (correct ? full : rng.int(0, Math.round(full * 0.5))) : null;
          gradingRows.push({
            id: gId, answer_id: answerId, exam_id: examId, student_id: sid, question_id: qid,
            knowledge_point_id: meta.kpId, full_score: full, question_type: meta.type,
            reference_answer: refAnswer, student_answer: stuAns,
            total_score: score, status: gradedE ? 'completed' : 'pending',
            error_type: gradedE ? (correct ? null : rng.pick(['概念错误', '审题不清', '计算错误', '要点不全'])) : null,
            overall_comment: gradedE ? (correct ? '作答正确。' : '作答存在缺陷，建议对照参考答案补强并回看该知识点。') : null,
            completed_at: gradedE ? submitAt : null, ai_generated_probability: gradedE ? (correct ? 0 : rng.range(0, 0.4)) : 0,
          });
          // 仅已批改且答错，才进入错题本与可能申诉
          if (gradedE && !correct) {
            errRows.push({
              id: nextId(), student_id: sid, question_id: qid, knowledge_point_id: meta.kpId,
              assignment_id: null, grading_task_id: null, exam_id: examId,
              content: `试题#${qid}`, student_answer: stuAns, correct_answer: refAnswer,
              error_type: '考试失分', error_analysis: meta.analysis || '该知识点掌握不充分。',
              learning_suggestion: '结合讲义补强并完成专项练习。',
              review_status: 'pending', next_review_at: datePlus(now(), 1), review_count: 0,
            });
          }
          if (gradedE && !correct && rng.chance(0.04)) {
            appealRows.push({
              id: nextId(), exam_id: examId, student_id: sid, question_id: qid, grading_id: gId,
              reason: '我认为该题得分应为满分，请复核。', status: rng.pick(['pending', 'resolved', 'rejected'] as const),
              teacher_comment: rng.bool(0.5) ? '经复核，维持原判。' : null,
              created_at: submitAt, handled_at: rng.bool(0.7) ? datePlus(now(), -1) : null,
            });
          }
        }
        if (riskScore >= 40) {
          proctorRows.push({
            id: nextId(), exam_id: examId, attempt_id: attemptId, student_id: sid,
            type: rng.pick(['switch_away', 'fullscreen_exit', 'blur', 'copy'] as const),
            severity: riskScore >= 80 ? 'critical' : riskScore >= 55 ? 'red' : 'warn',
            detail: { at: datePlus(now(), dayOff, rng.int(9, 11), rng.int(0, 60)) },
          });
        }
      }
      if (attempts.length) await insertChunked(db, schema.examAttempt, attempts);
      if (ansRows.length) await insertChunked(db, schema.examAnswer, ansRows);
      if (gradingRows.length) await insertChunked(db, schema.examGrading, gradingRows);
      if (errRows.length) await insertChunked(db, schema.errorBook, errRows);
      if (appealRows.length) await insertChunked(db, schema.examAppeal, appealRows);
      if (proctorRows.length) await insertChunked(db, schema.examProctorEvent, proctorRows);
    }
  }
}

function correctP(ctx: SeedCtx, sid: number, qid: number): number {
  const level = ctx.levelOf.get(sid) ?? 'medium';
  const diff = ctx.questionMeta.get(qid)?.difficulty ?? 'medium';
  const base: Record<string, number> = { easy: 0.85, medium: 0.68, hard: 0.46 };
  const lv: Record<string, number> = { top: 0.15, medium: 0, weak: -0.18 };
  return Math.min(0.96, Math.max(0.2, base[diff] + lv[level]));
}

function genExamAnswer(rng: SeedCtx['rng'], meta: QMeta, correct: boolean): string {
  const type = meta.type;
  if (type === 'single_choice') return rng.pick(['A', 'B', 'C', 'D']);
  if (type === 'judgment') return rng.bool(0.5) ? '对' : '错';
  if (type === 'multi_choice') return rng.pick(['AB', 'ACD', 'ABCD', 'BC', 'AD']);
  if (type === 'fill_blank') return '知识填空答案';
  // 主观题（short_answer/programming）：由真实参考答案派生具体作答（答错为残缺版）
  return genSubjectiveAttempt(rng, meta, correct).stuAns;
}
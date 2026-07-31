import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { assignment, question, answer, gradingTask, errorBook, knowledgeMasteryLog } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/server-auth';

// Batch grade: grade all answers for a specific student in an assignment
// Auto-archive errors to error_book and update knowledge_mastery_log
export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request, 'teacher');
    if (!userAuth) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { assignment_id, student_id } = body;

    if (!assignment_id || !student_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getDb();

    // Get assignment
    const assignmentRows = db.select().from(assignment).where(eq(assignment.id, assignment_id)).limit(1).all();
    const assignmentData = assignmentRows[0] || null;

    if (!assignmentData) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // Get questions
    const questionIds = assignmentData.question_ids as number[];
    const questions = db.select().from(question).where(inArray(question.id, questionIds)).all();

    // Get student answers
    const answers = db.select().from(answer).where(
      and(
        eq(answer.assignment_id, assignment_id),
        eq(answer.student_id, student_id)
      )
    ).all();

    if (!answers || answers.length === 0) {
      return NextResponse.json({ error: '学生未提交作业' }, { status: 400 });
    }

    // Get existing gradings to avoid duplicates
    const existingGradings = db.select({ question_id: gradingTask.question_id })
      .from(gradingTask)
      .where(
        and(
          eq(gradingTask.assignment_id, assignment_id),
          eq(gradingTask.student_id, student_id)
        )
      ).all();

    const existingQuestionIds = new Set((existingGradings || []).map((g) => g.question_id));

    const questionMap = new Map((questions || []).map((q) => [q.id, q]));
    const results: Array<Record<string, unknown>> = [];
    const errorsToInsert: Array<Record<string, unknown>> = [];
    const masteryUpdates: Map<number, { correct: number; total: number }> = new Map();

    // Normalize: each question's score scaled so total = 100
    const rawTotalScore = (questions || []).reduce((sum: number, q) => sum + ((q.default_score as number) || 10), 0);
    const normalizeScore = (raw: number) => rawTotalScore > 0 ? Math.round((raw / rawTotalScore) * 100 * 10) / 10 : raw;

    // Grade each answer by comparing with reference answer
    for (const answerData of answers) {
      const qId = answerData.question_id;
      if (existingQuestionIds.has(qId)) continue; // skip already graded

      const q = questionMap.get(qId);
      if (!q) continue;

      const rawScore = q.default_score || 10;
      const fullScore = normalizeScore(rawScore);
      const refAnswer = (q.answer || '').trim();
      const stuAnswer = (answerData.student_answer || '').trim();

      // Simple auto-grading logic
      let totalScore = 0;
      let errorType = '';
      const annotations: Array<Record<string, unknown>> = [];

      // === Objective questions: direct comparison, 0 or full score ===
      const OBJECTIVE_TYPES = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment', 'fill_blank'];
      const isObjective = OBJECTIVE_TYPES.includes(q.question_type);

      if (!stuAnswer || stuAnswer === '___' || stuAnswer === '（未作答）') {
        // Empty answer
        totalScore = 0;
        errorType = 'empty';
        annotations.push({
          content: '未作答',
          type: 'empty',
          comment: '该题未作答',
          point_deduction: fullScore,
        });
      } else if (isObjective) {
        // Objective questions: exact match, full or zero
        const sa = stuAnswer.trim().toLowerCase();
        const ca = refAnswer.toLowerCase();
        if (sa === ca) {
          totalScore = fullScore;
        } else if (q.question_type === 'fill_blank' && ca.includes(sa) && sa.length >= ca.length * 0.5) {
          // Fill blank partial match
          totalScore = Math.floor(fullScore * 0.5);
          errorType = 'incomplete';
          annotations.push({ content: '答案不完整', type: 'incomplete', comment: `正确答案是 ${refAnswer}`, point_deduction: fullScore - totalScore });
        } else {
          totalScore = 0;
          errorType = q.question_type === 'fill_blank' ? 'knowledge' : 'concept_confusion';
          annotations.push({ content: '答案错误', type: errorType, comment: `正确答案是 ${refAnswer}`, point_deduction: fullScore });
        }
      } else {
        // Subjective questions (short_answer, code): give reasonable partial credit
        // Use reference answer length ratio as baseline, with reasonable floor/ceiling
        const saLen = stuAnswer.length;
        const caLen = refAnswer.length || 1;
        const lenRatio = Math.min(saLen / caLen, 1.5);
        // Similarity heuristic: common words ratio
        const saWords = new Set(stuAnswer.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1));
        const caWords = refAnswer.toLowerCase().split(/\s+/).filter((w: string) => w.length > 1);
        const commonWords = caWords.filter((w: string) => saWords.has(w)).length;
        const wordRatio = caWords.length > 0 ? commonWords / caWords.length : 0.5;
        // Combined score: 30% length + 70% word match
        const similarity = lenRatio * 0.3 + wordRatio * 0.7;
        // Score range: minimum 30% for any serious attempt, max 95% (leave room for perfection)
        const scoreRatio = Math.max(0.3, Math.min(0.95, similarity));
        totalScore = Math.round(fullScore * scoreRatio);
        // Annotations for non-perfect scores
        if (scoreRatio < 0.6) {
          annotations.push({ content: '答案与参考答案存在较大差异', type: 'knowledge', comment: `建议复习相关知识点，对比参考答案 ${refAnswer.substring(0, 100)}`, point_deduction: fullScore - totalScore });
        } else if (scoreRatio < 0.85) {
          annotations.push({ content: '部分要点正确', type: 'incomplete', comment: '部分要点缺失或不准确', point_deduction: fullScore - totalScore });
        }
      }

      // Calculate dimension scores proportionally
      const ratio = fullScore > 0 ? totalScore / fullScore : 0;
      const dimensionScores = {
        knowledge_accuracy: Math.round(ratio * fullScore * 0.4 * 10) / 10,
        logic_completeness: Math.round(ratio * fullScore * 0.3 * 10) / 10,
        expression_clarity: Math.round(ratio * fullScore * 0.2 * 10) / 10,
        expansion: Math.round(ratio * fullScore * 0.1 * 10) / 10,
      };

      // Insert grading task
      const inserted = db.insert(gradingTask).values({
        answer_id: answerData.id,
        assignment_id,
        student_id,
        question_id: qId,
        knowledge_point_id: q.knowledge_point_id,
        full_score: fullScore,
        question_type: q.question_type,
        reference_answer: q.answer,
        student_answer: stuAnswer,
        total_score: totalScore,
        dimension_scores: dimensionScores,
        annotations: annotations,
        error_type: errorType || null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).returning().all();
      const gradingTaskData = inserted[0] || null;

      results.push({
        question_id: qId,
        total_score: totalScore,
        full_score: fullScore,
        grading_task_id: gradingTaskData?.id,
      });

      // Track mastery
      const kpId = q.knowledge_point_id;
      if (kpId) {
        const current = masteryUpdates.get(kpId) || { correct: 0, total: 0 };
        masteryUpdates.set(kpId, {
          correct: current.correct + (totalScore >= fullScore * 0.6 ? 1 : 0),
          total: current.total + 1,
        });
      }

      // Auto-archive to error_book if any error detected (wrong/empty/incomplete)
      if (errorType || annotations.length > 0) {
        errorsToInsert.push({
          student_id,
          question_id: qId,
          knowledge_point_id: q.knowledge_point_id,
          assignment_id,
          grading_task_id: gradingTaskData?.id || 0,
          student_answer: stuAnswer,
          correct_answer: q.answer,
          error_type: errorType || 'wrong',
          error_analysis: annotations.length > 0 ? (annotations[0].comment as string) : '答案错误',
          review_status: 'pending',
        });
      }
    }

    // Batch insert error_book records (deduplicate by student+question+assignment)
    if (errorsToInsert.length > 0) {
      const errorQuestionIds = errorsToInsert.map((e: any) => e.question_id as number);
      const existingErrors = db.select({
        student_id: errorBook.student_id,
        question_id: errorBook.question_id,
        assignment_id: errorBook.assignment_id,
      })
        .from(errorBook)
        .where(
          and(
            inArray(errorBook.question_id, errorQuestionIds),
            eq(errorBook.student_id, student_id),
            eq(errorBook.assignment_id, assignment_id)
          )
        ).all();
      const existingSet = new Set((existingErrors || []).map((e: any) => `${e.student_id}-${e.question_id}-${e.assignment_id}`));
      const newErrors = errorsToInsert.filter(
        (e: any) => !existingSet.has(`${e.student_id}-${e.question_id}-${e.assignment_id}`)
      );
      if (newErrors.length > 0) {
        db.insert(errorBook).values(newErrors as any).run();
      }
    }

    // Update knowledge_mastery_log
    for (const [kpId, stats] of masteryUpdates) {
      const masteryRate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

      // Upsert: update if exists, insert if not
      const existingLog = db.select({ id: knowledgeMasteryLog.id, error_count: knowledgeMasteryLog.error_count })
        .from(knowledgeMasteryLog)
        .where(
          and(
            eq(knowledgeMasteryLog.student_id, student_id),
            eq(knowledgeMasteryLog.knowledge_point_id, kpId)
          )
        )
        .limit(1).all();
      const existingLogRow = existingLog[0] || null;

      if (existingLogRow) {
        const newErrorCount = (existingLogRow.error_count || 0) + (stats.total - stats.correct);
        db.update(knowledgeMasteryLog)
          .set({
            mastery_rate: masteryRate,
            error_count: newErrorCount,
            recorded_at: new Date().toISOString().split('T')[0],
          })
          .where(eq(knowledgeMasteryLog.id, existingLogRow.id))
          .run();
      } else {
        db.insert(knowledgeMasteryLog)
          .values({
            student_id,
            knowledge_point_id: kpId,
            mastery_rate: masteryRate,
            error_count: stats.total - stats.correct,
            recorded_at: new Date().toISOString().split('T')[0],
          })
          .run();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        graded_count: results.length,
        error_count: errorsToInsert.length,
        results,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Batch grading error:', e);
    return NextResponse.json({ error: '批量批改失败' }, { status: 500 });
  }
}

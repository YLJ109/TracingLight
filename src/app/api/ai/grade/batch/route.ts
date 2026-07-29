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

      if (!stuAnswer) {
        // Empty answer
        totalScore = 0;
        errorType = 'empty';
        annotations.push({
          content: '未作答',
          type: 'empty',
          comment: '该题未作答，请加强相关知识点学习',
          point_deduction: fullScore,
        });
      } else if (q.question_type === 'single_choice' || q.question_type === 'judgment') {
        // Objective questions: exact match
        if (stuAnswer === refAnswer) {
          totalScore = fullScore;
        } else {
          totalScore = 0;
          errorType = 'concept_confusion';
          annotations.push({
            content: q.knowledge_point_id ? '概念混淆' : '答案错误',
            type: 'concept_confusion',
            comment: `正确答案是 ${refAnswer}，你的答案是 ${stuAnswer}`,
            point_deduction: fullScore,
          });
        }
      } else if (q.question_type === 'fill_blank') {
        // Fill blank: case-insensitive trim comparison
        if (stuAnswer.toLowerCase() === refAnswer.toLowerCase()) {
          totalScore = fullScore;
        } else if (stuAnswer.length > 0 && refAnswer.toLowerCase().includes(stuAnswer.toLowerCase())) {
          totalScore = Math.floor(fullScore * 0.5);
          errorType = 'incomplete';
          annotations.push({
            content: '答案不完整',
            type: 'incomplete',
            comment: `正确答案是 ${refAnswer}，你的答案不够完整`,
            point_deduction: fullScore - totalScore,
          });
        } else {
          totalScore = 0;
          errorType = 'wrong';
          annotations.push({
            content: '答案错误',
            type: 'wrong',
            comment: `正确答案是 ${refAnswer}，你的答案是 ${stuAnswer}`,
            point_deduction: fullScore,
          });
        }
      } else {
        // Short answer: lenient - give partial credit if answer is non-empty
        if (stuAnswer.length > 0) {
          totalScore = Math.floor(fullScore * 0.7);
        } else {
          totalScore = 0;
          errorType = 'empty';
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

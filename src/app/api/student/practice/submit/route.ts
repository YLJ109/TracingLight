import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { knowledgeMasteryLog, errorBook } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { gradeObjectiveQuestion, isObjectiveType } from '@/lib/objective-grading';

/**
 * 举一反三 · 即时练习 —— 提交判分（P1-2）
 * 服务端按统一客观题规则引擎判分（含数学等价/多选半对），答案与解析在判分后下发。
 * 练习结果回写掌握度（指数平滑），供图谱/推荐/规划使用——练习真正进入学习闭环。
 */
const g = globalThis as unknown as { __TL_PRACTICE_STORE?: Map<string, { studentId: number; knowledge_point_id: number; questions: Array<{ content: string; question_type: string; options: Record<string, string> | null; answer: string; analysis: string; default_score: number }>; createdAt: number }> };
const practiceStore = g.__TL_PRACTICE_STORE!;

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const { practice_id, answers } = body as { practice_id: string; answers: Array<{ index: number; student_answer: string }> };
    if (!practice_id || !Array.isArray(answers)) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const practice = practiceStore.get(practice_id);
    if (!practice) {
      return NextResponse.json({ error: '练习不存在或已过期，请重新生成' }, { status: 404 });
    }
    if (practice.studentId !== authUser.userId) {
      return NextResponse.json({ error: '无权提交该练习' }, { status: 403 });
    }

    // 服务端判分（统一规则引擎，与正式批改同源）
    const results = practice.questions.map((q, i) => {
      const submitted = answers.find((a) => a.index === i)?.student_answer ?? '';
      if (!isObjectiveType(q.question_type)) {
        return { index: i, total_score: 0, full_score: q.default_score, is_correct: false, comment: '本题类型不支持自动判分', correct_answer: q.answer, analysis: q.analysis };
      }
      const r = gradeObjectiveQuestion(q.question_type, q.answer, submitted || '', q.default_score);
      return {
        index: i,
        total_score: r?.total_score ?? 0,
        full_score: q.default_score,
        is_correct: r?.is_correct ?? false,
        comment: r?.comment ?? '未作答',
        correct_answer: q.answer,
        analysis: q.analysis,
      };
    });

    // 清理该练习（一次性）
    practiceStore.delete(practice_id);

    // 练习错题同步进错题本：答错的题目写入 error_book。
    // 练习题为 AI 生成（不入题库、非正式作业），故 question_id/assignment_id/grading_task_id 留空，
    // 以 content 列存题面；错题本页可据此展示，并作为该知识点薄弱/复习依据。
    const kpIdForError = Number(practice.knowledge_point_id) || null;
    if (kpIdForError) {
      try {
        const db = getDb();
        const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const wrongs = results.filter((r) => !r.is_correct);
        let insertCount = 0;
        for (const rs of wrongs) {
          const q = practice.questions[rs.index];
          const submitted = answers.find((a) => a.index === rs.index)?.student_answer ?? '';
          db.insert(errorBook).values({
            student_id: authUser.userId,
            knowledge_point_id: kpIdForError,
            content: q?.content ?? '',
            student_answer: submitted,
            correct_answer: rs.correct_answer ?? q?.answer ?? '',
            error_type: 'practice',
            error_analysis: rs.analysis ?? q?.analysis ?? '',
            review_status: 'pending',
            next_review_at: nextDay,
            review_count: 0,
          }).run();
          insertCount++;
        }
        if (insertCount > 0) { try { saveDb(); } catch {} }
      } catch (e) {
        console.error('Practice error-book sync error:', e);
      }
    }

    // 练习结果回写掌握度：以本次正确率为「本次表现」，与历史掌握度指数平滑（0.3 权重）
    const correctCount = results.filter((r) => r.is_correct).length;
    const thisRate = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
    // 练习生成自错题知识点——knowledge_point_id 从服务端 store 取（generate 时由错题归属写入），
    // 不信任前端请求体透传，杜绝伪造上游知识点提升任意掌握度
    const kpId = Number(practice.knowledge_point_id) || null;
    if (kpId) {
      try {
        const db = getDb();
        const row = db.select({ id: knowledgeMasteryLog.id, mastery_rate: knowledgeMasteryLog.mastery_rate, error_count: knowledgeMasteryLog.error_count })
          .from(knowledgeMasteryLog)
          .where(and(eq(knowledgeMasteryLog.student_id, authUser.userId), eq(knowledgeMasteryLog.knowledge_point_id, kpId)))
          .limit(1).all()[0];
        if (row) {
          const newRate = Math.round((row.mastery_rate || 0) * 0.7 + thisRate * 0.3);
          db.update(knowledgeMasteryLog)
            .set({ mastery_rate: newRate, recorded_at: new Date().toISOString().split('T')[0] })
            .where(eq(knowledgeMasteryLog.id, row.id))
            .run();
        } else {
          db.insert(knowledgeMasteryLog).values({
            student_id: authUser.userId,
            knowledge_point_id: kpId,
            mastery_rate: thisRate,
            error_count: 0,
            recorded_at: new Date().toISOString().split('T')[0],
          }).run();
        }
        try { saveDb(); } catch { /* 定时持久化兜底 */ }
      } catch (mErr) {
        console.error('Practice mastery update error:', mErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        correct_count: correctCount,
        total: results.length,
        score_percent: thisRate,
        mastery_updated: !!kpId,
      },
    });
  } catch (e) {
    console.error('Practice submit error:', e);
    return NextResponse.json({ error: '提交失败，请稍后重试' }, { status: 500 });
  }
}

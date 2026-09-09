import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { readingMinutesFromSeconds, readingScoreFromMinutes } from '@/lib/reading-score';
import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  errorBook, question, knowledgePoint, knowledgeMasteryLog,
  studyPlan, studySession, course, learningBehaviorLog,
} from '@/storage/database/shared/schema';

/**
 * 今日任务（自适应复习引擎 - P1）
 * GET : 聚合"今日最该做的事"——到期错题复习 + 薄弱点练习 + 今日学习计划 session。
 *       所有数据来自真实库（无 mock），同一学生任意两次调用一致。
 * POST: 错题复习反馈闭环——按 outcome(太简单/刚好/太难) 推进复习状态与下次到期日（遗忘曲线排期）。
 */
function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const studentId = authUser.userId;
    const today = todayStr();
    const db = getDb();

    // ===== 1. 到期需复习的错题 =====
    const errorRows = await db.select({
      id: errorBook.id,
      question_id: errorBook.question_id,
      content: errorBook.content,
      knowledge_point_id: errorBook.knowledge_point_id,
      error_type: errorBook.error_type,
      error_analysis: errorBook.error_analysis,
      learning_suggestion: errorBook.learning_suggestion,
      student_answer: errorBook.student_answer,
      correct_answer: errorBook.correct_answer,
      review_status: errorBook.review_status,
      next_review_at: errorBook.next_review_at,
      reviewed_at: errorBook.reviewed_at,
    }).from(errorBook)
      .where(eq(errorBook.student_id, studentId))
      .execute();

    const dueErrors = errorRows.filter((e) =>
      e.review_status !== 'mastered'
      && e.next_review_at
      && e.next_review_at.slice(0, 10) <= today
    );

    // 合并题目内容 + 知识点名
    const errQIds = [...new Set(dueErrors.map((e) => e.question_id).filter(Boolean))];
    const qMap = new Map<number, string>();
    if (errQIds.length > 0) {
      (await db.select({ id: question.id, content: question.content })
        .from(question).where(inArray(question.id, errQIds as number[]))
        .execute()).forEach((q) => qMap.set(q.id, q.content));
    }
    const errKpIds = [...new Set(dueErrors.map((e) => e.knowledge_point_id).filter(Boolean))];
    const kpMap = new Map<number, { name: string; course_id: number | null }>();
    if (errKpIds.length > 0) {
      (await db.select({ id: knowledgePoint.id, name: knowledgePoint.name, course_id: knowledgePoint.course_id })
        .from(knowledgePoint).where(inArray(knowledgePoint.id, errKpIds as number[]))
        .execute()).forEach((k) => kpMap.set(k.id, { name: k.name, course_id: k.course_id }));
    }

    // ===== 2. 薄弱知识点（mastery < 60，作为练习任务）=====
    const weakRows = await db.select({
      knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
      error_count: knowledgeMasteryLog.error_count,
      recorded_at: knowledgeMasteryLog.recorded_at,
    }).from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, studentId))
      .execute();
    // 每个知识点取最新掌握度，再筛薄弱
    const weakLatest = new Map<number, typeof weakRows[number]>();
    for (const m of weakRows) {
      const cur = weakLatest.get(m.knowledge_point_id);
      if (!cur || (m.recorded_at || '') >= (cur.recorded_at || '')) weakLatest.set(m.knowledge_point_id, m);
    }
    const weakLogs = [...weakLatest.values()].filter((m) => (m.mastery_rate || 0) < 60);
    const weakKpIds = weakLogs.map((m) => m.knowledge_point_id);
    const weakKpMap = new Map<number, { name: string; course_id: number | null }>();
    if (weakKpIds.length > 0) {
      (await db.select({ id: knowledgePoint.id, name: knowledgePoint.name, course_id: knowledgePoint.course_id })
        .from(knowledgePoint).where(inArray(knowledgePoint.id, weakKpIds))
        .execute()).forEach((k) => weakKpMap.set(k.id, { name: k.name, course_id: k.course_id }));
    }

    // ===== 3. 今日学习计划 session =====
    const todaySessions = await db.select({
      id: studySession.id,
      plan_id: studySession.plan_id,
      session_date: studySession.session_date,
      start_time: studySession.start_time,
      end_time: studySession.end_time,
      knowledge_point_id: studySession.knowledge_point_id,
      session_type: studySession.session_type,
      is_completed: studySession.is_completed,
      scheduled_duration: studySession.scheduled_duration,
    }).from(studySession)
      .innerJoin(studyPlan, eq(studyPlan.id, studySession.plan_id))
      .where(and(
        eq(studyPlan.student_id, studentId),
        sql`date(${studySession.session_date}) = date(${today})`,
        eq(studyPlan.status, 'active'),
      ))
      .execute();

    const sessionKpIds = todaySessions.map((s) => s.knowledge_point_id).filter(Boolean);
    const sessionKpMap = new Map<number, string>();
    if (sessionKpIds.length > 0) {
      (await db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint).where(inArray(knowledgePoint.id, sessionKpIds))
        .execute()).forEach((k) => sessionKpMap.set(k.id, k.name));
    }

    // ===== 组装 =====
    const tasks = {
      dueReviews: dueErrors.map((e) => ({
        id: e.id,
        type: 'review' as const,
        questionContent: e.question_id ? (qMap.get(e.question_id) || e.content || '题目内容缺失') : (e.content || '题目内容缺失'),
        student_answer: e.student_answer,
        correct_answer: e.correct_answer,
        knowledgePointId: e.knowledge_point_id,
        knowledgePointName: kpMap.get(e.knowledge_point_id)?.name || '未知知识点',
        errorType: e.error_type || 'wrong',
        errorAnalysis: e.error_analysis,
        suggestion: e.learning_suggestion,
        reviewStatus: e.review_status,
        nextReviewAt: e.next_review_at,
      })),
      weakPractice: weakLogs
        .filter((m) => weakKpMap.has(m.knowledge_point_id))
        .map((m) => ({
          type: 'practice' as const,
          knowledgePointId: m.knowledge_point_id,
          knowledgePointName: weakKpMap.get(m.knowledge_point_id)!.name,
          masteryRate: m.mastery_rate || 0,
          errorCount: m.error_count || 0,
        })),
      sessions: todaySessions.map((s) => ({
        type: 'session' as const,
        id: s.id,
        knowledgePointName: sessionKpMap.get(s.knowledge_point_id) || '待定知识点',
        sessionType: s.session_type,
        startTime: s.start_time,
        endTime: s.end_time,
        duration: s.scheduled_duration,
        isCompleted: s.is_completed,
      })),
    };

    // ===== 4. 今日阅读投入（供页头实时反馈）=====
    // 行为日志按 (student_id, material_id) 累计 watch_duration，last_watched_at 记录最近一次打开时间(UTC)。
    const readingLogs = await db.select({
      watch_duration: learningBehaviorLog.watch_duration,
      last_watched_at: learningBehaviorLog.last_watched_at,
      is_completed: learningBehaviorLog.is_completed,
    }).from(learningBehaviorLog)
      .where(eq(learningBehaviorLog.student_id, studentId))
      .execute();
    // 全时段累计阅读分钟 → 阅读投入得分（口径统一见 lib/reading-score：每 60 分钟 10 分，封顶 25）
    const readingTotalSeconds = readingLogs.reduce((s, r) => s + (r.watch_duration || 0), 0);
    const readingMinutesTotal = readingMinutesFromSeconds(readingTotalSeconds);
    const readingScore = readingScoreFromMinutes(readingMinutesTotal);
    // 今日活跃阅读：今天有学习行为的材料累计停留分钟（last_watched_at 为 UTC 日期）
    const todayUTC = new Date().toISOString().slice(0, 10);
    const todayReadingMinutes = readingMinutesFromSeconds(
      readingLogs
        .filter((r) => r.last_watched_at && r.last_watched_at.slice(0, 10) === todayUTC)
        .reduce((s, r) => s + (r.watch_duration || 0), 0)
    );

    return NextResponse.json({
      success: true,
      data: {
        date: today,
        totals: {
          reviews: tasks.dueReviews.length,
          practice: tasks.weakPractice.length,
          sessions: tasks.sessions.length,
          todo: tasks.dueReviews.length + tasks.weakPractice.length + tasks.sessions.filter((s) => !s.isCompleted).length,
        },
        reading: {
          minutesTotal: readingMinutesTotal,
          score: readingScore,
          todayMinutes: todayReadingMinutes,
        },
        ...tasks,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Today error:', e);
    return NextResponse.json({ success: false, error: '获取今日任务失败' }, { status: 500 });
  }
}

/** 复习反馈闭环：按遗忘曲线推进错题复习状态与下次到期日 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const errorBookId = Number(body?.error_book_id);
    const outcome = String(body?.outcome || '');
    if (!errorBookId || !['too_easy', 'just_right', 'too_hard'].includes(outcome)) {
      return NextResponse.json({ error: '参数错误：需要 error_book_id 与 outcome(too_easy/just_right/too_hard)' }, { status: 400 });
    }

    const db = getDb();
    const err = (await db.select().from(errorBook).where(eq(errorBook.id, errorBookId)).limit(1).execute())[0];
    if (!err) return NextResponse.json({ error: '错题不存在' }, { status: 404 });
    if (err.student_id !== authUser.userId) {
      return NextResponse.json({ error: '无权操作该错题' }, { status: 403 });
    }

    // 遗忘曲线间隔：too_easy→7天，just_right→3天，too_hard→1天
    const today = todayStr();
    const days = outcome === 'too_easy' ? 7 : outcome === 'just_right' ? 3 : 1;
    // 掌握判定：太简单→直接掌握；刚好且已复习过≥1次→掌握（第二次巩固成功）；太难→继续巩固
    const wasReviewed = !!err.reviewed_at;
    const mastered = outcome === 'too_easy' || (outcome === 'just_right' && wasReviewed);

    await db.update(errorBook)
      .set({
        review_status: mastered ? 'mastered' : 'reviewing',
        reviewed_at: today,
        next_review_at: mastered ? null : addDays(today, days),
      })
      .where(eq(errorBook.id, errorBookId))
      .execute();

    return NextResponse.json({
      success: true,
      data: {
        id: errorBookId,
        review_status: mastered ? 'mastered' : 'reviewing',
        next_review_at: mastered ? null : addDays(today, days),
        mastered,
        message: mastered ? '恭喜！该错题已标记为掌握' : `已将下次复习排到 ${addDays(today, days)}`,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Today review error:', e);
    return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 });
  }
}
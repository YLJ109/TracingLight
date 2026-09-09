import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { errorBook, question, knowledgePoint, course, assignment, knowledgeMasteryLog } from '@/storage/database/shared/schema';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { invalidateKnowledgeGraph } from '../knowledge-graph/route';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reviewStatus = searchParams.get('review_status');
    const kpId = searchParams.get('kp_id') ? parseInt(searchParams.get('kp_id')!, 10) : null;
    const courseId = searchParams.get('course_id') ? parseInt(searchParams.get('course_id')!, 10) : null;

    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const conditions = [eq(errorBook.student_id, user.userId)];
    if (reviewStatus) conditions.push(eq(errorBook.review_status, reviewStatus));
    if (kpId) conditions.push(eq(errorBook.knowledge_point_id, kpId));

    const errors = db.select()
      .from(errorBook)
      .where(and(...conditions))
      .orderBy(desc(errorBook.created_at))
      .all();

    if (!errors || errors.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Get question IDs
    const questionIds = [...new Set(errors.map((e) => e.question_id).filter((id): id is number => !!id))];
    const kpIds = [...new Set(errors.map((e) => e.knowledge_point_id))];

    // Fetch questions
    let questions: {
      id: number;
      content: string;
      question_type: string;
      options: unknown;
      course_id: number;
    }[] = [];
    if (questionIds.length > 0) {
      questions = db.select({
        id: question.id,
        content: question.content,
        question_type: question.question_type,
        options: question.options,
        course_id: question.course_id,
      })
        .from(question)
        .where(inArray(question.id, questionIds))
        .all();
    }

    // Fetch knowledge points
    let kps: {
      id: number;
      name: string;
      course_id: number;
    }[] = [];
    if (kpIds.length > 0) {
      kps = db.select({
        id: knowledgePoint.id,
        name: knowledgePoint.name,
        course_id: knowledgePoint.course_id,
      })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds))
        .all();
    }

    // Fetch courses
    const courseIds = [...new Set([
      ...questions.map((q) => q.course_id),
      ...kps.map((k) => k.course_id),
    ])];

    let courses: { id: number; name: string }[] = [];
    if (courseIds.length > 0) {
      courses = db.select({
        id: course.id,
        name: course.name,
      })
        .from(course)
        .where(inArray(course.id, courseIds))
        .all();
    }

    // 来源作业信息：作业名 + 题号（题目在作业中的序号，由 assignment.question_ids 顺序决定）
    const assignmentIds = [...new Set(errors.map((e) => e.assignment_id).filter((id): id is number => !!id))];
    let assignments: {
      id: number;
      title: string;
      question_ids: unknown;
    }[] = [];
    if (assignmentIds.length > 0) {
      assignments = db.select({
        id: assignment.id,
        title: assignment.title,
        question_ids: assignment.question_ids,
      })
        .from(assignment)
        .where(inArray(assignment.id, assignmentIds))
        .all();
    }
    // 题号映射：`${assignmentId}_${questionId}` -> 第几题（从 1 起）
    const questionNo = new Map<string, number>();
    for (const a of assignments) {
      const qids = Array.isArray(a.question_ids) ? (a.question_ids as number[]) : [];
      qids.forEach((qid, i) => questionNo.set(`${a.id}_${qid}`, i + 1));
    }
    const assignmentMap = new Map(assignments.map((a) => [a.id, a]));

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const kpMap = new Map(kps.map((k) => [k.id, k]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const result = errors.map((e) => {
      const q = e.question_id ? questionMap.get(e.question_id) : undefined;
      const kp = kpMap.get(e.knowledge_point_id);
      const courseId = q?.course_id || kp?.course_id;
      const courseData = courseMap.get(courseId || 0);
      const asgn = e.assignment_id ? assignmentMap.get(e.assignment_id) : undefined;

      return {
        ...e,
        question_content: q?.content || e.content || '题目加载中...',
        question_type: q?.question_type || '',
        question_options: q?.options || null,
        knowledge_point_name: kp?.name || '未知知识点',
        course_name: courseData?.name || '未知课程',
        course_id: courseId || null,
        knowledge_point_id: e.knowledge_point_id,
        assignment_title: asgn?.title || '',
        question_no: e.assignment_id && e.question_id
          ? (questionNo.get(`${e.assignment_id}_${e.question_id}`) ?? null)
          : null,
        // 今日是否到期待复习：未掌握 且 到期时间已到（间隔复习排期）
        due: e.review_status !== 'mastered' && !!e.reviewed_at
          ? new Date(e.reviewed_at).getTime() <= Date.now()
          : false,
      };
    });

    // 课程维度过滤（course_id 不在 error_book 上，用知识点/题目所属课程派生后过滤）
    const scoped = courseId ? result.filter((r) => r.course_id === courseId) : result;

    return NextResponse.json({ success: true, data: scoped });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get errors error:', e);
    return NextResponse.json({ error: '获取错题列表失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { error_id, review_status } = body;

    // review_status 白名单校验
    const VALID_STATUS = ['pending', 'reviewing', 'mastered'];
    if (!error_id || !VALID_STATUS.includes(review_status)) {
      return NextResponse.json({ error: '无效参数' }, { status: 400 });
    }

    // 校验错题归属当前用户，防止越权修改他人错题
    const target = db.select({ id: errorBook.id, student_id: errorBook.student_id })
      .from(errorBook)
      .where(eq(errorBook.id, Number(error_id)))
      .limit(1)
      .all();
    if (!target[0] || target[0].student_id !== user.userId) {
      return NextResponse.json({ error: '无权操作该错题' }, { status: 403 });
    }

    // 间隔复习：reviewing = 完成本次复习 → 按 1/3/7 天推进间隔，三次后自动掌握
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
    let finalStatus = review_status;
    const updateSet: Record<string, unknown> = { review_status, reviewed_at: fmt(now) };

    if (review_status === 'reviewing') {
      const cur = db.select({ review_count: errorBook.review_count })
        .from(errorBook).where(eq(errorBook.id, Number(error_id))).limit(1).all()[0];
      const count = cur?.review_count ?? 0;
      if (count >= 2) {
        // 第三次复习完成 → 掌握
        finalStatus = 'mastered';
        updateSet.review_status = 'mastered';
        updateSet.next_review_at = null;
        updateSet.review_count = count + 1;
      } else {
        const gapDays = count === 0 ? 3 : 7;
        updateSet.next_review_at = fmt(new Date(now.getTime() + gapDays * 24 * 60 * 60 * 1000));
        updateSet.review_count = count + 1;
      }
    } else if (review_status === 'mastered') {
      updateSet.next_review_at = null;
    }

    db.update(errorBook)
      .set(updateSet)
      .where(eq(errorBook.id, Number(error_id)))
      .run();

    // 掌握 → 把该错题知识点的掌握度回写入 knowledgeMasteryLog（拉到≥80 掌握线），
    // 使知识图谱/推荐/学情等掌握度数据源同步更新，不再出现「错题本已掌握、图谱不变」。
    if (finalStatus === 'mastered') {
      try {
        const kpRow = db.select({ knowledge_point_id: errorBook.knowledge_point_id })
          .from(errorBook)
          .where(eq(errorBook.id, Number(error_id)))
          .limit(1)
          .all()[0];
        const kpId = kpRow?.knowledge_point_id;
        if (kpId != null) {
          const MODULE_MASTERY = 0.5;
          const existing = db.select({ id: knowledgeMasteryLog.id, mastery_rate: knowledgeMasteryLog.mastery_rate })
            .from(knowledgeMasteryLog)
            .where(and(
              eq(knowledgeMasteryLog.student_id, user.userId),
              eq(knowledgeMasteryLog.knowledge_point_id, kpId)
            ))
            .limit(1)
            .all()[0];
          const today = new Date().toISOString().split('T')[0];
          if (existing) {
            const newRate = Math.max(existing.mastery_rate || 0, Math.round((existing.mastery_rate || 0) * (1 - MODULE_MASTERY) + 100 * MODULE_MASTERY));
            db.update(knowledgeMasteryLog)
              .set({ mastery_rate: newRate, recorded_at: today })
              .where(eq(knowledgeMasteryLog.id, existing.id))
              .run();
          } else {
            db.insert(knowledgeMasteryLog).values({
              student_id: user.userId,
              knowledge_point_id: kpId,
              mastery_rate: MODULE_MASTERY * 100,
              error_count: 0,
              recorded_at: today,
            }).run();
          }
        }
      } catch (mErr) {
        console.error('Mastered mastery-log write error:', mErr);
      }
      // 失效该学生的图谱缓存，立即反映到知识图谱
      try { invalidateKnowledgeGraph(user.userId); } catch { /* */ }
    }

    // 关键写路径即时落盘（T-2）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: { status: finalStatus } });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Update error book error:', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

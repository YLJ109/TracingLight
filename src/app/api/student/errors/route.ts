import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { errorBook, question, knowledgePoint, course } from '@/storage/database/shared/schema';
import { eq, desc, inArray, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reviewStatus = searchParams.get('review_status');

    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const conditions = [eq(errorBook.student_id, user.userId)];
    if (reviewStatus) conditions.push(eq(errorBook.review_status, reviewStatus));

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

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const kpMap = new Map(kps.map((k) => [k.id, k]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const result = errors.map((e) => {
      const q = e.question_id ? questionMap.get(e.question_id) : undefined;
      const kp = kpMap.get(e.knowledge_point_id);
      const courseId = q?.course_id || kp?.course_id;
      const courseData = courseMap.get(courseId || 0);

      return {
        ...e,
        question_content: q?.content || e.content || '题目加载中...',
        question_type: q?.question_type || '',
        question_options: q?.options || null,
        knowledge_point_name: kp?.name || '未知知识点',
        course_name: courseData?.name || '未知课程',
      };
    });

    return NextResponse.json({ success: true, data: result });
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

    // 关键写路径即时落盘（T-2）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: { status: finalStatus } });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Update error book error:', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

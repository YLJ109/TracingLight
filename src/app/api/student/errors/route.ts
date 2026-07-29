import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { errorBook, question, knowledgePoint, course } from '@/storage/database/shared/schema';
import { eq, desc, inArray, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('student_id');
    const reviewStatus = searchParams.get('review_status');

    // Build conditions
    const conditions = [];
    if (studentId) conditions.push(eq(errorBook.student_id, parseInt(studentId)));
    if (reviewStatus) conditions.push(eq(errorBook.review_status, reviewStatus));

    // Get error books
    let errors;
    if (conditions.length > 0) {
      errors = db.select()
        .from(errorBook)
        .where(and(...conditions))
        .orderBy(desc(errorBook.created_at))
        .all();
    } else {
      errors = db.select()
        .from(errorBook)
        .orderBy(desc(errorBook.created_at))
        .all();
    }

    if (!errors || errors.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Get question IDs
    const questionIds = [...new Set(errors.map((e) => e.question_id))];
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
      const q = questionMap.get(e.question_id);
      const kp = kpMap.get(e.knowledge_point_id);
      const courseId = q?.course_id || kp?.course_id;
      const courseData = courseMap.get(courseId || 0);

      return {
        ...e,
        question_content: q?.content || '题目加载中...',
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
    const db = getDb();
    const body = await request.json();
    const { error_id, review_status } = body;

    db.update(errorBook)
      .set({ review_status })
      .where(eq(errorBook.id, error_id))
      .run();

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Update error book error:', e);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

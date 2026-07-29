import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { question, course, knowledgePoint } from '@/storage/database/shared/schema';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const course_id = searchParams.get('course_id');
    const knowledge_point_id = searchParams.get('knowledge_point_id');
    const question_type = searchParams.get('question_type');
    const difficulty = searchParams.get('difficulty');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const offset = (page - 1) * pageSize;

    const filters = [eq(question.is_active, true)];
    if (course_id) filters.push(eq(question.course_id, parseInt(course_id)));
    if (knowledge_point_id) filters.push(eq(question.knowledge_point_id, parseInt(knowledge_point_id)));
    if (question_type) filters.push(eq(question.question_type, question_type));
    if (difficulty) filters.push(eq(question.difficulty, difficulty));

    // Get total count
    const countResult = db.select({ count: sql<number>`count(*)` })
      .from(question)
      .where(and(...filters))
      .all();
    const total = countResult[0]?.count || 0;

    // Get paginated questions
    const questions = db.select().from(question)
      .where(and(...filters))
      .orderBy(desc(question.created_at))
      .limit(pageSize)
      .offset(offset)
      .all();

    // Collect course IDs and knowledge point IDs for enrichment
    const courseIds = [...new Set(questions.map((q) => q.course_id))];
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id))];

    const coursesMap = new Map<number, { id: number; name: string; short_name: string | null }>();
    if (courseIds.length > 0) {
      const crs = db.select({ id: course.id, name: course.name, short_name: course.short_name })
        .from(course)
        .where(inArray(course.id, courseIds))
        .all();
      crs.forEach((c) => coursesMap.set(c.id, c));
    }

    const kpMap = new Map<number, { id: number; name: string }>();
    if (kpIds.length > 0) {
      const kps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds as number[]))
        .all();
      kps.forEach((kp) => kpMap.set(kp.id, kp));
    }

    // Enrich questions
    const enrichedQuestions = questions.map((q) => ({
      ...q,
      course: coursesMap.get(q.course_id) || null,
      knowledge_point: kpMap.get(q.knowledge_point_id) || null,
    }));

    // Get all courses for filter
    const courses = db.select({
      id: course.id,
      name: course.name,
      short_name: course.short_name,
    }).from(course).orderBy(course.id).all();

    // Get knowledge points for filter (if course_id provided)
    let allKps: { id: number; name: string }[] = [];
    if (course_id) {
      allKps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(eq(knowledgePoint.course_id, parseInt(course_id)))
        .orderBy(knowledgePoint.id)
        .all();
    }

    return NextResponse.json({
      success: true,
      data: {
        questions: enrichedQuestions,
        total,
        page,
        pageSize,
        courses,
        knowledgePoints: allKps,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    return NextResponse.json({ success: false, error: '获取题库失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();

    const {
      course_id,
      knowledge_point_id,
      question_type,
      difficulty,
      content,
      options,
      answer: answerText,
      analysis,
      default_score,
      source,
    } = body;

    const result = db.insert(question).values({
      course_id,
      knowledge_point_id,
      question_type,
      difficulty,
      content,
      options: options || {},
      answer: answerText,
      analysis,
      default_score: default_score || 10,
      source: source || 'manual',
      version: 1,
      is_active: true,
    }).returning().all();

    const data = result[0];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Create question error:', error);
    return NextResponse.json({ success: false, error: '创建题目失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少题目ID' }, { status: 400 });
    }

    const result = db.update(question)
      .set(updates)
      .where(eq(question.id, id))
      .returning()
      .all();

    const data = result[0];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Update question error:', error);
    return NextResponse.json({ success: false, error: '更新题目失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少题目ID' }, { status: 400 });
    }

    db.update(question)
      .set({ is_active: false })
      .where(eq(question.id, parseInt(id)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete question error:', error);
    return NextResponse.json({ success: false, error: '删除题目失败' }, { status: 500 });
  }
}

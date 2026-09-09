import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, not } from 'drizzle-orm';
import { question, course, knowledgePoint } from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';

export const dynamic = 'force-dynamic';

// 随机组卷：按课程+难度+数量抽取题目（仅本人课程，跳过已锁定题目）
// body: { course_id, difficulty?: 'easy'|'medium'|'hard', count, excludeIds?: number[] }
export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await req.json();
    const course_id = Number(body.course_id);
    const difficulty = body.difficulty;
    const count = Number(body.count);
    const excludeIds: number[] = Array.isArray(body.excludeIds)
      ? body.excludeIds.map(Number).filter((n: number) => Number.isFinite(n))
      : [];

    if (!Number.isFinite(course_id)) {
      return NextResponse.json({ success: false, error: '请选择课程' }, { status: 400 });
    }
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      return NextResponse.json({ success: false, error: '抽取数量无效（1-100）' }, { status: 400 });
    }

    // 课程归属校验
    const myCourseIds = await getTeacherCourseIds(authUser.userId);
    if (!myCourseIds.includes(course_id)) {
      return NextResponse.json({ success: false, error: '无权访问该课程' }, { status: 403 });
    }

    // 难度可选，校验合法值
    if (difficulty != null && !['easy', 'medium', 'hard'].includes(difficulty)) {
      return NextResponse.json({ success: false, error: '无效的难度' }, { status: 400 });
    }

    const db = getDb();
    const filters = [
      eq(question.course_id, course_id),
      eq(question.is_active, true),
      eq(question.locked, false), // 跳过已锁定题目
    ];
    if (difficulty) filters.push(eq(question.difficulty, difficulty));
    if (excludeIds.length > 0) filters.push(not(inArray(question.id, excludeIds)));

    const pool = await db.select().from(question).where(and(...filters)).execute();

    // 随机抽取 count 道
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

    // 补充课程与知识点信息
    const courseIds = [...new Set(shuffled.map((q) => q.course_id))];
    const kpIds = [...new Set(shuffled.map((q) => q.knowledge_point_id))];
    const coursesMap = new Map<number, { id: number; name: string }>();
    if (courseIds.length > 0) {
      (await db.select({ id: course.id, name: course.name }).from(course)
        .where(inArray(course.id, courseIds)).execute())
        .forEach((c) => coursesMap.set(c.id, c));
    }
    const kpMap = new Map<number, { id: number; name: string }>();
    if (kpIds.length > 0) {
      (await db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds as number[])).execute())
        .forEach((kp) => kpMap.set(kp.id, kp));
    }

    const data = shuffled.map((q) => ({
      ...q,
      course: coursesMap.get(q.course_id) || null,
      knowledge_point: kpMap.get(q.knowledge_point_id) || null,
    }));

    return NextResponse.json({ success: true, data, total: pool.length });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Random question error:', error);
    return NextResponse.json({ success: false, error: '随机组卷失败' }, { status: 500 });
  }
}
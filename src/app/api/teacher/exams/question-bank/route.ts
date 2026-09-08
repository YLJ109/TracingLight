import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray, desc, like } from 'drizzle-orm';
import { question, knowledgePoint } from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';
import { normalizeOptions } from '@/lib/exam-core';

/** 教师考试出题题库检索：按课程过滤已启用题目 */
export async function GET(request: NextRequest) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course_id');
  const qtype = searchParams.get('question_type');
  const diff = searchParams.get('difficulty');
  const kpId = searchParams.get('knowledge_point_id');
  const q = searchParams.get('q');

  const teacherCourseIds = getTeacherCourseIds(r.user.userId);
  const filters = [eq(question.is_active, true), eq(question.locked, false)];
  if (courseId) {
    if (!teacherCourseIds.includes(parseInt(courseId))) return NextResponse.json({ error: '无权操作该课程' }, { status: 403 });
    filters.push(eq(question.course_id, parseInt(courseId)));
  } else if (teacherCourseIds.length) {
    filters.push(inArray(question.course_id, teacherCourseIds));
  }
  if (qtype) filters.push(eq(question.question_type, qtype));
  if (diff) filters.push(eq(question.difficulty, diff));
  if (kpId) filters.push(eq(question.knowledge_point_id, parseInt(kpId)));
  if (q) filters.push(like(question.content, `%${q}%`));

  const questions = db.select({
    id: question.id, question_type: question.question_type, difficulty: question.difficulty,
    content: question.content, options: question.options, knowledge_point_id: question.knowledge_point_id,
    default_score: question.default_score,
  }).from(question).where(and(...filters)).orderBy(desc(question.created_at)).all();

  const kpMap = new Map<number, string>();
  db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint).all().forEach((k: any) => kpMap.set(k.id, k.name));

  return NextResponse.json({ questions: questions.map((qq: any) => ({
    ...qq,
    options: normalizeOptions(qq.options),
    knowledge_point_name: kpMap.get(qq.knowledge_point_id) || '',
  })) });
}
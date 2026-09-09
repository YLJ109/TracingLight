import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { classInfo, course } from '@/storage/database/shared/schema';
import { eq, inArray } from 'drizzle-orm';

/** 当前教师授课班级列表（为考试布置页选班级/选课程用） */
export async function GET(request: NextRequest) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();

  const myCourses = await db.select({ id: course.id, name: course.name, class_id: course.class_id }).from(course).where(eq(course.teacher_id, r.user.userId)).execute();
  const classIds = [...new Set(myCourses.map((c) => c.class_id).filter((v): v is number => v != null))];

  let classes: Array<{ id: number; name: string }> = [];
  if (classIds.length) {
    classes = await db.select({ id: classInfo.id, name: classInfo.name }).from(classInfo).where(inArray(classInfo.id, classIds)).execute();
  }
  return NextResponse.json({
    courses: myCourses.map((c) => ({ id: c.id, name: c.name, class_id: c.class_id })),
    classes,
  });
}
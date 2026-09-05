import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { announcement, course, user } from '@/storage/database/shared/schema';
import { inArray, desc, or, isNull, eq } from 'drizzle-orm';

/**
 * 学生端公告列表：本班级课程的公告 + 全校公告(target_type='all'/无课程)
 * GET /api/student/announcements
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    // 学生班级 → 班级课程
    const stu = db.select({ class_id: user.class_id }).from(user)
      .where(eq(user.id, authUser.userId)).limit(1).all()[0];
    const courseIds = stu?.class_id
      ? db.select({ id: course.id }).from(course).where(eq(course.class_id, stu.class_id)).all().map((c) => c.id)
      : [];

    // 可见公告：本班课程公告 或 无课程限定公告
    const visible = courseIds.length > 0
      ? db.select({
          id: announcement.id,
          title: announcement.title,
          content: announcement.content,
          teacher_id: announcement.teacher_id,
          course_id: announcement.course_id,
          is_pinned: announcement.is_pinned,
          created_at: announcement.created_at,
        }).from(announcement)
          .where(or(
            inArray(announcement.course_id, courseIds),
            isNull(announcement.course_id),
          ))
          .orderBy(desc(announcement.is_pinned), desc(announcement.created_at))
          .all()
      : db.select({
          id: announcement.id,
          title: announcement.title,
          content: announcement.content,
          teacher_id: announcement.teacher_id,
          course_id: announcement.course_id,
          is_pinned: announcement.is_pinned,
          created_at: announcement.created_at,
        }).from(announcement)
          .where(isNull(announcement.course_id))
          .orderBy(desc(announcement.is_pinned), desc(announcement.created_at))
          .all();

    // 教师名
    const teacherIds = [...new Set(visible.map((a) => a.teacher_id).filter(Boolean))];
    const teacherMap = new Map<number, string>();
    if (teacherIds.length > 0) {
      db.select({ id: user.id, name: user.real_name }).from(user)
        .where(inArray(user.id, teacherIds as number[]))
        .all()
        .forEach((t) => teacherMap.set(t.id, t.name));
    }

    return NextResponse.json({
      success: true,
      data: visible.map((a) => ({
        ...a,
        teacher_name: teacherMap.get(a.teacher_id!) || '老师',
      })),
    });
  } catch (e) {
    console.error('Student announcements error:', e);
    return NextResponse.json({ error: '获取公告失败' }, { status: 500 });
  }
}

/**
 * 课程访问权限（跨租户隔离，供讨论区等按课程维度接口复用）
 *
 * - 教师：仅可访问自己授课的课程
 * - 学生：仅可访问自己班级的课程
 * - 管理员：全部课程
 *
 * 统一收敛，避免任一角色查看不属于自己的课程内容。
 */
import { getDb } from '@/storage/database/db';
import { course, user } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import type { ServerUser } from '@/lib/server-auth';

/** 判断当前用户是否有权访问指定课程 */
export function canAccessCourse(authUser: ServerUser, courseId: number): boolean {
  const db = getDb();
  if (authUser.role === 'admin') return true;
  const row = db.select().from(course).where(eq(course.id, courseId)).limit(1).all()[0];
  if (!row) return false;
  if (authUser.role === 'teacher') return row.teacher_id === authUser.userId;
  if (authUser.role === 'student') {
    return row.class_id != null && row.class_id === authUser.classId;
  }
  return false;
}

/** 返回当前用户有权访问的全部课程 ID（讨论区列表用） */
export function getAccessibleCourseIds(authUser: ServerUser): number[] {
  const db = getDb();
  if (authUser.role === 'admin') {
    return db.select({ id: course.id }).from(course).all().map((r) => r.id);
  }
  if (authUser.role === 'teacher') {
    return db.select({ id: course.id }).from(course).where(eq(course.teacher_id, authUser.userId)).all().map((r) => r.id);
  }
  if (authUser.role === 'student') {
    return db.select({ id: course.id }).from(course).where(eq(course.class_id, authUser.classId ?? -1)).all().map((r) => r.id);
  }
  return [];
}

/** 解析用户可见名（学生/教师统一显示真实姓名，附带角色标识） */
export function resolveAuthorInfo(authorId: number): { name: string; role: string } {
  const db = getDb();
  const row = db.select({ real_name: user.real_name, role: user.role }).from(user).where(eq(user.id, authorId)).limit(1).all()[0];
  return {
    name: row?.real_name || '未知用户',
    role: row?.role || 'student',
  };
}
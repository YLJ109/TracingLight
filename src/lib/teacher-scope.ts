/**
 * 教师数据归属范围（跨租户隔离）
 *
 * 教师端接口统一通过这里收敛数据可见范围：
 * 教师 → 授课课程(course.teacher_id) → 授课班级(course.class_id) → 班级学生(user.class_id)
 * 避免任意教师查看其他教师的课程/班级/学生/作业/考试数据。
 */
import { getDb } from '@/storage/database/db';
import { course, user, assignment } from '@/storage/database/shared/schema';
import { eq, inArray, and } from 'drizzle-orm';

/** 当前教师授课的课程 ID */
export function getTeacherCourseIds(teacherId: number): number[] {
  const db = getDb();
  const rows = db.select({ id: course.id })
    .from(course)
    .where(eq(course.teacher_id, teacherId))
    .all();
  return rows.map((r) => r.id);
}

/** 当前教师授课的班级 ID（经课程关联，去重去空） */
export function getTeacherClassIds(teacherId: number): number[] {
  const db = getDb();
  const rows = db.select({ class_id: course.class_id })
    .from(course)
    .where(eq(course.teacher_id, teacherId))
    .all();
  return [...new Set(rows.map((r) => r.class_id).filter((v): v is number => v != null))];
}

/** 当前教师的学生 ID（授课班级下的在册学生） */
export function getTeacherStudentIds(teacherId: number): number[] {
  const db = getDb();
  const classIds = getTeacherClassIds(teacherId);
  if (classIds.length === 0) return [];
  const rows = db.select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'student'), inArray(user.class_id, classIds)))
    .all();
  return rows.map((r) => r.id);
}

/** 当前教师的作业 ID（教师创建的作业；与作业列表 `assignment.teacher_id` 归口一致） */
export function getTeacherAssignmentIds(teacherId: number): number[] {
  const db = getDb();
  const rows = db.select({ id: assignment.id })
    .from(assignment)
    .where(eq(assignment.teacher_id, teacherId))
    .all();
  return rows.map((r) => r.id);
}

/** 学生是否属于当前教师的授课范围 */
export function isStudentInTeacherScope(teacherId: number, studentId: number): boolean {
  return getTeacherStudentIds(teacherId).includes(studentId);
}

/** 课程是否属于当前教师（授课课程） */
export function isCourseInTeacherScope(teacherId: number, courseId: number): boolean {
  return getTeacherCourseIds(teacherId).includes(courseId);
}

/** 班级是否属于当前教师（授课班级） */
export function isClassInTeacherScope(teacherId: number, classId: number): boolean {
  return getTeacherClassIds(teacherId).includes(classId);
}

/** 作业是否属于当前教师（作业课程 ∈ 授课课程） */
export function isAssignmentInTeacherScope(teacherId: number, assignmentId: number): boolean {
  return getTeacherAssignmentIds(teacherId).includes(assignmentId);
}

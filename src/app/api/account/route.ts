import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { user as userTable, classInfo, course, gradingTask, errorBook } from '@/storage/database/shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

/**
 * 个人中心账户信息
 * GET  /api/account:  返回当前登录用户资料 + 班级/导师 + 学习摘要（学生端）
 * PATCH /api/account: 更新资料（真实姓名、学生层级、头像）
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const my = (await db.select()
      .from(userTable)
      .where(eq(userTable.id, authUser.userId))
      .limit(1)
      .execute())[0];
    if (!my) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    // 班级名
    let className = null;
    let advisor: Array<{ id: number; name: string; username: string }> = [];
    if (my.class_id) {
      className = (await db.select({ name: classInfo.name }).from(classInfo)
        .where(eq(classInfo.id, my.class_id)).limit(1).execute())[0]?.name || null;

      if (my.role === 'student') {
        // 指导导师 = 本班课程所关联的授课教师（去重）
        const courseIds = (await db.select({ id: course.id }).from(course)
          .where(eq(course.class_id, my.class_id)).execute()).map((c) => c.id);
        const teacherIds: number[] = [];
        if (courseIds.length > 0) {
          (await db.select({ teacher_id: course.teacher_id }).from(course)
            .where(inArray(course.id, courseIds))
            .execute())
            .forEach((c) => { if (c.teacher_id) teacherIds.push(c.teacher_id); });
        }
        const uniqueTeacherIds = [...new Set(teacherIds)];
        if (uniqueTeacherIds.length > 0) {
          advisor = await db.select({ id: userTable.id, name: userTable.real_name, username: userTable.username })
            .from(userTable)
            .where(inArray(userTable.id, uniqueTeacherIds))
            .execute();
        }
      }
    }

    // 学生端学习摘要（真实数据）
    let stats = null;
    if (my.role === 'student') {
      const studentId = my.id;
      const completed = (await db.select({ count: sql<number>`count(*)` }).from(gradingTask)
        .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed'))).execute())[0]?.count || 0;
      const errRows = await db.select({ review_status: errorBook.review_status }).from(errorBook)
        .where(eq(errorBook.student_id, studentId)).execute();
      const totalErrors = errRows.length;
      const masteredErrors = errRows.filter((r) => r.review_status === 'mastered').length;
      const grads = await db.select({ total_score: gradingTask.total_score, full_score: gradingTask.full_score })
        .from(gradingTask)
        .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed'))).execute();
      const ts = grads.reduce((s, g) => s + (g.total_score || 0), 0);
      const tf = grads.reduce((s, g) => s + (g.full_score || 0), 0);
      const avgScore = tf > 0 ? Math.round((ts / tf) * 1000) / 10 : 0;
      stats = { completedAssignments: completed, totalErrors, masteredErrors, avgScore };
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: my.id,
          username: my.username,
          real_name: my.real_name,
          role: my.role,
          student_level: my.student_level,
          avatar_url: my.avatar_url,
          created_at: my.created_at,
        },
        className,
        advisor,
        stats,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get account error:', e);
    return NextResponse.json({ error: '获取账户信息失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json().catch(() => ({}));

    const patch: Partial<typeof userTable.$inferSelect> = {};
    if (typeof body.real_name === 'string') {
      const name = body.real_name.trim();
      if (name.length < 2 || name.length > 20) {
        return NextResponse.json({ error: '姓名长度须在 2-20 个字符之间' }, { status: 400 });
      }
      patch.real_name = name;
    }
    if (typeof body.student_level === 'string') {
      if (!['top', 'medium', 'weak'].includes(body.student_level)) {
        return NextResponse.json({ error: '非法的学生层级' }, { status: 400 });
      }
      patch.student_level = body.student_level;
    }
    if (typeof body.avatar_url === 'string' && body.avatar_url.length > 0) {
      if (body.avatar_url.length > 500) {
        return NextResponse.json({ error: '头像链接过长' }, { status: 400 });
      }
      patch.avatar_url = body.avatar_url;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }

    await db.update(userTable)
      .set(patch)
      .where(eq(userTable.id, authUser.userId))
      .execute();

    const updated = (await db.select().from(userTable).where(eq(userTable.id, authUser.userId)).limit(1).execute())[0];
    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        real_name: updated.real_name,
        role: updated.role,
        student_level: updated.student_level,
        avatar_url: updated.avatar_url,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Update account error:', e);
    return NextResponse.json({ error: '更新资料失败' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { assignment, gradingTask } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { writeAudit } from '@/lib/audit';

async function getOwnedAssignment(userId: number, assignmentId: number) {
  const db = getDb();
  return (await db.select().from(assignment)
    .where(and(eq(assignment.id, assignmentId), eq(assignment.teacher_id, userId)))
    .limit(1)
    .execute())[0];
}

// GET /api/teacher/assignments/[id]/publish-grades - 查询该作业成绩是否已发布
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await params;
    const row = await getOwnedAssignment(user.userId, Number(id));
    if (!row) return NextResponse.json({ error: '作业不存在或无权限' }, { status: 404 });
    return NextResponse.json({ success: true, grades_published: !!Number(row.grades_published) });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get publish-grades error:', e);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

// POST /api/teacher/assignments/[id]/publish-grades - 一键发布成绩（发布后学生可见批改结果）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await params;
    const assignmentId = Number(id);

    // 归属校验：仅作业创建教师可发布
    const row = await getOwnedAssignment(user.userId, assignmentId);
    if (!row) return NextResponse.json({ error: '作业不存在或无权限' }, { status: 404 });

    // 前置校验：至少存在一条已完成批改的成绩，避免发布「空成绩」
    const gradedCount = (await getDb().select({ id: gradingTask.id })
      .from(gradingTask)
      .where(and(eq(gradingTask.assignment_id, assignmentId), eq(gradingTask.status, 'completed')))
      .execute()).length;
    if (gradedCount === 0) {
      return NextResponse.json({ error: '该作业还没有批改完成的成绩，请先完成批改后再发布' }, { status: 400 });
    }

    await getDb().update(assignment).set({ grades_published: true }).where(eq(assignment.id, assignmentId)).execute();
    saveDb();

    // 公布作业成绩埋点（静默，失败不影响响应）
    try {
      writeAudit({
        operatorId: user.userId,
        operatorName: user.username,
        action: 'assignment_grades_published',
        targetType: 'assignment',
        targetId: assignmentId,
        detail: `公布作业「${String(row.title).slice(0, 50)}」成绩`,
      });
    } catch (auditErr) {
      console.error('Assignment publish-grades audit error:', auditErr);
    }

    return NextResponse.json({ success: true, grades_published: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Publish grades error:', e);
    return NextResponse.json({ error: '发布成绩失败' }, { status: 500 });
  }
}
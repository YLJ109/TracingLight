import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { isAssignmentInTeacherScope } from '@/lib/teacher-scope';

/**
 * 补考 / 重开提交（C6）
 * PATCH {allow_resubmit: boolean}
 * 教师可对已截止的作业开启补考重开（allow_resubmit=true，学生在截止时间后仍可提交），
 * 或关闭补考（allow_resubmit=false）。
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await context.params;
    const assignmentId = Number(id);
    if (!isAssignmentInTeacherScope(authUser.userId, assignmentId)) {
      return NextResponse.json({ error: '无权操作该作业' }, { status: 403 });
    }
    const body = await request.json();
    const allowResubmit = !!body.allow_resubmit;

    const db = getDb();
    db.update(assignment)
      .set({ allow_resubmit: allowResubmit })
      .where(eq(assignment.id, assignmentId))
      .run();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: { assignment_id: assignmentId, allow_resubmit: allowResubmit } });
  } catch (e) {
    console.error('Toggle resubmit error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
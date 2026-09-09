import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { assignment } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { isAssignmentInTeacherScope } from '@/lib/teacher-scope';
import { writeAudit } from '@/lib/audit';

/**
 * 补交 / 重开提交（C6）
 * PATCH {allow_resubmit: boolean}
 * 教师可对已截止的作业开启补交（allow_resubmit=true，学生在截止时间后仍可提交），
 * 或关闭补交（allow_resubmit=false）。
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const { id } = await context.params;
    const assignmentId = Number(id);
    if (!await isAssignmentInTeacherScope(authUser.userId, assignmentId)) {
      return NextResponse.json({ error: '无权操作该作业' }, { status: 403 });
    }
    const body = await request.json();
    const allowResubmit = !!body.allow_resubmit;

    const db = getDb();
    await db.update(assignment)
      .set({ allow_resubmit: allowResubmit })
      .where(eq(assignment.id, assignmentId))
      .execute();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    // 补交切换埋点（静默，失败不影响响应）
    try {
      writeAudit({
        operatorId: authUser.userId,
        operatorName: authUser.username,
        action: 'assignment_reopen_toggle',
        targetType: 'assignment',
        targetId: assignmentId,
        detail: `${allowResubmit ? '开启' : '关闭'}作业补交`,
      });
    } catch (auditErr) {
      console.error('Assignment reopen audit error:', auditErr);
    }

    return NextResponse.json({ success: true, data: { assignment_id: assignmentId, allow_resubmit: allowResubmit } });
  } catch (e) {
    console.error('Toggle resubmit error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
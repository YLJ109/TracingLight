import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import { gradingTask, auditLog } from '@/storage/database/shared/schema';

const REPAIRABLE = ['pending', 'processing', 'failed'];

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const taskId = Number(body.task_id);
    const action: 'retry' | 'force_complete' = body.action;
    const forceScore = body.force_score === undefined ? undefined : Number(body.force_score);
    const remark = body.remark ? String(body.remark) : undefined;

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: '缺少有效的 task_id' }, { status: 400 });
    }
    if (action !== 'retry' && action !== 'force_complete') {
      return NextResponse.json({ error: 'action 必须是 retry 或 force_complete' }, { status: 400 });
    }

    const rows = db.select().from(gradingTask).where(eq(gradingTask.id, taskId)).all();
    if (rows.length === 0) return NextResponse.json({ error: '批改任务不存在' }, { status: 404 });
    const task = rows[0];

    // 已完成/已过期的任务不允许再修复，避免重复审计与误覆盖
    if (task.status === 'completed') {
      return NextResponse.json({ error: '该任务已完成，无需修复' }, { status: 409 });
    }
    if (!REPAIRABLE.includes(String(task.status))) {
      return NextResponse.json({ error: `当前状态 ${task.status} 不可修复` }, { status: 409 });
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let toStatus = 'completed';
    let detail = '';

    if (action === 'force_complete') {
      // 校验分数区间
      if (forceScore !== undefined) {
        if (!Number.isFinite(forceScore) || forceScore < 0 || forceScore > (task.full_score || 100)) {
          return NextResponse.json({ error: `强制分数需在 0~${task.full_score || 100} 之间` }, { status: 400 });
        }
      }
      const score = forceScore !== undefined ? forceScore : (task.total_score ?? 0);
      db.update(gradingTask)
        .set({ status: 'completed', total_score: score, error_message: null, completed_at: now })
        .where(eq(gradingTask.id, taskId))
        .run();
      toStatus = 'completed';
      detail = `force_complete 原${task.status}→completed 分=${score}${remark ? ` 备注:${remark}` : ''}`;
    } else {
      // retry：重置为 pending，计数+1，清理错误信息（交由批改服务重新处理）
      db.update(gradingTask)
        .set({
          status: 'pending',
          retry_count: (task.retry_count || 0) + 1,
          error_message: null,
          completed_at: null,
        })
        .where(eq(gradingTask.id, taskId))
        .run();
      toStatus = 'pending';
      detail = `retry 原${task.status}→pending 重试第${(task.retry_count || 0) + 1}次${remark ? ` 备注:${remark}` : ''}`;
    }

    db.insert(auditLog).values({
      operator_id: authUser.userId,
      operator_name: authUser.username,
      action: 'repair_grading_task',
      target_type: 'grading_task',
      target_id: String(taskId),
      detail,
    }).run();
    saveDb();

    return NextResponse.json({ success: true, taskId, toStatus });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Repair grading task error:', e);
    return NextResponse.json({ error: '修复批改任务失败' }, { status: 500 });
  }
}
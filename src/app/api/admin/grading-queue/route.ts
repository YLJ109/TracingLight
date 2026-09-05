import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, count } from 'drizzle-orm';
import { gradingTask, user, assignment, question, course } from '@/storage/database/shared/schema';

const STUCK_MINUTES = 10; // processing 超过该时长视为卡住

function toDate(s?: string | null): Date {
  if (!s) return new Date(0);
  // CURRENT_TIMESTAMP 形如 "YYYY-MM-DD HH:MM:SS"，补成可解析格式
  const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20));

    // 状态统计
    const statusGroups = db
      .select({ status: gradingTask.status, c: count() })
      .from(gradingTask)
      .groupBy(gradingTask.status)
      .all();
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, stuck: 0 };
    const statusMap: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {
      pending: 'pending', processing: 'processing', completed: 'completed', failed: 'failed',
    };
    for (const g of statusGroups) {
      const k = g.status ? statusMap[g.status] : undefined;
      if (k) stats[k] = g.c;
    }

    // 卡住：processing 且创建时间超过阈值
    const processingRows = db
      .select({ created_at: gradingTask.created_at })
      .from(gradingTask)
      .where(eq(gradingTask.status, 'processing'))
      .all();
    const cutoff = Date.now() - STUCK_MINUTES * 60 * 1000;
    for (const r of processingRows) {
      if (toDate(r.created_at).getTime() < cutoff) stats.stuck += 1;
    }

    // 近 7 天趋势（按创建日期聚合 pending/completed）
    const dayKeys: string[] = [];
    const nowDay = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowDay.getFullYear(), nowDay.getMonth(), nowDay.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const dayFill: Record<string, { pending: number; completed: number }> = {};
    for (const k of dayKeys) dayFill[k] = { pending: 0, completed: 0 };
    const allTasks = db.select({ status: gradingTask.status, created_at: gradingTask.created_at }).from(gradingTask).all();
    for (const t of allTasks) {
      const k = toDate(t.created_at).toISOString().slice(0, 10);
      if (!dayFill[k]) continue;
      if (t.status === 'pending') dayFill[k].pending += 1;
      if (t.status === 'completed') dayFill[k].completed += 1;
    }
    const overTimeTrend = dayKeys.map((k) => ({
      date: k,
      pending: dayFill[k].pending,
      completed: dayFill[k].completed,
    }));

    // 明细（联表取可读信息）
    const query = db
      .select({
        id: gradingTask.id,
        studentName: user.real_name,
        assignmentTitle: assignment.title,
        questionId: gradingTask.question_id,
        questionContent: question.content,
        courseName: course.name,
        questionType: gradingTask.question_type,
        totalScore: gradingTask.total_score,
        fullScore: gradingTask.full_score,
        status: gradingTask.status,
        retryCount: gradingTask.retry_count,
        errorMessage: gradingTask.error_message,
        createdAt: gradingTask.created_at,
        completedAt: gradingTask.completed_at,
      })
      .from(gradingTask)
      .leftJoin(user, eq(gradingTask.student_id, user.id))
      .leftJoin(assignment, eq(gradingTask.assignment_id, assignment.id))
      .leftJoin(question, eq(gradingTask.question_id, question.id))
      .leftJoin(course, eq(question.course_id, course.id))
      .orderBy(desc(gradingTask.id));

    const withStatus = status ? query.where(eq(gradingTask.status, status)) : query;
    const total = withStatus.all().length;
    const list = withStatus.limit(pageSize).offset((page - 1) * pageSize).all();

    return NextResponse.json({
      success: true,
      stats,
      overTimeTrend,
      list: list.map((r) => ({
        ...r,
        questionContent: r.questionContent ? r.questionContent.slice(0, 60) : '',
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get grading queue error:', e);
    return NextResponse.json({ error: '获取批改队列失败' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { assignment, user, answerMonitor, answer as answerTable } from '@/storage/database/shared/schema';
import { getTeacherClassIds, isStudentInTeacherScope } from '@/lib/teacher-scope';

/**
 * 作业监控面板数据（阶段3·防作弊）：
 * 返回每名授课学生的作答行为采集（复制/粘贴/切屏/用时/粘贴追溯）与系统判疑，
 * 并按课时等效/相似度上下文给老师复核参考。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const assignmentId = parseInt(id);

    const asgn = (await db.select().from(assignment).where(eq(assignment.id, assignmentId)).limit(1).execute())[0] || null;
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    if (asgn.teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }

    const monitorConfig = (asgn.monitor_config as Record<string, unknown> | null) || {};

    // 授课学生
    const classIds = await getTeacherClassIds(authUser.userId);
    const studentFilters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classIds.length > 0) studentFilters.push(inArray(user.class_id, classIds));
    const students = await db.select({ id: user.id, real_name: user.real_name, student_level: user.student_level })
      .from(user).where(and(...studentFilters)).execute();

    // 已交监控
    const monitors = await db.select()
      .from(answerMonitor)
      .where(eq(answerMonitor.assignment_id, assignmentId))
      .execute();
    const monitorByStudent = new Map(monitors.map((m) => [m.student_id, m]));

    // 是否已提交
    const submitted = await db.select({ student_id: answerTable.student_id })
      .from(answerTable)
      .where(and(eq(answerTable.assignment_id, assignmentId), eq(answerTable.is_submitted, true)))
      .execute();
    const submittedSet = new Set(submitted.map((a) => a.student_id));

    const rows = students.map((s) => {
      const mon = monitorByStudent.get(s.id);
      const pasteRecords = (mon?.paste_records as Array<{ questionId: number; preview: string; at: string }> | null) || [];
      return {
        studentId: s.id,
        studentName: s.real_name,
        studentLevel: s.student_level,
        submitted: submittedSet.has(s.id),
        monitor: mon ? {
          copy_count: mon.copy_count ?? 0,
          paste_count: mon.paste_count ?? 0,
          blur_count: mon.blur_count ?? 0,
          blur_seconds: mon.blur_seconds ?? 0,
          time_spent_seconds: mon.time_spent_seconds ?? 0,
          paste_records: pasteRecords,
          suspicious_flag: !!mon.suspicious_flag,
          suspicious_reason: mon.suspicious_reason || null,
          snapshot: mon.monitor_snapshot,
        } : null,
      };
    }).sort((a, b) => {
      // 可疑优先、其余按姓名
      const af = a.monitor?.suspicious_flag ? 0 : 1;
      const bf = b.monitor?.suspicious_flag ? 0 : 1;
      return af - bf || a.studentName.localeCompare(b.studentName, 'zh');
    });

    return NextResponse.json({
      success: true,
      data: {
        assignment_id: assignmentId,
        monitor_config: monitorConfig,
        rows,
        suspicious_count: rows.filter((r) => r.monitor?.suspicious_flag).length,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get monitor error:', e);
    return NextResponse.json({ error: '获取监控数据失败' }, { status: 500 });
  }
}
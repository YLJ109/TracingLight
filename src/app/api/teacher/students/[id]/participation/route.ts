import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { isStudentInTeacherScope } from '@/lib/teacher-scope';
import { parseIntSafe, validationErrorResponse } from '@/lib/validation';
import { computeParticipationScore } from '@/services/participation.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const parsed = parseIntSafe(id);
    if (!parsed.valid) return validationErrorResponse(parsed.error!);
    const studentId = parsed.value!;

    // 跨租户隔离：仅允许查看自己授课范围内的学生
    if (!await isStudentInTeacherScope(authUser.userId, studentId)) {
      return NextResponse.json({ error: '学生不在您的授课范围内' }, { status: 403 });
    }

    const score = await computeParticipationScore(studentId);
    return NextResponse.json({ success: true, data: score });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get participation score error:', e);
    return NextResponse.json({ error: '获取平时表现失败' }, { status: 500 });
  }
}
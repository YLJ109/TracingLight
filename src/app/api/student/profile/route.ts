import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { generateStudentData } from '@/lib/mock-data-generator';
import { user, gradingTask, assignment } from '@/storage/database/shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const studentId = parseInt(searchParams.get('student_id') || '0');
    if (!studentId || isNaN(studentId)) {
      return NextResponse.json({ error: '无效的学生ID' }, { status: 400 });
    }

    // Get student info
    const studentRows = db.select()
      .from(user)
      .where(eq(user.id, studentId))
      .limit(1)
      .all();
    const student = studentRows[0] || null;

    // Generate rich mock data based on student profile
    const mockData = generateStudentData(studentId);

    // Get grading stats from DB (for actual assignment count)
    const completedAssignmentsResult = db.select({ count: sql<number>`count(*)` })
      .from(gradingTask)
      .where(and(
        eq(gradingTask.student_id, studentId),
        eq(gradingTask.status, 'completed')
      ))
      .all();
    const completedAssignments = completedAssignmentsResult[0]?.count || 0;

    const totalAssignmentsResult = db.select({ count: sql<number>`count(*)` })
      .from(assignment)
      .all();
    const totalAssignments = totalAssignmentsResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      data: {
        student,
        // Core indicators (from mock engine, with boundary enforcement)
        indicators: mockData.indicators,
        // 8-dimension radar
        radarData: mockData.radarData,
        // Knowledge stats
        knowledgeStats: mockData.knowledgeStats,
        // Weak points TOP10
        weakTop10: mockData.weakTop10,
        // Error data
        errorData: mockData.errorData,
        // Trend
        trendData: mockData.trendData,
        // Course comparison
        courseComparison: mockData.courseComparison,
        // Exam schedule
        examSchedule: mockData.examSchedule,
        // Assignment counts from DB
        completedAssignments: completedAssignments || 0,
        totalAssignments: totalAssignments || 0,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student profile error:', e);
    return NextResponse.json({ error: '获取学情数据失败' }, { status: 500 });
  }
}

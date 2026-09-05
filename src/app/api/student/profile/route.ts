import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { generateStudentData } from '@/lib/mock-data-generator';
import { user, gradingTask, assignment, course, knowledgeMasteryLog, knowledgePoint, errorBook } from '@/storage/database/shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = authUser.userId;
    const courseId = searchParams.get('course_id') ? parseInt(searchParams.get('course_id')!) : null;

    // Get student info
    const studentRows = db.select()
      .from(user)
      .where(eq(user.id, studentId))
      .limit(1)
      .all();
    const student = studentRows[0] || null;

    // 课程列表（供筛选下拉）
    const courses = db.select({ id: course.id, name: course.name }).from(course).all();

    // Generate rich mock data based on student profile
    const mockData = generateStudentData(studentId);

    // ============ 真实数据覆盖（全部维度）：平均分 + 薄弱知识点 ============
    const allGradings = db.select({ total_score: gradingTask.total_score, full_score: gradingTask.full_score })
      .from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const realTotalScore = allGradings.reduce((s, g) => s + (g.total_score || 0), 0);
    const realTotalFull = allGradings.reduce((s, g) => s + (g.full_score || 0), 0);
    const realAvgScore = realTotalFull > 0 ? Math.round((realTotalScore / realTotalFull) * 1000) / 10 : 0;

    // 真实薄弱知识点（每个知识点取最新掌握度，<70 视为薄弱）
    const allMastery = db.select({ knowledge_point_id: knowledgeMasteryLog.knowledge_point_id, mastery_rate: knowledgeMasteryLog.mastery_rate })
      .from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, studentId))
      .all();
    const kpMasteryMap = new Map<number, number>();
    for (const m of allMastery) kpMasteryMap.set(m.knowledge_point_id, m.mastery_rate);
    const weakEntries = [...kpMasteryMap.entries()]
      .filter(([, rate]) => rate < 70)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10);
    // 批量查询知识点名，消除 N+1
    const weakKpIds = weakEntries.map(([kpId]) => kpId);
    const kpNameMap = new Map<number, string>();
    if (weakKpIds.length > 0) {
      const kpRows = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, weakKpIds))
        .all();
      for (const r of kpRows) kpNameMap.set(r.id, r.name);
    }
    const realWeakKps = weakEntries.map(([kpId, rate]) => ({
      name: kpNameMap.get(kpId) || `知识点${kpId}`,
      masteryRate: rate,
    }));

    // 用真实数据覆盖 indicators 的 avgScore / totalErrors，weakTop10
    const indicators = mockData.indicators.map((ind: any) => {
      if (ind.key === 'avgScore') return { ...ind, value: realAvgScore };
      return ind;
    });
    const weakTop10 = realWeakKps.length > 0
      ? realWeakKps.map((w) => ({ name: w.name, priority: '重点', masteryRate: w.masteryRate, lossWeight: 0 }))
      : mockData.weakTop10;

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

    // ============ 课程维度真实学情（按课程筛选） ============
    let courseData = null;
    if (courseId) {
      const courseAssignments = db.select({ id: assignment.id, title: assignment.title, end_time: assignment.end_time })
        .from(assignment)
        .where(eq(assignment.course_id, courseId))
        .all();
      const assignmentIds = courseAssignments.map((a) => a.id);

      let courseGradings: any[] = [];
      if (assignmentIds.length > 0) {
        courseGradings = db.select().from(gradingTask)
          .where(and(
            eq(gradingTask.student_id, studentId),
            inArray(gradingTask.assignment_id, assignmentIds),
            eq(gradingTask.status, 'completed'),
          ))
          .all();
      }

      const totalScore = courseGradings.reduce((s, g) => s + (g.total_score || 0), 0);
      const totalFull = courseGradings.reduce((s, g) => s + (g.full_score || 0), 0);
      const avgScore = totalFull > 0 ? Math.round((totalScore / totalFull) * 1000) / 10 : 0;
      const completedCount = new Set(courseGradings.map((g) => g.assignment_id)).size;

      // 该课程的知识点掌握度
      const courseKps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(eq(knowledgePoint.course_id, courseId))
        .all();
      const courseKpIds = courseKps.map((k) => k.id);
      let masteryList: any[] = [];
      if (courseKpIds.length > 0) {
        masteryList = db.select().from(knowledgeMasteryLog)
          .where(and(
            eq(knowledgeMasteryLog.student_id, studentId),
            inArray(knowledgeMasteryLog.knowledge_point_id, courseKpIds),
          ))
          .all();
      }
      const avgMastery = masteryList.length > 0
        ? Math.round(masteryList.reduce((s, m) => s + (m.mastery_rate || 0), 0) / masteryList.length)
        : 0;
      const weakKps = masteryList
        .filter((m) => (m.mastery_rate || 0) < 70)
        .map((m) => ({ name: courseKps.find((k) => k.id === m.knowledge_point_id)?.name || `知识点${m.knowledge_point_id}`, masteryRate: m.mastery_rate }))
        .sort((a, b) => a.masteryRate - b.masteryRate)
        .slice(0, 8);

      // 成绩趋势（该课程作业，按时间）
      const trend = courseAssignments
        .filter((a) => courseGradings.some((g) => g.assignment_id === a.id))
        .sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime())
        .map((a) => {
          const gs = courseGradings.filter((g) => g.assignment_id === a.id);
          const sc = gs.reduce((s, g) => s + (g.total_score || 0), 0);
          const fl = gs.reduce((s, g) => s + (g.full_score || 0), 0);
          return { week: a.title.slice(0, 8), avgScore: fl > 0 ? Math.round((sc / fl) * 100) : 0 };
        });

      courseData = {
        courseName: courses.find((c) => c.id === courseId)?.name || '',
        avgScore,
        completedCount,
        avgMastery,
        weakKps,
        trend,
      };
    }

    // ============ 真实成绩趋势 + 课程对比（替换 mock） ============
    const allAssignments = db.select({ id: assignment.id, end_time: assignment.end_time, title: assignment.title })
      .from(assignment).all();
    const asgnMap = new Map(allAssignments.map((a) => [a.id, a]));

    // 成绩趋势：按作业聚合（真实批改成绩），取最近 7 次
    const trendGradings = db.select({
      assignment_id: gradingTask.assignment_id,
      total_score: gradingTask.total_score,
      full_score: gradingTask.full_score,
    }).from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const byAssignment = new Map<number, { ts: number; tf: number }>();
    for (const g of trendGradings) {
      const cur = byAssignment.get(g.assignment_id) || { ts: 0, tf: 0 };
      cur.ts += g.total_score || 0;
      cur.tf += g.full_score || 0;
      byAssignment.set(g.assignment_id, cur);
    }
    const realTrendData = [...byAssignment.entries()]
      .map(([aid, v]) => ({ aid, ...v, end_time: asgnMap.get(aid)?.end_time || '' }))
      .sort((a, b) => a.end_time.localeCompare(b.end_time))
      .slice(-7)
      .map((v) => ({
        week: (asgnMap.get(v.aid)?.title || '').slice(0, 8),
        avgScore: v.tf > 0 ? Math.round((v.ts / v.tf) * 100) : 0,
        completionRate: 100,
        errorCount: 0,
      }));

    // 课程对比：按课程聚合真实掌握度 + 平均分 + 错题数
    const allCourses = db.select({ id: course.id, name: course.name, short_name: course.short_name })
      .from(course).all();
    const realCourseComparison = allCourses.map((c) => {
      const cAssignments = db.select({ id: assignment.id }).from(assignment).where(eq(assignment.course_id, c.id)).all();
      const cAssignmentIds = cAssignments.map((a) => a.id);
      let avgScore = 0;
      if (cAssignmentIds.length > 0) {
        const cGradings = db.select({ total_score: gradingTask.total_score, full_score: gradingTask.full_score })
          .from(gradingTask)
          .where(and(eq(gradingTask.student_id, studentId), inArray(gradingTask.assignment_id, cAssignmentIds)))
          .all();
        const ts = cGradings.reduce((s, g) => s + (g.total_score || 0), 0);
        const tf = cGradings.reduce((s, g) => s + (g.full_score || 0), 0);
        avgScore = tf > 0 ? Math.round((ts / tf) * 100) : 0;
      }
      const cKps = db.select({ id: knowledgePoint.id }).from(knowledgePoint).where(eq(knowledgePoint.course_id, c.id)).all();
      const cKpIds = cKps.map((k) => k.id);
      let avgMastery = 0;
      let errorCount = 0;
      if (cKpIds.length > 0) {
        const cMastery = db.select({ mastery_rate: knowledgeMasteryLog.mastery_rate })
          .from(knowledgeMasteryLog)
          .where(and(eq(knowledgeMasteryLog.student_id, studentId), inArray(knowledgeMasteryLog.knowledge_point_id, cKpIds)))
          .all();
        avgMastery = cMastery.length > 0
          ? Math.round(cMastery.reduce((s, m) => s + (m.mastery_rate || 0), 0) / cMastery.length)
          : 0;
        const cErrors = db.select({ id: errorBook.id })
          .from(errorBook)
          .where(and(eq(errorBook.student_id, studentId), inArray(errorBook.knowledge_point_id, cKpIds)))
          .all();
        errorCount = cErrors.length;
      }
      return { courseId: c.id, name: c.name, shortName: c.short_name || c.name, avgMastery, kpCount: cKpIds.length, errorCount };
    });

    return NextResponse.json({
      success: true,
      data: {
        student,
        courses,
        selectedCourseId: courseId,
        // Core indicators (真实 avgScore 覆盖 mock)
        indicators,
        // 8-dimension radar
        radarData: mockData.radarData,
        // Knowledge stats
        knowledgeStats: mockData.knowledgeStats,
        // Weak points TOP10（真实薄弱知识点覆盖）
        weakTop10,
        // Error data
        errorData: mockData.errorData,
        // Trend（真实成绩趋势）
        trendData: realTrendData.length > 0 ? realTrendData : mockData.trendData,
        // Course comparison（真实课程对比）
        courseComparison: realCourseComparison.some((c) => c.avgMastery > 0 || c.errorCount > 0) ? realCourseComparison : mockData.courseComparison,
        // Exam schedule
        examSchedule: mockData.examSchedule,
        // Assignment counts from DB
        completedAssignments: completedAssignments || 0,
        totalAssignments: totalAssignments || 0,
        // 课程维度真实学情
        courseData,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student profile error:', e);
    return NextResponse.json({ error: '获取学情数据失败' }, { status: 500 });
  }
}

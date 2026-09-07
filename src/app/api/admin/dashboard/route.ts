import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, gte, inArray, sql } from 'drizzle-orm';
import {
  user, course, assignment, gradingTask, knowledgeMasteryLog,
  knowledgePoint, signInRecord, learningBehaviorLog,
} from '@/storage/database/shared/schema';

/**
 * 教务数据大屏（P3）
 * 管理端实时聚合：注册/活跃/作业完成率/平均掌握度/掌握度分布/课程对比/签到热力图/活跃趋势。
 * 全部真实数据，无 mock。
 */
function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const today = todayStr();

    // ===== 顶层指标 =====
    const totalStudents = Number(
      db.select({ c: sql<number>`count(*)` }).from(user)
        .where(and(eq(user.role, 'student'), eq(user.is_active, true))).all()[0]?.c ?? 0
    );
    const totalTeachers = Number(
      db.select({ c: sql<number>`count(*)` }).from(user)
        .where(and(eq(user.role, 'teacher'), eq(user.is_active, true))).all()[0]?.c ?? 0
    );
    const totalCourses = Number(db.select({ c: sql<number>`count(*)` }).from(course).all()[0]?.c ?? 0);
    const totalAssignments = Number(db.select({ c: sql<number>`count(*)` }).from(assignment).all()[0]?.c ?? 0);

    // 今日活跃：今日签到 + 今日{ learner behavior }人数
    const todaySigners = db.select({ userId: signInRecord.user_id })
      .from(signInRecord).where(eq(signInRecord.sign_date, today)).all();
    const todayActiveSet = new Set<number>(todaySigners.map((s) => s.userId));
    const behaviorToday = db.select({ student_id: learningBehaviorLog.student_id })
      .from(learningBehaviorLog).where(sql`date(${learningBehaviorLog.last_watched_at}) = date(${today})`).all();
    behaviorToday.forEach((b) => todayActiveSet.add(b.student_id));
    const todayActive = todayActiveSet.size;

    // ===== 作业完成率 =====
    const submittedStudents = db.select({ sid: sql<string>`count(distinct ${gradingTask.student_id})` })
      .from(gradingTask).where(eq(gradingTask.status, 'completed')).all()[0];
    const completedTasks = Number(
      db.select({ c: sql<number>`count(*)` }).from(gradingTask)
        .where(eq(gradingTask.status, 'completed')).all()[0]?.c ?? 0
    );

    // ===== 掌握度（全部记录平均 + 分布） =====
    const masteryRows = db.select({
      kp_id: knowledgeMasteryLog.knowledge_point_id,
      rate: knowledgeMasteryLog.mastery_rate,
    }).from(knowledgeMasteryLog).all();
    const totalMastery = masteryRows.length;
    const avgMastery = totalMastery > 0
      ? Math.round(masteryRows.reduce((s, m) => s + (m.rate || 0), 0) / totalMastery) : 0;
    const strong = masteryRows.filter((m) => (m.rate || 0) >= 80).length;
    const medium = masteryRows.filter((m) => (m.rate || 0) >= 60 && (m.rate || 0) < 80).length;
    const weak = masteryRows.filter((m) => (m.rate || 0) < 60).length;

    // ===== 课程掌握度对比 =====
    const courses = db.select({ id: course.id, name: course.name, short_name: course.short_name })
      .from(course).all();
    const kpByCourse = db.select({ id: knowledgePoint.id, course_id: knowledgePoint.course_id })
      .from(knowledgePoint).all();
    const courseKpMap = new Map<number, number[]>();
    kpByCourse.forEach((k) => {
      const arr = courseKpMap.get(k.course_id) || [];
      arr.push(k.id);
      courseKpMap.set(k.course_id, arr);
    });
    const masteryFine = new Map<number, { sum: number; count: number }>();
    masteryRows.forEach((m) => {
      const found = kpByCourse.find((k) => k.id === m.kp_id);
      if (!found) return;
      const acc = masteryFine.get(found.course_id) || { sum: 0, count: 0 };
      acc.sum += m.rate || 0; acc.count += 1;
      masteryFine.set(found.course_id, acc);
    });
    const courseComparison = courses.map((c) => {
      const acc = masteryFine.get(c.id) || { sum: 0, count: 0 };
      return {
        name: c.short_name || c.name,
        avgMastery: acc.count > 0 ? Math.round(acc.sum / acc.count) : 0,
        kpCount: (courseKpMap.get(c.id) || []).length,
      };
    }).filter((c) => c.kpCount > 0);

    // ===== 近7天签到热力图/活跃趋势 =====
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(fmtDate(d));
    }
    const signRows = db.select({
      sign_date: signInRecord.sign_date,
      userId: signInRecord.user_id,
    }).from(signInRecord).where(gte(signInRecord.sign_date, days[0])).all();
    const signByDay = new Map<string, Set<number>>();
    signRows.forEach((s) => {
      if (!signByDay.has(s.sign_date)) signByDay.set(s.sign_date, new Set());
      signByDay.get(s.sign_date)!.add(s.userId);
    });
    const signHeatmap = days.map((d) => ({
      date: d.slice(5),
      count: signByDay.get(d)?.size || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        updatedAt: new Date().toISOString(),
        cards: {
          totalStudents, totalTeachers, totalCourses, totalAssignments,
          todayActive, completedTasks,
          avgMastery, masteryPoints: totalMastery,
        },
        submissionRate: totalStudents > 0
          ? Math.min(100, Math.round((submittedStudents?.sid ? Number(submittedStudents.sid) : 0) / totalStudents * 100))
          : 0,
        masteryDist: {
          strong: Math.round((strong / Math.max(totalMastery, 1)) * 100),
          medium: Math.round((medium / Math.max(totalMastery, 1)) * 100),
          weak: Math.round((weak / Math.max(totalMastery, 1)) * 100),
          strongCount: strong, mediumCount: medium, weakCount: weak,
        },
        courseComparison,
        signHeatmap,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('dashboard error:', e);
    return NextResponse.json({ error: '获取大屏数据失败' }, { status: 500 });
  }
}
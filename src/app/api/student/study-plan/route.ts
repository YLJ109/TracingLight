import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { generateStudentData } from "@/lib/mock-data-generator";
import { studyPlan, studentSchedule, examSchedule } from "@/storage/database/shared/schema";
import { eq, and, gte, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = user.userId;

    const db = getDb();
    const mockData = generateStudentData(studentId);

    // Get DB study plans（查今天及未来的全部计划，含已完成，用于准确的完成统计）
    const today = new Date().toISOString().split("T")[0];
    const allPlans = db.select()
      .from(studyPlan)
      .where(and(
        eq(studyPlan.student_id, studentId),
        gte(studyPlan.plan_date, today)
      ))
      .orderBy(asc(studyPlan.plan_date), asc(studyPlan.time_slot))
      .all();
    // 日程展示仍以「未完成」任务为主（与原逻辑一致）；统计则在含已完成的完整数据上计算
    const plans = allPlans.filter((p) => p.status === "pending");

    // Group by date
    const dayMap = new Map<string, { day: string; date: string; sessions: any[] }>();
    const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    plans.forEach((p) => {
      const dateStr = p.plan_date;
      if (!dateStr) return;
      if (!dayMap.has(dateStr)) {
        const d = new Date(dateStr);
        const dayName = dayNames[d.getDay()];
        dayMap.set(dateStr, {
          day: `${dayName} ${dateStr.slice(5)}`,
          date: dateStr,
          sessions: [],
        });
      }
      dayMap.get(dateStr)!.sessions.push({
        time: p.time_slot || "",
        topic: `${p.subject || ""} - ${(p.content || "").slice(0, 25)}`,
        type: p.plan_type || "review",
        kp: p.subject || "",
        priority: p.plan_type === "review" ? "P0" : p.plan_type === "practice" ? "P1" : "P2",
        resources: p.content || p.subject || "",
        duration: p.duration_minutes || 45,
        completed: p.status === "completed",
      });
    });

    // Get schedules from DB
    const schedules = db.select()
      .from(studentSchedule)
      .where(eq(studentSchedule.student_id, studentId))
      .all();

    // Get exams from DB
    const exams = db.select()
      .from(examSchedule)
      .orderBy(asc(examSchedule.exam_date))
      .limit(5)
      .all();

    return NextResponse.json({
      success: true,
      data: {
        plans: Array.from(dayMap.values()),
        // AI-generated study plan from mock data
        aiStudyPlan: mockData.studyPlan,
        // Weak knowledge points
        weakKnowledgePoints: mockData.weakTop10.map(w => ({
          name: w.name,
          mastery: w.masteryRate,
        })),
        schedules: schedules || [],
        exams: exams || [],
        generatedAt: plans[0]?.generated_at || null,
        totalSessions: allPlans?.length || 0,
        completedSessions: allPlans?.filter((p) => p.status === "completed").length || 0,
      },
    });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

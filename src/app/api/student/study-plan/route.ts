import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { studyPlan, studentSchedule, examSchedule, knowledgePoint, knowledgeMasteryLog } from "@/storage/database/shared/schema";
import { eq, and, gte, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = user.userId;

    const db = getDb();

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

    // 计划内容对接到真实知识点（用于跳转时精准定位错题/材料）
    const kpRows = db.select({ id: knowledgePoint.id, name: knowledgePoint.name, course_id: knowledgePoint.course_id })
      .from(knowledgePoint).all();
    const kpNameToId = new Map<string, { id: number; courseId: number }>();
    for (const k of kpRows) {
      if (k.name && !kpNameToId.has(k.name)) kpNameToId.set(k.name, { id: k.id, courseId: k.course_id });
    }
    const matchKp = (text: string) => {
      for (const [name, v] of kpNameToId.entries()) {
        if (text.includes(name)) return { id: v.id, name, courseId: v.courseId };
      }
      return null;
    };

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
      const matched = matchKp(`${p.subject || ''} ${p.content || ''}`);
      dayMap.get(dateStr)!.sessions.push({
        time: p.time_slot || "",
        topic: `${p.subject || ""} - ${(p.content || "").slice(0, 25)}`,
        type: p.plan_type || "review",
        kp: matched ? matched.name : (p.subject || ""),
        knowledgePointId: matched ? matched.id : (kpNameToId.get(p.subject || "")?.id ?? null),
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

    // 真实薄弱知识点：每个知识点取最新掌握度，<70 按薄弱，升序取前 10
    const masteryRows = db.select({
      knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
      recorded_at: knowledgeMasteryLog.recorded_at,
    }).from(knowledgeMasteryLog).where(eq(knowledgeMasteryLog.student_id, studentId)).all();
    const latestMastery = new Map<number, number>();
    const masteryAt = new Map<number, string>();
    for (const m of masteryRows) {
      if (!latestMastery.has(m.knowledge_point_id) || (m.recorded_at || '') >= (masteryAt.get(m.knowledge_point_id) || '')) {
        latestMastery.set(m.knowledge_point_id, m.mastery_rate);
        masteryAt.set(m.knowledge_point_id, m.recorded_at || '');
      }
    }
    const kpIdToName = new Map(kpRows.map((k) => [k.id, k.name]));
    const weakKnowledgePoints = [...latestMastery.entries()]
      .filter(([, rate]) => rate < 70)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10)
      .map(([kpId, rate]) => ({ name: kpIdToName.get(kpId) || `知识点${kpId}`, mastery: rate }));

    return NextResponse.json({
      success: true,
      data: {
        plans: Array.from(dayMap.values()),
        weakKnowledgePoints,
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

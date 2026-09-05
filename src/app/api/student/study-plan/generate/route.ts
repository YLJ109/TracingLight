import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { createAIClient, aiErrorResponse, invokeStructured } from "@/lib/ai/client";
import { studentSchedule, knowledgeMasteryLog, knowledgePoint, examSchedule, user, studyPlan } from "@/storage/database/shared/schema";
import { eq, and, gte, desc, asc } from "drizzle-orm";

interface StudyPlanItem {
  day: string;
  date: string;
  timeSlot: string;
  subject: string;
  content: string;
  duration: number;
  type: "review" | "practice" | "preview" | "rest";
}

interface StudyPlanResult {
  weeklyPlan: StudyPlanItem[];
  focusAreas: string[];
  tips: string[];
}

const PLAN_SYSTEM_PROMPT = `你是溯光智慧教育平台的学习规划智能体，为大学生生成个性化学习计划。

【要求】
1. 根据学生课表和个人安排，避开已占用时间段
2. 优先安排薄弱知识点的复习和练习
3. 每天安排2-3个学习时段，每个时段30-90分钟
4. 周末适当增加学习量，但保留休息时间
5. 结合考试安排，考前增加相关科目复习时间
6. 学习计划要具体到知识点，不能笼统

【输出格式】严格输出JSON：
{
  "weeklyPlan": [
    {
      "day": "周一",
      "date": "2026-07-27",
      "timeSlot": "14:00-15:30",
      "subject": "Python程序设计",
      "content": "复习变量与数据类型，完成5道练习题",
      "duration": 90,
      "type": "review"
    }
  ],
  "focusAreas": ["重点复习领域1", "重点复习领域2"],
  "tips": ["学习建议1", "学习建议2"]
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { course_id } = body;
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getDb();
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const sid = authUser.userId;
    const cid = course_id ? parseInt(course_id) : 1;

    // 1. 获取学生课表
    const schedules = db.select()
      .from(studentSchedule)
      .where(eq(studentSchedule.student_id, sid))
      .all();

    // 2. 获取薄弱知识点
    const masteryLogs = db.select({
      knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
    })
      .from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, sid))
      .orderBy(desc(knowledgeMasteryLog.recorded_at))
      .all();

    const weakKps: string[] = [];
    if (masteryLogs.length > 0) {
      const seen = new Set<number>();
      for (const m of masteryLogs) {
        if (!seen.has(m.knowledge_point_id) && (m.mastery_rate || 0) < 70) {
          seen.add(m.knowledge_point_id);
          // Look up knowledge point name
          const kpRow = db.select({ name: knowledgePoint.name })
            .from(knowledgePoint)
            .where(eq(knowledgePoint.id, m.knowledge_point_id))
            .limit(1)
            .all();
          weakKps.push(kpRow[0]?.name || `知识点${m.knowledge_point_id}`);
        }
      }
    }

    // 3. 获取考试安排
    const today = new Date().toISOString().split("T")[0];
    const exams = db.select()
      .from(examSchedule)
      .where(and(
        eq(examSchedule.class_id, cid),
        gte(examSchedule.exam_date, today)
      ))
      .orderBy(asc(examSchedule.exam_date))
      .all();

    // 4. 获取学生信息
    const studentRows = db.select({ real_name: user.real_name })
      .from(user)
      .where(eq(user.id, sid))
      .limit(1)
      .all();
    const student = studentRows[0] || null;

    // 5. 调用AI生成学习计划
    const busySlots = schedules?.map((s) => ({
      day: s.day_of_week,
      time: `${s.start_time}-${s.end_time}`,
      title: s.title,
      type: s.schedule_type,
    })) || [];

    const examInfo = exams?.map((e) => ({
      subject: e.exam_name,
      date: e.exam_date,
      time: e.start_time || "待定",
    })) || [];

    const userPrompt = `请为${student?.real_name || "学生"}生成一周个性化学习计划：

【已占用时间段（不可安排学习）】
${JSON.stringify(busySlots, null, 2)}

【薄弱知识点（需重点复习）】
${weakKps.join("、") || "暂无数据"}

【近期考试安排】
${JSON.stringify(examInfo, null, 2)}

【要求】
- 从明天（${new Date(Date.now() + 86400000).toISOString().split("T")[0]}）开始排7天
- 避开所有已占用时间段
- 每天学习总时长不超过4小时
- 周末保留至少半天休息时间
- 薄弱知识点优先安排在精力最好的时段（上午9-11点或下午2-4点）
- 每学习45-60分钟安排5-10分钟休息

请严格按照JSON格式输出学习计划。`;

    const client = createAIClient();
    const plan = await invokeStructured<StudyPlanResult>(client, PLAN_SYSTEM_PROMPT, userPrompt, 0.5);

    // 修正日期：AI 返回的日期不可靠，强制映射为「明天开始的连续 N 天」
    const uniqueDates = [...new Set((plan.weeklyPlan || []).map((item) => item.date))];
    const dateMap = new Map<string, string>();
    uniqueDates.forEach((_, i) => {
      const d = new Date(Date.now() + (i + 1) * 86400000);
      dateMap.set(uniqueDates[i], d.toISOString().split('T')[0]);
    });

    // 6. 保存到数据库
    if (plan.weeklyPlan?.length > 0) {
      const planItems = plan.weeklyPlan.map((item) => ({
        student_id: sid,
        course_id: cid,
        plan_name: `${item.subject} - ${item.content?.slice(0, 30) || item.timeSlot}`,
        plan_date: dateMap.get(item.date) || item.date,
        time_slot: item.timeSlot,
        subject: item.subject,
        content: item.content,
        duration_minutes: item.duration,
        plan_type: item.type,
        status: "pending",
        is_ai_generated: true,
      }));

      db.transaction(() => {
        db.insert(studyPlan).values(planItems).run();
      });
      saveDb();
    }

    return NextResponse.json({
      success: true,
      data: {
        weeklyPlan: (plan.weeklyPlan || []).map((item) => ({
          plan_date: dateMap.get(item.date) || item.date,
          time_slot: item.timeSlot,
          subject: item.subject,
          content: item.content,
          duration_minutes: item.duration,
          plan_type: item.type,
          status: "pending",
          is_ai_generated: true,
        })),
        weakKnowledgePoints: weakKps,
        examSchedule: examInfo,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

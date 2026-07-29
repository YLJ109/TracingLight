import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { generateStudentData } from "@/lib/mock-data-generator";
import { course, examSchedule } from "@/storage/database/shared/schema";
import { eq, and, gte, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const studentId = parseInt(searchParams.get("student_id") || "0");
    const courseId = parseInt(searchParams.get("course_id") || "1");

    if (!studentId || isNaN(studentId)) {
      return NextResponse.json({ success: false, error: "缺少student_id" }, { status: 400 });
    }

    const db = getDb();

    // Get courses from DB
    const courses = db.select({
      id: course.id,
      name: course.name,
      short_name: course.short_name,
    })
      .from(course)
      .orderBy(course.id)
      .all();

    // Get exam schedule from DB
    const today = new Date().toISOString().split("T")[0];
    const examScheduleData = db.select()
      .from(examSchedule)
      .where(and(
        eq(examSchedule.course_id, courseId),
        gte(examSchedule.exam_date, today)
      ))
      .orderBy(asc(examSchedule.exam_date))
      .all();

    // Generate rich mock data
    const mockData = generateStudentData(studentId);

    // Build knowledge mastery list from mock data (merge strong/medium/weak)
    const allMastery = [
      ...mockData.knowledgeStats.strong.map(k => ({ ...k, level: 'strong' as const })),
      ...mockData.knowledgeStats.medium.map(k => ({ ...k, level: 'medium' as const })),
      ...mockData.knowledgeStats.weak.map(k => ({ ...k, level: 'weak' as const })),
    ];

    // Build course name -> id mapping for masteryByCourse key resolution
    const courseNameToId: Record<string, number> = {};
    for (const c of courses) {
      courseNameToId[c.name] = c.id;
    }

    const masteryByCourse: Record<number, typeof allMastery> = {};
    for (const m of allMastery) {
      const cid = courseNameToId[m.courseName] || 0;
      if (!masteryByCourse[cid]) masteryByCourse[cid] = [];
      masteryByCourse[cid].push(m);
    }

    // Generate prerequisite + related knowledge + AI suggestion for weak points
    const errorTypeLabels: Record<string, string> = {
      concept_confusion: "概念混淆", calculation_error: "计算错误",
      step_missing: "步骤缺失", method_unknown: "方法不会",
      careless: "粗心大意", knowledge_missing: "知识缺失",
    };
    const aiSuggestions = [
      "建议从基础概念入手，结合教材第3章重新梳理知识点，完成配套练习题巩固理解。",
      "该知识点关联多个前置概念，建议先复习相关基础内容，再通过专项练习强化应用能力。",
      "多做同类型题目的变式练习，注意总结解题思路和常见陷阱，建立错题档案定期回顾。",
      "可以观看教学视频中的相关章节，配合思维导图整理知识框架，然后进行针对性训练。",
      "建议与同学组成学习小组，互相讲解该知识点，通过教学相长加深理解。",
      "利用在线编程平台进行实战练习，从简单题目逐步过渡到综合应用题。",
    ];

    const weakPoints = mockData.weakTop10.map((w, idx) => {
      // Generate recent errors for this weak point
      const recentErrors = [];
      const errCount = Math.min(w.errorCount, 3);
      for (let i = 0; i < errCount; i++) {
        const eType = mockData.errorData.errors[i % mockData.errorData.errors.length];
        recentErrors.push({
          id: 1000 + idx * 10 + i,
          content: `${w.name}相关题目 - 第${i + 1}次错误`,
          difficulty: ["easy", "medium", "hard"][i % 3],
          errorType: eType.errorType,
        });
      }

      // Generate prerequisites (simulated)
      const preqCount = Math.min(2 + (idx % 3), 3);
      const prerequisites = [];
      for (let i = 0; i < preqCount; i++) {
        const preq = mockData.knowledgeStats.strong[i % mockData.knowledgeStats.strong.length];
        if (preq) {
          prerequisites.push({
            nodeName: preq.name,
            mastery: preq.mastery,
          });
        }
      }

      // Related knowledge points
      const relCount = Math.min(2 + (idx % 2), 3);
      const relatedKnowledge = [];
      for (let i = 0; i < relCount; i++) {
        const rel = mockData.knowledgeStats.medium[i % mockData.knowledgeStats.medium.length];
        if (rel) {
          relatedKnowledge.push({
            nodeName: rel.name,
            mastery: rel.mastery,
          });
        }
      }

      return {
        knowledgePointId: w.knowledgePointId,
        name: w.name,
        masteryRate: w.masteryRate,
        errorCount: w.errorCount,
        priority: w.priority,
        courseName: w.courseName,
        chapter: w.chapter,
        recentErrors,
        prerequisites,
        relatedKnowledge,
        aiSuggestion: aiSuggestions[idx % aiSuggestions.length],
      };
    });

    // Radar data (8 dimensions)
    const radarData = mockData.radarData.map(r => ({
      dimension: r.key,
      label: r.label,
      score: r.score,
    }));

    // Trend data - transform to match frontend TrendPoint interface
    const trendData = mockData.trendData.map(t => ({
      date: t.week,
      mastery: t.avgScore,
    }));

    // Course comparison
    const courseComparison = courses.map((c) => {
      const courseData = mockData.courseComparison.find(cc => cc.courseId === c.id);
      return {
        courseId: c.id,
        name: c.name,
        shortName: c.short_name || c.name,
        avgMastery: courseData?.avgMastery || 0,
        kpCount: courseData?.kpCount || 0,
        errorCount: courseData?.errorCount || 0,
      };
    });

    // Upcoming exams
    const upcomingExams = examScheduleData.map((e) => ({
      id: e.id,
      title: e.exam_name,
      examDate: e.exam_date,
      location: undefined as string | undefined,
      daysUntil: Math.ceil((new Date(e.exam_date).getTime() - Date.now()) / 86400000),
    }));

    // Compute stats from indicators array
    const getIndicator = (key: string) => mockData.indicators.find(i => i.key === key);
    const avgScore = getIndicator('avgScore')?.value || 0;
    const totalErrors = getIndicator('totalErrors')?.value || 0;

    // AI insights
    const aiInsights: Array<{ type: "warning" | "success" | "info"; icon: string; title: string; detail: string }> = [];
    const weakCount = allMastery.filter(m => m.level === "weak").length;
    if (weakCount >= 3) aiInsights.push({ type: "warning", icon: "AlertTriangle", title: "薄弱知识点较多", detail: `当前有${weakCount}个知识点掌握度不足60%，建议优先处理P0级薄弱点` });
    if (upcomingExams.length > 0) {
      const nearest = upcomingExams[0];
      aiInsights.push({ type: "info", icon: "Calendar", title: `距离${nearest.title}还有${nearest.daysUntil}天`, detail: `考试地点：${nearest.location || "待定"}，建议针对性复习` });
    }
    if (avgScore >= 70) aiInsights.push({ type: "success", icon: "TrendingUp", title: "整体掌握度良好", detail: `综合掌握度${avgScore}%，继续保持当前学习节奏` });
    if (totalErrors >= 5) aiInsights.push({ type: "warning", icon: "Target", title: "错题积累较多", detail: `累计${totalErrors}道错题，建议每周安排错题回顾` });

    const strongCount = allMastery.filter(m => m.level === "strong").length;
    const mediumCount = allMastery.filter(m => m.level === "medium").length;

    return NextResponse.json({
      success: true,
      data: {
        knowledgeMastery: allMastery,
        masteryByCourse,
        weakPoints: weakPoints.slice(0, 8),
        overallMastery: avgScore,
        strongCount,
        mediumCount,
        weakCount,
        totalErrors,
        radarData,
        trendData,
        courseComparison,
        upcomingExams: upcomingExams.slice(0, 3),
        aiInsights,
        courses: courses || [],
        // Additional mock data for rich display
        errorTypeDistribution: mockData.errorData.errorTypeDistribution,
        scoreTrend: mockData.trendData,
        examSchedule: mockData.examSchedule,
        studyPlan: mockData.studyPlan,
        exerciseRecommend: mockData.exerciseRecommend,
        weakAnalysis: mockData.weakAnalysis,
        indicators: mockData.indicators,
      },
    });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const errMsg = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

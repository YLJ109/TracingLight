import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import {
  course, examSchedule, knowledgePoint, knowledgeMasteryLog,
  errorBook, question, gradingTask, assignment, user,
  learningBehaviorLog, learningMaterial,
} from "@/storage/database/shared/schema";
import { eq, and, gte, asc, inArray, sql } from "drizzle-orm";

/**
 * 学生个性化推荐（全部真实数据聚合，无 mock）：
 * - 知识掌握：knowledge_mastery_log（真实掌握度/错误数）
 * - 薄弱点：掌握度升序 + 真实错题（error_book × question）
 * - 趋势：grading_task × assignment 按截止时间聚合的真实成绩
 * - 课程对比：掌握度/错题按课程聚合
 * - 学习投入：learning_behavior_log 真实观看进度
 * 全部输出确定性结果，同一学生任意两次调用一致。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = authUser.userId;
    const courseId = parseInt(searchParams.get("course_id") || "1");

    const db = getDb();

    // 学生班级（用于收敛课程范围）
    const stu = db.select({ class_id: user.class_id }).from(user).where(eq(user.id, studentId)).limit(1).all()[0];
    const classId = stu?.class_id ?? null;

    // 课程（本班级课程）
    const courses = (classId != null
      ? db.select({ id: course.id, name: course.name, short_name: course.short_name })
          .from(course).where(eq(course.class_id, classId)).orderBy(course.id).all()
      : db.select({ id: course.id, name: course.name, short_name: course.short_name })
          .from(course).orderBy(course.id).all()
    );
    const courseIds = courses.map((c) => c.id);
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    // 知识点（本班级课程下）
    const kps = courseIds.length > 0
      ? db.select({ id: knowledgePoint.id, name: knowledgePoint.name, course_id: knowledgePoint.course_id })
          .from(knowledgePoint).where(inArray(knowledgePoint.course_id, courseIds)).all()
      : [];
    const kpMap = new Map(kps.map((k) => [k.id, k]));

    // 真实掌握度
    const masteryLogs = db.select({
      knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
      error_count: knowledgeMasteryLog.error_count,
      recorded_at: knowledgeMasteryLog.recorded_at,
    }).from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, studentId))
      .all();
    const masteryByKp = new Map<number, typeof masteryLogs[number]>();
    for (const m of masteryLogs) {
      const cur = masteryByKp.get(m.knowledge_point_id);
      if (!cur || (m.recorded_at || '') >= (cur.recorded_at || '')) masteryByKp.set(m.knowledge_point_id, m);
    }

    // 每个知识点题量（真实）
    const qpCounts = kps.length > 0
      ? db.select({ kp_id: question.knowledge_point_id, cnt: sql<number>`count(*)` })
          .from(question).where(inArray(question.knowledge_point_id, kps.map((k) => k.id))).all()
      : [];
    const qpMap = new Map(qpCounts.map((r) => [r.kp_id, r.cnt || 0]));

    // 真实错题（含题目内容）
    const errorRows = db.select({
      id: errorBook.id,
      question_id: errorBook.question_id,
      knowledge_point_id: errorBook.knowledge_point_id,
      error_type: errorBook.error_type,
      review_status: errorBook.review_status,
      next_review_at: errorBook.next_review_at,
    }).from(errorBook).where(eq(errorBook.student_id, studentId)).all();
    const errQIds = [...new Set(errorRows.map((e) => e.question_id).filter(Boolean))];
    const errQMap = new Map<number, { content: string; difficulty: string | null }>();
    if (errQIds.length > 0) {
      db.select({ id: question.id, content: question.content, difficulty: question.difficulty })
        .from(question).where(inArray(question.id, errQIds as number[]))
        .all()
        .forEach((q) => errQMap.set(q.id, { content: q.content, difficulty: q.difficulty }));
    }
    const errors = errorRows.map((e) => ({
      ...e,
      qContent: e.question_id ? (errQMap.get(e.question_id)?.content || '题目内容缺失') : '题目内容缺失',
      qDifficulty: e.question_id ? (errQMap.get(e.question_id)?.difficulty || 'medium') : 'medium',
    }));

    // 真实批改成绩
    const gradings = db.select({
      assignment_id: gradingTask.assignment_id,
      total_score: gradingTask.total_score,
      full_score: gradingTask.full_score,
      completed_at: gradingTask.completed_at,
    }).from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();

    // 学习投入（真实行为日志）
    const behavior = db.select({
      progress: learningBehaviorLog.progress,
      is_completed: learningBehaviorLog.is_completed,
    }).from(learningBehaviorLog).where(eq(learningBehaviorLog.student_id, studentId)).all();

    // 学习材料（本班级课程，按知识点推荐）——knowledge_point_ids 存 JSON 数组
    const materials = courseIds.length > 0
      ? db.select().from(learningMaterial).where(inArray(learningMaterial.course_id, courseIds)).all()
      : [];
    const materialsByKp = new Map<number, typeof learningMaterial.$inferSelect[]>();
    for (const m of materials) {
      const kpIdsRaw = m.knowledge_point_ids;
      let kpIds: number[] = Array.isArray(kpIdsRaw) ? kpIdsRaw as number[] : [];
      if (!Array.isArray(kpIdsRaw) && typeof kpIdsRaw === 'string') {
        try { const p = JSON.parse(kpIdsRaw); kpIds = Array.isArray(p) ? p : []; } catch { kpIds = []; }
      }
      for (const kid of kpIds) {
        if (!materialsByKp.has(kid)) materialsByKp.set(kid, []);
        materialsByKp.get(kid)!.push(m);
      }
    }
    const materialProgress = new Map<number, number>();
    db.select({ material_id: learningBehaviorLog.material_id, progress: learningBehaviorLog.progress })
      .from(learningBehaviorLog).where(eq(learningBehaviorLog.student_id, studentId)).all()
      .forEach((b) => materialProgress.set(b.material_id, b.progress || 0));

    // ===== 知识掌握列表（每个知识点取最新掌握度） =====
    const allMastery = [...masteryByKp.entries()]
      .map(([kpId, m]) => {
        const kp = kpMap.get(kpId);
        if (!kp) return null;
        const rate = m.mastery_rate || 0;
        const level = rate >= 80 ? 'strong' as const : rate >= 60 ? 'medium' as const : 'weak' as const;
        return {
          id: kp.id,
          name: kp.name,
          mastery: rate,
          errorCount: m.error_count || 0,
          level,
          courseId: kp.course_id,
          courseName: courseMap.get(kp.course_id)?.name || '未知课程',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.mastery - a.mastery);

    const masteryByCourse: Record<number, typeof allMastery> = {};
    for (const m of allMastery) {
      if (!masteryByCourse[m.courseId]) masteryByCourse[m.courseId] = [];
      masteryByCourse[m.courseId].push(m);
    }

    // ===== 薄弱点（掌握度升序，真实错题明细）=====
    const aiSuggestions = [
      "建议从基础概念入手，结合教材重新梳理知识点，完成配套练习题巩固理解。",
      "该知识点关联多个前置概念，建议先复习相关基础内容，再通过专项练习强化应用能力。",
      "多做同类型题目的变式练习，注意总结解题思路和常见陷阱，建立错题档案定期回顾。",
      "可以观看教学材料中的相关章节，配合思维导图整理知识框架，然后进行针对性训练。",
      "建议与同学组成学习小组，互相讲解该知识点，通过教学相长加深理解。",
    ];
    const weakLogs = [...masteryByKp.entries()]
      .map(([kpId, m]) => ({ ...m, kp: kpMap.get(kpId) }))
      .filter((m) => m.kp && (m.mastery_rate || 0) < 70)
      .sort((a, b) => (a.mastery_rate || 0) - (b.mastery_rate || 0))
      .slice(0, 8);

    const sameCourseStrong = (cid: number, excludeKp: number) =>
      allMastery.filter((m) => m.courseId === cid && m.id !== excludeKp && m.level === 'strong').slice(0, 3);
    const sameCourseMedium = (cid: number, excludeKp: number) =>
      allMastery.filter((m) => m.courseId === cid && m.id !== excludeKp && m.level === 'medium').slice(0, 3);

    const weakPoints = weakLogs.map((w, idx) => {
      // 真实错题明细（该知识点下）
      const kpErrors = errors.filter((e) => e.knowledge_point_id === w.kp!.id).slice(0, 3);
      // 真实推荐材料（该知识点关联）
      const kpMaterials = (materialsByKp.get(w.kp!.id) || []).map((m) => ({
        id: m.id, title: m.title, type: m.type, duration: m.duration_minutes || 0,
        url: m.url || '', courseId: m.course_id, progress: materialProgress.get(m.id) || 0,
      }));
      const rate = w.mastery_rate || 0;
      return {
        knowledgePointId: w.kp!.id,
        name: w.kp!.name,
        masteryRate: rate,
        errorCount: w.error_count || 0,
        courseId: w.kp!.course_id,
        priority: (rate < 60 ? 'P0' : 'P1') as 'P0' | 'P1' | 'P2',
        recentErrors: kpErrors.map((e) => ({
          id: e.id,
          content: e.qContent,
          difficulty: e.qDifficulty,
          errorType: e.error_type || 'wrong',
        })),
        prerequisites: sameCourseStrong(w.kp!.course_id, w.kp!.id).map((m) => ({ nodeName: m.name, mastery: m.mastery })),
        relatedKnowledge: sameCourseMedium(w.kp!.course_id, w.kp!.id).map((m) => ({ nodeName: m.name, mastery: m.mastery })),
        materials: kpMaterials,
        materialCount: kpMaterials.length,
        aiSuggestion: aiSuggestions[idx % aiSuggestions.length],
      };
    });

    // ===== 真实趋势（按作业聚合成绩）=====
    const assignments = courseIds.length > 0
      ? db.select({ id: assignment.id, end_time: assignment.end_time })
          .from(assignment).where(inArray(assignment.course_id, courseIds)).orderBy(asc(assignment.end_time)).all()
      : [];
    const asgnMap = new Map(assignments.map((a) => [a.id, a]));
    const trendByAssignment = new Map<number, { score: number; full: number }>();
    for (const g of gradings) {
      const acc = trendByAssignment.get(g.assignment_id) || { score: 0, full: 0 };
      acc.score += g.total_score || 0;
      acc.full += g.full_score || 0;
      trendByAssignment.set(g.assignment_id, acc);
    }
    const trendData = assignments
      .filter((a) => trendByAssignment.has(a.id))
      .map((a) => {
        const acc = trendByAssignment.get(a.id)!;
        return {
          date: (a.end_time || '').slice(0, 10) || '未知',
          mastery: acc.full > 0 ? Math.round((acc.score / acc.full) * 100) : 0,
        };
      });

    // ===== 课程对比（真实聚合）=====
    const courseComparison = courses.map((c) => {
      const cKpIds = kps.filter((k) => k.course_id === c.id).map((k) => k.id);
      const cMasteries = allMastery.filter((m) => m.courseId === c.id).map((m) => m.mastery);
      return {
        courseId: c.id,
        name: c.name,
        shortName: c.short_name || c.name,
        avgMastery: cMasteries.length > 0 ? Math.round(cMasteries.reduce((s, r) => s + r, 0) / cMasteries.length) : 0,
        kpCount: cKpIds.length,
        errorCount: errors.filter((e) => e.knowledge_point_id != null && cKpIds.includes(e.knowledge_point_id)).length,
      };
    });

    // ===== 近期考试（真实）：未指定课程时展示本班全部课程，指定时精确到该课程 =====
    const today = new Date().toISOString().split("T")[0];
    const examScope = (courseId && courseIds.includes(courseId))
      ? eq(examSchedule.course_id, courseId)
      : (courseIds.length > 0 ? inArray(examSchedule.course_id, courseIds) : undefined);
    const examScheduleData = examScope
      ? db.select().from(examSchedule)
          .where(and(examScope, gte(examSchedule.exam_date, today)))
          .orderBy(asc(examSchedule.exam_date)).all()
      : db.select().from(examSchedule)
          .where(gte(examSchedule.exam_date, today))
          .orderBy(asc(examSchedule.exam_date)).all();
    const upcomingExams = examScheduleData.map((e) => ({
      id: e.id,
      title: e.exam_name,
      examDate: e.exam_date,
      daysUntil: Math.ceil((new Date(e.exam_date).getTime() - Date.now()) / 86400000),
    }));

    // ===== 指标与雷达（真实）=====
    const overallMastery = allMastery.length > 0
      ? Math.round(allMastery.reduce((s, m) => s + m.mastery, 0) / allMastery.length) : 0;
    const strongCount = allMastery.filter((m) => m.level === 'strong').length;
    const mediumCount = allMastery.filter((m) => m.level === 'medium').length;
    const weakCount = allMastery.filter((m) => m.level === 'weak').length;
    const totalErrors = errors.length;
    const masteredErrors = errors.filter((e) => e.review_status === 'mastered').length;

    const totalScore = gradings.reduce((s, g) => s + (g.total_score || 0), 0);
    const totalFull = gradings.reduce((s, g) => s + (g.full_score || 0), 0);
    const avgScorePct = totalFull > 0 ? Math.round((totalScore / totalFull) * 100) : 0;
    const gradedAssignments = trendByAssignment.size;
    const completionRate = assignments.length > 0 ? Math.min(100, Math.round((gradedAssignments / assignments.length) * 100)) : 0;
    const errorResolutionRate = totalErrors > 0 ? Math.round((masteredErrors / totalErrors) * 100) : 0;
    const engagement = behavior.length > 0
      ? Math.round(behavior.reduce((s, b) => s + (b.progress || 0), 0) / behavior.length)
      : 0;
    const coverage = kps.length > 0 ? Math.min(100, Math.round((masteryLogs.length / kps.length) * 100)) : 0;
    const trendImprovement = trendData.length >= 2
      ? Math.max(0, Math.min(100, 50 + (trendData[trendData.length - 1].mastery - trendData[0].mastery)))
      : overallMastery;

    const radarData = [
      { dimension: 'knowledge', label: '知识掌握', score: overallMastery },
      { dimension: 'score', label: '作业成绩', score: avgScorePct },
      { dimension: 'completion', label: '完成率', score: completionRate },
      { dimension: 'error_fix', label: '错题巩固', score: errorResolutionRate },
      { dimension: 'engagement', label: '学习投入', score: engagement },
      { dimension: 'coverage', label: '知识覆盖', score: coverage },
      { dimension: 'trend', label: '进步势头', score: trendImprovement },
      { dimension: 'participation', label: '巩固频次', score: Math.min(100, gradings.length * 10) },
    ];

    // ===== AI 洞察（真实数字驱动）=====
    const aiInsights: Array<{ type: "warning" | "success" | "info"; icon: string; title: string; detail: string }> = [];
    if (weakCount >= 3) aiInsights.push({ type: "warning", icon: "AlertTriangle", title: "薄弱知识点较多", detail: `当前有${weakCount}个知识点掌握度不足60%，建议优先处理P0级薄弱点` });
    if (upcomingExams.length > 0) {
      const nearest = upcomingExams[0];
      aiInsights.push({ type: "info", icon: "Calendar", title: `距离${nearest.title}还有${nearest.daysUntil}天`, detail: "建议针对性复习薄弱知识点" });
    }
    if (overallMastery >= 70) aiInsights.push({ type: "success", icon: "TrendingUp", title: "整体掌握度良好", detail: `综合掌握度${overallMastery}%，继续保持当前学习节奏` });
    if (totalErrors >= 5) aiInsights.push({ type: "warning", icon: "Target", title: "错题积累较多", detail: `累计${totalErrors}道错题，建议每周安排错题回顾` });

    return NextResponse.json({
      success: true,
      data: {
        knowledgeMastery: allMastery,
        masteryByCourse,
        weakPoints,
        overallMastery,
        strongCount,
        mediumCount,
        weakCount,
        totalErrors,
        radarData,
        trendData,
        courseComparison,
        upcomingExams: upcomingExams.slice(0, 3),
        aiInsights,
        courses,
      },
    });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Recommend error:', error);
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

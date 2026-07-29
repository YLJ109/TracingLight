import { NextRequest, NextResponse } from "next/server";
import { createAIClient, HeaderUtils, invokeStructured } from "@/lib/ai/client";
import { PROFILER_SYSTEM_PROMPT, buildProfilerPrompt } from "@/lib/ai/prompts/profiler";
import { getDb } from "@/storage/database/db";
import { user, gradingTask, errorBook, knowledgePoint } from "@/storage/database/shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";

interface ProfileResult {
  student_level: string;
  avg_score: number;
  class_rank: number;
  total_students: number;
  radar_scores: {
    knowledge_accuracy: number;
    logic_completeness: number;
    expression_clarity: number;
    expansion: number;
  };
  weak_points: Array<{
    knowledge_point_id: number;
    knowledge_point_name: string;
    mastery_rate: number;
    error_count: number;
  }>;
  overall_comment: string;
  improvement_suggestions: string[];
}

export async function POST(request: NextRequest) {
  try {
    const userAuth = await requireAuth(request);
    const body = await request.json();
    const { student_id } = body;

    if (!student_id) {
      return NextResponse.json(
        { error: "缺少必要参数：student_id" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. 获取学生信息
    const studentRows = db.select().from(user).where(eq(user.id, student_id)).limit(1).all();
    const student = studentRows[0] || null;

    if (!student) {
      return NextResponse.json({ error: "学生不存在" }, { status: 404 });
    }

    // 2. 获取作业成绩
    const tasks = db.select().from(gradingTask)
      .where(
        and(
          eq(gradingTask.student_id, student_id),
          eq(gradingTask.status, "completed")
        )
      )
      .all();

    // 对于 assignment title，这里 grading_task 表中没有 assignment name，
    // 保持与原有逻辑一致：使用 assignment id 作为 fallback
    const assignmentScores = tasks.map((t) => ({
      assignmentTitle: `作业 #${t.assignment_id}`,
      score: t.total_score || 0,
      fullScore: t.full_score || 100,
    }));

    // 3. 获取错题分布 - 需要 knowledge_point name，单独查询
    const errors = db.select({
      knowledge_point_id: errorBook.knowledge_point_id,
    })
      .from(errorBook)
      .where(eq(errorBook.student_id, student_id))
      .all();

    // 批量获取知识点名称
    const kpIds = [...new Set(errors.map((e) => e.knowledge_point_id))];
    const kpMap = new Map<number, string>();
    if (kpIds.length > 0) {
      const kpRows = db.select().from(knowledgePoint).where(inArray(knowledgePoint.id, kpIds)).all();
      for (const kp of kpRows) {
        kpMap.set(kp.id, kp.name);
      }
    }

    const errorMap = new Map<string, { count: number; id: number }>();
    for (const e of errors) {
      const name = kpMap.get(e.knowledge_point_id) || "未知";
      const existing = errorMap.get(name);
      if (existing) {
        existing.count++;
      } else {
        errorMap.set(name, { count: 1, id: e.knowledge_point_id });
      }
    }
    const errorSummary = Array.from(errorMap.entries()).map(([name, data]) => ({
      knowledgePointName: name,
      errorCount: data.count,
      knowledgePointId: data.id,
    }));

    // 4. 计算四维度均分
    const dimSums = { knowledge_accuracy: 0, logic_completeness: 0, expression_clarity: 0, expansion: 0 };
    let dimCount = 0;
    for (const t of tasks) {
      const ds = t.dimension_scores as Record<string, number> | null;
      if (ds) {
        dimSums.knowledge_accuracy += ds.knowledge_accuracy || 0;
        dimSums.logic_completeness += ds.logic_completeness || 0;
        dimSums.expression_clarity += ds.expression_clarity || 0;
        dimSums.expansion += ds.expansion || 0;
        dimCount++;
      }
    }
    const dimensionAverages = {
      knowledge_accuracy: dimCount > 0 ? Math.round(dimSums.knowledge_accuracy / dimCount * 10) : 50,
      logic_completeness: dimCount > 0 ? Math.round(dimSums.logic_completeness / dimCount * 10) : 50,
      expression_clarity: dimCount > 0 ? Math.round(dimSums.expression_clarity / dimCount * 10) : 50,
      expansion: dimCount > 0 ? Math.round(dimSums.expansion / dimCount * 10) : 50,
    };

    // 5. 获取班级总人数
    const countResult = db.select({ count: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.role, "student"))
      .get();
    const totalStudents = countResult?.count || 10;

    // 6. 调用 AI 学情分析
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = createAIClient(customHeaders);

    const prompt = buildProfilerPrompt({
      studentName: student.real_name,
      assignmentScores,
      errorSummary,
      dimensionAverages,
      totalStudents: totalStudents || 10,
    });

    const result = await invokeStructured<ProfileResult>(
      client,
      PROFILER_SYSTEM_PROMPT,
      prompt,
      0.3
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("Student profiling failed:", error);
    return NextResponse.json(
      { error: "学情分析失败：" + (error instanceof Error ? error.message : "未知错误") },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAIClient , aiErrorResponse } from "@/lib/ai/client";
import { getDb } from "@/storage/database/db";
import { user, gradingTask, errorBook, knowledgeMasteryLog } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";
import { isStudentInTeacherScope } from "@/lib/teacher-scope";

const SYSTEM_PROMPT = `你是溯光智慧教育平台的学情分析专家。根据学生的成绩、错题、知识掌握度数据，生成一份结构化、有洞察的学习分析报告。

报告须包含：
1. 学习概况（总体表现一句话总结）
2. 优势与薄弱点（各 2-3 条，具体到知识点/能力）
3. 错题归因（主要错因类型及占比）
4. 学习建议（3-5 条可执行的具体建议）

要求：客观、具体、避免空话套话，用中文，适当分点。`;

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, "teacher");
    if (!authUser) return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });

    const { student_id } = await request.json();
    if (!student_id) return NextResponse.json({ error: "缺少 student_id" }, { status: 400 });

    const db = getDb();

    // 跨租户隔离：只能为本人授课班级学生生成报告
    if (!isStudentInTeacherScope(authUser.userId, Number(student_id))) {
      return NextResponse.json({ error: "无权查看该学生学习数据" }, { status: 403 });
    }

    const stuRows = db.select().from(user).where(eq(user.id, Number(student_id))).limit(1).all();
    const stu = stuRows[0];
    if (!stu) return NextResponse.json({ error: "学生不存在" }, { status: 404 });

    const gradings = db.select().from(gradingTask).where(eq(gradingTask.student_id, Number(student_id))).all();
    const totalScore = gradings.reduce((s, g) => s + (g.total_score || 0), 0);
    const fullScore = gradings.reduce((s, g) => s + (g.full_score || 0), 0);
    const avg = fullScore > 0 ? Math.round((totalScore / fullScore) * 1000) / 10 : 0;

    const errors = db.select().from(errorBook).where(eq(errorBook.student_id, Number(student_id))).all();
    const errorTypeCount: Record<string, number> = {};
    for (const e of errors) {
      const t = e.error_type || "unknown";
      errorTypeCount[t] = (errorTypeCount[t] || 0) + 1;
    }
    const errorTypeSummary = Object.entries(errorTypeCount)
      .map(([k, v]) => `${k}: ${v} 题`)
      .join("、");

    const mastery = db.select().from(knowledgeMasteryLog).where(eq(knowledgeMasteryLog.student_id, Number(student_id))).all();
    const avgMastery = mastery.length > 0
      ? Math.round(mastery.reduce((s, m) => s + (m.mastery_rate || 0), 0) / mastery.length)
      : 0;

    const prompt = `学生：${stu.real_name}（${stu.student_level || "未知层级"}）
总成绩：${avg} 分（百分制，共 ${gradings.length} 次批改记录）
知识平均掌握度：${avgMastery}%
错题总数：${errors.length} 题
错因分布：${errorTypeSummary || "无"}

请生成该学生的学情分析报告。`;

    const client = createAIClient();
    const result = await client.invoke(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, max_tokens: 1500 }
    );

    return NextResponse.json({
      success: true,
      data: {
        student: stu.real_name,
        avg,
        avgMastery,
        errorCount: errors.length,
        report: result.content,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("AI report error:", error);
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    return NextResponse.json(
      { error: "学情报告生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}

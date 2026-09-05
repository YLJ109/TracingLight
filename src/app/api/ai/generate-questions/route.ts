import { NextRequest, NextResponse } from "next/server";
import { createAIClient, HeaderUtils, invokeStructured, aiErrorResponse } from "@/lib/ai/client";
import { QUESTION_GEN_SYSTEM_PROMPT, buildQuestionGenPrompt } from "@/lib/ai/prompts/question-gen";
import { requireAuth } from "@/lib/server-auth";
import { getDb } from "@/storage/database/db";
import { knowledgePoint, course, question } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { isCourseInTeacherScope } from "@/lib/teacher-scope";

interface GeneratedQuestion {
  content: string;
  question_type: string;
  difficulty: string;
  options: string[] | null;
  answer: string;
  analysis: string;
  default_score: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'teacher');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const {
      course_id,
      knowledge_point_id,
      question_type = "single_choice",
      difficulty = "medium",
      count = 3,
    } = body;

    if (!knowledge_point_id) {
      return NextResponse.json(
        { error: "缺少必要参数：knowledge_point_id" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. 获取知识点信息
    const kpRows = db.select().from(knowledgePoint).where(eq(knowledgePoint.id, knowledge_point_id)).limit(1).all();
    const kp = kpRows[0] || null;

    if (!kp) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 });
    }

    // 单独查询关联的课程
    const courseRows = db.select().from(course).where(eq(course.id, kp.course_id)).limit(1).all();
    const courseData = courseRows[0] || null;

    // 跨租户隔离：出题课程必须为本人授课课程，防越权向他人课程/知识点出题
    const kpCourseId = kp.course_id ?? course_id ?? null;
    const outCourseId = course_id ?? kpCourseId;
    if (outCourseId == null || !isCourseInTeacherScope(user.userId, Number(outCourseId))) {
      return NextResponse.json({ error: "无权在该课程生成题目" }, { status: 403 });
    }

    // 2. 调用 AI 出题
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = createAIClient(customHeaders);

    const typeMap: Record<string, string> = {
      single_choice: "单选题",
      multi_choice: "多选题",
      judgment: "判断题",
      fill_blank: "填空题",
      short_answer: "简答题",
      programming: "编程题",
    };

    const prompt = buildQuestionGenPrompt({
      courseName: courseData?.name || "计算机课程",
      knowledgePointName: kp.name,
      knowledgePointDescription: kp.description || "",
      questionType: typeMap[question_type] || question_type,
      difficulty,
      count: Math.min(count, 5),
    });

    const result = await invokeStructured<GeneratedQuestion[]>(
      client,
      QUESTION_GEN_SYSTEM_PROMPT,
      prompt,
      0.7
    );

    // 3. 存入题库（处理AI返回格式兼容性）
    const questionsToInsert = (Array.isArray(result) ? result : [result]).map((q) => {
      // 转换选项格式：数组["A.xxx","B.xxx"] → 对象{"A":"xxx","B":"xxx"}
      let opts: Record<string, string> | null = null;
      if (q.options) {
        if (Array.isArray(q.options)) {
          opts = {};
          q.options.forEach((opt: string) => {
            const m = opt.match(/^([A-Z])[.、．]\s*(.+)/);
            if (m) opts![m[1]] = m[2].trim();
            else {
              const letter = String.fromCharCode(65 + q.options!.indexOf(opt));
              opts![letter] = opt.replace(/^[A-Z][.、．]\s*/, '').trim() || opt;
            }
          });
        } else if (typeof q.options === 'object') {
          opts = q.options as Record<string, string>;
        }
      }

      return {
        course_id: course_id || kp.course_id,
        knowledge_point_id,
        question_type: q.question_type || question_type,
        difficulty: q.difficulty || difficulty,
        content: q.content || '',
        options: opts,
        answer: q.answer || '',
        analysis: q.analysis || '（暂无解析）',
        default_score: q.default_score || 10,
        source: "ai" as const,
      };
    });

    let inserted: Array<typeof question.$inferSelect> = [];
    // P2-6：persist=false 时不入库，先返回给教师预览审校（确认后再经题库接口入库）
    const persist = body?.persist !== false;
    if (persist) {
      try {
        inserted = db.insert(question).values(questionsToInsert).returning().all();
      } catch (insErr) {
        console.error("Insert questions error:", insErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: questionsToInsert,
        inserted: inserted || [],
        count: questionsToInsert.length,
        persisted: persist,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    console.error("Question generation failed:", error);
    return NextResponse.json(
      { error: "AI出题失败，请稍后重试" },
      { status: 500 }
    );
  }
}

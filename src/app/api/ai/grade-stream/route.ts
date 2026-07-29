import { NextRequest, NextResponse } from "next/server";
import { createAIClient, HeaderUtils } from "@/lib/ai/client";
import { GRADING_SYSTEM_PROMPT, buildGradingPrompt } from "@/lib/ai/prompts/grading";
import { getDb } from "@/storage/database/db";
import { question, answer, knowledgePoint } from "@/storage/database/shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  const user = await requireAuth(request, 'teacher');
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const encoder = new TextEncoder();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = createAIClient(customHeaders);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json();
        const { question_id, student_id, assignment_id } = body;

        if (!question_id || !student_id || !assignment_id) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "缺少必要参数" })}\n\n`));
          controller.close();
          return;
        }

        const db = getDb();

        // 获取题目信息
        const questionRows = db.select().from(question).where(eq(question.id, question_id)).limit(1).all();
        const questionData = questionRows[0] || null;

        if (!questionData) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "题目不存在" })}\n\n`));
          controller.close();
          return;
        }

        // 查询关联的知识点
        const kpRows = db.select().from(knowledgePoint).where(eq(knowledgePoint.id, questionData.knowledge_point_id)).limit(1).all();
        const kp = kpRows[0] || null;

        // 获取学生作答
        const answerRows = db.select().from(answer).where(
          and(
            eq(answer.assignment_id, assignment_id),
            eq(answer.student_id, student_id),
            eq(answer.question_id, question_id)
          )
        ).limit(1).all();
        const answerData = answerRows[0] || null;

        const prompt = buildGradingPrompt({
          questionContent: questionData.content,
          questionType: questionData.question_type,
          referenceAnswer: questionData.answer,
          studentAnswer: answerData?.student_answer || "（未作答）",
          fullScore: questionData.default_score || 10,
          knowledgePointName: kp?.name || "未知知识点",
          knowledgePointId: questionData.knowledge_point_id,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "AI正在批改中..." })}\n\n`));

        // 流式调用 AI
        const aiStream = client.stream(
          [
            { role: "system" as const, content: GRADING_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
          ],
          {
            temperature: 0.2,
          }
        );

        let fullContent = "";

        for await (const chunk of aiStream) {
          if (chunk.content) {
            const text = chunk.content.toString();
            fullContent += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
            );
          }
        }

        // 发送完成信号，附带完整内容供前端解析
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "complete", content: fullContent })}\n\n`)
        );
        controller.close();
      } catch (error) {
        if (error && typeof (error as { status?: number }).status === "number") return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "未知错误" })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

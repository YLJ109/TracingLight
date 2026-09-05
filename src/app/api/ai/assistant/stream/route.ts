import { NextRequest, NextResponse } from "next/server";
import { createAIClient } from "@/lib/ai/client";
import { requireAuth } from "@/lib/server-auth";
import { getDb, saveDb } from "@/storage/database/db";
import { qaSession, qaMessage } from "@/storage/database/shared/schema";
import { eq, and, desc } from "drizzle-orm";

const SYSTEM_PROMPT = `你是「溯光 TracingLight」智慧教育平台的 AI 学习助手，面向高校学生提供学习答疑服务。

你的职责：
1. 解答课程知识点疑问，讲解题目思路；
2. 用循序渐进、通俗易懂的方式解释概念；
3. 数学、代码类问题给出清晰步骤与示例；
4. 提供学习方法与复习建议。

【输出格式规范（必须遵守）】
你的回答将以标准 Markdown 渲染（支持标题/列表/表格/加粗/引用/代码高亮），请严格使用以下格式：
1. 结构化：用「## 小标题」「- 列表」「**加粗**」组织长回答，避免大段纯文本；
2. 数学公式：一律使用 LaTeX——行内公式写 $E=mc^2$，独立公式写 $$\\int_0^1 x^2 dx = \\frac{1}{3}$$；分式用 \\frac{}{}，根号用 \\sqrt{}，上下标用 ^ 与 _，求和用 \\sum，积分用 \\int，希腊字母用 \\alpha、\\pi 等；
3. 代码：一律用带语言标注的代码块（\`\`\`python、\`\`\`java 等），保留缩进与换行；
4. 流程图/结构示意图：当描述步骤流程、结构关系、状态转换时，优先用 mermaid 代码块（\`\`\`mermaid ... \`\`\`，支持 flowchart/graph/sequenceDiagram/classDiagram），而不是纯文字罗列；
5. 对比类内容优先用 Markdown 表格呈现；
6. 不要输出原始 HTML 标签；不要使用嵌套复杂 LaTeX 宏。

要求：
- 回答准确、简洁，避免冗长；
- 不确定的内容诚实说明，绝不编造；
- 使用中文回答；
- 适当使用要点或代码块辅助表达。`;

/**
 * AI 答疑 · 流式输出（SSE）
 * 逐 token 推送回答（打字机效果）；流结束后落库（会话/消息持久化与非流式接口一致）。
 * 事件格式：
 *   data: {"session_id": 1}            首帧，返回会话 id
 *   data: {"delta": "..."}             增量文本
 *   data: {"done": true}               结束
 *   data: {"error": "..."}             出错（前端降级到非流式接口）
 */
export async function POST(request: NextRequest) {
  const authUser = await requireAuth(request);
  if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { message?: string; session_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  const message = (body.message || '').trim();
  if (!message) return NextResponse.json({ error: "消息不能为空" }, { status: 400 });

  const db = getDb();

  // 会话归属：只能续写本人会话（与非流式接口一致）
  let sessionId = body.session_id ? Number(body.session_id) : null;
  if (sessionId) {
    const s = db.select().from(qaSession)
      .where(and(eq(qaSession.id, sessionId), eq(qaSession.user_id, authUser.userId)))
      .get();
    if (!s) sessionId = null;
  }
  if (!sessionId) {
    const created = db.insert(qaSession).values({
      user_id: authUser.userId,
      title: message.slice(0, 20),
    }).returning().all();
    sessionId = created[0]?.id;
  }

  // 取历史 + 保存用户消息（非流式部分先落库）——上下文记忆：最近 30 条
  const historyMsgs = db.select().from(qaMessage)
    .where(eq(qaMessage.session_id, sessionId!))
    .orderBy(qaMessage.id)
    .limit(30)
    .all();
  db.insert(qaMessage).values({ session_id: sessionId!, role: 'user', content: message }).run();
  try { saveDb(); } catch { /* 定时持久化兜底 */ }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...historyMsgs
      .filter((m) => m.role && m.content)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();
  const sid = sessionId!;
  const userId = authUser.userId;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* 客户端断开 */ }
      };
      send({ session_id: sid });

      let fullContent = '';
      try {
        // 自动标题：默认标题的会话在首条消息后改为消息摘要（豆包式）
        try {
          const sess = db.select().from(qaSession).where(eq(qaSession.id, sid)).get();
          if (sess && (!sess.title || sess.title === '新的对话')) {
            db.update(qaSession).set({ title: message.slice(0, 20) }).where(eq(qaSession.id, sid)).run();
          }
        } catch { /* 标题更新失败不影响主流程 */ }
        const client = createAIClient();
        for await (const chunk of client.stream(messages, { temperature: 0.5, max_tokens: 1024 })) {
          if (chunk.content) {
            fullContent += chunk.content;
            send({ delta: chunk.content });
          }
        }
        // 流结束：落库 assistant 回复（与非流式接口持久化一致）
        db.insert(qaMessage).values({ session_id: sid, role: 'assistant', content: fullContent }).run();
        db.update(qaSession).set({ updated_at: new Date().toISOString() })
          .where(and(eq(qaSession.id, sid), eq(qaSession.user_id, userId)))
          .run();
        try { saveDb(); } catch { /* 定时持久化兜底 */ }
        send({ done: true });
      } catch (e) {
        console.error("AI assistant stream error:", e);
        // 出错：把已生成的部分保存，并通知前端
        if (fullContent) {
          try {
            db.insert(qaMessage).values({ session_id: sid, role: 'assistant', content: fullContent + '\n\n（回复中断）' }).run();
            try { saveDb(); } catch { /* 定时持久化兜底 */ }
          } catch { /* 忽略落库失败 */ }
        }
        send({ error: 'AI 回复中断，请重试', partial: fullContent });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

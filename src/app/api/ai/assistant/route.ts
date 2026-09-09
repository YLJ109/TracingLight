import { NextRequest, NextResponse } from "next/server";
import { createAIClient , aiErrorResponse } from "@/lib/ai/client";
import { requireAuth } from "@/lib/server-auth";
import { getDb, saveDb } from "@/storage/database/db";
import { qaSession, qaMessage, user, course, knowledgePoint, errorBook } from "@/storage/database/shared/schema";
import { inArray } from "drizzle-orm";
import { eq, and, desc } from "drizzle-orm";
import { buildUserContent, VISION_MODEL, type IncomingAttachment } from "@/lib/ai/attachments";

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

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const db = getDb();

    // 会话列表（不含消息——消息按需经 /session?id= 加载，避免列表接口随历史膨胀）
    const sessions = await db.select({
      id: qaSession.id,
      title: qaSession.title,
      created_at: qaSession.created_at,
      updated_at: qaSession.updated_at,
    }).from(qaSession)
      .where(eq(qaSession.user_id, authUser.userId))
      .orderBy(desc(qaSession.updated_at), desc(qaSession.id))
      .execute();

    const counts = new Map<number, number>();
    for (const s of sessions) {
      const c = await db.select({ id: qaMessage.id }).from(qaMessage)
        .where(eq(qaMessage.session_id, s.id)).execute();
      counts.set(s.id, c.length);
    }

    return NextResponse.json({
      success: true,
      data: sessions.map((s) => ({ ...s, message_count: counts.get(s.id) || 0 })),
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error("AI assistant history error:", e);
    return NextResponse.json({ error: "获取会话失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const message: string = (body.message || '').trim();
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments as IncomingAttachment[] : [];
    if (!message && rawAttachments.length === 0) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    // 构造本轮 user content：图片多模态 + 文件文本注入；并产出持久化元数据
    const build = buildUserContent(message, rawAttachments);
    const titleFallback = (rawAttachments[0]?.name || message || '').slice(0, 20);

    // 获取或创建会话
    let sessionId = body.session_id ? Number(body.session_id) : null;
    if (sessionId) {
      const s = (await db.select().from(qaSession)
        .where(and(eq(qaSession.id, sessionId), eq(qaSession.user_id, authUser.userId)))
        .execute())[0];
      if (!s) sessionId = null;
    }
    if (!sessionId) {
      const created = await db.insert(qaSession).values({
        user_id: authUser.userId,
        title: message.slice(0, 20) || titleFallback,
      }).returning().execute();
      sessionId = created[0]?.id;
    }

    // 取历史消息（上下文记忆：最近 30 条）
    const historyMsgs = await db.select().from(qaMessage)
      .where(eq(qaMessage.session_id, sessionId!))
      .orderBy(qaMessage.id)
      .limit(30)
      .execute();

    // 保存用户消息
    await db.insert(qaMessage).values({ session_id: sessionId!, role: 'user', content: message, attachment: build.persist ? JSON.stringify(build.persist) : null }).execute();

    // ── 轻量 RAG：检索该学生的课程知识点、错题薄弱点，注入上下文让答疑贴合学情 ──
    let contextBlock = '';
    try {
      const stu = (await db.select({ class_id: user.class_id }).from(user)
        .where(eq(user.id, authUser.userId)).limit(1).execute())[0];
      if (stu?.class_id) {
        const courses = await db.select({ id: course.id, name: course.name }).from(course)
          .where(eq(course.class_id, stu.class_id)).execute();
        const courseIds = courses.map((c) => c.id);
        if (courseIds.length > 0) {
          const kps = await db.select({ id: knowledgePoint.id, name: knowledgePoint.name, course_id: knowledgePoint.course_id })
            .from(knowledgePoint)
            .where(inArray(knowledgePoint.course_id, courseIds))
            .execute();
          const errs = await db.select({
            kp_id: errorBook.knowledge_point_id,
            error_type: errorBook.error_type,
            review_status: errorBook.review_status,
          }).from(errorBook)
            .where(and(eq(errorBook.student_id, authUser.userId)))
            .execute();
          // 关键词过滤：优先保留与提问相关的知识点（含在 message 中或错题关联）
          const msgLower = message.toLowerCase();
          const relevantKps = kps.filter((k) => k.name && (msgLower.includes(k.name.slice(0, 2)) || k.name.length <= 4));
          const kpNames = [...new Set((relevantKps.length > 0 ? relevantKps : kps).map((k) => k.name).filter(Boolean))].slice(0, 20);
          const errKpIds = [...new Set(errs.filter((e) => e.review_status !== 'mastered').map((e) => e.kp_id))];
          const errKpNames = kps.filter((k) => errKpIds.includes(k.id)).map((k) => k.name);
          const courseNames = courses.map((c) => c.name).join('、');
          const errSummary = errKpNames.length > 0
            ? `薄弱知识点（来自错题本，未掌握）：${[...new Set(errKpNames)].slice(0, 10).join('、')}`
            : '暂无错题记录';
          contextBlock = `\n\n【学生学情上下文（来自平台真实数据，回答时结合参考）】\n- 在修课程：${courseNames}\n- 课程知识点：${kpNames.join('、')}\n- ${errSummary}\n回答时可主动关联这些知识点与薄弱点，给出针对性建议。`;
        }
      }
    } catch (ctxErr) {
      console.error('Assistant context error:', ctxErr);
    }

    const client = await createAIClient();
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT + contextBlock },
      ...historyMsgs
        .filter((m) => m.role && m.content)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: build.content },
    ];
    // 含图片 → 本轮切换视觉模型
    const result = await client.invoke(messages, { model: build.hasImage ? VISION_MODEL : undefined, temperature: 0.5, max_tokens: 1024 });

    // 保存 AI 回复
    await db.insert(qaMessage).values({ session_id: sessionId!, role: 'assistant', content: result.content }).execute();
    await db.update(qaSession).set({ updated_at: new Date().toISOString() })
      .where(eq(qaSession.id, sessionId!)).execute();
    saveDb();

    return NextResponse.json({ success: true, data: { reply: result.content, session_id: sessionId } });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("AI assistant error:", error);
    const cfgErr = aiErrorResponse(error);
    if (cfgErr) return cfgErr;
    return NextResponse.json(
      { error: "AI 答疑失败，请稍后重试" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { errorBook, knowledgePoint, course } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { createAIClient, invokeStructured, aiErrorResponse } from '@/lib/ai/client';
import { QUESTION_GEN_SYSTEM_PROMPT, buildQuestionGenPrompt } from '@/lib/ai/prompts/question-gen';

/**
 * 举一反三 · 即时练习 —— 生成（P1-2）
 * 学生从错题一键生成同知识点变式练习（3 题，仅客观题，AI 生成但不入题库）。
 * 题目与答案保存在服务端内存（practiceStore），前端仅拿到题目内容；判分在 /submit 服务端完成，答案不泄露。
 */

interface PracticeQuestion {
  content: string;
  question_type: string;
  difficulty: string;
  options: Record<string, string> | null;
  answer: string;
  analysis: string;
  default_score: number;
}

// 内存练习仓库（单进程演示环境够用；重启丢失仅影响未提交的练习）
const g = globalThis as unknown as { __TL_PRACTICE_STORE?: Map<string, { studentId: number; knowledge_point_id: number; questions: PracticeQuestion[]; createdAt: number }> };
if (!g.__TL_PRACTICE_STORE) g.__TL_PRACTICE_STORE = new Map();
const practiceStore = g.__TL_PRACTICE_STORE;

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const body = await request.json();
    const error_book_id = Number(body?.error_book_id) || null;
    const kpIdFromBody = Number(body?.knowledge_point_id) || null;
    if (!error_book_id && !kpIdFromBody) {
      return NextResponse.json({ error: '缺少 error_book_id 或 knowledge_point_id' }, { status: 400 });
    }

    const db = getDb();
    let kpId = kpIdFromBody;
    if (error_book_id) {
      // 归属校验：只能为自己错题生成练习
      const err = db.select().from(errorBook).where(eq(errorBook.id, error_book_id)).limit(1).all()[0];
      if (!err) return NextResponse.json({ error: '错题不存在' }, { status: 404 });
      if (err.student_id !== authUser.userId) {
        return NextResponse.json({ error: '无权操作该错题' }, { status: 403 });
      }
      kpId = err.knowledge_point_id;
    }

    // 知识点与课程信息（AI 出题上下文）
    const kp = kpId
      ? db.select({ id: knowledgePoint.id, name: knowledgePoint.name, description: knowledgePoint.description, course_id: knowledgePoint.course_id })
          .from(knowledgePoint).where(eq(knowledgePoint.id, kpId)).limit(1).all()[0]
      : null;
    if (!kp) return NextResponse.json({ error: '缺少知识点信息' }, { status: 400 });
    const courseData = db.select({ name: course.name }).from(course).where(eq(course.id, kp.course_id)).limit(1).all()[0];

    // 练习题型：单选/填空交替（避免主观题，保证即时判分）
    const client = createAIClient();
    const prompt = buildQuestionGenPrompt({
      courseName: courseData?.name || '课程',
      knowledgePointName: kp.name,
      knowledgePointDescription: kp.description || '',
      questionType: '单选题',
      difficulty: 'medium',
      count: 3,
    });
    const raw = await invokeStructured<PracticeQuestion[]>(client, QUESTION_GEN_SYSTEM_PROMPT, prompt, 0.7);
    const questions = (Array.isArray(raw) ? raw : [raw])
      .filter((q) => q && q.content)
      .slice(0, 3)
      .map((q) => ({
        content: q.content,
        question_type: q.question_type || 'single_choice',
        difficulty: q.difficulty || 'medium',
        options: (typeof q.options === 'object' && q.options) || null,
        answer: q.answer || '',
        analysis: q.analysis || '（暂无解析）',
        default_score: 10,
      }));
    if (questions.length === 0) {
      return NextResponse.json({ error: 'AI 出题失败，请稍后重试' }, { status: 502 });
    }

    // 服务端保存答案与知识点绑定，返回脱敏题目（剥离 answer/analysis）
    // knowledge_point_id 由服务端从错题归属写入，供 /submit 回写掌握度，杜绝前端伪造
    const practiceId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    practiceStore.set(practiceId, { studentId: authUser.userId, knowledge_point_id: kp.id, questions, createdAt: Date.now() });
    // 清理 30 分钟前的过期练习
    for (const [k, v] of practiceStore) {
      if (Date.now() - v.createdAt > 30 * 60 * 1000) practiceStore.delete(k);
    }

    return NextResponse.json({
      success: true,
      data: {
        practice_id: practiceId,
        knowledge_point: { id: kp.id, name: kp.name },
        questions: questions.map((q, i) => ({
          index: i,
          content: q.content,
          question_type: q.question_type,
          difficulty: q.difficulty,
          options: q.options,
          default_score: q.default_score,
        })),
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    const cfgErr = aiErrorResponse(e);
    if (cfgErr) return cfgErr;
    console.error('Practice generate error:', e);
    return NextResponse.json({ error: '生成练习失败，请稍后重试' }, { status: 500 });
  }
}

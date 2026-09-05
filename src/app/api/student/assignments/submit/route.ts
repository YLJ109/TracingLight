import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { answer, assignment } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { assignment_id, answers } = body as {
      assignment_id: number;
      answers: Array<{ question_id: number; student_answer: string }>;
    };

    if (!assignment_id || !answers?.length) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 数据归属强制绑定当前登录用户，杜绝替他人提交（IDOR）
    const studentId = user.userId;

    // 校验题目归属：answers 中的 question_id 必须属于该作业
    const asgn = db.select({ question_ids: assignment.question_ids })
      .from(assignment)
      .where(eq(assignment.id, Number(assignment_id)))
      .limit(1)
      .all();
    if (!asgn[0]) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    const validQuestionIds = (asgn[0].question_ids || []) as number[];
    const invalidQids = answers.map((a) => a.question_id).filter((qid) => !validQuestionIds.includes(Number(qid)));
    if (invalidQids.length > 0) {
      return NextResponse.json({ error: '提交了不属于该作业的题目' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const questionIds = answers.map((a) => a.question_id);

    // Upsert: delete existing answers, then insert new ones
    const result = db.transaction(() => {
      for (const qId of questionIds) {
        db.delete(answer)
          .where(and(
            eq(answer.assignment_id, assignment_id),
            eq(answer.student_id, studentId),
            eq(answer.question_id, qId)
          ))
          .run();
      }

      // Insert all new answers（重做提交：returned 复位，重新进入批改流程）
      const rows = answers.map((a) => ({
        assignment_id,
        student_id: studentId,
        question_id: a.question_id,
        student_answer: a.student_answer,
        is_submitted: true,
        submitted_at: now,
        returned: false,
        returned_at: null,
        return_comment: null,
      }));

      db.insert(answer).values(rows).run();

      // Return the inserted data
      return db.select()
        .from(answer)
        .where(and(
          eq(answer.assignment_id, assignment_id),
          eq(answer.student_id, studentId),
        ))
        .all();
    });

    // 关键写路径即时落盘：提交成功后立刻持久化，避免崩溃丢失（T-2）
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Submit assignment error:', e);
    return NextResponse.json({ error: '提交作业失败' }, { status: 500 });
  }
}

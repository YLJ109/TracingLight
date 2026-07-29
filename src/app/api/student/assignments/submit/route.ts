import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { answer } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { assignment_id, student_id, answers } = body as {
      assignment_id: number;
      student_id: number;
      answers: Array<{ question_id: number; student_answer: string }>;
    };

    if (!assignment_id || !student_id || !answers?.length) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const questionIds = answers.map((a) => a.question_id);

    // Upsert: delete existing answers, then insert new ones
    const result = db.transaction(() => {
      for (const qId of questionIds) {
        db.delete(answer)
          .where(and(
            eq(answer.assignment_id, assignment_id),
            eq(answer.student_id, student_id),
            eq(answer.question_id, qId)
          ))
          .run();
      }

      // Insert all new answers
      const rows = answers.map((a) => ({
        assignment_id,
        student_id,
        question_id: a.question_id,
        student_answer: a.student_answer,
        is_submitted: true,
        submitted_at: now,
      }));

      db.insert(answer).values(rows).run();

      // Return the inserted data
      return db.select()
        .from(answer)
        .where(and(
          eq(answer.assignment_id, assignment_id),
          eq(answer.student_id, student_id),
        ))
        .all();
    });

    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Submit assignment error:', e);
    return NextResponse.json({ error: '提交作业失败' }, { status: 500 });
  }
}

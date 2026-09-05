import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { answer, assignment, gradingTask, question } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { isObjectiveType } from '@/lib/objective-grading';
import { htmlToPlainText } from '@/lib/rich-text';

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
    // 草稿保存标志：save_only / is_draft 任一为真即「保存草稿」，不置为已提交、不触发批改
    const saveOnly = !!(body.save_only || body.is_draft);

    if (!assignment_id || !answers?.length) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 数据归属强制绑定当前登录用户，杜绝替他人提交（IDOR）
    const studentId = user.userId;

    // 归属 + 完整作业信息（用于状态/时间窗/重交规则校验）
    const asgn = db.select()
      .from(assignment)
      .where(eq(assignment.id, Number(assignment_id)))
      .limit(1)
      .all()[0];
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    const validQuestionIds = (asgn.question_ids || []) as number[];
    const invalidQids = answers.map((a) => a.question_id).filter((qid) => !validQuestionIds.includes(Number(qid)));
    if (invalidQids.length > 0) {
      return NextResponse.json({ error: '提交了不属于该作业的题目' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 已存在的作答：草稿存字段 + 正式提交的状态/重交规则校验
    const existingAnswers = db.select().from(answer)
      .where(and(
        eq(answer.assignment_id, assignment_id),
        eq(answer.student_id, studentId)
      ))
      .all();
    const existingMap = new Map(existingAnswers.map((a) => [a.question_id, a]));
    const isCurrentlySubmitted = existingAnswers.length > 0 && existingAnswers.every((a) => a.is_submitted);
    const isReturned = existingAnswers.some((a) => a.returned);

    // ── 正式提交校验（草稿保存不校验，避免阻断中途存档）──
    // 规则：
    //  1. 作业已关闭/未发布 → 拒绝
    //  2. 已整份提交且未退回：若全部题目已批改完成且未开启 allow_resubmit → 拒绝重复提交
    //  3. 作业处于退回重做（answer.returned=1）→ 允许重新提交
    // 不硬性拦截 end_time：演示数据多数已过期，避免阻断正常的首次/退回重做提交
    if (!saveOnly) {
      if (asgn.status === 'closed') {
        return NextResponse.json({ error: '该作业已关闭，无法提交' }, { status: 400 });
      }
      if (asgn.status === 'draft') {
        return NextResponse.json({ error: '该作业尚未发布，无法提交' }, { status: 400 });
      }
      // 超过截止时间自动关闭提交（C6）：除非教师开启补考重开（allow_resubmit）或该生处于退回重做（isReturned），否则拒绝。
      if (asgn.end_time && now > asgn.end_time && !asgn.allow_resubmit && !isReturned) {
        return NextResponse.json({ error: '已超过截止时间，提交通道已关闭' }, { status: 400 });
      }
      if (isCurrentlySubmitted && !isReturned) {
        const gradedQids = db.select({ question_id: gradingTask.question_id })
          .from(gradingTask)
          .where(and(
            eq(gradingTask.assignment_id, assignment_id),
            eq(gradingTask.student_id, studentId),
            eq(gradingTask.status, 'completed'),
            inArray(gradingTask.question_id, validQuestionIds)
          ))
          .all()
          .map((g) => g.question_id);
        const allGraded = validQuestionIds.length > 0 && validQuestionIds.every((qid) => gradedQids.includes(Number(qid)));
        if (allGraded && !asgn.allow_resubmit) {
          return NextResponse.json({ error: '该作业已批改完成且未开启重新提交，暂无法再次提交' }, { status: 400 });
        }
      }
    }

    // ── 内容合规校验（仅正式提交）──
    // 字数限制（主观题）与选择数量限制（多选）。草稿保存跳过，避免阻断中途存档。
    if (!saveOnly) {
      const qRows = validQuestionIds.length > 0
        ? db.select().from(question).where(inArray(question.id, validQuestionIds)).all()
        : [];
      const qMap = new Map(qRows.map((q) => [q.id, q]));
      for (const a of answers) {
        const q = qMap.get(Number(a.question_id));
        if (!q) continue;
        const type = q.question_type;
        // 主观题字数限制：富文本去标签统计纯文本长度
        if (!isObjectiveType(type)) {
          const len = htmlToPlainText(a.student_answer || '').length;
          if (q.max_chars != null && len > q.max_chars) {
            return NextResponse.json({ error: `第 ${a.question_id} 题作答超过字数上限（最多 ${q.max_chars} 字）` }, { status: 400 });
          }
          if (q.min_chars != null && len > 0 && len < q.min_chars) {
            return NextResponse.json({ error: `第 ${a.question_id} 题作答不足最低字数（至少 ${q.min_chars} 字）` }, { status: 400 });
          }
        }
        // 多选选择数量限制
        if (type === 'multiple_choice' || type === 'multi_choice') {
          const picked = (a.student_answer || '').split(',').filter(Boolean).length;
          if (q.max_select != null && picked > q.max_select) {
            return NextResponse.json({ error: `第 ${a.question_id} 题选择项过多（最多 ${q.max_select} 项）` }, { status: 400 });
          }
          if (q.min_select != null && picked < q.min_select) {
            return NextResponse.json({ error: `第 ${a.question_id} 题选择项不足（至少 ${q.min_select} 项）` }, { status: 400 });
          }
        }
      }
    }

    // Upsert: delete existing answers, then insert new ones
    const result = db.transaction(() => {
      for (const qId of answers.map((a) => a.question_id)) {
        db.delete(answer)
          .where(and(
            eq(answer.assignment_id, assignment_id),
            eq(answer.student_id, studentId),
            eq(answer.question_id, qId)
          ))
          .run();
      }

      const rows = answers.map((a) => {
        const qid = a.question_id;
        const prev = existingMap.get(Number(qid));
        if (saveOnly) {
          // 草稿保存：仅更新答案，保持提交/退回状态不变，不触发批改
          const wasSubmitted = !!prev?.is_submitted;
          return {
            assignment_id,
            student_id: studentId,
            question_id: qid,
            student_answer: a.student_answer,
            is_submitted: prev?.is_submitted ?? false,
            submitted_at: wasSubmitted ? prev!.submitted_at : null,
            returned: prev?.returned ?? false,
            returned_at: prev?.returned_at ?? null,
            return_comment: prev?.return_comment ?? null,
          };
        }
        // 正式提交：置已提交并写时间戳；重做提交时复位 returned，重新进入批改流程
        return {
          assignment_id,
          student_id: studentId,
          question_id: qid,
          student_answer: a.student_answer,
          is_submitted: true,
          submitted_at: now,
          returned: false,
          returned_at: null,
          return_comment: null,
        };
      });

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

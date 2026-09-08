import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { answer, assignment, gradingTask, question, answerMonitor } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { canAccessCourse } from '@/lib/course-access';
import { isObjectiveType } from '@/lib/objective-grading';
import { htmlToPlainText } from '@/lib/rich-text';
import { gradeOneAndRecord } from '@/services/grading.service';
import { computePlagiarism, assessSuspicious } from '@/services/plagiarism/checker';
import { writeAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { assignment_id, answers, monitor } = body as {
      assignment_id: number;
      answers: Array<{ question_id: number; student_answer: string }>;
      monitor?: Partial<{
        copy_count: number;
        paste_count: number;
        blur_count: number;
        blur_seconds: number;
        time_spent_seconds: number;
        start_at: string;
        paste_records: Array<{ questionId: number; preview: string; at: string }>;
      }>;
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
    // 越权防护：仅本班课程作业可提交
    if (!canAccessCourse(user, asgn.course_id)) return NextResponse.json({ error: '无权参与该作业' }, { status: 403 });
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

    // 成绩已公布 → 已提交学生的作答视为只读，禁止再提交/保存修改（教师退回重做除外）。
    // 纯客观题作业会随每位学生首次提交即时发布，因此未提交的学生首次提交必须放行，否则其余学生将无法作答。
    if (Number(asgn.grades_published) === 1 && isCurrentlySubmitted && !isReturned) {
      return NextResponse.json({ error: '该作业成绩已公布，已提交的作答仅可查看，无法修改' }, { status: 403 });
    }

    // ── 正式提交校验（草稿保存不校验，避免阻断中途存档）──
    // 规则：
    //  1. 作业已关闭/未发布 → 拒绝
    //  2. 已整份提交且未退回 → 提交即锁定：除非教师开启补交（allow_resubmit）或退回重做，否则拒绝再次提交
    //  3. 作业处于退回重做（answer.returned=1）→ 允许重新提交
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
      // 正式提交即锁定（对标学习通）：一经提交即不再允许修改，除非退回重做或教师开放补交
      if (isCurrentlySubmitted && !isReturned) {
        if (!asgn.allow_resubmit) {
          return NextResponse.json({ error: '该作业已提交并锁定，暂无法再次提交。如需修改请联系老师退回重做或开启补交' }, { status: 400 });
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

    // ── 客观题提交即时预判分（规则引擎，无 AI，确定且耗时极低）──
    // 仅正式提交触发；草稿保存不判分。客观题提交时先用规则引擎算出最终分并落库，
    // 但**不自动公布**——成绩/答案/解析仅教师批改复核并手动「公布成绩」后对学生可见（教师主导）。
    // 主观题不在此处调用 AI，仅进入待批队列，由教师在批改台「AI 批量批改」后复核公布。
    const objectiveGrades: Array<{ question_id: number; total_score: number; full_score: number }> = [];
    if (!saveOnly && result.length > 0) {
      const qRows = validQuestionIds.length > 0
        ? db.select().from(question).where(inArray(question.id, validQuestionIds)).all()
        : [];
      const ansById = new Map(result.map((r) => [r.question_id, r]));
      for (const q of qRows) {
        if (!isObjectiveType(q.question_type)) continue;
        const ans = ansById.get(q.id);
        try {
          const { result: rr } = await gradeOneAndRecord({
            questionData: q,
            studentId,
            assignmentId: assignment_id,
            studentAnswer: ans?.student_answer || '',
            answerId: ans?.id ?? 0,
            knowledgePointName: '',
            notify: false,
          });
          objectiveGrades.push({ question_id: q.id, total_score: rr.total_score, full_score: rr.full_score });
        } catch (e) {
          console.error('Objective instant grading failed', q.id, e);
        }
      }
    }

    const objectiveSummary = objectiveGrades.length > 0
      ? { total_score: objectiveGrades.reduce((s, g) => s + g.total_score, 0),
          full_score: objectiveGrades.reduce((s, g) => s + g.full_score, 0) }
      : null;

    // ── 防作弊监督：记录作答行为 + 学生端对全班查重 + 系统判疑（提交即回落 answer_monitor）──
    // 定位为「监督采集 + 系统提示 + 老师复核」，因前端 JS 可被绕过，不作绝对判罚。
    if (!saveOnly) {
      try {
        const m = monitor || {};
        const copyCount = Math.max(0, Number(m.copy_count) || 0);
        const pasteCount = Math.max(0, Number(m.paste_count) || 0);
        const blurCount = Math.max(0, Number(m.blur_count) || 0);
        const blurSeconds = Math.max(0, Number(m.blur_seconds) || 0);
        const timeSpent = Math.max(0, Number(m.time_spent_seconds) || 0);
        const pasteRecords = Array.isArray(m.paste_records)
          ? m.paste_records.slice(0, 200)
          : [];

        // 读取作业监督配置（服务端为准，防止前端伪造）
        const monitorConfig = (asgn.monitor_config as Record<string, unknown> | null) || {};

        // 对当前学生在本作业的主观题作答做班级内查重（与其余已提交同学）
        const monoSubjRows = validQuestionIds.length > 0
          ? db.select({ id: question.id, question_type: question.question_type })
              .from(question)
              .where(inArray(question.id, validQuestionIds))
              .all()
              .filter((q) => !isObjectiveType(q.question_type))
          : [];
        let maxSimilarity = 0;
        if (monoSubjRows.length > 0) {
          let similarity = 0;
          for (const q of monoSubjRows) {
            const mine = answers.find((a) => a.question_id === q.id)?.student_answer || '';
            if (!htmlToPlainText(mine).trim()) continue;
            const peers = db.select({ student_id: answer.student_id, student_answer: answer.student_answer })
              .from(answer)
              .where(and(
                eq(answer.assignment_id, assignment_id),
                eq(answer.question_id, q.id),
                eq(answer.is_submitted, true),
              ))
              .all()
              .filter((r) => r.student_id !== studentId);
            const all = [{ student_id: studentId, text: mine }, ...peers.map((p) => ({ student_id: p.student_id, text: p.student_answer || '' }))];
            similarity = Math.max(similarity, computePlagiarism(all).max_similarity);
          }
          maxSimilarity = similarity;
        }

        // 系统判疑：极短用时 / 超高切屏（配合阈值判断）
        const minTimeSec = Number(monitorConfig.min_time_seconds) || 0;
        const maxBlur = Number(monitorConfig.max_blur_count) || 5;
        const simThreshold = Number(monitorConfig.similarity_threshold) || 0.8;
        const suspicious = assessSuspicious({
          time_spent_seconds: timeSpent,
          min_time_seconds: minTimeSec > 0 ? minTimeSec : undefined,
          blur_count: blurCount,
          max_blur: maxBlur,
          max_similarity: maxSimilarity,
          similar_threshold: simThreshold,
        });

        const monitorSnapshot = {
          copied_chars: copyCount,
          pasted_chars: pasteCount,
          time_spent_seconds: timeSpent,
          start_at: m.start_at || null,
        };

        const existingMonitor = db.select({ id: answerMonitor.id })
          .from(answerMonitor)
          .where(and(eq(answerMonitor.assignment_id, assignment_id), eq(answerMonitor.student_id, studentId)))
          .limit(1).all()[0];
        const monitorRow = {
          assignment_id,
          student_id: studentId,
          copy_count: copyCount,
          paste_count: pasteCount,
          blur_count: blurCount,
          blur_seconds: blurSeconds,
          time_spent_seconds: timeSpent,
          paste_records: pasteRecords,
          suspicious_flag: suspicious.flag,
          suspicious_reason: suspicious.reason || null,
          monitor_snapshot: monitorSnapshot,
          updated_at: now,
        };
        if (existingMonitor) {
          db.update(answerMonitor).set(monitorRow).where(eq(answerMonitor.id, existingMonitor.id)).run();
        } else {
          db.insert(answerMonitor).values(monitorRow).run();
        }
        try { saveDb(); } catch { /* 兜底 */ }
      } catch (e) {
        console.error('Monitor persistence failed', e);
      }
    }

    // 正式提交（非草稿保存）埋点（静默，失败不影响响应）
    if (!saveOnly) {
      try {
        writeAudit({
          operatorId: studentId,
          operatorName: user.username,
          action: 'assignment_submit',
          targetType: 'assignment',
          targetId: Number(assignment_id),
          detail: `提交作业「${String(asgn.title).slice(0, 50)}」`,
        });
      } catch (auditErr) {
        console.error('Assignment submit audit error:', auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      count: result.length,
      objectiveGrades,
      objective_summary: objectiveSummary,
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Submit assignment error:', e);
    return NextResponse.json({ error: '提交作业失败' }, { status: 500 });
  }
}

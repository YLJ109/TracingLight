import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, desc } from 'drizzle-orm';
import {
  assignment, peerReview, user, question, answer, course,
} from '@/storage/database/shared/schema';
import { parsePeerConfig } from '@/lib/peer-review';

/**
 * 教师端「生生互评」管理接口
 *  - GET：互评配置 + 全部互评记录（含评阅人/被评人姓名）+ 按被评人聚合的分值
 *  - PUT：更新互评配置 { enabled?, count?, reveal_name? }
 * 跨租户隔离：仅本人创建的作业可访问。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const assignmentId = parseInt(id);

    const asgnRows = await db.select().from(assignment)
      .where(eq(assignment.id, assignmentId)).limit(1).execute();
    const asgn = asgnRows[0] || null;
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    if (asgn.teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }

    const config = parsePeerConfig(asgn.peer_review);

    // 提交人数统计
    const courseRows = await db.select({ class_id: course.class_id })
      .from(course).where(eq(course.id, asgn.course_id)).execute();
    const courseRow = courseRows[0] || null;
    const submittedRows = await db.select({ student_id: answer.student_id })
      .from(answer)
      .where(and(eq(answer.assignment_id, assignmentId), eq(answer.is_submitted, true)))
      .groupBy(answer.student_id).execute();
    const totalRows = courseRow?.class_id
      ? await db.select({ id: user.id }).from(user)
          .where(and(eq(user.role, 'student'), eq(user.class_id, courseRow.class_id))).execute()
      : [];
    const submissions = {
      submitted: submittedRows.length,
      total: totalRows.length,
    };

    // 全部互评记录
    const reviewRows = await db.select().from(peerReview)
      .where(eq(peerReview.assignment_id, assignmentId))
      .orderBy(desc(peerReview.created_at)).execute();

    const userIds = [...new Set(reviewRows.flatMap((r) => [r.reviewer_id, r.reviewee_id]))];
    const userMap = new Map<number, string>();
    if (userIds.length > 0) {
      const us = await db.select({ id: user.id, real_name: user.real_name })
        .from(user).where(inArray(user.id, userIds)).execute();
      us.forEach((u) => userMap.set(u.id, u.real_name));
    }
    const qIds = [...new Set(reviewRows.map((r) => r.question_id))];
    const qMap = new Map<number, { content: string; question_type: string }>();
    if (qIds.length > 0) {
      const qs = await db.select({ id: question.id, content: question.content, question_type: question.question_type })
        .from(question).where(inArray(question.id, qIds)).execute();
      qs.forEach((q) => qMap.set(q.id, { content: q.content, question_type: q.question_type }));
    }

    const reviews = reviewRows.map((r) => ({
      id: r.id,
      assignment_id: r.assignment_id,
      question_id: r.question_id,
      question: qMap.get(r.question_id) || null,
      reviewer_id: r.reviewer_id,
      reviewer_name: userMap.get(r.reviewer_id) || `同学#${r.reviewer_id}`,
      reviewee_id: r.reviewee_id,
      reviewee_name: userMap.get(r.reviewee_id) || `同学#${r.reviewee_id}`,
      total_score: r.total_score,
      dimension_scores: r.dimension_scores,
      comment: r.comment,
      status: r.status,
      created_at: r.created_at,
    }));

    // 按被评人+题目聚合（count + avg）
    const scoreMap = new Map<string, { reviewee_id: number; question_id: number; scores: number[] }>();
    for (const r of reviewRows) {
      if (r.total_score == null) continue;
      const key = `${r.reviewee_id}:${r.question_id}`;
      if (!scoreMap.has(key)) scoreMap.set(key, { reviewee_id: r.reviewee_id, question_id: r.question_id, scores: [] });
      scoreMap.get(key)!.scores.push(r.total_score);
    }
    const peerScores = [...scoreMap.values()].map((g) => {
      const sum = g.scores.reduce((a, b) => a + b, 0);
      return {
        reviewee_id: g.reviewee_id,
        reviewee_name: userMap.get(g.reviewee_id) || `同学#${g.reviewee_id}`,
        question_id: g.question_id,
        review_count: g.scores.length,
        avg_score: Math.round((sum / g.scores.length) * 10) / 10,
      };
    });

    return NextResponse.json({
      success: true,
      data: { config, submissions, reviews, peerScores },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get peer review error:', e);
    return NextResponse.json({ error: '获取互评数据失败' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const assignmentId = parseInt(id);

    const asgnRows = await db.select().from(assignment)
      .where(eq(assignment.id, assignmentId)).limit(1).execute();
    const asgn = asgnRows[0] || null;
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    if (asgn.teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }

    const body = await request.json();
    const prev = parsePeerConfig(asgn.peer_review);
    const next = {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : prev.enabled,
      count: Number.isFinite(Number(body.count)) && body.count != null
        ? Math.min(10, Math.max(1, Math.round(Number(body.count))))
        : prev.count,
      reveal_name: typeof body.reveal_name === 'boolean' ? body.reveal_name : prev.reveal_name,
    };

    await db.update(assignment).set({ peer_review: next }).where(eq(assignment.id, assignmentId)).execute();
    saveDb();

    return NextResponse.json({ success: true, data: { config: next } });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Update peer review error:', e);
    return NextResponse.json({ error: '更新互评配置失败' }, { status: 500 });
  }
}
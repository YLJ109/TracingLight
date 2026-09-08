import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, desc } from 'drizzle-orm';
import {
  assignment, peerReview, user, question, answer, course,
} from '@/storage/database/shared/schema';
import { isObjectiveType } from '@/lib/objective-grading';
import {
  pickPeers, parsePeerConfig, isPeerRevealName, peerBlindLabel,
} from '@/lib/peer-review';

/** 是否盲评（匿名默认）。reveal_name 为 true 才显示姓名。 */
function labelFor(studentId: number, indexBySorted: number, reveal: boolean, nameMap: Map<number, string>): string {
  if (reveal) return nameMap.get(studentId) || `同学#${studentId}`;
  return peerBlindLabel(indexBySorted);
}

interface PeerTarget {
  assignment_id: number;
  question_id: number;
  question_type: string;
  content: string;
  reference_answer: string | null;
  full_score: number;
  reviewee_id: number;
  peer_label: string;
  reviewee_name: string | null;
  student_answer: string | null;
}

/**
 * 学生端「生生互评」：
 *  - GET ?assignment_id=X&mine=1 ：返回「我收到的互评」（reviewee=我），用于作业详情页展示互评参考；
 *  - GET 无参（或带 course_id）：返回已开启互评的作业及「我需互评」的待办（盲评匿名），用于互评页面。
 *  - POST：提交一份互评（upsert）。
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const me = authUser.userId;
    const { searchParams } = new URL(request.url);
    const assignmentIdParam = searchParams.get('assignment_id');
    const mine = searchParams.get('mine') === '1';

    // ── 分支：仅取「我收到的互评」（指定作业）──
    if (assignmentIdParam && mine) {
      const assignmentId = parseInt(assignmentIdParam);
      const rows = db.select().from(peerReview)
        .where(and(eq(peerReview.assignment_id, assignmentId), eq(peerReview.reviewee_id, me)))
        .orderBy(desc(peerReview.created_at)).all();
      const asgnRows = db.select().from(assignment)
        .where(eq(assignment.id, assignmentId)).limit(1).all();
      const asgn = asgnRows[0] || null;
      if (!asgn) return NextResponse.json({ success: true, data: [] });
      const config = parsePeerConfig(asgn.peer_review);
      const reveal = isPeerRevealName(asgn.peer_review);

      // 评阅人姓名（盲评时仅用化名标签）
      const reviewerIds = [...new Set(rows.map((r) => r.reviewer_id))];
      const nameMap = new Map<number, string>();
      if (reviewerIds.length) {
        const us = db.select({ id: user.id, real_name: user.real_name })
          .from(user).where(inArray(user.id, reviewerIds)).all();
        us.forEach((u) => nameMap.set(u.id, u.real_name));
      }
      const qIds = [...new Set(rows.map((r) => r.question_id))];
      const qMap = new Map<number, { content: string; question_type: string; answer: string | null }>();
      if (qIds.length) {
        const qs = db.select({ id: question.id, content: question.content, question_type: question.question_type, answer: question.answer })
          .from(question).where(inArray(question.id, qIds)).all();
        qs.forEach((q) => qMap.set(q.id, { content: q.content, question_type: q.question_type, answer: q.answer }));
      }
      const sortedReviewers = [...reviewerIds].sort((a, b) => a - b);
      const data = rows.map((r, i) => ({
        id: r.id,
        question_id: r.question_id,
        question: qMap.get(r.question_id) || null,
        reviewer_name: reveal ? (nameMap.get(r.reviewer_id) || `同学#${r.reviewer_id}`) : (peerBlindLabel(sortedReviewers.indexOf(r.reviewer_id))),
        total_score: r.total_score,
        dimension_scores: r.dimension_scores,
        comment: r.comment,
        created_at: r.created_at,
      }));
      return NextResponse.json({ success: true, data });
    }

    // ── 分支：返回「我需互评」的作业与待办 ──
    if (!authUser.classId) return NextResponse.json({ success: true, data: [] });
    const classId = authUser.classId;
    const courseRows = db.select({ id: course.id }).from(course).where(eq(course.class_id, classId)).all();
    const courseIds = courseRows.map((c) => c.id);
    if (courseIds.length === 0) return NextResponse.json({ success: true, data: [] });

    const asgns = db.select().from(assignment)
      .where(inArray(assignment.course_id, courseIds))
      .orderBy(desc(assignment.created_at)).all();
    const enabledAsgns = asgns.filter((a) => parsePeerConfig(a.peer_review).enabled);

    // 我是否已提交该作业（互评前置条件）
    const mySubmitted = new Set<number>();
    {
      const rows = db.select({ assignment_id: answer.assignment_id })
        .from(answer)
        .where(and(eq(answer.student_id, me), eq(answer.is_submitted, true)))
        .groupBy(answer.assignment_id).all();
      rows.forEach((r) => mySubmitted.add(r.assignment_id));
    }

    // 该班级内全部学生 id（用于姓名映射 + 盲评排序）
    const classStudentIds = db.select({ id: user.id, real_name: user.real_name })
      .from(user)
      .where(and(eq(user.role, 'student'), eq(user.class_id, classId))).all();
    const sortedClassStudentIds = classStudentIds.map((u) => u.id).sort((a, b) => a - b);
    const nameMap = new Map(classStudentIds.map((u) => [u.id, u.real_name]));

    const result: Array<{
      assignment: { id: number; title: string; course_name: string; total_score: number };
      config: { enabled: boolean; count: number; reveal_name: boolean };
      submitted: boolean;
      targets: Array<{
        assignment_id: number;
        question_id: number;
        question_type: string;
        content: string;
        reference_answer: string | null;
        full_score: number;
        reviewee_id: number;
        peer_label: string;
        reviewee_name: string | null;
        student_answer: string | null;
      }>;
    }> = [];

    for (const asgn of enabledAsgns) {
      const config = parsePeerConfig(asgn.peer_review);
      const reveal = config.reveal_name;
      const assignmentIdForReview = asgn.id;
      if (!mySubmitted.has(assignmentIdForReview)) continue; // 未提交则暂不派互评

      const qIds = (asgn.question_ids as number[]) || [];
      const qs = qIds.length
        ? db.select().from(question).where(inArray(question.id, qIds)).all()
        : [];
      const subjectiveQs = qs.filter((q) => !isObjectiveType(q.question_type));

      const qFullScore = (qid: number): number => {
        const scores = asgn.question_scores as Record<number, number> | null | undefined;
        if (scores && Number.isFinite(Number(scores[qid]))) return Number(scores[qid]);
        return qs.find((q) => q.id === qid)?.default_score ?? 10;
      };

      // 已提交同学（同班、已交该作业）
      const submittedRows = db.select({ student_id: answer.student_id })
        .from(answer)
        .where(and(eq(answer.assignment_id, assignmentIdForReview), eq(answer.is_submitted, true)))
        .groupBy(answer.student_id).all();
      const submittedStudentIds = submittedRows.map((r) => r.student_id);

      // 学生作答（用于取每题作答内容 + 判断是否已答）
      const answerRows = db.select({
        student_id: answer.student_id, question_id: answer.question_id, student_answer: answer.student_answer,
      })
        .from(answer)
        .where(and(eq(answer.assignment_id, assignmentIdForReview), inArray(answer.question_id, subjectiveQs.map((q) => q.id))))
        .all();
      const answerByQ = new Map<string, string | null>();
      answerRows.forEach((r) => answerByQ.set(`${r.student_id}:${r.question_id}`, r.student_answer));

      // 既有互评记录（按 reviewee 聚合已有的评阅人）
      const existingByReviewee = new Map<number, number[]>();
      const existingRows = db.select({ reviewer_id: peerReview.reviewer_id, reviewee_id: peerReview.reviewee_id })
        .from(peerReview)
        .where(eq(peerReview.assignment_id, assignmentIdForReview)).all();
      existingRows.forEach((r) => {
        if (!existingByReviewee.has(r.reviewee_id)) existingByReviewee.set(r.reviewee_id, []);
        existingByReviewee.get(r.reviewee_id)!.push(r.reviewer_id);
      });

      const targets: PeerTarget[] = [];
      for (const revieweeId of submittedStudentIds) {
        if (revieweeId === me) continue;
        const reviewers = pickPeers({
          revieweeId,
          submittedStudentIds,
          count: config.count,
          excludeIds: existingByReviewee.get(revieweeId) || [],
        });
        if (!reviewers.includes(me)) continue; // 本次互评未被分配到我
        for (const q of subjectiveQs) {
          const stuAns = answerByQ.get(`${revieweeId}:${q.id}`) || '';
          // 跳过未作答的题目（无可评内容）
          if (!stuAns.trim()) continue;
          targets.push({
            assignment_id: assignmentIdForReview,
            question_id: q.id,
            question_type: q.question_type,
            content: q.content,
            reference_answer: q.answer ?? null,
            full_score: qFullScore(q.id),
            reviewee_id: revieweeId,
            peer_label: labelFor(revieweeId, sortedClassStudentIds.indexOf(revieweeId), reveal, nameMap),
            reviewee_name: reveal ? (nameMap.get(revieweeId) || null) : null,
            student_answer: stuAns,
          });
        }
      }

      const courseInfo = db.select({ name: course.name }).from(course)
        .where(eq(course.id, asgn.course_id)).get();
      result.push({
        assignment: {
          id: asgn.id,
          title: asgn.title,
          course_name: courseInfo?.name || '',
          total_score: asgn.total_score ?? 100,
        },
        config,
        submitted: mySubmitted.has(assignmentIdForReview),
        targets: targets,
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get student peer review error:', e);
    return NextResponse.json({ error: '获取互评数据失败' }, { status: 500 });
  }
}

/** 已互评记录（assignment 维度） */

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const reviewerId = authUser.userId;
    const body = await request.json();
    const assignmentId = Number(body.assignment_id);
    const questionId = Number(body.question_id);
    const revieweeId = Number(body.reviewee_id);
    const totalScore = Number(body.total_score);

    if (!assignmentId || !questionId || !revieweeId) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    if (revieweeId === reviewerId) {
      return NextResponse.json({ error: '不能互评自己的作业' }, { status: 400 });
    }

    const asgnRows = db.select().from(assignment).where(eq(assignment.id, assignmentId)).limit(1).all();
    const asgn = asgnRows[0] || null;
    if (!asgn) return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    const config = parsePeerConfig(asgn.peer_review);
    if (!config.enabled) return NextResponse.json({ error: '该作业未开启互评' }, { status: 400 });

    // 跨租户隔离：被评者必须是同班学生且已提交该作业
    const courseInfo = db.select({ class_id: course.class_id }).from(course)
      .where(eq(course.id, asgn.course_id)).get();
    const revieweeRows = db.select()
      .from(user)
      .where(and(eq(user.id, revieweeId), eq(user.role, 'student')))
      .limit(1).all();
    const reviewee = revieweeRows[0] || null;
    if (!reviewee || courseInfo?.class_id == null || reviewee.class_id !== courseInfo.class_id) {
      return NextResponse.json({ error: '被评同学不在本班范围内' }, { status: 403 });
    }

    // 题目分值（用于校验互评分数范围）
    const qRows = db.select().from(question).where(eq(question.id, questionId)).limit(1).all();
    const q = qRows[0] || null;
    if (!q) return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    if (isObjectiveType(q.question_type)) {
      return NextResponse.json({ error: '客观题无需互评' }, { status: 400 });
    }
    const scores = asgn.question_scores as Record<number, number> | null | undefined;
    const fullScore = (scores && Number.isFinite(Number(scores[questionId])) ? Number(scores[questionId]) : q.default_score) || 10;
    if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > fullScore) {
      return NextResponse.json({ error: `互评分值需在 0 ~ ${fullScore} 之间` }, { status: 400 });
    }

    // 校验该同学确已作答该题（只评已提交的作答）
    const hasAnswer = db.select({ id: answer.id })
      .from(answer)
      .where(and(
        eq(answer.assignment_id, assignmentId),
        eq(answer.question_id, questionId),
        eq(answer.student_id, revieweeId),
        eq(answer.is_submitted, true),
      ))
      .get();
    if (!hasAnswer) return NextResponse.json({ error: '该同学尚未作答此题' }, { status: 400 });

    const dimensionScores = (body.dimension_scores && typeof body.dimension_scores === 'object')
      ? {
          knowledge_accuracy: Number(body.dimension_scores.knowledge_accuracy),
          logic_completeness: Number(body.dimension_scores.logic_completeness),
          expression_clarity: Number(body.dimension_scores.expression_clarity),
          expansion: Number(body.dimension_scores.expansion),
        }
      : undefined;

    // upsert（同 (assignment, question, reviewer, reviewee) 唯一键）
    db.insert(peerReview).values({
      assignment_id: assignmentId,
      question_id: questionId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      total_score: Math.round(totalScore * 10) / 10,
      dimension_scores: dimensionScores,
      comment: body.comment || '',
      status: 'completed',
    }).onConflictDoUpdate({
      target: [peerReview.assignment_id, peerReview.question_id, peerReview.reviewer_id, peerReview.reviewee_id],
      set: {
        total_score: Math.round(totalScore * 10) / 10,
        dimension_scores: dimensionScores,
        comment: body.comment || '',
        status: 'completed',
      },
    }).run();
    saveDb();

    return NextResponse.json({ success: true, data: { reviewed: true } });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Submit peer review error:', e);
    return NextResponse.json({ error: '提交互评失败' }, { status: 500 });
  }
}
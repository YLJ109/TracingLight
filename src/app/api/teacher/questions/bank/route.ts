import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and, sql, inArray, notInArray } from 'drizzle-orm';
import { question, course, knowledgePoint, gradingTask, assignment, exam } from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';

// 解析某题归属课程
function questionCourseId(questionId: number): number | null {
  const db = getDb();
  const row = db.select({ course_id: question.course_id })
    .from(question).where(eq(question.id, questionId)).get();
  return row?.course_id ?? null;
}

// 根据知识点反查课程归属
function kpCourseId(kpId?: number | null): number | null {
  if (kpId == null) return null;
  const db = getDb();
  const row = db.select({ course_id: knowledgePoint.course_id })
    .from(knowledgePoint).where(eq(knowledgePoint.id, kpId)).get();
  return row?.course_id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const course_id = searchParams.get('course_id');
    const knowledge_point_id = searchParams.get('knowledge_point_id');
    const question_type = searchParams.get('question_type');
    const difficulty = searchParams.get('difficulty');
    const excludeLocked = searchParams.get('exclude_locked') === '1';
    const usage = searchParams.get('usage'); // used | unused
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const offset = (page - 1) * pageSize;

    const myCourseIds = getTeacherCourseIds(authUser.userId);
    // 计算每题「已布置」次数：扫描本人课程下所有作业与考试的 question_ids
    const usedCounts = new Map<number, number>();
    const scanRefs = (qids: unknown) => {
      if (!Array.isArray(qids)) return;
      qids.forEach((id) => {
        const n = Number(id);
        if (Number.isFinite(n)) usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
      });
    };
    if (myCourseIds.length > 0) {
      db.select({ q: assignment.question_ids }).from(assignment)
        .where(inArray(assignment.course_id, myCourseIds)).all().forEach((r) => scanRefs(r.q));
      db.select({ q: exam.question_ids }).from(exam)
        .where(inArray(exam.course_id, myCourseIds)).all().forEach((r) => scanRefs(r.q));
    }
    const usedIds = [...usedCounts.keys()];
    // 越权指定他人课程 → 403
    if (course_id && !myCourseIds.includes(parseInt(course_id))) {
      return NextResponse.json({ error: '无权访问该课程' }, { status: 403 });
    }
    // 越权指定他人课程下的知识点 → 403
    if (knowledge_point_id && !course_id) {
      const kc = kpCourseId(parseInt(knowledge_point_id));
      if (kc != null && !myCourseIds.includes(kc)) {
        return NextResponse.json({ error: '无权访问该知识点' }, { status: 403 });
      }
    }

    // 题目可见范围：本人课程的题目（含知识点属于本人课程但未标注课程的历史题）
    const filters = [
      eq(question.is_active, true),
      myCourseIds.length > 0
        ? inArray(question.course_id, myCourseIds)
        : eq(question.id, -1),
    ];
    if (course_id) filters.push(eq(question.course_id, parseInt(course_id)));
    if (knowledge_point_id) filters.push(eq(question.knowledge_point_id, parseInt(knowledge_point_id)));
    if (question_type) filters.push(eq(question.question_type, question_type));
    if (difficulty) filters.push(eq(question.difficulty, difficulty));
    // 选题/组卷场景：排除已锁定题目
    if (excludeLocked) filters.push(eq(question.locked, false));
    // 布置状态筛选：used=已被作业/考试布置过；unused=从未布置
    if (usage === 'used') filters.push(inArray(question.id, usedIds.length ? usedIds : [-1]));
    if (usage === 'unused') filters.push(notInArray(question.id, usedIds));

    // Get total count
    const countResult = db.select({ count: sql<number>`count(*)` })
      .from(question)
      .where(and(...filters))
      .all();
    const total = countResult[0]?.count || 0;

    // Get paginated questions
    const questions = db.select().from(question)
      .where(and(...filters))
      .orderBy(desc(question.created_at))
      .limit(pageSize)
      .offset(offset)
      .all();

    // Collect course IDs and knowledge point IDs for enrichment
    const courseIds = [...new Set(questions.map((q) => q.course_id))];
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id))];

    const coursesMap = new Map<number, { id: number; name: string; short_name: string | null }>();
    if (courseIds.length > 0) {
      const crs = db.select({ id: course.id, name: course.name, short_name: course.short_name })
        .from(course)
        .where(inArray(course.id, courseIds))
        .all();
      crs.forEach((c) => coursesMap.set(c.id, c));
    }

    const kpMap = new Map<number, { id: number; name: string }>();
    if (kpIds.length > 0) {
      const kps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds as number[]))
        .all();
      kps.forEach((kp) => kpMap.set(kp.id, kp));
    }

    // 正确率统计：仅统计已批改完成(completed)的作答（退回/重批的旧行 status=superseded 不计入）。
    // 答对 = 满分（规则引擎对客观题仅精确正确给满分，主观题 AI 满分代表完整作答）。
    const accuracyByQuestion = new Map<number, { attempts: number; correct: number }>();
    if (questions.length > 0) {
      const gradings = db.select({
        question_id: gradingTask.question_id,
        total_score: gradingTask.total_score,
        full_score: gradingTask.full_score,
      }).from(gradingTask)
        .where(and(inArray(gradingTask.question_id, questions.map(q => q.id)), eq(gradingTask.status, 'completed')))
        .all();
      for (const g of gradings) {
        const cur = accuracyByQuestion.get(g.question_id) || { attempts: 0, correct: 0 };
        cur.attempts += 1;
        if ((g.total_score ?? 0) >= (g.full_score ?? 0)) cur.correct += 1;
        accuracyByQuestion.set(g.question_id, cur);
      }
    }

    // Enrich questions
    const enrichedQuestions = questions.map((q) => {
      const acc = accuracyByQuestion.get(q.id);
      return {
        ...q,
        course: coursesMap.get(q.course_id) || null,
        knowledge_point: kpMap.get(q.knowledge_point_id) || null,
        accuracy_attempts: acc?.attempts ?? 0,
        accuracy: acc && acc.attempts > 0 ? Math.round((acc.correct / acc.attempts) * 1000) / 10 : null,
        used_count: usedCounts.get(q.id) || 0,
        is_used: usedCounts.has(q.id),
      };
    });

    // 下拉课程：仅本人课程
    const courses = myCourseIds.length > 0
      ? db.select({
          id: course.id,
          name: course.name,
          short_name: course.short_name,
        }).from(course).where(inArray(course.id, myCourseIds)).orderBy(course.id).all()
      : [];

    // 知识点下拉：仅本人课程的知识点（供出题选择）
    const allKps = myCourseIds.length > 0
      ? db.select({
          id: knowledgePoint.id,
          name: knowledgePoint.name,
          course_id: knowledgePoint.course_id,
        }).from(knowledgePoint)
          .where(inArray(knowledgePoint.course_id, myCourseIds))
          .orderBy(knowledgePoint.id)
          .all()
      : [];

    return NextResponse.json({
      success: true,
      data: {
        questions: enrichedQuestions,
        total,
        page,
        pageSize,
        courses,
        knowledgePoints: allKps,
      },
    });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    return NextResponse.json({ success: false, error: '获取题库失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await req.json();

    const {
      course_id,
      knowledge_point_id,
      question_type,
      difficulty,
      content,
      options,
      answer: answerText,
      analysis,
      default_score,
      source,
      min_chars,
      max_chars,
      min_select,
      max_select,
      experiment_template,
    } = body;

    if (!knowledge_point_id) {
      return NextResponse.json({ success: false, error: '请选择知识点' }, { status: 400 });
    }

    const myCourseIds = getTeacherCourseIds(authUser.userId);
    // 归属：题目课程必须为本人课程；若未给课程则从知识点反查，仍须归属本人
    const targetCourseId: number | null = course_id ? Number(course_id) : kpCourseId(knowledge_point_id);
    if (targetCourseId != null && !myCourseIds.includes(targetCourseId)) {
      return NextResponse.json({ success: false, error: '无权在该课程创建题目' }, { status: 403 });
    }

    // 实验题：将可选 experiment_template 存入 question.options = { template: {...} }
    let finalOptions: unknown = options || {};
    if (experiment_template && typeof experiment_template === 'object') {
      const base = (options && typeof options === 'object') ? options : {};
      finalOptions = { ...(base as Record<string, unknown>), template: experiment_template };
    }

    const result = db.insert(question).values({
      course_id: targetCourseId ?? course_id ?? null,
      knowledge_point_id,
      question_type,
      difficulty,
      content,
      options: finalOptions,
      answer: answerText,
      analysis,
      default_score: default_score || 10,
      source: source || 'manual',
      version: 1,
      is_active: true,
      min_chars: min_chars == null || min_chars === '' ? null : Number(min_chars) || null,
      max_chars: max_chars == null || max_chars === '' ? null : Number(max_chars) || null,
      min_select: min_select == null || min_select === '' ? null : Number(min_select) || null,
      max_select: max_select == null || max_select === '' ? null : Number(max_select) || null,
    }).returning().all();

    const data = result[0];

    saveDb();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Create question error:', error);
    return NextResponse.json({ success: false, error: '创建题目失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await req.json();
    const { id, course_id, knowledge_point_id, experiment_template, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少题目ID' }, { status: 400 });
    }

    const myCourseIds = getTeacherCourseIds(authUser.userId);
    const ownedCourse = questionCourseId(Number(id));
    if (ownedCourse == null || !myCourseIds.includes(ownedCourse)) {
      return NextResponse.json({ success: false, error: '无权修改该题目' }, { status: 403 });
    }
    // 不允许迁移到他人课程
    if (course_id != null && Number(course_id) !== ownedCourse && !myCourseIds.includes(Number(course_id))) {
      return NextResponse.json({ success: false, error: '无权将该题目迁移至该课程' }, { status: 403 });
    }
    // 知识点归属校验
    if (knowledge_point_id != null) {
      const kc = kpCourseId(Number(knowledge_point_id));
      if (kc != null && !myCourseIds.includes(kc)) {
        return NextResponse.json({ success: false, error: '无权将该题目关联至该知识点' }, { status: 403 });
      }
    }

    const setObj: Record<string, unknown> = { ...updates };
    // 实验题：experiment_template 与 options 合并存入 options.template
    if (experiment_template && typeof experiment_template === 'object') {
      const cur = setObj.options && typeof setObj.options === 'object' ? setObj.options : {};
      setObj.options = { ...(cur as Record<string, unknown>), template: experiment_template };
    }
    if (course_id != null) setObj.course_id = Number(course_id);
    if (knowledge_point_id != null) setObj.knowledge_point_id = Number(knowledge_point_id);
    // 规范化可选限制字段：空串/非数值 → null（不限制）
    for (const f of ['min_chars', 'max_chars', 'min_select', 'max_select'] as const) {
      const v = setObj[f];
      setObj[f] = (v === null || v === undefined || v === '') ? null : Number(v) || null;
    }

    const result = db.update(question)
      .set(setObj)
      .where(eq(question.id, Number(id)))
      .returning()
      .all();

    const data = result[0];

    saveDb();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Update question error:', error);
    return NextResponse.json({ success: false, error: '更新题目失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少题目ID' }, { status: 400 });
    }

    const myCourseIds = getTeacherCourseIds(authUser.userId);
    const ownedCourse = questionCourseId(Number(id));
    if (ownedCourse == null || !myCourseIds.includes(ownedCourse)) {
      return NextResponse.json({ success: false, error: '无权删除该题目' }, { status: 403 });
    }

    db.update(question)
      .set({ is_active: false })
      .where(eq(question.id, parseInt(id)))
      .run();
    saveDb();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Delete question error:', error);
    return NextResponse.json({ success: false, error: '删除题目失败' }, { status: 500 });
  }
}

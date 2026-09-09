import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { exam, examEnroll, examAttempt, examGrading, user, course, classInfo, question } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, getTeacherClassIds } from '@/lib/teacher-scope';
import { normalizeScores, defaultProctorConfig } from '@/lib/exam-core';
import { writeAudit } from '@/lib/audit';

interface CreateExamBody {
  title: string;
  description?: string;
  exam_type?: string;
  course_id: number;
  class_ids?: number[];
  time_mode: 'fixed' | 'window';
  start_at: string;
  end_at?: string | null;
  duration: number;
  auto_submit?: boolean;
  allow_resubmit?: boolean;
  publish_mode?: string;
  publish_at?: string | null;
  question_ids: number[];
  proctor_config?: Record<string, unknown>;
  randomized?: boolean;
}

export async function GET(request: NextRequest) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course_id');
  const status = searchParams.get('status');

  const filters = [eq(exam.teacher_id, r.user.userId)];
  if (courseId) filters.push(eq(exam.course_id, parseInt(courseId)));
  if (status) filters.push(eq(exam.status, status));

  const exams = await db.select().from(exam).where(and(...filters)).orderBy(desc(exam.created_at)).execute();
  const examIds = exams.map((e) => e.id);

  // 报名/参考统计
  const enrolls = examIds.length
    ? await db.select({ exam_id: examEnroll.exam_id, student_id: examEnroll.student_id, enroll_status: examEnroll.enroll_status }).from(examEnroll).where(inArray(examEnroll.exam_id, examIds)).execute()
    : [];
  const attempts = examIds.length
    ? await db.select({ exam_id: examAttempt.exam_id, student_id: examAttempt.student_id, status: examAttempt.status }).from(examAttempt).where(inArray(examAttempt.exam_id, examIds)).execute()
    : [];
  const gradings = examIds.length
    ? await db.select({ exam_id: examGrading.exam_id, student_id: examGrading.student_id }).from(examGrading).where(inArray(examGrading.exam_id, examIds)).execute()
    : [];

  const courseNames = new Map<number, string>();
  if (examIds.length) {
    const cs = await db.select({ id: course.id, name: course.name }).from(course).execute();
    cs.forEach((c) => courseNames.set(c.id, c.name));
  }

  const byExam = exams.map((e) => {
    const enr = enrolls.filter((x) => x.exam_id === e.id);
    const att = attempts.filter((x) => x.exam_id === e.id);
    const grad = gradings.filter((x) => x.exam_id === e.id);
    const submitted = att.filter((x) => x.status === 'submitted' || x.status === 'auto_submitted' || x.status === 'terminated').length;
    const graded = grad.length > 0 ? new Set(grad.map((g) => g.student_id)).size : 0;
    return {
      ...e,
      course_name: courseNames.get(e.course_id) || '',
      enrolled_count: enr.length,
      submitted_count: submitted,
      graded_count: graded,
    };
  });

  return NextResponse.json({ exams: byExam });
}

export async function POST(request: NextRequest) {
  const r = await requireAuthWithStatus(request, 'teacher');
  if (!r.user) return NextResponse.json({ error: null }, { status: r.status });
  const db = getDb();
  let body: CreateExamBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请求格式错误' }, { status: 400 }); }

  if (!body.title?.trim()) return NextResponse.json({ error: '请填写考试名称' }, { status: 400 });
  if (!body.course_id) return NextResponse.json({ error: '请选择课程' }, { status: 400 });
  if (!body.question_ids?.length) return NextResponse.json({ error: '请选择考试题目' }, { status: 400 });

  // 跨租户隔离：仅允许本人课程的题目
  const teacherCourseIds = new Set(await getTeacherCourseIds(r.user.userId));
  if (!teacherCourseIds.has(body.course_id)) return NextResponse.json({ error: '无权使用该课程' }, { status: 403 });

  // 加载题目（校验归属 + 取类型/难度做满分归一化）
  const qs = await db.select({ id: question.id, question_type: question.question_type, difficulty: question.difficulty })
    .from(question).where(inArray(question.id, body.question_ids)).execute();
  if (qs.length !== body.question_ids.length) return NextResponse.json({ error: '部分题目不存在或已失效' }, { status: 400 });
  for (const q of qs) {
    const qrow = (await db.select({ course_id: question.course_id }).from(question).where(eq(question.id, q.id)).execute())[0];
    if (qrow && !teacherCourseIds.has(qrow.course_id)) return NextResponse.json({ error: '含无权使用题目' }, { status: 403 });
  }

  const questionScores = normalizeScores(qs);
  const hasSubjective = qs.some((q) => !['single_choice', 'multi_choice', 'judgment', 'multi_choice', 'fill_blank'].includes(q.question_type));

  const now = new Date().toISOString();
  const proctorConfig = body.proctor_config ?? defaultProctorConfig();

  const inserted = (await db.insert(exam).values({
    teacher_id: r.user.userId,
    course_id: body.course_id,
    title: body.title.trim(),
    description: body.description || null,
    exam_type: body.exam_type || 'unit',
    time_mode: body.time_mode || 'fixed',
    start_at: body.start_at,
    end_at: body.end_at || null,
    duration: body.duration || 60,
    auto_submit: body.auto_submit ?? true,
    allow_resubmit: body.allow_resubmit ?? false,
    publish_mode: body.publish_mode || 'manual',
    publish_at: body.publish_at || null,
    question_ids: body.question_ids,
    question_scores: questionScores,
    total_score: 100,
    has_subjective: hasSubjective,
    proctor_config: proctorConfig,
    randomized: body.randomized ?? true,
    status: 'draft',
    created_at: now,
    updated_at: now,
  }).returning({ id: exam.id }).execute())[0];
  if (!inserted) return NextResponse.json({ error: '创建失败' }, { status: 500 });

  // 名单展开：所选班级的学生生成考试报名
  const classIds = body.class_ids ?? [];
  if (classIds.length) {
    const teacherClassIds = new Set(await getTeacherClassIds(r.user.userId));
    const validClasses = classIds.filter((c) => teacherClassIds.has(c));
    if (validClasses.length) {
      const students = await db.select({ id: user.id, class_id: user.class_id })
        .from(user).where(and(eq(user.role, 'student'), eq(user.is_active, true), inArray(user.class_id, validClasses))).execute();
      for (const s of students) {
        await db.insert(examEnroll).values({ exam_id: inserted.id, student_id: s.id, class_id: s.class_id }).execute();
      }
    }
  }

  // 创建考试埋点（静默，失败不影响响应）
  try {
    writeAudit({
      operatorId: r.user.userId,
      operatorName: r.user.username,
      action: 'exam_create',
      targetType: 'exam',
      targetId: inserted.id,
      detail: `创建考试「${String(body.title.trim()).slice(0, 50)}」`,
    });
  } catch (auditErr) {
    console.error('Exam create audit error:', auditErr);
  }

  return NextResponse.json({ id: inserted.id, question_scores: questionScores });
}
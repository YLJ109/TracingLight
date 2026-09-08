import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { assignment, user, gradingTask, answer, course, classInfo, question, notification } from '@/storage/database/shared/schema';
import { getTeacherCourseIds, getTeacherAssignmentIds, getTeacherClassIds } from '@/lib/teacher-scope';
import { isObjectiveType } from '@/lib/objective-grading';
import { allocateScores } from '@/lib/score-allocator';
import { writeAudit } from '@/lib/audit';

/** 作业配置的每题分值总和（question_scores 以 {questionId: score} 存储，key 为字符串） */
function sumScores(qs: unknown): number {
  if (!qs || typeof qs !== 'object') return 0;
  return Object.values(qs as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0);
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    const status = searchParams.get('status');
    const studentId = searchParams.get('student_id');
    const classId = searchParams.get('class_id');

    // Build assignment query with optional filters
    // 跨租户隔离：仅返回当前教师本人创建的作业
    const asgnFilters = [eq(assignment.teacher_id, authUser.userId)];
    if (courseId) asgnFilters.push(eq(assignment.course_id, parseInt(courseId)));
    if (status) asgnFilters.push(eq(assignment.status, status));

    const assignments = db.select().from(assignment)
      .where(and(...asgnFilters))
      .orderBy(desc(assignment.created_at))
      .all();

    // Get all students (filtered by class)
    // 跨租户隔离：仅当前教师授课班级下的学生
    const classIds = getTeacherClassIds(authUser.userId);
    const studentFilters = [eq(user.role, 'student'), eq(user.is_active, true)];
    if (classIds.length > 0) studentFilters.push(inArray(user.class_id, classIds));

    const allStudents = db.select({
      id: user.id,
      real_name: user.real_name,
      username: user.username,
      student_level: user.student_level,
      class_id: user.class_id,
    }).from(user).where(and(...studentFilters)).all();

    // Get all grading records（仅 completed；退回/重批旧行 status=superseded 不计入）
    const allGradings = db.select({
      id: gradingTask.id,
      assignment_id: gradingTask.assignment_id,
      student_id: gradingTask.student_id,
      question_id: gradingTask.question_id,
      total_score: gradingTask.total_score,
      full_score: gradingTask.full_score,
      teacher_override_score: gradingTask.teacher_override_score,
      completed_at: gradingTask.completed_at,
      status: gradingTask.status,
    }).from(gradingTask)
      .where(eq(gradingTask.status, 'completed'))
      .all();

    // 按 (student, question) 去重取最新一条 completed
    function dedupByStudentQuestion(rows: typeof allGradings): typeof allGradings {
      const map = new Map<string, typeof allGradings[number]>();
      for (const r of rows) {
        const key = `${r.student_id}:${r.question_id}`;
        const prev = map.get(key);
        if (!prev || (r.completed_at || '') >= (prev.completed_at || '')) map.set(key, r);
      }
      return [...map.values()];
    }

    // Get all answer records
    const allAnswers = db.select({
      id: answer.id,
      assignment_id: answer.assignment_id,
      student_id: answer.student_id,
      is_submitted: answer.is_submitted,
    }).from(answer).all();

    // Get course list（跨租户：取「授课课程 ∪ 本人创建的作业所覆盖课程」并集，
    // 保证课程筛选/新建选择能覆盖到作业实际归属的课程，避免课程显示不全）
    const myCourseIdsDrop = getTeacherCourseIds(authUser.userId);
    const myAssignmentCourseIds = db.selectDistinct({ course_id: assignment.course_id })
      .from(assignment)
      .where(eq(assignment.teacher_id, authUser.userId))
      .all()
      .map((r) => r.course_id)
      .filter((v): v is number => v != null);
    const unionCourseIds = [...new Set([...myCourseIdsDrop, ...myAssignmentCourseIds])];
    const courses = unionCourseIds.length > 0
      ? db.select({
          id: course.id,
          name: course.name,
        }).from(course).where(inArray(course.id, unionCourseIds)).orderBy(course.id).all()
      : [];

    // Get class list（跨租户：仅本人授课班级）
    const myClassIdsDrop = getTeacherClassIds(authUser.userId);
    const classes = myClassIdsDrop.length > 0
      ? db.select({
          id: classInfo.id,
          name: classInfo.name,
        }).from(classInfo).where(inArray(classInfo.id, myClassIdsDrop)).orderBy(classInfo.id).all()
      : [];

    // Build enriched statistics for each assignment
    const enrichedData = assignments.map((asgn) => {
      const asgnGradings = dedupByStudentQuestion(
        allGradings.filter((g) => g.assignment_id === asgn.id)
      );
      const asgnAnswers = allAnswers.filter((a) => a.assignment_id === asgn.id);
      const totalQuestions = ((asgn.question_ids as number[]) || []).length;

      // Per-student aggregation
      const studentStats = allStudents.map((stu) => {
        const stuGradings = asgnGradings.filter((g) => g.student_id === stu.id);
        const stuAnswers = asgnAnswers.filter((a) => a.student_id === stu.id);
        const completedCount = stuGradings.length;
        const totalScore = stuGradings.reduce((s, g) => s + (g.teacher_override_score ?? (g.total_score || 0)), 0);
        const totalFull = stuGradings.reduce((s, g) => s + (g.full_score || 0), 0);

        return {
          studentId: stu.id,
          studentName: stu.real_name,
          studentLevel: stu.student_level,
          totalQuestions,
          completedCount,
          submittedCount: stuAnswers.filter((a) => a.is_submitted).length,
          totalScore,
          totalFull,
          avgScore: totalFull > 0 ? Math.round((totalScore / totalFull) * 1000) / 10 : 0,
          status: completedCount === totalQuestions && totalQuestions > 0
            ? 'completed'
            : stuAnswers.some((a) => a.is_submitted) ? 'submitted' : 'pending',
        };
      });

      // Filter by student
      const filteredStudentStats = studentId
        ? studentStats.filter((s) => s.studentId === parseInt(studentId))
        : studentStats;

      // Overall stats — 均已按「去重后的学生」维度统计，避免把答题行数误当人数
      const submittedAnswers = asgnAnswers.filter((a) => a.is_submitted);
      // 已交作业人数 = 去重后的已提交学生数（同一学生多题/多次提交只计 1 人）
      const submittedStudentIds = new Set<number>();
      for (const a of submittedAnswers) submittedStudentIds.add(a.student_id);
      const submittedCount = submittedStudentIds.size;
      // 已批人数 = 已提交且全部题目都批改完成的学生数
      const gradedCount = studentStats.filter((s) => submittedStudentIds.has(s.studentId) && s.status === 'completed').length;
      // 全班均分 = 各(有批改记录)学生的个人得分率百分比的平均值（学生维度，而非按批改行加权）
      const graded = studentStats.filter((s) => s.totalFull > 0 && s.totalScore >= 0);
      const avgScore = graded.length > 0
        ? Math.round((graded.reduce((sum, s) => sum + s.avgScore, 0) / graded.length) * 10) / 10
        : 0;
      // 满分 = 该作业配置的每题分值总和（normalize 后恒为 100）；缺失时兜底 100
      const fullScore = sumScores(asgn.question_scores) || 100;

      return {
        ...asgn,
        full_score: fullScore,
        question_count: totalQuestions,
        submitted_count: submittedCount,
        graded_count: gradedCount,
        total_students: allStudents.length,
        avg_score: avgScore,
        student_stats: filteredStudentStats,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedData,
      courses,
      classes,
      students: allStudents,
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get assignments error:', e);
    return NextResponse.json({ error: '获取作业列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const questionIds: number[] = body.question_ids || [];

    // 判断是否含主观题（简答/编程）+ 取题目用于自动分配分值
    let hasSubjective = false;
    let questionScores: Record<number, number> | undefined = undefined;
    if (questionIds.length > 0) {
      const qRows = db.select({
        id: question.id,
        question_type: question.question_type,
        difficulty: question.difficulty,
      })
        .from(question)
        .where(inArray(question.id, questionIds))
        .all();
      hasSubjective = qRows.some(q => !isObjectiveType(q.question_type));
      // 每题分值：前端可按难度/题型微调传入 question_scores；未传则服务端自动分配（合计=100）
      if (body.question_scores && typeof body.question_scores === 'object') {
        questionScores = body.question_scores;
      } else if (qRows.length > 0) {
        questionScores = allocateScores(qRows.map(q => ({
          id: q.id, question_type: q.question_type, difficulty: q.difficulty,
        }))).scores;
      }
    }
    // 批改方式：教师显式指定 auto/teacher_review，否则按是否含主观题默认
    const reviewMode = (body.review_mode && body.review_mode !== 'auto_judge')
      ? body.review_mode
      : (hasSubjective ? 'teacher_review' : 'auto');

    // 校验课程归属，防止往其他教师的课程发布作业（跨租户）
    const teacherCourseIds = getTeacherCourseIds(authUser.userId);
    if (!body.course_id || !teacherCourseIds.includes(Number(body.course_id))) {
      return NextResponse.json({ error: '课程不存在或不在您的授课范围内' }, { status: 403 });
    }

    const result = db.insert(assignment).values({
      course_id: body.course_id,
      // 归属强制取自 token，杜绝伪造 teacher_id（IDOR）
      teacher_id: authUser.userId,
      title: body.title,
      description: body.description || '',
      question_ids: questionIds,
      total_score: body.total_score,
      start_time: body.start_time,
      end_time: body.end_time,
      status: body.status || 'published',
      review_mode: reviewMode,
      has_subjective: hasSubjective,
      question_scores: questionScores,
      // 生生互评配置：仅接受白名单字段
      peer_review: body.peer_review && typeof body.peer_review === 'object'
        ? {
            enabled: !!body.peer_review.enabled,
            count: Math.min(10, Math.max(1, Math.round(Number(body.peer_review.count) || 2))),
            reveal_name: !!(body.peer_review as { reveal_name?: boolean }).reveal_name,
          }
        : undefined,
      // 防作弊监督配置：仅接受白名单字段，杜绝任意字段注入
      monitor_config: body.monitor_config && typeof body.monitor_config === 'object'
        ? {
            disable_copy: !!body.monitor_config.disable_copy,
            disable_paste: !!body.monitor_config.disable_paste,
            enable_fullscreen: !!body.monitor_config.enable_fullscreen,
            disable_devtools: !!body.monitor_config.disable_devtools,
            min_time_seconds: Math.max(0, Number(body.monitor_config.min_time_seconds) || 0),
            max_blur_count: Math.max(0, Number(body.monitor_config.max_blur_count) || 5),
            similarity_threshold: Math.min(1, Math.max(0, Number(body.monitor_config.similarity_threshold) || 0.8)),
          }
        : undefined,
    }).returning().all();

    const data = result[0];

    // 发布作业时，通知该课程班级的学生
    if (body.status !== 'draft') {
      const courseRow = db.select({ class_id: course.class_id, name: course.name })
        .from(course).where(eq(course.id, body.course_id)).get();
      if (courseRow?.class_id) {
        const students = db.select({ id: user.id })
          .from(user)
          .where(and(eq(user.role, 'student'), eq(user.class_id, courseRow.class_id), eq(user.is_active, true)))
          .all();
        for (const s of students) {
          db.insert(notification).values({
            user_id: s.id,
            type: 'assignment',
            title: '新作业发布',
            content: `老师在《${courseRow.name}》发布了作业「${body.title}」`,
            link: '/student/assignments',
          }).run();
        }
      }
    }

    saveDb();

    // 教师发布作业埋点（静默，失败不影响响应）
    writeAudit({
      operatorId: authUser.userId,
      operatorName: authUser.username,
      action: 'assignment_create',
      targetType: 'assignment',
      targetId: data?.id,
      detail: `发布作业「${body.title}」（${reviewMode === 'teacher_review' ? '教师批改' : '自动批改'}）`,
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Create assignment error:', e);
    return NextResponse.json({ error: '创建作业失败' }, { status: 500 });
  }
}

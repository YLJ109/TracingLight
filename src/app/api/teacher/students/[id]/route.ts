import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { parseIntSafe, validationErrorResponse } from '@/lib/validation';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, desc, and, inArray } from 'drizzle-orm';
import {
  user,
  gradingTask,
  errorBook,
  knowledgeMasteryLog,
  answer,
  assignment,
  question,
  knowledgePoint,
  course,
  classInfo,
} from '@/storage/database/shared/schema';
import { isStudentInTeacherScope } from '@/lib/teacher-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const parsed = parseIntSafe(id);
    if (!parsed.valid) return validationErrorResponse(parsed.error!);
    const studentId = parsed.value!;
    const db = getDb();

    // 1. 学生基本信息（显式列选择，不加载 password）
    const studentRows = db.select({
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      class_id: user.class_id,
      student_level: user.student_level,
      avatar_url: user.avatar_url,
    }).from(user)
      .where(and(eq(user.id, studentId), eq(user.role, 'student')))
      .limit(1).all();
    const student = studentRows[0] || null;

    if (!student) {
      return NextResponse.json({ error: '学生不存在' }, { status: 404 });
    }

    // 跨租户隔离：校验该学生属于当前教师授课班级，杜绝越权查看他人学生
    if (!isStudentInTeacherScope(authUser.userId, studentId)) {
      return NextResponse.json({ error: '学生不在您的授课范围内' }, { status: 403 });
    }

    // Get class name for student
    let className = '';
    if (student.class_id) {
      const classRow = db.select({ name: classInfo.name })
        .from(classInfo)
        .where(eq(classInfo.id, student.class_id))
        .limit(1).all()[0];
      className = classRow?.name || '';
    }

    // 2. 所有批改记录
    const gradings = db.select().from(gradingTask)
      .where(eq(gradingTask.student_id, studentId))
      .orderBy(desc(gradingTask.created_at))
      .all();

    // 3. 错题本
    const errors = db.select().from(errorBook)
      .where(eq(errorBook.student_id, studentId))
      .orderBy(desc(errorBook.created_at))
      .all();

    // 4. 知识掌握度
    const mastery = db.select().from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, studentId))
      .orderBy(desc(knowledgeMasteryLog.recorded_at))
      .all();

    // 5. 作答记录
    const answers = db.select().from(answer)
      .where(eq(answer.student_id, studentId))
      .orderBy(desc(answer.created_at))
      .all();

    // ===== 批量获取关联数据 =====

    // Collect all unique assignment IDs from gradings, errors, answers
    const assignmentIds = [
      ...new Set([
        ...gradings.map((g) => g.assignment_id),
        ...errors.map((e) => e.assignment_id),
        ...answers.map((a) => a.assignment_id),
      ]),
    ];

    // Fetch assignments in batch
    const assignmentsMap = new Map<number, typeof assignment.$inferSelect>();
    if (assignmentIds.length > 0) {
      const asgns = db.select().from(assignment)
        .where(inArray(assignment.id, assignmentIds))
        .all();
      asgns.forEach((a) => assignmentsMap.set(a.id, a));
    }

    // Collect course IDs from assignments
    const courseIds = [...new Set(
      [...assignmentsMap.values()].map((a) => a.course_id),
    )];
    const coursesMap = new Map<number, string>();
    if (courseIds.length > 0) {
      const crs = db.select({ id: course.id, name: course.name })
        .from(course)
        .where(inArray(course.id, courseIds))
        .all();
      crs.forEach((c) => coursesMap.set(c.id, c.name));
    }

    // Collect question IDs
    const questionIds = [
      ...new Set([
        ...gradings.map((g) => g.question_id),
        ...errors.map((e) => e.question_id),
        ...answers.map((a) => a.question_id),
      ]),
    ];
    const questionsMap = new Map<number, typeof question.$inferSelect>();
    if (questionIds.length > 0) {
      const qs = db.select().from(question)
        .where(inArray(question.id, questionIds))
        .all();
      qs.forEach((q) => questionsMap.set(q.id, q));
    }

    // Collect knowledge point IDs
    const kpIds = [
      ...new Set([
        ...gradings.map((g) => g.knowledge_point_id),
        ...errors.map((e) => e.knowledge_point_id),
        ...mastery.map((m) => m.knowledge_point_id),
        ...[...questionsMap.values()].map((q) => q.knowledge_point_id),
      ]),
    ];
    const kpMap = new Map<number, typeof knowledgePoint.$inferSelect>();
    if (kpIds.length > 0) {
      const kps = db.select().from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds))
        .all();
      kps.forEach((kp) => kpMap.set(kp.id, kp));
    }

    // Helper to get enriched info
    const getAssignmentCourse = (assignmentId: number) => {
      const a = assignmentsMap.get(assignmentId);
      return {
        assignment: a || null,
        courseName: a ? (coursesMap.get(a.course_id) || '') : '',
        courseId: a?.course_id || null,
      };
    };

    const getQuestionKp = (questionId: number) => {
      const q = questionsMap.get(questionId);
      const kp = q ? kpMap.get(q.knowledge_point_id) : undefined;
      return {
        question: q || null,
        kpName: kp?.name || '',
      };
    };

    // ===== 聚合统计 =====

    // 按课程分组统计
    const courseStatsMap = new Map<number, {
      courseId: number;
      courseName: string;
      assignmentCount: number;
      completedCount: number;
      totalScore: number;
      totalFull: number;
      errorCount: number;
    }>();

    const assignmentIdsSet = new Set<number>();
    gradings.forEach((g) => {
      const info = getAssignmentCourse(g.assignment_id);
      const cId = info.courseId;
      if (cId === null) return;
      const cName = info.courseName || '未知课程';
      if (!courseStatsMap.has(cId)) {
        courseStatsMap.set(cId, {
          courseId: cId,
          courseName: cName,
          assignmentCount: 0,
          completedCount: 0,
          totalScore: 0,
          totalFull: 0,
          errorCount: 0,
        });
      }
      const cs = courseStatsMap.get(cId)!;
      if (!assignmentIdsSet.has(g.assignment_id)) {
        assignmentIdsSet.add(g.assignment_id);
        cs.assignmentCount++;
      }
      if (g.status === 'completed') {
        cs.completedCount++;
        cs.totalScore += g.total_score || 0;
        cs.totalFull += g.full_score || 0;
      }
    });

    errors.forEach((e) => {
      const info = getAssignmentCourse(e.assignment_id);
      const cId = info.courseId;
      if (cId && courseStatsMap.has(cId)) {
        courseStatsMap.get(cId)!.errorCount++;
      }
    });

    const courseStats = Array.from(courseStatsMap.values()).map((cs) => ({
      ...cs,
      avgScore: cs.totalFull > 0 ? Math.round((cs.totalScore / cs.totalFull) * 1000) / 10 : 0,
    }));

    // 按作业分组
    const assignmentStatsMap = new Map<number, any>();
    gradings.forEach((g) => {
      if (!assignmentStatsMap.has(g.assignment_id)) {
        const info = getAssignmentCourse(g.assignment_id);
        assignmentStatsMap.set(g.assignment_id, {
          assignmentId: g.assignment_id,
          title: info.assignment?.title || '',
          courseName: info.courseName,
          questionCount: 0,
          completedCount: 0,
          totalScore: 0,
          totalFull: 0,
          avgScore: 0,
          status: 'pending',
        });
      }
      const as = assignmentStatsMap.get(g.assignment_id)!;
      as.questionCount++;
      if (g.status === 'completed') {
        as.completedCount++;
        as.totalScore += g.total_score || 0;
        as.totalFull += g.full_score || 0;
      }
    });

    const assignmentStats = Array.from(assignmentStatsMap.values()).map((as) => ({
      ...as,
      avgScore: as.totalFull > 0 ? Math.round((as.totalScore / as.totalFull) * 1000) / 10 : 0,
      status: as.completedCount === as.questionCount ? 'completed' : as.completedCount > 0 ? 'partial' : 'pending',
    }));

    // 整体统计
    const allCompleted = gradings.filter((g) => g.status === 'completed');
    const overallAvg = allCompleted.length > 0
      ? Math.round((allCompleted.reduce((s, g) => s + (g.total_score || 0), 0) /
          allCompleted.reduce((s, g) => s + (g.full_score || 0), 0)) * 1000) / 10
      : 0;

    // 知识掌握度雷达图数据
    const knowledgeRadar = mastery.map((m) => {
      const kp = kpMap.get(m.knowledge_point_id);
      const kpCourseId = kp?.course_id;
      return {
        name: kp?.name || `知识点${m.knowledge_point_id}`,
        courseName: kpCourseId ? (coursesMap.get(kpCourseId) || '') : '',
        mastery: m.mastery_rate,
        errorCount: m.error_count,
      };
    });

    // 最近作业趋势 (not using SQL window functions, just take last 20 sorted)
    const recentGradings = gradings
      .filter((g) => g.status === 'completed')
      .slice(0, 20)
      .reverse();

    const trendData = recentGradings.map((g) => {
      const info = getAssignmentCourse(g.assignment_id);
      return {
        assignmentTitle: info.assignment?.title || '',
        score: g.total_score || 0,
        fullScore: g.full_score || 0,
        date: g.completed_at || g.created_at,
      };
    });

    // 六维雷达图数据
    const completedGradings = gradings.filter((g) => g.status === 'completed');
    const dimensionTotals: Record<string, { total: number; count: number }> = {};

    completedGradings.forEach((g) => {
      const ds = g.dimension_scores as Record<string, number> | null;
      const scale = 100 / (g.full_score || 10);
      if (ds) {
        Object.entries(ds).forEach(([key, value]) => {
          if (!dimensionTotals[key]) dimensionTotals[key] = { total: 0, count: 0 };
          dimensionTotals[key].total += value * scale;
          dimensionTotals[key].count += 1;
        });
      }
    });

    const radarData = {
      knowledgeAccuracy: Object.keys(dimensionTotals).length > 0 ? Math.round((dimensionTotals['knowledge_accuracy']?.total || 0) / Math.max(dimensionTotals['knowledge_accuracy']?.count || 1, 1)) : 0,
      logicCompleteness: Object.keys(dimensionTotals).length > 0 ? Math.round((dimensionTotals['logic_completeness']?.total || 0) / Math.max(dimensionTotals['logic_completeness']?.count || 1, 1)) : 0,
      expressionClarity: Object.keys(dimensionTotals).length > 0 ? Math.round((dimensionTotals['expression_clarity']?.total || 0) / Math.max(dimensionTotals['expression_clarity']?.count || 1, 1)) : 0,
      expansionAbility: Object.keys(dimensionTotals).length > 0 ? Math.round((dimensionTotals['expansion']?.total || 0) / Math.max(dimensionTotals['expansion']?.count || 1, 1)) : 0,
      completionRate: assignmentStats.length > 0 ? Math.round((assignmentStats.filter((a: any) => a.status === 'completed').length / assignmentStats.length) * 100) : 0,
      errorResolutionRate: errors.length > 0 ? Math.round((errors.filter((e) => e.review_status === 'mastered').length / errors.length) * 100) : 0,
    };

    // 错题类型分布
    const errorTypeMap = new Map<string, number>();
    errors.forEach((e) => {
      const type = e.error_type || '其他';
      errorTypeMap.set(type, (errorTypeMap.get(type) || 0) + 1);
    });
    const errorTypeDistribution = Array.from(errorTypeMap.entries()).map(([type, count]) => ({ type, count }));

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.real_name,
          real_name: student.real_name,
          username: student.username,
          student_level: student.student_level,
          level: student.student_level,
          className,
        },
        avgScore: overallAvg,
        totalErrors: errors.length,
        masteredErrors: errors.filter((e) => e.review_status === 'mastered').length,
        pendingErrors: errors.filter((e) => e.review_status !== 'mastered').length,
        radarData,
        assignmentHistory: assignmentStats.map((a: any) => ({
          id: a.assignmentId,
          assignmentTitle: a.title,
          courseName: a.courseName,
          score: a.totalScore,
          fullScore: a.totalFull,
          status: a.status,
        })),
        knowledgeMastery: knowledgeRadar,
        errorAnalysis: {
          errorTypeDistribution,
          recentErrors: errors.filter((e) => e.review_status !== 'mastered').slice(0, 10).map((e) => {
            const qInfo = getQuestionKp(e.question_id);
            const aInfo = getAssignmentCourse(e.assignment_id);
            return {
              id: e.id,
              questionContent: qInfo.question?.content || '',
              questionType: qInfo.question?.question_type || '',
              courseName: aInfo.courseName,
              wrongAnswer: e.student_answer || '',
              correctAnswer: e.correct_answer || '',
              errorType: e.error_type,
            };
          }),
        },
        courseStats,
        assignmentStats,
        knowledgeRadar,
        trendData,
        errors: errors.map((e) => {
          const qInfo = getQuestionKp(e.question_id);
          const aInfo = getAssignmentCourse(e.assignment_id);
          return {
            id: e.id,
            questionContent: qInfo.question?.content || '',
            questionType: qInfo.question?.question_type || '',
            difficulty: qInfo.question?.difficulty || '',
            knowledgePoint: qInfo.kpName,
            studentAnswer: e.student_answer,
            correctAnswer: e.correct_answer,
            errorType: e.error_type,
            errorAnalysis: e.error_analysis,
            reviewStatus: e.review_status,
            assignmentTitle: aInfo.assignment?.title || '',
            courseName: aInfo.courseName,
            createdAt: e.created_at,
          };
        }),
        gradings: gradings.map((g) => {
          const aInfo = getAssignmentCourse(g.assignment_id);
          const qInfo = getQuestionKp(g.question_id);
          return {
            id: g.id,
            assignmentTitle: aInfo.assignment?.title || '',
            courseName: aInfo.courseName,
            questionContent: qInfo.question?.content || '',
            questionType: qInfo.question?.question_type || '',
            difficulty: qInfo.question?.difficulty || '',
            knowledgePoint: qInfo.kpName,
            studentAnswer: g.student_answer,
            referenceAnswer: g.reference_answer,
            totalScore: g.total_score,
            fullScore: g.full_score,
            dimensionScores: g.dimension_scores,
            overallComment: g.overall_comment,
            status: g.status,
            createdAt: g.created_at,
          };
        }),
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student detail error:', e);
    return NextResponse.json({ error: '获取学生详情失败' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { user, gradingTask, assignment, course, knowledgeMasteryLog, knowledgePoint, errorBook, answer, examSchedule, abilityPoint, abilityKnowledge, learningBehaviorLog, qaSession, classInfo, major, exam, examAttempt, examGrading } from '@/storage/database/shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { classifyMastery, isWeakMastery } from '@/lib/domain';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = authUser.userId;
    const courseId = searchParams.get('course_id') ? parseInt(searchParams.get('course_id')!) : null;

    // Get student info
    const studentRows = db.select()
      .from(user)
      .where(eq(user.id, studentId))
      .limit(1)
      .all();
    const student = studentRows[0] || null;
    // 班级/专业名（供身份卡完整展示）
    const stuClassId = student?.class_id ?? null;
    let className = '';
    let majorName = '';
    if (stuClassId) {
      const cl = db.select({ name: classInfo.name, major_id: classInfo.major_id }).from(classInfo)
        .where(eq(classInfo.id, stuClassId)).limit(1).all()[0];
      if (cl) {
        className = cl.name || '';
        const ma = db.select({ name: major.name }).from(major).where(eq(major.id, cl.major_id)).limit(1).all()[0];
        majorName = ma?.name || '';
      }
    }

    // 课程列表（供筛选下拉）：仅返回本班课程，避免“我的学情”出现非本班课程
    const courses = stuClassId
      ? db.select({ id: course.id, name: course.name }).from(course).where(eq(course.class_id, stuClassId)).all()
      : [];

    // ============ 真实数据覆盖（全部维度）：平均分 + 薄弱知识点 ============
    const allGradings = db.select({ total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`, full_score: gradingTask.full_score })
      .from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const realTotalScore = allGradings.reduce((s, g) => s + (g.total_score || 0), 0);
    const realTotalFull = allGradings.reduce((s, g) => s + (g.full_score || 0), 0);
    const realAvgScore = realTotalFull > 0 ? Math.round((realTotalScore / realTotalFull) * 1000) / 10 : 0;

    // 真实薄弱知识点（每个知识点取最新掌握度，统一口径 isWeakMastery：弱 = [30,60)）
    const allMastery = db.select({ knowledge_point_id: knowledgeMasteryLog.knowledge_point_id, mastery_rate: knowledgeMasteryLog.mastery_rate, recorded_at: knowledgeMasteryLog.recorded_at })
      .from(knowledgeMasteryLog)
      .where(eq(knowledgeMasteryLog.student_id, studentId))
      .all();
    const kpMasteryMap = new Map<number, number>();
    const kpMasteryDate = new Map<number, string>();
    for (const m of allMastery) {
      if (!kpMasteryMap.has(m.knowledge_point_id) || (m.recorded_at || '') >= (kpMasteryDate.get(m.knowledge_point_id) || '')) {
        kpMasteryMap.set(m.knowledge_point_id, m.mastery_rate);
        kpMasteryDate.set(m.knowledge_point_id, m.recorded_at || '');
      }
    }
    const weakEntries = [...kpMasteryMap.entries()]
      .filter(([, rate]) => isWeakMastery(rate))
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5);
    // 批量查询知识点名，消除 N+1
    const weakKpIds = weakEntries.map(([kpId]) => kpId);
    const kpNameMap = new Map<number, string>();
    if (weakKpIds.length > 0) {
      const kpRows = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, weakKpIds))
        .all();
      for (const r of kpRows) kpNameMap.set(r.id, r.name);
    }
    const realWeakKps = weakEntries.map(([kpId, rate]) => ({
      name: kpNameMap.get(kpId) || `知识点${kpId}`,
      masteryRate: rate,
    }));

    // 用真实数据覆盖 indicators / weakTop10（杜绝 mock 死数据与「100%」假数）
    const weakTop10 = realWeakKps.map((w) => ({ name: w.name, priority: '重点', masteryRate: w.masteryRate, lossWeight: 0 }));

    // ============ 真实核心指标（全部来自数据库） ============
    // 学生班级 → 所修课程 → 应提交作业数
    const enrolledCourseIds = stuClassId
      ? db.select({ id: course.id }).from(course).where(eq(course.class_id, stuClassId)).all().map((c) => c.id)
      : [];
    // 已完成作业数 = 有 ≥1 条完成批改的不同作业数（gradingTask 每道题一行，须按作业去重，避免多题作业虚增）
    const completedAssignmentRows = db.select({ assignment_id: gradingTask.assignment_id })
      .from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const completedAssignments = new Set(completedAssignmentRows.map((g) => g.assignment_id).filter((x): x is number => !!x)).size;
    const totalAssignments = enrolledCourseIds.length > 0
      ? (db.select({ count: sql<number>`count(*)` }).from(assignment)
          .where(inArray(assignment.course_id, enrolledCourseIds)).all()[0]?.count || 0)
      : 0;
    const completionRate = totalAssignments > 0
      ? Math.min(100, Math.round((completedAssignments / totalAssignments) * 100))
      : 0;

    // 累计做题量（已提交作答数）
    const answerCount = db.select({ count: sql<number>`count(*)` }).from(answer)
      .where(and(eq(answer.student_id, studentId), eq(answer.is_submitted, true)))
      .all()[0]?.count || 0;

    // 错题总数 + 错题订正率（errorBook.review_status='mastered'）
    const errRows = db.select({ review_status: errorBook.review_status }).from(errorBook)
      .where(eq(errorBook.student_id, studentId)).all();
    const totalErrors = errRows.length;
    const masteredErrors = errRows.filter((r) => r.review_status === 'mastered').length;
    const correctionRate = totalErrors > 0 ? Math.round((masteredErrors / totalErrors) * 100) : 0;

    // 按时提交率：已提交作答中 submitted_at <= 作业截止时间的占比（统一按时间戳比较，兼容 "T"/空格 两种日期格式）
    const submittedAnswers = db.select({
      submitted_at: answer.submitted_at,
      end_time: assignment.end_time,
    }).from(answer).innerJoin(assignment, eq(answer.assignment_id, assignment.id))
      .where(eq(answer.student_id, studentId)).all();
    const onTimeRows = submittedAnswers.filter((r) => {
      if (!r.submitted_at) return false;
      const s = new Date(r.submitted_at).getTime();
      const e = r.end_time ? new Date(r.end_time).getTime() : Number.MAX_SAFE_INTEGER;
      return Number.isFinite(s) && (Number.isFinite(e) ? s <= e : true);
    });
    const onTimeRate = submittedAnswers.length > 0
      ? Math.round(onTimeRows.length / submittedAnswers.length * 100)
      : 0;

    // 班级排名：同班已完成批改的平均分降序，第 1 名 = 班级第一
    // 优化：一次批量查询全班批改记录，内存聚合求平均，避免逐个同学 N+1 查询
    let classRank: number | null = null;
    let classTotal = 0; // 参与排名的全班人数（含已批改作业的同学）
    if (stuClassId) {
      const classmates = db.select({ id: user.id }).from(user)
        .where(and(eq(user.role, 'student'), eq(user.class_id, stuClassId)))
        .all();
      const classmateIds = classmates.map((c) => c.id);
      const classScoreMap: Record<number, { ts: number; tf: number }> = {};
      if (classmateIds.length > 0) {
        const allGrades = db.select({
          student_id: gradingTask.student_id,
          total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`,
          full_score: gradingTask.full_score,
        })
          .from(gradingTask)
          .where(and(
            inArray(gradingTask.student_id, classmateIds),
            eq(gradingTask.status, 'completed'),
          ))
          .all();
        for (const g of allGrades) {
          if (!classScoreMap[g.student_id]) classScoreMap[g.student_id] = { ts: 0, tf: 0 };
          classScoreMap[g.student_id].ts += g.total_score || 0;
          classScoreMap[g.student_id].tf += g.full_score || 0;
        }
      }
      const scored = classmates.map((c) => {
        const s = classScoreMap[c.id];
        const tf = s?.tf || 0;
        return { id: c.id, avg: tf > 0 ? s!.ts / tf : 0 };
      });
      scored.sort((a, b) => b.avg - a.avg);
      const idx = scored.findIndex((r) => r.id === studentId);
      if (idx >= 0) classRank = idx + 1;
      classTotal = scored.length;
    }

    const indicators = [
      { key: 'completionRate', icon: 'completionRate', label: '作业完成率', value: completionRate, unit: '%', color: 'teal' },
      { key: 'onTimeRate', icon: 'onTimeRate', label: '按时提交率', value: onTimeRate, unit: '%', color: 'blue' },
      { key: 'avgScore', icon: 'avgScore', label: '平均得分', value: realAvgScore, unit: '分', color: 'amber' },
      { key: 'totalQuestions', icon: 'totalQuestions', label: '累计做题量', value: answerCount, unit: '题', color: 'purple' },
      { key: 'totalErrors', icon: 'weakPoints', label: '错题总数', value: totalErrors, unit: '题', color: 'red' },
      { key: 'correctionRate', icon: 'correctionRate', label: '错题订正率', value: correctionRate, unit: '%', color: 'green' },
    ];

    // ============ 课程维度真实学情（按课程筛选） ============
    let courseData = null;
    if (courseId) {
      const courseAssignments = db.select({ id: assignment.id, title: assignment.title, end_time: assignment.end_time })
        .from(assignment)
        .where(eq(assignment.course_id, courseId))
        .all();
      const assignmentIds = courseAssignments.map((a) => a.id);

      let courseGradings: any[] = [];
      if (assignmentIds.length > 0) {
        courseGradings = db.select().from(gradingTask)
          .where(and(
            eq(gradingTask.student_id, studentId),
            inArray(gradingTask.assignment_id, assignmentIds),
            eq(gradingTask.status, 'completed'),
          ))
          .all();
      }

      const totalScore = courseGradings.reduce((s, g) => s + (g.total_score || 0), 0);
      const totalFull = courseGradings.reduce((s, g) => s + (g.full_score || 0), 0);
      const avgScore = totalFull > 0 ? Math.round((totalScore / totalFull) * 1000) / 10 : 0;
      const completedCount = new Set(courseGradings.map((g) => g.assignment_id)).size;

      // 该课程的知识点掌握度（用全量最新掌握度 kpMasteryMap 按课程聚合，避免流水历史被重复平均）
      const courseKps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
        .from(knowledgePoint)
        .where(eq(knowledgePoint.course_id, courseId))
        .all();
      const courseKpIds = courseKps.map((k) => k.id);
      const kpNameById = new Map(courseKps.map((k) => [k.id, k.name]));
      const courseRates = courseKpIds
        .map((id) => ({ rate: kpMasteryMap.get(id), name: kpNameById.get(id) || `知识点${id}` }))
        .filter((x): x is { rate: number; name: string } => x.rate !== undefined);
      const avgMastery = courseRates.length > 0
        ? Math.round(courseRates.reduce((s, x) => s + x.rate, 0) / courseRates.length)
        : 0;
      const weakKps = courseRates
        .filter((x) => isWeakMastery(x.rate))
        .sort((a, b) => a.rate - b.rate)
        .map((x) => ({ name: x.name, masteryRate: x.rate }))
        .slice(0, 8);

      // 成绩趋势（该课程作业，按时间）
      const trend = courseAssignments
        .filter((a) => courseGradings.some((g) => g.assignment_id === a.id))
        .sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime())
        .map((a) => {
          const gs = courseGradings.filter((g) => g.assignment_id === a.id);
          const sc = gs.reduce((s, g) => s + (g.total_score || 0), 0);
          const fl = gs.reduce((s, g) => s + (g.full_score || 0), 0);
          return { week: a.title.slice(0, 8), avgScore: fl > 0 ? Math.round((sc / fl) * 100) : 0 };
        });

      courseData = {
        courseName: courses.find((c) => c.id === courseId)?.name || '',
        avgScore,
        completedCount,
        avgMastery,
        weakKps,
        trend,
      };
    }

    // ============ 真实成绩趋势 + 课程对比（替换 mock） ============
    const allAssignments = db.select({ id: assignment.id, end_time: assignment.end_time, title: assignment.title })
      .from(assignment).all();
    const asgnMap = new Map(allAssignments.map((a) => [a.id, a]));

    // 成绩趋势：按作业聚合（真实批改成绩），取最近 7 次
    const trendGradings = db.select({
      assignment_id: gradingTask.assignment_id,
      total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`,
      full_score: gradingTask.full_score,
    }).from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const byAssignment = new Map<number, { ts: number; tf: number }>();
    for (const g of trendGradings) {
      const cur = byAssignment.get(g.assignment_id) || { ts: 0, tf: 0 };
      cur.ts += g.total_score || 0;
      cur.tf += g.full_score || 0;
      byAssignment.set(g.assignment_id, cur);
    }
    const realTrendData = [...byAssignment.entries()]
      .map(([aid, v]) => ({ aid, ...v, end_time: asgnMap.get(aid)?.end_time || '' }))
      .sort((a, b) => a.end_time.localeCompare(b.end_time))
      .slice(-7)
      .map((v) => ({
        week: (asgnMap.get(v.aid)?.title || '').slice(0, 8),
        avgScore: v.tf > 0 ? Math.round((v.ts / v.tf) * 100) : 0,
      }));

    // 课程对比：按课程聚合真实掌握度 + 平均分 + 错题数（仅本班课程）
    const allCourses = stuClassId
      ? db.select({ id: course.id, name: course.name, short_name: course.short_name })
        .from(course).where(eq(course.class_id, stuClassId)).all()
      : [];
    const realCourseComparison = allCourses.map((c) => {
      const cAssignments = db.select({ id: assignment.id }).from(assignment).where(eq(assignment.course_id, c.id)).all();
      const cAssignmentIds = cAssignments.map((a) => a.id);
      let avgScore = 0;
      if (cAssignmentIds.length > 0) {
        const cGradings = db.select({ total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`, full_score: gradingTask.full_score })
          .from(gradingTask)
          .where(and(eq(gradingTask.student_id, studentId), inArray(gradingTask.assignment_id, cAssignmentIds)))
          .all();
        const ts = cGradings.reduce((s, g) => s + (g.total_score || 0), 0);
        const tf = cGradings.reduce((s, g) => s + (g.full_score || 0), 0);
        avgScore = tf > 0 ? Math.round((ts / tf) * 100) : 0;
      }
      const cKps = db.select({ id: knowledgePoint.id }).from(knowledgePoint).where(eq(knowledgePoint.course_id, c.id)).all();
      const cKpIds = cKps.map((k) => k.id);
      let avgMastery = 0;
      let errorCount = 0;
      if (cKpIds.length > 0) {
        const cMastery = db.select({ mastery_rate: knowledgeMasteryLog.mastery_rate })
          .from(knowledgeMasteryLog)
          .where(and(eq(knowledgeMasteryLog.student_id, studentId), inArray(knowledgeMasteryLog.knowledge_point_id, cKpIds)))
          .all();
        avgMastery = cMastery.length > 0
          ? Math.round(cMastery.reduce((s, m) => s + (m.mastery_rate || 0), 0) / cMastery.length)
          : 0;
        const cErrors = db.select({ id: errorBook.id })
          .from(errorBook)
          .where(and(eq(errorBook.student_id, studentId), inArray(errorBook.knowledge_point_id, cKpIds)))
          .all();
        errorCount = cErrors.length;
      }
      return { courseId: c.id, name: c.name, shortName: c.short_name || c.name, avgMastery, kpCount: cKpIds.length, errorCount };
    });

    // ============ 能力雷达（8维，全部由真实掌握度 + 真实错题类型推算，杜绝随机数） ============
    const radarDiff = db.select({ id: knowledgePoint.id, difficulty: knowledgePoint.difficulty }).from(knowledgePoint).all();
    const diffMap = new Map(radarDiff.map((k) => [k.id, k.difficulty || 'medium']));
    const scoreArr = [...kpMasteryMap.entries()].map(([id, s]) => ({ id, s, d: diffMap.get(id) || 'medium' }));
    const overallAvg = scoreArr.length ? Math.round(scoreArr.reduce((a, b) => a + b.s, 0) / scoreArr.length) : 0;
    const dimAvg = (pred: (x: { d: string }) => boolean) => {
      const l = scoreArr.filter(pred);
      return l.length ? Math.round(l.reduce((a, b) => a + b.s, 0) / l.length) : null;
    };
    const easyAvg = dimAvg((x) => x.d === 'easy');
    const medAvg = dimAvg((x) => x.d === 'medium');
    const hardAvg = dimAvg((x) => x.d === 'hard');
    const base = (v: number | null) => v ?? overallAvg; // 无该类数据时以总体掌握度计，避免 0 分假象

    // 真实错题类型 + 订正
    const allErrRows = db.select({ error_type: errorBook.error_type, review_status: errorBook.review_status })
      .from(errorBook).where(eq(errorBook.student_id, studentId)).all();
    const errTypes = allErrRows.map((e) => e.error_type || '');
    const errN = errTypes.length;
    const typeRatio = (re: RegExp) => (errN ? Math.round(errTypes.filter((t) => re.test(t)).length / errN * 100) : 0);
    const calcErrPct = typeRatio(/calculation|compute|careless/);
    const logicErrPct = typeRatio(/logic|reason/);
    const carelessPct = typeRatio(/careless|typo|empty/);
    const methodErrPct = typeRatio(/method|step|expression|incomplete/);
    const masteredErrN = allErrRows.filter((e) => e.review_status === 'mastered').length;
    const correctionRateReal = errN ? Math.round(masteredErrN / errN * 100) : overallAvg;
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const compAvg = (() => {
      const l = scoreArr.filter((x) => x.d === 'hard' || x.d === 'medium');
      return l.length ? Math.round(l.reduce((a, b) => a + b.s, 0) / l.length) : overallAvg;
    })();

    // 知识掌握分层统计（真实，统一走 domain.classifyMastery：未学<30 / 薄弱[30,60) / 基本[60,80) / 掌握>=80）
    const kpTotal = scoreArr.length;
    const tierMap = { unlearned: 0, weak: 0, basic: 0, mastered: 0 };
    for (const x of scoreArr) tierMap[classifyMastery(x.s)] += 1;
    const knowledgeStats = {
      mastered: tierMap.mastered,
      weak: tierMap.weak,
      basic: tierMap.basic,
      unlearned: tierMap.unlearned,
      total: kpTotal,
    };

    // 错题类型分布（真实 errorBook）
    const errTypeDist = new Map<string, number>();
    for (const t of errTypes) errTypeDist.set(t, (errTypeDist.get(t) || 0) + 1);
    const errLabels: Record<string, string> = {
      concept_confusion: '概念混淆', calculation_error: '计算错误', logic_error: '逻辑错误',
      knowledge_missing: '知识缺失', careless: '粗心大意', empty: '未作答', wrong: '答案错误',
      method_error: '方法错误', step_missing: '步骤缺失', expression: '表达问题', incomplete: '未答完整', other: '其他',
    };
    const errorTypeDistribution = [...errTypeDist.entries()].map(([t, c]) => ({
      errorType: t, errorTypeLabel: errLabels[t] || t, count: c, percentage: errN ? Math.round(c / errN * 100) : 0,
    }));
    const errorData = { errors: errorTypeDistribution, errorTypeDistribution, totalErrors: errN };

    // 考试安排（真实 exam_schedule，按学生班级）
    let examScheduleReal: Array<{ id: number; title: string; courseName: string; examDate: string; location: string; daysUntil: number }> = [];
    if (stuClassId) {
      const examRows = db.select({
        id: examSchedule.id, exam_name: examSchedule.exam_name, exam_date: examSchedule.exam_date,
        course_id: examSchedule.course_id, start_time: examSchedule.start_time, end_time: examSchedule.end_time,
      }).from(examSchedule).where(eq(examSchedule.class_id, stuClassId)).all();
      const courseNameMap = new Map(courses.map((c) => [c.id, c.name]));
      const todayMs = new Date().setHours(0, 0, 0, 0);
      examScheduleReal = examRows
        .map((e) => ({
          id: e.id,
          title: e.exam_name,
          courseName: courseNameMap.get(e.course_id) || '',
          examDate: (e.exam_date || '').split(' ')[0],
          location: [e.start_time, e.end_time].filter(Boolean).join('~'),
          daysUntil: Math.max(0, Math.round(((new Date(e.exam_date).getTime()) - todayMs) / 86400000)),
        }))
        .sort((a, b) => a.examDate.localeCompare(b.examDate));
    }

    // ============ 掌握率四段分层（真实） ============
    const scopeKpRows = (courseId
      ? db.select({ id: knowledgePoint.id }).from(knowledgePoint).where(eq(knowledgePoint.course_id, courseId)).all()
      : db.select({ id: knowledgePoint.id }).from(knowledgePoint).all());
    const masteryTiers = { total: 0, mastered: 0, good: 0, weak: 0, none: 0 };
    for (const k of scopeKpRows) {
      const r = kpMasteryMap.get(k.id);
      if (r == null) masteryTiers.none += 1;
      else if (r >= 80) masteryTiers.mastered += 1;
      else if (r >= 60) masteryTiers.good += 1;
      else if (r >= 30) masteryTiers.weak += 1;
      else masteryTiers.none += 1;
    }
    masteryTiers.total = masteryTiers.mastered + masteryTiers.good + masteryTiers.weak + masteryTiers.none;
    const scopeRates = scopeKpRows.map((k) => kpMasteryMap.get(k.id)).filter((r): r is number => r != null);
    const avgMastery = scopeRates.length ? Math.round(scopeRates.reduce((a, b) => a + b, 0) / scopeRates.length) : 0;

    // 全量知识点名映射（优势/薄弱通用）
    const kpNameFull = new Map(
      db.select({ id: knowledgePoint.id, name: knowledgePoint.name }).from(knowledgePoint).all().map((k) => [k.id, k.name])
    );

    // 优势知识点 TOP3（真实，掌握度≥80） + 顽固/待复习错题（真实 errorBook）
    const strongTop3 = [...kpMasteryMap.entries()]
      .filter(([, r]) => r >= 80)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, r]) => ({ name: kpNameFull.get(id) || `知识点${id}`, masteryRate: r }));
    const stubbornRows = db.select({ review_count: errorBook.review_count, review_status: errorBook.review_status })
      .from(errorBook).where(eq(errorBook.student_id, studentId)).all();
    const stubbornErrors = stubbornRows.filter((r) => (r.review_count || 0) >= 2).length;
    const pendingErrors = Math.max(0, totalErrors - masteredErrors);

    // ============ 能力六维雷达（真实 ability_point 加权 + 记忆理解/综合应用 推导） ============
    const abilityDefs = db.select().from(abilityPoint).all();
    const akRows = db.select({
      ability_id: abilityKnowledge.ability_id,
      knowledge_id: abilityKnowledge.knowledge_id,
      weight: abilityKnowledge.weight,
    }).from(abilityKnowledge).all();
    const abilityScoreOf = (abId: number): number | null => {
      const links = akRows.filter((a) => a.ability_id === abId);
      let wsum = 0; let msum = 0;
      for (const l of links) {
        const r = kpMasteryMap.get(l.knowledge_id);
        if (r != null) { msum += r * (l.weight || 1); wsum += l.weight || 1; }
      }
      return wsum > 0 ? msum / wsum : null;
    };
    const radarData = [
      ...abilityDefs.map((ab) => ({
        key: `ab_${ab.id}`, label: ab.name, icon: 'Target', score: clamp(abilityScoreOf(ab.id) ?? overallAvg),
      })),
      { key: 'memory_understanding', label: '记忆理解', icon: 'Brain', score: clamp(base(easyAvg)) },
      { key: 'comprehensive_apply', label: '综合应用', icon: 'Puzzle', score: clamp(compAvg) },
    ];

    // ============ 学习行为（近7天学习时长 + 材料平均进度，真实） ============
    const behRows = db.select({
      watch_duration: learningBehaviorLog.watch_duration,
      progress: learningBehaviorLog.progress,
      last_watched_at: learningBehaviorLog.last_watched_at,
    })
      .from(learningBehaviorLog)
      .where(eq(learningBehaviorLog.student_id, studentId))
      .all();
    const daySecMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      daySecMap.set(dd.toISOString().slice(0, 10), 0);
    }
    for (const b of behRows) {
      const dt = (b.last_watched_at || '').slice(0, 10);
      if (daySecMap.has(dt)) daySecMap.set(dt, daySecMap.get(dt)! + (b.watch_duration || 0));
    }
    const weekSeconds = [...daySecMap.values()].reduce((a, b) => a + b, 0);
    const avgMaterialProgress = behRows.length ? Math.round(behRows.reduce((s, b) => s + (b.progress || 0), 0) / behRows.length) : 0;
    const learningBehavior = {
      weekMinutes: Math.round(weekSeconds / 60),
      weekHours: Math.round(weekSeconds / 3600 * 10) / 10,
      materialProgress: avgMaterialProgress,
      days: [...daySecMap.entries()].map(([date, seconds]) => ({ date, seconds })),
      materialsStudied: behRows.length,
    };

    // ============ 学习稳定性（得分波动 + 粗心失分占比，真实） ============
    const scoreList = [...byAssignment.entries()]
      .map(([, v]) => v.tf > 0 ? (v.ts / v.tf) * 100 : 0)
      .filter((x) => x > 0);
    const meanS = scoreList.length ? scoreList.reduce((a, b) => a + b, 0) / scoreList.length : 0;
    const variance = scoreList.length > 1 ? scoreList.reduce((a, b) => a + (b - meanS) ** 2, 0) / scoreList.length : 0;
    const stdevScore = Math.sqrt(variance);
    const stability = {
      scoreStd: Math.round(stdevScore * 10) / 10,
      level: stdevScore <= 10 ? '发挥稳定' : stdevScore <= 20 ? '较稳定' : '起伏较大',
      carelessRatio: errN ? Math.round(errTypes.filter((t) => /careless|calculation|compute/.test(t)).length / errN * 100) : 0,
      judgedAssignments: byAssignment.size,
    };

    // ============ 考试维度（真实 examAttempt + examGrading + exam，考试专项学情） ============
    const examAttemptRows = db.select({
      exam_id: examAttempt.exam_id,
      submitted_at: examAttempt.submitted_at,
      status: examAttempt.status,
    }).from(examAttempt).where(eq(examAttempt.student_id, studentId)).all();
    const submittedAttempts = examAttemptRows
      .filter((a) => ['submitted', 'auto_submitted', 'terminated', 'exceed'].includes(String(a.status)));
    const submittedExamIds = submittedAttempts.map((a) => a.exam_id);
    const examRows = submittedExamIds.length
      ? db.select({ id: exam.id, title: exam.title }).from(exam).where(inArray(exam.id, submittedExamIds)).all()
      : [];
    const examTitleMap = new Map(examRows.map((e) => [e.id, e.title]));
    const examGradingRows = submittedExamIds.length
      ? db.select({
          exam_id: examGrading.exam_id,
          total_score: examGrading.total_score,
          full_score: examGrading.full_score,
          status: examGrading.status,
        }).from(examGrading)
          .where(and(eq(examGrading.student_id, studentId), inArray(examGrading.exam_id, submittedExamIds)))
          .all()
      : [];
    const examAgg = new Map<number, { ts: number; tf: number; totalQs: number; gradedQs: number; pendingQs: number; wrong: number }>();
    for (const g of examGradingRows) {
      const agg = examAgg.get(g.exam_id) || { ts: 0, tf: 0, totalQs: 0, gradedQs: 0, pendingQs: 0, wrong: 0 };
      agg.totalQs += 1;
      if (g.status === 'completed' && g.total_score != null) {
        agg.gradedQs += 1;
        agg.ts += g.total_score;
        agg.tf += g.full_score || 0;
        if ((g.full_score || 0) > 0 && g.total_score < g.full_score) agg.wrong += 1;
      } else if (g.status === 'pending') {
        agg.pendingQs += 1;
      }
      examAgg.set(g.exam_id, agg);
    }
    const examList = submittedAttempts
      .map((a) => {
        const agg = examAgg.get(a.exam_id) || { ts: 0, tf: 0, totalQs: 0, gradedQs: 0, pendingQs: 0, wrong: 0 };
        const scored = agg.gradedQs > 0 && agg.tf > 0;
        return {
          exam_id: a.exam_id,
          title: examTitleMap.get(a.exam_id) || `考试${a.exam_id}`,
          score: scored ? Math.round(agg.ts) : null,
          full: scored ? Math.round(agg.tf) : null,
          percent: scored ? Math.round((agg.ts / agg.tf) * 1000) / 10 : null,
          pending_subjective: agg.pendingQs,
          wrong: agg.wrong,
          submitted_at: a.submitted_at,
        };
      })
      .sort((x, y) => (y.submitted_at || '').localeCompare(x.submitted_at || ''));
    const examDefPercent = submittedAttempts
      .map((a) => { const agg = examAgg.get(a.exam_id); if (!agg || !(agg.gradedQs > 0 && agg.tf > 0)) return null; return Math.round((agg.ts / agg.tf) * 1000) / 10; })
      .filter((x): x is number => x != null);
    const examPerformance = {
      examCount: submittedAttempts.length,
      examAvgPercent: examDefPercent.length ? Math.round(examDefPercent.reduce((a, b) => a + b, 0) / examDefPercent.length * 10) / 10 : null,
      examList,
    };

    // ============ 成长时间线（真实：AI评语 + AI答疑 + 考试） ============
    const gradeRows = db.select({
      assignment_id: gradingTask.assignment_id,
      total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`,
      full_score: gradingTask.full_score,
      overall_comment: gradingTask.overall_comment,
      completed_at: gradingTask.completed_at,
    })
      .from(gradingTask)
      .where(and(eq(gradingTask.student_id, studentId), eq(gradingTask.status, 'completed')))
      .all();
    const asgnTitleMap = new Map(allAssignments.map((a) => [a.id, a.title]));
    const timeline: Array<{ type: string; title: string; desc: string; ts: string }> = [];
    for (const g of gradeRows) {
      if (!g.overall_comment || !g.completed_at) continue;
      timeline.push({
        type: 'grade',
        title: `作业《${asgnTitleMap.get(g.assignment_id) || `作业${g.assignment_id}`}》AI 批改反馈`,
        desc: g.overall_comment.length > 80 ? g.overall_comment.slice(0, 80) + '…' : g.overall_comment,
        ts: g.completed_at,
      });
    }
    const qaRows = db.select({ title: qaSession.title, created_at: qaSession.created_at })
      .from(qaSession).where(eq(qaSession.user_id, studentId)).all();
    for (const q of qaRows) {
      if (!q.title || !q.created_at) continue;
      timeline.push({ type: 'qa', title: `向 AI 提问「${q.title}」`, desc: 'AI 答疑已回复，可回看对话', ts: q.created_at });
    }
    // 考试交卷事件（含得分，供成长时间线体现考试节奏）
    for (const a of submittedAttempts) {
      if (!a.submitted_at) continue;
      const agg = examAgg.get(a.exam_id);
      const scored = agg && agg.gradedQs > 0 && agg.tf > 0;
      timeline.push({
        type: 'exam',
        title: `考试《${examTitleMap.get(a.exam_id) || `考试${a.exam_id}`}》已交卷`,
        desc: scored
          ? `得分 ${Math.round(agg!.ts)}/${Math.round(agg!.tf)}（${Math.round((agg!.ts / agg!.tf) * 100)}%）`
          : `已交卷·主观题待批 ${agg?.pendingQs || 0} 题`,
        ts: a.submitted_at,
      });
    }
    timeline.sort((a, b) => b.ts.localeCompare(a.ts));
    const growthTimeline = timeline.slice(0, 12);

    return NextResponse.json({
        success: true,
        data: {
          student: { ...student, classRank, classTotal, className, majorName, courseCount: courses.length },
          courses,
          selectedCourseId: courseId,
          // 当前范围平均掌握率 + 综合掌握度
          avgMastery,
          totalScore: Math.round(realAvgScore),
          // Core indicators（真实）
          indicators,
          // 能力雷达（六维：真实 ability_point 加权 + 记忆理解/综合应用 推导）
          radarData,
          // 知识掌握统计（真实）
          knowledgeStats,
          // 掌握率四段分层（真实）
          masteryTiers,
          // 薄弱知识点 TOP（真实）
          weakTop10,
          // 优势知识点 TOP3（真实，掌握度≥80）
          strongTop3,
          // 顽固错题数（真实，review_count≥2）
          stubbornErrors,
          // 待复习错题数（错题总数-已掌握）
          pendingErrors,
          // 错题数据（真实）
          errorData,
          // 成绩趋势（真实）
          trendData: realTrendData,
          // 课程对比（真实）
          courseComparison: realCourseComparison,
          // 学习行为（近7天学习时长 + 材料进度，真实）
          learningBehavior,
          // 学习稳定性（真实）
          stability,
          // 成长时间线（真实：AI评语 + 答疑）
          growthTimeline,
          // 考试安排（真实）
          examSchedule: examScheduleReal,
          // 考试维度学情（真实：参考考试数、平均得分率、逐场成绩）
          examPerformance,
          // Assignment counts from DB
          completedAssignments: completedAssignments || 0,
          totalAssignments: totalAssignments || 0,
          // 课程维度真实学情
          courseData,
        },
      });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === "number") return e as NextResponse;
    console.error('Get student profile error:', e);
    return NextResponse.json({ error: '获取学情数据失败' }, { status: 500 });
  }
}

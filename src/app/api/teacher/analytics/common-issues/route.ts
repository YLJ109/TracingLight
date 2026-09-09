import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and, inArray, type SQL } from 'drizzle-orm';
import { getTeacherCourseIds, getTeacherClassIds } from '@/lib/teacher-scope';
import {
  user, gradingTask, knowledgeMasteryLog, errorBook, knowledgePoint,
  assignment, course, learningBehaviorLog, question, systemConfig,
} from '@/storage/database/shared/schema';
import { createAIClient, invokeStructured, aiErrorResponse, AIConfigError } from '@/lib/ai/client';

/**
 * 教师端 AI 自动化（P2）
 * - 共性问题清单：把全班错题/掌握度按知识点聚合，AI 生成 TopN 共性问题 + 一句话行动建议。
 * - 临界生预警：识别持续薄弱 / 参与高却低效 / 复习滞后的学生，AI 生成关注名单与诊断。
 * AI 未配置时自动降级为本地聚合展示（aiGenerated:false），不影响打开页面。
 */

interface CommonIssue {
  knowledgePointId: number;
  knowledgePointName: string;
  courseName: string;
  errorCount: number;
  affectedStudents: number;
  avgMastery: number;
  topErrorType: string;
  sampleQuestion: string;
  actionSuggestion: string;
}
interface AtRiskStudent {
  studentId: number;
  name: string;
  level: string;
  avgScore: number;
  errorCount: number;
  errorResolutionRate: number;
  readonlyMinutes: number;
  completedMaterials: number;
  reasons: string[];
  aiDiagnosis: string;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const myCourseIds = await getTeacherCourseIds(authUser.userId);
    const myClassIds = await getTeacherClassIds(authUser.userId);
    const sp = request.nextUrl.searchParams;
    const courseId = sp.get('course_id') ? Number(sp.get('course_id')) : null;
    if (courseId != null && !myCourseIds.includes(courseId)) {
      return NextResponse.json({ error: '无权访问该课程' }, { status: 403 });
    }
    if (myCourseIds.length === 0 || myClassIds.length === 0) {
      return NextResponse.json({ code: 'AI_NOT_CONFIGURED', error: '暂无授课班级数据' }, { status: 400 });
    }

    // 学生集合（本人班级）
    const myStudentIds = myClassIds.length > 0
      ? (await db.select({ id: user.id }).from(user)
          .where(and(eq(user.role, 'student'), eq(user.is_active, true), inArray(user.class_id, myClassIds)))
          .execute()).map((u) => u.id)
      : [];
    if (myStudentIds.length === 0) {
      return NextResponse.json({ success: true, data: { issues: [], atRisk: [], summary: '暂无学生数据', aiGenerated: false } });
    }

    // 课程/知识点范围
    let kpCond: SQL = myCourseIds.length > 0
      ? inArray(knowledgePoint.course_id, myCourseIds)
      : eq(knowledgePoint.id, -1);
    if (courseId) kpCond = eq(knowledgePoint.course_id, courseId);
    const allKps = await db.select({
      id: knowledgePoint.id, name: knowledgePoint.name,
      course_id: knowledgePoint.course_id, description: knowledgePoint.description,
    }).from(knowledgePoint).where(kpCond).execute();
    const kpIds = allKps.map((k) => k.id);
    const kpMap = new Map(allKps.map((k) => [k.id, k]));
    const courseMap = new Map<number, string>(
      (await db.select({ id: course.id, name: course.name }).from(course)
        .where(myCourseIds.length > 0 ? inArray(course.id, myCourseIds) : eq(course.id, -1))
        .execute()).map((c) => [c.id, c.name])
    );

    // 学生详情
    const studentRows = await db.select({
      id: user.id, real_name: user.real_name, student_level: user.student_level,
    }).from(user).where(inArray(user.id, myStudentIds)).execute();
    const studentMap = new Map(studentRows.map((s) => [s.id, s]));

    // 错题按知识点聚合
    const errConds: SQL[] = [inArray(errorBook.student_id, myStudentIds)];
    if (courseId) errConds.push(inArray(errorBook.knowledge_point_id, kpIds));
    const errors = await db.select({
      student_id: errorBook.student_id,
      knowledge_point_id: errorBook.knowledge_point_id,
      error_type: errorBook.error_type,
      review_status: errorBook.review_status,
      question_id: errorBook.question_id,
    }).from(errorBook).where(and(...errConds)).execute();

    // 掌握度（按知识点平均）
    const masteryConds: SQL[] = [inArray(knowledgeMasteryLog.student_id, myStudentIds)];
    if (courseId) masteryConds.push(inArray(knowledgeMasteryLog.knowledge_point_id, kpIds));
    const masteryRows = await db.select({
      student_id: knowledgeMasteryLog.student_id,
      knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
      mastery_rate: knowledgeMasteryLog.mastery_rate,
    }).from(knowledgeMasteryLog).where(and(...masteryConds)).execute();

    // 成绩（本人课程作业）
    const myAssignmentIds = myCourseIds.length > 0
      ? (await db.select({ id: assignment.id }).from(assignment)
          .where(inArray(assignment.course_id, myCourseIds)).execute()).map((a) => a.id)
      : [];
    let gradingCond: SQL | undefined = myAssignmentIds.length > 0
      ? inArray(gradingTask.assignment_id, myAssignmentIds)
      : eq(gradingTask.id, -1);
    if (courseId) {
      const courseAssignments = (await db.select({ id: assignment.id }).from(assignment)
        .where(eq(assignment.course_id, courseId)).execute()).map((a) => a.id);
      gradingCond = and(gradingCond, courseAssignments.length > 0
        ? inArray(gradingTask.assignment_id, courseAssignments)
        : eq(gradingTask.id, -1));
    }
    const gradings = await db.select({
      student_id: gradingTask.student_id,
      total_score: gradingTask.total_score,
      full_score: gradingTask.full_score,
    }).from(gradingTask).where(and(eq(gradingTask.status, 'completed'), gradingCond)).execute();

    // 行为（阅读）
    const behaviorRows = await db.select({
      student_id: learningBehaviorLog.student_id,
      watch_duration: learningBehaviorLog.watch_duration,
      is_completed: learningBehaviorLog.is_completed,
    }).from(learningBehaviorLog).where(inArray(learningBehaviorLog.student_id, myStudentIds)).execute();
    const behaviorMap = new Map<number, { readonlySeconds: number; completedMaterials: number }>();
    behaviorRows.forEach((b) => {
      const cur = behaviorMap.get(b.student_id) || { readonlySeconds: 0, completedMaterials: 0 };
      cur.readonlySeconds += b.watch_duration || 0;
      if (b.is_completed) cur.completedMaterials += 1;
      behaviorMap.set(b.student_id, cur);
    });

    // ===== 共性问题聚合（按知识点）=====
    const issueAgg = new Map<number, { errorCount: number; students: Set<number>; errorTypes: Record<string, number>; qid: number | null }>();
    errors.forEach((e) => {
      if (e.knowledge_point_id == null) return;
      const a = issueAgg.get(e.knowledge_point_id) || { errorCount: 0, students: new Set<number>(), errorTypes: {}, qid: null };
      a.errorCount += 1;
      if (e.student_id != null) a.students.add(e.student_id);
      const t = e.error_type || 'wrong';
      a.errorTypes[t] = (a.errorTypes[t] || 0) + 1;
      if (!a.qid) a.qid = e.question_id ?? null;
      issueAgg.set(e.knowledge_point_id, a);
    });
    const kpMasteryMap = new Map<number, number[]>();
    masteryRows.forEach((m) => {
      if (m.knowledge_point_id == null) return;
      const arr = kpMasteryMap.get(m.knowledge_point_id) || [];
      arr.push(m.mastery_rate || 0);
      kpMasteryMap.set(m.knowledge_point_id, arr);
    });
    const sampleQMap = new Map<number, string>();
    const sampleQIds = [...new Set([...issueAgg.values()].map((v) => v.qid).filter(Boolean))] as number[];
    if (sampleQIds.length > 0) {
      (await db.select({ id: question.id, content: question.content })
        .from(question).where(inArray(question.id, sampleQIds))
        .execute()).forEach((q) => sampleQMap.set(q.id, q.content));
    }

    const issues: CommonIssue[] = [...issueAgg.entries()]
      .map(([kpId, v]) => {
        const kp = kpMap.get(kpId);
        if (!kp) return null;
        const masteryArr = kpMasteryMap.get(kpId) || [];
        const topType = Object.entries(v.errorTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'wrong';
        return {
          knowledgePointId: kpId,
          knowledgePointName: kp.name,
          courseName: courseMap.get(kp.course_id) || '',
          errorCount: v.errorCount,
          affectedStudents: v.students.size,
          avgMastery: masteryArr.length > 0 ? Math.round((masteryArr.reduce((s, m) => s + m, 0) / masteryArr.length) * 100) / 100 : 0,
          topErrorType: topType,
          sampleQuestion: v.qid ? sampleQMap.get(v.qid) || '' : '',
          actionSuggestion: '',
        };
      })
      .filter((x): x is CommonIssue => x !== null)
      .sort((a, b) => b.affectedStudents - a.affectedStudents || b.errorCount - a.errorCount)
      .slice(0, 10);

    // ===== 临界生聚合 =====
    const scoreMap = new Map<number, { score: number; full: number }>();
    gradings.forEach((g) => {
      const acc = scoreMap.get(g.student_id) || { score: 0, full: 0 };
      acc.score += g.total_score || 0; acc.full += g.full_score || 0;
      scoreMap.set(g.student_id, acc);
    });
    const errorByStudent = new Map<number, { total: number; resolved: number }>();
    errors.forEach((e) => {
      const acc = errorByStudent.get(e.student_id!) || { total: 0, resolved: 0 };
      acc.total += 1;
      if (e.review_status === 'mastered') acc.resolved += 1;
      errorByStudent.set(e.student_id!, acc);
    });
    const atRisk: AtRiskStudent[] = studentRows.map((s) => {
      const sc = scoreMap.get(s.id) || { score: 0, full: 0 };
      const avgScore = sc.full > 0 ? Math.round((sc.score / sc.full) * 100) : 0;
      const eb = errorByStudent.get(s.id) || { total: 0, resolved: 0 };
      const resRate = eb.total > 0 ? Math.round((eb.resolved / eb.total) * 100) : 100;
      const beh = behaviorMap.get(s.id) || { readonlySeconds: 0, completedMaterials: 0 };
      const reasons: string[] = [];
      if (avgScore > 0 && avgScore < 60) reasons.push(`平均成绩偏低(${avgScore}%)`);
      if (eb.total >= 5 && resRate < 50) reasons.push(`错题复习滞后(未掌握${eb.total - eb.resolved}题)`);
      if (eb.total >= 10 && resRate < 30) reasons.push('错题积压严重');
      return {
        studentId: s.id, name: s.real_name, level: s.student_level || 'medium',
        avgScore, errorCount: eb.total, errorResolutionRate: eb.total === 0 ? 100 : resRate,
        readonlyMinutes: Math.round(beh.readonlySeconds / 60), completedMaterials: beh.completedMaterials,
        reasons, aiDiagnosis: '',
      };
    })
      // 仅保留"需关注"（有明显风险信号 或 表现确实偏低）
      .filter((s) => s.reasons.length > 0 || (s.errorCount >= 3 && s.avgScore < 65))
      .sort((a, b) => b.reasons.length - a.reasons.length || a.avgScore - b.avgScore)
      .slice(0, 10);

    // ===== 本地降级汇总（无 AI 时直接返回）=====
    const localSummary = issues.slice(0, 3)
      .map((i) => `「${i.knowledgePointName}」有${i.affectedStudents}名同学出错，平均掌握度${Math.round(i.avgMastery * 100)}%`).join('；')
      || '暂无共性薄弱点';

    // ===== 数据指纹：仅当底层错题/掌握度变化时才重新调用 AI =====
    const fp = 'issues:' + issues.map((i) => `${i.knowledgePointId}:${i.errorCount}:${i.affectedStudents}`).join('|')
      + ';risk:' + atRisk.map((s) => `${s.studentId}:${s.avgScore}:${s.errorCount}:${s.reasons.join(',')}`).join('|');
    const cacheKey = `teacher_common_issues:${authUser.userId}:${courseId ?? 'all'}`;
    const cachedRow = (await db.select({ value: systemConfig.value }).from(systemConfig)
      .where(eq(systemConfig.key, cacheKey)).limit(1).execute())[0];
    let cached: {
      fingerprint?: string;
      summary?: string;
      issueMap?: Record<string, { knowledgePointName: string; actionSuggestion: string }>;
      riskMap?: Record<string, { studentName: string; aiDiagnosis: string }>;
    } | null = null;
    if (cachedRow?.value) {
      try { cached = JSON.parse(cachedRow.value); } catch { cached = null; }
    }
    const cacheHits =
      !!cached && cached.fingerprint === fp && !!cached.issueMap && !!cached.riskMap && !!cached.summary;

    // ===== AI 诊断（命中指纹缓存则直接复用，不再调用大模型）=====
    let aiIssues = issues; let aiAtRisk = atRisk; let summary = localSummary; let aiGenerated = false;
    if (cacheHits && cached) {
      const issueMap = new Map(Object.entries(cached.issueMap!));
      aiIssues = issues.map((i) => ({ ...i, actionSuggestion: issueMap.get(i.knowledgePointName)?.actionSuggestion || i.actionSuggestion }));
      const riskMap = new Map(Object.entries(cached.riskMap!));
      aiAtRisk = atRisk.map((s) => ({ ...s, aiDiagnosis: riskMap.get(s.name)?.aiDiagnosis || '' }));
      summary = cached.summary || localSummary;
      aiGenerated = true;
    } else {
      try {
        const client = await createAIClient();
        const result = await invokeStructured<{
          issues: Array<{ knowledgePointName: string; actionSuggestion: string }>;
          atRisk: Array<{ studentName: string; aiDiagnosis: string }>;
          summary: string;
        }>(
          client,
          '你是学情分析师。根据教师给出的班级错题与掌握度数据，输出 JSON：issues数组(每项含 knowledgePointName 与 actionSuggestion一句话教学建议)；atRisk数组(每项含 studentName 与 aiDiagnosis一句诊断)；summary为对全班的一条总结建议。只输出JSON。',
          JSON.stringify({
            issues: issues.map((i) => ({ knowledgePointName: i.knowledgePointName, errorCount: i.errorCount, affectedStudents: i.affectedStudents, avgMastery: i.avgMastery, topErrorType: i.topErrorType })),
            atRisk: atRisk.map((s) => ({ studentName: s.name, avgScore: s.avgScore, errorCount: s.errorCount, errorResolutionRate: s.errorResolutionRate, reasons: s.reasons })),
          }),
          0.4
        );
        if (result) {
          const issueMap = new Map((result.issues || []).map((x) => [x.knowledgePointName, x]));
          aiIssues = issues.map((i) => ({ ...i, actionSuggestion: issueMap.get(i.knowledgePointName)?.actionSuggestion || i.actionSuggestion }));
          const riskMap = new Map((result.atRisk || []).map((x) => [x.studentName, x]));
          aiAtRisk = atRisk.map((s) => ({ ...s, aiDiagnosis: riskMap.get(s.name)?.aiDiagnosis || '' }));
          summary = result.summary || localSummary;
          aiGenerated = true;
          // 缓存本次 AI 结果：指纹不变则后续直读，不再重复调用大模型
          try {
            const payload = JSON.stringify({
              fingerprint: fp,
              summary,
              issueMap: Object.fromEntries(issueMap),
              riskMap: Object.fromEntries(riskMap),
              generatedAt: new Date().toISOString(),
            });
            await db.insert(systemConfig).values({
              key: cacheKey,
              value: payload,
              description: 'AI共性/临界生缓存（指纹命中复用，数据变化自动刷新）',
              updated_at: new Date().toISOString(),
            }).onConflictDoUpdate({
              target: systemConfig.key,
              set: { value: payload, description: 'AI共性/临界生缓存（指纹命中复用，数据变化自动刷新）', updated_at: new Date().toISOString() },
            }).execute();
            saveDb();
          } catch { /* 缓存写入失败不影响本次返回 */ }
        }
      } catch (e) {
        if (!(e instanceof AIConfigError)) console.error('common-issues AI error (degraded):', e);
        // 降级：沿用本地聚合
      }
    }

    return NextResponse.json({ success: true, data: { issues: aiIssues, atRisk: aiAtRisk, summary, aiGenerated } });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    const cfgErr = aiErrorResponse(e);
    if (cfgErr) return cfgErr;
    console.error('common-issues error:', e);
    return NextResponse.json({ error: '获取共性问题失败' }, { status: 500 });
  }
}
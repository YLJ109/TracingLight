import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import {
  assignment, question, answer, gradingTask, user, course, classInfo,
} from '@/storage/database/shared/schema';
import { getTeacherClassIds } from '@/lib/teacher-scope';
import { eq, and, inArray } from 'drizzle-orm';

// POST /api/teacher/assignments/[id]/export - 导出成绩/作答/未交名单为 CSV（可被 Excel 打开）
// 归属校验：仅作业所属课程在本人授课范围内可用（与 questions 路由一致）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { id } = await params;
    const assignmentId = parseInt(id, 10);

    const asgn = (await db.select().from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1).execute())[0];
    if (!asgn) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 });
    }

    // 跨租户隔离：仅作业创建教师可访问（与作业列表归口一致）
    if (asgn.teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权访问该作业' }, { status: 403 });
    }
    const myClassIds = await getTeacherClassIds(authUser.userId);

    const courseNameRow = (await db.select({ name: course.name }).from(course)
      .where(eq(course.id, asgn.course_id)).limit(1).execute())[0] || null;

    // 题目（按作业 question_ids 顺序；取其中真实存在的题目）
    const questionIds: number[] = (asgn.question_ids as number[]) || [];
    const questions = questionIds.length > 0
      ? await db.select().from(question).where(inArray(question.id, questionIds)).execute()
      : [];
    const qById = new Map(questions.map((q) => [q.id, q]));

    // 学生集合：仅本人授课班级的在册学生
    const students = myClassIds.length > 0
      ? await db.select({
          id: user.id, username: user.username, real_name: user.real_name,
          class_id: user.class_id, student_level: user.student_level,
        }).from(user).where(and(
          eq(user.role, 'student'), eq(user.is_active, true), inArray(user.class_id, myClassIds),
        )).execute()
      : [];

    // 班级名映射
    const classIds = [...new Set(students.map((s) => s.class_id).filter((v): v is number => v != null))];
    const classMap = new Map<number, string>();
    if (classIds.length > 0) {
      (await db.select({ id: classInfo.id, name: classInfo.name })
        .from(classInfo).where(inArray(classInfo.id, classIds)).execute())
        .forEach((c) => classMap.set(c.id, c.name));
    }

    // 作答：是否提交 / 是否退回
    const answers = await db.select({
      student_id: answer.student_id,
      is_submitted: answer.is_submitted,
      returned: answer.returned,
    }).from(answer).where(eq(answer.assignment_id, assignmentId)).execute();

    // 批改：仅 completed，按 question 去重取最新（含覆盖分）
    const gradings = await db.select({
      student_id: gradingTask.student_id,
      question_id: gradingTask.question_id,
      total_score: gradingTask.total_score,
      teacher_override_score: gradingTask.teacher_override_score,
      completed_at: gradingTask.completed_at,
    }).from(gradingTask).where(and(
      eq(gradingTask.assignment_id, assignmentId),
      eq(gradingTask.status, 'completed'),
    )).execute();

    // 学生 → 每道题最新批改记录（同题多条时按 completed_at 保留最新一条，与 questions 路由一致）
    const rawScores = new Map<string, typeof gradings[number]>();
    for (const g of gradings) {
      const key = `${g.student_id}:${g.question_id}`;
      const prev = rawScores.get(key);
      if (!prev || (g.completed_at || '') >= (prev.completed_at || '')) rawScores.set(key, g);
    }
    const scoreBy = new Map<string, number>();
    for (const [key, g] of rawScores) {
      scoreBy.set(key, g.teacher_override_score ?? (g.total_score || 0));
    }

    /** 分数格式化：整数不带小数，否则保留 2 位 */
    function fmtScore(n: number): string {
      const v = Math.round(n * 100) / 100;
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }

    /** CSV 字段转义：含逗号/引号/换行时加双引号并转义内部引号 */
    function csvCell(v: string | number): string {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    // 收集明细行
    const rows: string[][] = [];
    const notSubmitted: { username: string; real_name: string; className: string }[] = [];

    for (const [idx, s] of students.entries()) {
      const sAnswers = answers.filter((a) => a.student_id === s.id);
      const isSubmitted = sAnswers.some((a) => a.is_submitted);
      const isReturned = sAnswers.some((a) => a.returned && !a.is_submitted);
      const statusText = isSubmitted ? '已交' : (isReturned ? '退回' : '未交');
      if (!isSubmitted) {
        notSubmitted.push({ username: s.username, real_name: s.real_name, className: classMap.get(s.class_id ?? 0) ?? '' });
      }

      const total = questionIds.reduce((sum, qid) => {
        const sc = scoreBy.get(`${s.id}:${qid}`);
        return sum + (typeof sc === 'number' ? sc : 0);
      }, 0);

      const line: (string | number)[] = [
        idx + 1,
        s.username,
        s.real_name,
        classMap.get(s.class_id ?? 0) ?? '',
        statusText,
        asgn.grades_published ? '已发布' : '未发布',
        isSubmitted ? fmtScore(total) : '',
      ];
      // 每道题得分（尽力而为；未批未作答留空）
      for (const qid of questionIds) {
        const sc = scoreBy.get(`${s.id}:${qid}`);
        line.push(typeof sc === 'number' ? fmtScore(sc) : '');
      }
      rows.push(line.map(csvCell));
    }

    // 组装 CSV 文本（UTF-8 BOM，保证 Excel 正确识别中文）
    const linesOut: string[] = [];
    linesOut.push(['作业标题', asgn.title].map(csvCell).join(','));
    linesOut.push(['总分', String(asgn.total_score ?? '')].map(csvCell).join(','));
    linesOut.push(['时间', `${asgn.start_time} ~ ${asgn.end_time}`].map(csvCell).join(','));
    linesOut.push(['课程', (courseNameRow?.name ?? '')].map(csvCell).join(','));
    linesOut.push(['成绩是否已发布', asgn.grades_published ? '已发布' : '未发布（导出分数仅供教师参考，学生端暂不可见）'].map(csvCell).join(','));
    linesOut.push(''); // 空行分隔

    const qHeader = questionIds.map((qid, i) => `题${i + 1}` + (qById.has(qid) ? `(${qById.get(qid)!.default_score ?? ''}分)` : ''));
    const headerRow = ['序号', '学号', '姓名', '班级', '状态', '发布状态', '总分', ...qHeader];
    linesOut.push(headerRow.map(csvCell).join(','));
    linesOut.push(...rows.map((r) => r.join(',')));

    linesOut.push(''); // 空行分隔
    linesOut.push(['未交名单（共 ' + notSubmitted.length + ' 人）'].map(csvCell).join(','));
    if (notSubmitted.length === 0) {
      linesOut.push('无');
    } else {
      linesOut.push(['学号', '姓名', '班级'].map(csvCell).join(','));
      notSubmitted.forEach((s, i) => {
        linesOut.push([String(i + 1), s.username, s.real_name, s.className].map(csvCell).join(','));
      });
    }

    const bom = '\uFEFF';
    const csvContent = bom + linesOut.join('\r\n');

    const filename = `${asgn.title}_成绩导出.csv`;
    // 中文文件名：RFC 5987 filename* 编码，同时保留普通 fallback
    const encoded = encodeURIComponent(filename).replace(/['()]/g, '_');
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="grades.csv"; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Export assignment error:', e);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
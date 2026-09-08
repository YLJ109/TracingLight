/**
 * 平时分 / 学习参与度计算服务（D5 权重制）
 *
 * 将散落的"过程性行为"数据（签到、阅读时长、作业完成、讨论贡献）按可配置权重
 * 汇聚为一个 0-100 的"平时表现分"，供教师端查看单个学生的综合投入情况。
 *
 * 评分口径（总分 100）：
 *   - 签到率 30%：区间内实际签到天数 / 应签到天数 = 区间日期数
 *   - 作业完成率 20%：已提交作业 / 布置给该班级的作业数
 *   - 阅读投入 25%：按累计阅读时长折算（每 60 分钟记 10 分，封顶 25 分）
 *   - 讨论贡献 15%：发帖数 + 回复数，每 1 次计 2 分，封顶 15 分
 *   - 错题复习 10%：错题已掌握(标记 mastered) / 错题总数，封顶 10 分
 *
 * 说明：
 *   - 纯只读聚合，不写库，不参与积分发放（积分体系另由 points.service 负责）。
 *   - 权重集中在 WEIGHTS 常量，后续如需后台配置可扩展。
 */
import { getDb } from '@/storage/database/db';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { readingMinutesFromSeconds, readingScoreFromMinutes } from '@/lib/reading-score';
import {
  signInRecord,
  learningBehaviorLog,
  answer,
  assignment,
  course,
  user,
  errorBook,
  discussionPost,
  discussionReply,
} from '@/storage/database/shared/schema';

export interface ParticipationScore {
  score: number;
  signinRate: number;       // 0-100
  signinDays: number;
  windowDays: number;
  homeworkRate: number;     // 0-100
  submittedCount: number;
  assignedCount: number;
  readingMinutes: number;
  readingScore: number;     // 0-25
  discussionContribution: number; // 0-15
  postCount: number;
  replyCount: number;
  reviewRate: number;       // 0-100
  reviewScore: number;      // 0-10
}

const WEIGHTS = {
  signin: 0.3,
  homework: 0.2,
  reading: 0.25,
  discussion: 0.15,
  review: 0.1,
};

/** 近 30 天表现窗口 */
const WINDOW = 30;
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const windowStart = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - (WINDOW - 1));
  return d.toISOString().slice(0, 10);
};

export function computeParticipationScore(studentId: number): ParticipationScore {
  const db = getDb();
  const start = windowStart();
  const end = today();

  // 1) 签到率：近30天实际签到 / 30
  const signins = db.select().from(signInRecord)
    .where(and(
      eq(signInRecord.user_id, studentId),
      gte(signInRecord.sign_date, start),
      lte(signInRecord.sign_date, end),
    ))
    .all();
  const signinDays = signins.length;
  const signinRate = Math.min(100, Math.round((signinDays / WINDOW) * 100));

  // 2) 作业完成率：布置给该学生所在班级的作业数 vs 该生已提交数
  // 口径：学生班级(经 user.class_id) → 该班课程(course.class_id) → 布置的作业(assignment.course_id)
  const myClassId = db.select({ class_id: user.class_id })
    .from(user).where(eq(user.id, studentId)).all()[0]?.class_id;
  let assignedAll = 0;
  if (myClassId != null) {
    const classCourseIds = db.select({ id: course.id })
      .from(course).where(eq(course.class_id, myClassId)).all().map((c) => c.id);
    assignedAll = classCourseIds.length > 0
      ? db.select({ id: assignment.id })
          .from(assignment)
          .where(and(
            inArray(assignment.course_id, classCourseIds),
            inArray(assignment.status, ['published', 'closed']),
          )).all().length
      : 0;
  }
  const answered = db.select().from(answer)
    .where(and(eq(answer.student_id, studentId), eq(answer.is_submitted, true)))
    .all();
  const submittedCount = Math.min(new Set(answered.map((a) => a.assignment_id)).size, assignedAll || Number.MAX_SAFE_INTEGER);
  const homeworkRate = assignedAll > 0 ? Math.round((submittedCount / assignedAll) * 100) : 0;

  // 3) 阅读投入：累计分钟数 → 每 60 分钟 10 分，封顶 25（口径见 lib/reading-score）
  const readingLogs = db.select().from(learningBehaviorLog)
    .where(eq(learningBehaviorLog.student_id, studentId))
    .all();
  const readingMinutes = readingMinutesFromSeconds(readingLogs.reduce((s, r) => s + (r.watch_duration || 0), 0));
  const readingScore = readingScoreFromMinutes(readingMinutes);

  // 4) 讨论贡献：发帖数 + 回复数，每 1 次 2 分，封顶 15
  const postCount = db.select().from(discussionPost)
    .where(eq(discussionPost.author_id, studentId)).all().length;
  const replyCount = db.select().from(discussionReply)
    .where(eq(discussionReply.author_id, studentId)).all().length;
  const discussionContribution = Math.min(15, (postCount + replyCount) * 2);

  // 5) 错题复习：已掌握 / 总数，封顶 10
  const myErrors = db.select().from(errorBook)
    .where(eq(errorBook.student_id, studentId)).all();
  const reviewRate = myErrors.length > 0
    ? Math.round((myErrors.filter((e) => e.review_status === 'mastered').length / myErrors.length) * 100)
    : 0;
  const reviewScore = Math.min(10, Math.round((reviewRate / 100) * 10));

  const score = Math.round(
    (signinRate / 100) * WEIGHTS.signin * 100 +
    (homeworkRate / 100) * WEIGHTS.homework * 100 +
    readingScore +
    discussionContribution +
    reviewScore
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    signinRate,
    signinDays,
    windowDays: WINDOW,
    homeworkRate,
    submittedCount,
    assignedCount: assignedAll,
    readingMinutes,
    readingScore,
    discussionContribution,
    postCount,
    replyCount,
    reviewRate,
    reviewScore,
  };
}
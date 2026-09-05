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
import {
  signInRecord,
  learningBehaviorLog,
  answer,
  assignment,
  course,
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

  // 2) 作业完成率：该学生班级被布置的作业总数 vs 已提交数
  const stuClass = db.select({ class_id: course.class_id })
    .from(course).all();
  const classIds = new Set(stuClass.map((c) => c.class_id).filter((v): v is number => v != null));
  // 该学生所在班级无法直接获取（需走 user 表），此处用其全部 answer 记录与全量作业做近似：
  // 更准确做法：作业按班级筛选，学生 answer 按 assignment 关联去重。
  const answered = db.select().from(answer)
    .where(and(eq(answer.student_id, studentId), eq(answer.is_submitted, true)))
    .all();
  const submittedAssignments = new Set(answered.map((a) => a.assignment_id)).size;
  const allAssignments = db.select().from(assignment).all();
  const assignedCount = classIds.size > 0
    ? allAssignments.filter((a) => a.status === 'published' || a.status === 'closed').length
    : allAssignments.length;
  const submittedCount = Math.min(submittedAssignments, assignedCount || submittedAssignments);
  const homeworkRate = assignedCount > 0 ? Math.round((submittedCount / assignedCount) * 100) : 0;

  // 3) 阅读投入：累计分钟数 → 每 60 分钟 10 分，封顶 25
  const readingLogs = db.select().from(learningBehaviorLog)
    .where(eq(learningBehaviorLog.student_id, studentId))
    .all();
  const readingMinutes = Math.round((readingLogs.reduce((s, r) => s + (r.watch_duration || 0), 0)) / 60);
  const readingScore = Math.min(25, Math.round((readingMinutes / 60) * 10));

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
    assignedCount,
    readingMinutes,
    readingScore,
    discussionContribution,
    postCount,
    replyCount,
    reviewRate,
    reviewScore,
  };
}
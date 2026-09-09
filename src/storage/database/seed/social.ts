/**
 * 模块6：互动管理层 — 讨论区 / AI答疑 / 公告 / 学习行为 / 学习材料 /
 *        积分·签到·商店 / 学习计划 / 课表 / 审计 / 通知 / 系统配置 / 批改规则 / 门控授能力
 * 覆盖：discussion_post·reply·like / qa_session·message / announcement·read /
 *       learning_material·learning_behavior_log / points_account·ledger·sign_in_record·summary /
 *       shop_item·redeem_order·user_decoration / study_plan·study_session / class_schedule·student_schedule /
 *       audit_log / notification / system_config / grading_config / ability_point·ideology_point·ability_knowledge·ideology_knowledge / article_attribute / question_record / review_record
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';
import { datePlus } from '../../../lib/seed/rng';

const now = () => new Date();

export async function seedSocial(db: Drizzle, ctx: SeedCtx) {
  const { rng, nextId } = ctx;

  // ===== 系统配置 =====
  const sysConfing: Array<{ key: string; value: string; description: string }> = [
    { key: 'points.reading.per_minute', value: '10', description: '每分钟阅读积分' },
    { key: 'points.reading.cap_daily', value: '30', description: '每日阅读积分上限' },
    { key: 'exam.auto_submit_warning_sec', value: '60', description: '交卷前提醒秒数' },
    { key: 'mastery.weak_threshold', value: '60', description: '薄弱知识点掌握度阈值' },
    { key: 'remedy.initial_cards', value: '1', description: '初始补签卡数' },
  ];
  for (const c of sysConfing) await db.insert(schema.systemConfig).values({ id: nextId(), ...c }).execute();

  // ===== 学习材料 + 行为日志（含阅读计分） =====
  const materialTypes = ['video', 'document', 'slide'] as const;
  for (const cid of ctx.courseIds) {
    const teacherId = ctx.courseTeacher.get(cid)!;
    const classId = ctx.courseClass.get(cid)!;
    const students = ctx.classStudents.get(classId) ?? [];
    const kps = ctx.courseKps.get(cid) ?? [];
    const nMat = rng.int(4, 8);
    for (let m = 0; m < nMat; m++) {
      const mid = nextId();
      const type = rng.pick(materialTypes);
      const title = `${rng.pick(['课件', '微视频', '拓展阅读'])}${m + 1}`;
      const kpIds = kps.slice(0, Math.min(rng.int(1, 3), kps.length)).map((k) => k.kpId);
      await db.insert(schema.learningMaterial).values({
        id: mid, course_id: cid, teacher_id: teacherId, title, type,
        content: `${type === 'video' ? '本视频讲解' : type === 'slide' ? '本课件包含' : '本材料系统梳理'}${kpIds.length}个必考知识点。`,
        url: type === 'video' ? `/uploads/materials/v${mid}.mp4` : `/uploads/materials/m${mid}.pdf`,
        duration_minutes: type === 'video' ? rng.int(8, 30) : rng.int(15, 45),
        knowledge_point_ids: kpIds, chapter: ctx.courseKps.get(cid)?.[0]?.chapter ?? '第1章 基础',
        is_required: rng.chance(0.4),
      } as any).execute();
      // 行为日志（部分学生完成阅读）
      for (const sid of students) {
        if (rng.chance(0.35)) continue;
        const watched = rng.int(0, type === 'video' ? 1800 : 2400);
        const completed = watcher(watched, type);
        await db.insert(schema.learningBehaviorLog).values({
          id: nextId(), student_id: sid, material_id: mid, watch_duration: watched,
          progress: completed ? 100 : rng.int(5, 90), review_count: rng.int(0, 3),
          is_completed: completed, last_watched_at: datePlus(now(), -rng.int(0, 20)),
        } as any).execute();
      }
    }
  }

  // ===== 积分 / 签到 =====
  for (const sid of ctx.students) {
    const totalEarned = rng.int(50, 900);
    await db.insert(schema.pointsAccount).values({
      id: nextId(), user_id: sid, total_earned: totalEarned, balance: rng.int(0, totalEarned),
      total_spent: totalEarned - rng.int(0, totalEarned), expired: 0, frozen: 0,
      level: Math.floor(totalEarned / 200) + 1, rank_visible: true,
    } as any).execute();
    // 签到汇总 + 记录
    const days = rng.int(3, 30);
    await db.insert(schema.signInSummary).values({
      id: nextId(), user_id: sid, current_streak: rng.int(0, 12), max_streak: rng.int(3, 20),
      last_sign_date: datePlus(now(), 0, 0, 0).slice(0, 10), total_days: days,
      month: '2026-09', month_days: rng.int(0, 8), year_days: rng.int(10, 120), remedy_cards: rng.int(0, 3),
    } as any).execute();
    for (let d = 0; d < days; d++) {
      await db.insert(schema.signInRecord).values({
        id: nextId(), user_id: sid, sign_date: datePlus(now(), -d, 0, 0).slice(0, 10),
        streak_day: rng.int(1, 12), points: rng.pick([2, 3, 5]), source: 'normal',
      } as any).execute();
    }
  }

  // ===== 学习计划 + 会话（含薄弱专项） =====
  for (const sid of ctx.students) {
    const planCount = rng.int(1, 3);
    for (let p = 0; p < planCount; p++) {
      const pid = nextId();
      const isAi = rng.bool(0.6);
      await db.insert(schema.studyPlan).values({
        id: pid, student_id: sid, plan_name: isAi ? 'AI 薄弱提升计划' : rng.pick(['周学习计划', '考前冲刺计划']),
        plan_type: rng.pick(['weekly', 'sprint', 'daily'] as const),
        start_date: datePlus(now(), -rng.int(0, 10), 0, 0).slice(0, 10),
        end_date: datePlus(now(), 6, 0, 0).slice(0, 10),
        total_sessions: rng.int(5, 12), completed_sessions: rng.int(0, 10),
        status: rng.pick(['active', 'active', 'completed'] as const),
        is_ai_generated: isAi, time_slot: rng.pick(['19:00-20:00', '20:00-21:00', '15:00-16:00']),
        subject: '薄弱知识点', content: '针对掌握度低于60的知识点进行专项练习。',
        duration_minutes: rng.pick([30, 45, 60]),
      } as any).execute();
      // 会话
      const sessN = rng.int(1, 4);
      for (let s = 0; s < sessN; s++) {
        await db.insert(schema.studySession).values({
          id: nextId(), plan_id: pid, session_date: datePlus(now(), -rng.int(0, 10), 0, 0).slice(0, 10),
          start_time: '19:00', end_time: rng.bool(0.3) && s === 0 ? '20:00' : '21:00',
          knowledge_point_id: pickKp(ctx, cidOf(ctx, sid)),
          session_type: rng.pick(['review', 'practice', 'preview'] as const),
          is_completed: rng.bool(0.7), student_feedback: rng.pick(['just_right', 'just_right', 'too_easy']),
          scheduled_duration: rng.pick([30, 45, 60]), actual_duration: rng.int(20, 70),
        } as any).execute();
      }
    }
    // AI 答疑会话
    if (rng.bool(0.6)) {
      const sessId = nextId();
      await db.insert(schema.qaSession).values({
        id: sessId, user_id: sid, title: rng.pick(['关于期末复习的疑问', '数据结构题目求助', '作业题目求解']),
        created_at: datePlus(now(), -rng.int(0, 15)), updated_at: datePlus(now(), -rng.int(0, 2)),
      } as any).execute();
      await db.insert(schema.qaMessage).values({ id: nextId(), session_id: sessId, role: 'user', content: '这道题我不太会，能帮忙讲讲思路吗？' } as any).execute();
      await db.insert(schema.qaMessage).values({ id: nextId(), session_id: sessId, role: 'assistant', content: '好的，这道题的关键在于抓住核心概念，然后逐步推导。首先...' } as any).execute();
    }
  }

  // ===== 课表 =====
  for (const [cid] of ctx.courseIds.map((cid, i) => [cid, i] as const)) {
    const classId = ctx.courseClass.get(cid)!;
    const dow = rng.int(1, 7);
    await db.insert(schema.classSchedule).values({
      id: nextId(), course_id: cid, class_id: classId, day_of_week: dow,
      start_time: '08:00', end_time: '09:40', location: `A${rng.int(1, 5)}${rng.int(101, 499)}`, week_pattern: 'every', is_active: true,
    } as any).execute();
  }
  for (const sid of ctx.students) {
    if (rng.chance(0.5)) continue;
    await db.insert(schema.studentSchedule).values({
      id: nextId(), student_id: sid, title: rng.pick(['晚自习', '实验室值班', '社团活动', '兼职']),
      category: rng.pick(['club', 'parttime', 'exercise', 'other'] as const),
      schedule_type: 'fixed', day_of_week: [rng.int(1, 7)], start_time: '19:00', end_time: '21:00',
      priority: rng.int(1, 5), is_active: true,
    } as any).execute();
  }

  // ===== 讨论区 =====
  const POSTS = [
    '大家觉得期末最难的是哪一章？', '这道算法题求解答思路', '数据库第三范式怎么理解呀',
    '有人一起组队做课程设计吗', '笔记分享：操作系统进程调度', '期末复习资料汇总',
  ];
  for (const cid of ctx.courseIds) {
    const classId = ctx.courseClass.get(cid)!;
    const students = ctx.classStudents.get(classId) ?? [];
    if (students.length === 0) continue;
    const nPost = rng.int(2, 5);
    for (let p = 0; p < nPost; p++) {
      const postId = nextId();
      const author = students[rng.int(0, students.length)];
      const title = rng.pick(POSTS);
      await db.insert(schema.discussionPost).values({
        id: postId, course_id: cid, author_id: author, title,
        content: `想听听大家的看法，顺便分享一下自己的理解。 #${title}`,
        is_pinned: p === 0 && rng.bool(0.5), like_count: rng.int(0, 20), reply_count: rng.int(0, 8),
        created_at: datePlus(now(), -rng.int(0, 30)), updated_at: datePlus(now(), -rng.int(0, 5)),
      } as any).execute();
      const nReply = rng.int(0, 8);
      for (let r = 0; r < nReply; r++) {
        const rid = nextId();
        const repl = students[rng.int(0, students.length)];
        await db.insert(schema.discussionReply).values({
          id: rid, post_id: postId, author_id: repl,
          content: rng.pick(['我理解是……', '同求解答', '觉得可以参考课本这一节', '我来补充一下']),
          like_count: rng.int(0, 5), created_at: datePlus(now(), -rng.int(0, 20)),
        } as any).execute();
        if (rng.bool(0.3)) {
          await db.insert(schema.discussionLike).values({
            id: nextId(), target_type: 'reply', target_id: rid, user_id: students[rng.int(0, students.length)],
          } as any).execute();
        }
      }
      if (rng.bool(0.5)) {
        await db.insert(schema.discussionLike).values({ id: nextId(), target_type: 'post', target_id: postId, user_id: students[rng.int(0, students.length)] } as any).execute();
      }
    }
  }

  // ===== 公告 =====
  for (const cid of ctx.courseIds) {
    const teacherId = ctx.courseTeacher.get(cid)!;
    await db.insert(schema.announcement).values({
      id: nextId(), teacher_id: teacherId, course_id: cid,
      title: `【${rng.pick(['作业提醒', '考试安排', '资料更新', '答疑通知'])}】${rng.pick(['第', '第'])}${rng.int(1, 12)}周`,
      content: '请同学们关注课程通知，按时完成学习任务。', is_pinned: rng.bool(0.5), target_type: 'all',
      created_at: datePlus(now(), -rng.int(0, 15)), updated_at: datePlus(now(), -rng.int(0, 15)),
    } as any).execute();
  }

  // ===== 通知 =====
  for (const sid of ctx.students) {
    for (let n = 0; n < rng.int(1, 4); n++) {
      const notifType = rng.pick(['assignment', 'grade', 'system'] as const);
      await db.insert(schema.notification).values({
        id: nextId(), user_id: sid, type: notifType,
        title: notifType === 'grade' ? '新的成绩已公布' : notifType === 'assignment' ? '有新的作业' : '系统通知',
        content: '请查看相关详情。', link: '#', is_read: rng.bool(0.5),
        created_at: datePlus(now(), -rng.int(0, 10)),
      } as any).execute();
    }
  }

  // ===== 审计日志 =====
  const adminId = ctx.admins[0] ?? 0;
  const auditActions = [
    'login', 'create_user', 'disable_user', 'reset_password', 'change_role', 'update_config',
    'assignment.created', 'assignment.grades_published', 'exam.created', 'exam.grades_published',
  ];
  for (let n = 0; n < 120; n++) {
    await db.insert(schema.auditLog).values({
      id: nextId(), operator_id: adminId, operator_name: 'admin',
      action: rng.pick(auditActions), target_type: rng.pick(['user', 'assignment', 'exam', 'config']),
      target_id: String(rng.int(0, 500)), detail: rng.pick(['批量创建用户', '公布作业成绩', '更新系统配置', '登录成功']),
      created_at: datePlus(now(), -rng.int(0, 40)),
    } as any).execute();
  }

  // ===== 批改规则 / 门控能力 / 思政 =====
  for (const [cid, cIdx] of ctx.courseIds.map((cid, i) => [cid, i] as const)) {
    const teacherId = ctx.courseTeacher.get(cid)!;
    await db.insert(schema.gradingConfig).values({
      id: nextId(), teacher_id: teacherId, course_id: cid, question_type: null,
      name: '默认批改规则',
      scoring_criteria: '按要点给分，思路正确优先。', deduction_rules: '答错扣分，关键步骤缺失酌情扣分。',
      comment_style: '温和鼓励', grade_levels: [{ min: 90, label: '优秀' }, { min: 75, label: '良好' }, { min: 60, label: '及格' }],
      is_active: true,
    } as any).execute();
    // 能力点 + 思政点
    const abId = nextId();
    await db.insert(schema.abilityPoint).values({ id: abId, name: '分析与建模能力', description: '把实际问题抽象为可求解的模型', course_id: cid } as any).execute();
    const kbId = nextId();
    await db.insert(schema.ideologyPoint).values({ id: kbId, name: '工程伦理与责任', description: '在工程实践中坚守伦理与职业操守', course_id: cid } as any).execute();
    for (const k of ctx.courseKps.get(cid) ?? []) {
      await db.insert(schema.abilityKnowledge).values({ id: nextId(), ability_id: abId, knowledge_id: k.kpId, weight: rng.range(0.5, 1) } as any).execute();
      if (rng.bool(0.5)) await db.insert(schema.ideologyKnowledge).values({ id: nextId(), ideology_id: kbId, knowledge_id: k.kpId } as any).execute();
    }
    void cIdx;
  }

  // ===== 商店 + 兑换 =====
  const ITEMS: Array<{ name: string; type: string; subtype: string; rarity: string; points_price: number }> = [
    { name: '星空头像框', type: 'decoration', subtype: 'avatar_frame', rarity: 'rare', points_price: 200 },
    { name: '彩虹聊天气泡', type: 'decoration', subtype: 'chat_bubble', rarity: 'common', points_price: 80 },
    { name: '学神称号', type: 'decoration', subtype: 'title', rarity: 'epic', points_price: 500 },
    { name: '补签卡×1', type: 'benefit', subtype: 'consumable', rarity: 'rare', points_price: 50 },
    { name: '鼠标垫', type: 'physical', subtype: 'consumable', rarity: 'limited', points_price: 800 },
  ];
  const itemIds: number[] = [];
  for (const it of ITEMS) {
    const iid = nextId();
    itemIds.push(iid);
    await db.insert(schema.shopItem).values({
      id: iid, name: it.name, type: it.type, subtype: it.subtype, rarity: it.rarity,
      description: '通过积分兑换的奖励', config_key: 'style', config_value: '#fff',
      points_price: it.points_price, stock: -1, per_user_limit: 1,
      need_teacher_review: it.type === 'physical', status: 'on_shelf',
    } as any).execute();
  }
  for (const sid of ctx.students.slice(0, 20)) {
    const iid = itemIds[rng.int(0, itemIds.length)];
    const cost = ITEMS[itemIds.indexOf(iid)].points_price;
    await db.insert(schema.redeemOrder).values({
      id: nextId(), order_no: `RO${Date.now()}${sid}`, user_id: sid, item_id: iid, quantity: 1,
      points_cost: cost, status: 'completed', idempotency_key: `ro_${sid}_${iid}`,
    } as any).execute();
    await db.insert(schema.userDecoration).values({
      id: nextId(), user_id: sid, item_id: iid, subtype: ITEMS[itemIds.indexOf(iid)].subtype,
      config_key: 'style', config_value: '#fff', source: 'purchase', is_equipped: rng.bool(0.3),
    } as any).execute();
  }

  // ===== 答疑记录 question_record =====
  for (const [cid, cIdx] of ctx.courseIds.map((cid, i) => [cid, i] as const)) {
    const classId = ctx.courseClass.get(cid)!;
    const students = ctx.classStudents.get(classId) ?? [];
    if (students.length === 0) continue;
    for (let q = 0; q < rng.int(1, 3); q++) {
      const teacherId = ctx.courseTeacher.get(cid)!;
      await db.insert(schema.questionRecord).values({
        id: nextId(), student_id: students[rng.int(0, students.length)], teacher_id: teacherId,
        course_id: cid, knowledge_point_id: ctx.courseKps.get(cid)?.[0]?.kpId ?? null,
        question_text: '这道课后题不会做，求讲解', status: rng.pick(['pending', 'answered', 'resolved'] as const),
        is_public: rng.bool(0.3), created_at: datePlus(now(), -rng.int(0, 10)),
      } as any).execute();
    }
    void cIdx;
  }
}

function watcher(watched: number, type: string): boolean {
  const need = type === 'video' ? 900 : 1200;
  return watched >= need;
}

function cidOf(ctx: SeedCtx, sid: number): number {
  const clsId = ctx.userClass.get(sid);
  if (clsId == null) return ctx.courseIds[0] ?? 0;
  for (const cid of ctx.courseIds) if (ctx.courseClass.get(cid) === clsId) return cid;
  return ctx.courseIds[0] ?? 0;
}

function pickKp(ctx: SeedCtx, cid: number): number {
  const kps = ctx.courseKps.get(cid);
  if (!kps || kps.length === 0) return ctx.lastKpId;
  return kps[0].kpId;
}
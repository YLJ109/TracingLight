import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { signInRecord, signInSummary } from '@/storage/database/shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardPointsTx } from '@/services/points.service';

/** 7 天周期奖励：第 7 天大奖 */
const CYCLE_POINTS = [2, 3, 5, 5, 8, 8, 20];
/** 连续满 7 天后每日额外加成（封顶 10） */
const STREAK_BONUS_CAP = 10;

/** 北京时间“本地日”（北京 0-8 点 UTC 仍是前一天，须 +8h 对齐） */
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const monthOf = (d: string) => d.slice(0, 7);
const yearOf = (d: string) => d.slice(0, 4);

/** 日期加减天数 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 唯一约束冲突判定 */
function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /unique|constraint/i.test(msg);
}

/** 在给定句柄上获取（或惰性创建）签到汇总；并发首建 UNIQUE 冲突用 INSERT+重查规避 */
async function getOrCreateSummaryOn(q: any, user_id: number) {
  let s = (await q.select().from(signInSummary)
    .where(eq(signInSummary.user_id, user_id)).limit(1).execute())[0];
  if (!s) {
    try {
      await q.insert(signInSummary).values({
        user_id, current_streak: 0, max_streak: 0, last_sign_date: null,
        total_days: 0, month: monthOf(today()), month_days: 0, year_days: 0,
        remedy_cards: 1, updated_at: nowStr(),
      }).execute();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    s = (await q.select().from(signInSummary)
      .where(eq(signInSummary.user_id, user_id)).limit(1).execute())[0];
  }
  return s;
}

function getOrCreateSummary(user_id: number) {
  return getOrCreateSummaryOn(getDb(), user_id);
}

/** GET：签到面板状态（今日状态 / 连续天数 / 7 天进度 / 补签卡 / 本月日历） */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const uid = authUser.userId;
    const t = today();

    const summary = await getOrCreateSummary(uid);
    const signedToday = (await db.select().from(signInRecord)
      .where(and(eq(signInRecord.user_id, uid), eq(signInRecord.sign_date, t)))
      .limit(1).execute())[0];

    // 本月签到记录
    const monthStart = monthOf(t) + '-01';
    const monthRecords = await db.select().from(signInRecord)
      .where(and(
        eq(signInRecord.user_id, uid),
        sql`${signInRecord.sign_date} >= ${monthStart}`,
        sql`${signInRecord.sign_date} <= ${t}`,
      ))
      .orderBy(signInRecord.sign_date)
      .execute();

    const missed = monthRecords.length < new Date(t).getUTCDate()
      ? new Date(t).getUTCDate() - monthRecords.length
      : 0;

    const cycleDay = ((summary.current_streak ?? 0) % 7);
    const nextPoints = CYCLE_POINTS[signedToday ? cycleDay : cycleDay] || CYCLE_POINTS[0];
    const bonus = Math.min(Math.floor((summary.current_streak ?? 0) / 7) * 2, STREAK_BONUS_CAP);

    return NextResponse.json({
      success: true,
      data: {
        today: t,
        status: signedToday ? 'signed' : (missed > 0 && (summary.remedy_cards ?? 0) > 0 ? 'can_remedy' : 'not_signed'),
        signed_today: !!signedToday,
        today_points: signedToday?.points ?? 0,
        current_streak: summary.current_streak ?? 0,
        max_streak: summary.max_streak ?? 0,
        total_days: summary.total_days ?? 0,
        month_days: summary.month_days ?? 0,
        year_days: summary.year_days ?? 0,
        remedy_cards: summary.remedy_cards ?? 0,
        cycle: { position: cycleDay + 1, points: CYCLE_POINTS, next_points: nextPoints, bonus },
        month_records: monthRecords.map((r) => ({
          date: r.sign_date,
          points: r.points,
          source: r.source,
          streak_day: r.streak_day,
        })),
        missed_days: missed,
      },
    });
  } catch (e) {
    console.error('Checkin status error:', e);
    return NextResponse.json({ error: '获取签到状态失败' }, { status: 500 });
  }
}

/** POST：今日签到（签到记录 + 汇总更新 + 发积分整体在一个事务内，避免“有记录无积分”） */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const uid = authUser.userId;
    const t = today();

    // 前置防重复（数据库唯一索引做并发兜底）
    const exist = (await db.select().from(signInRecord)
      .where(and(eq(signInRecord.user_id, uid), eq(signInRecord.sign_date, t)))
      .limit(1).execute())[0];
    if (exist) {
      return NextResponse.json({
        success: false, code: 'ALREADY_SIGNED', error: '今天已经签到过啦',
        data: { points: exist.points, streak: exist.streak_day },
      }, { status: 409 });
    }

    let result;
    try {
      result = await db.transaction(async (tx) => {
        const summary = await getOrCreateSummaryOn(tx, uid);
        const last = summary.last_sign_date;
        // 连续判定：昨天签过则 +1，否则从 1 开始
        const isConsecutive = last && addDays(last, 1) === t;
        const newStreak = isConsecutive ? (summary.current_streak ?? 0) + 1 : 1;
        const cycleIdx = (newStreak - 1) % 7;
        const base = CYCLE_POINTS[cycleIdx];
        const bonus = Math.min(Math.floor(newStreak / 7) * 2, STREAK_BONUS_CAP);
        const points = base + bonus;
        const newMonth = monthOf(t);
        const sameMonth = summary.month === newMonth;

        // 满 7 天赠送补签卡（上限 3）
        let cards = summary.remedy_cards ?? 0;
        if (newStreak > 0 && newStreak % 7 === 0 && cards < 3) cards += 1;

        await tx.insert(signInRecord).values({
          user_id: uid, sign_date: t, streak_day: newStreak, points, source: 'normal', created_at: nowStr(),
        }).execute();

        await tx.update(signInSummary).set({
          current_streak: newStreak,
          max_streak: Math.max(summary.max_streak ?? 0, newStreak),
          last_sign_date: t,
          total_days: (summary.total_days ?? 0) + 1,
          month: newMonth,
          month_days: sameMonth ? (summary.month_days ?? 0) + 1 : 1,
          year_days: (summary.year_days ?? 0) + 1,
          remedy_cards: cards,
          updated_at: nowStr(),
        }).where(eq(signInSummary.user_id, uid)).execute();

        // 发积分（幂等键 = 用户+日期，与上面写入同一事务，失败整体回滚）
        const award = await awardPointsTx(tx, {
          user_id: uid,
          amount: points,
          biz_type: 'checkin',
          biz_ref: t,
          remark: `每日签到（连续 ${newStreak} 天）`,
          idempotency_key: `earn:checkin:${uid}:${t}`,
        });

        return { award, newStreak, cycleIdx, bonus, cards };
      });
    } catch (e) {
      // 并发重复签到：sign_in_record 唯一索引冲突 → 返回 409 而非 500
      if (isUniqueViolation(e)) {
        return NextResponse.json({
          success: false, code: 'ALREADY_SIGNED', error: '今天已经签到过啦',
        }, { status: 409 });
      }
      throw e;
    }

    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({
      success: true,
      data: {
        points: result.award.amount,
        streak: result.newStreak,
        bonus: result.bonus,
        cycle_position: result.cycleIdx + 1,
        remedy_cards: result.cards,
        balance: result.award.balance,
        total_earned: result.award.total_earned,
        is_seventh: result.cycleIdx === 6,
      },
    });
  } catch (e) {
    console.error('Checkin error:', e);
    return NextResponse.json({ error: '签到失败' }, { status: 500 });
  }
}

/** 补签：消耗 1 张补签卡，仅可补本月内的漏签日期 */
export async function PUT(request: NextRequest) {
  return NextResponse.json({ error: '请使用 POST /api/student/checkin/remedy' }, { status: 405 });
}

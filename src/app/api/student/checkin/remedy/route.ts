import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { signInRecord, signInSummary } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { awardPointsTx } from '@/services/points.service';

const CYCLE_POINTS = [2, 3, 5, 5, 8, 8, 20];

/** 北京时间“本地日”（北京 0-8 点 UTC 仍是前一天，须 +8h 对齐） */
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

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
        total_days: 0, month: today().slice(0, 7), month_days: 0, year_days: 0,
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

/**
 * 推断被补签日在该日真实连续序列中的位置，据此取档位：
 * 以“补签日前一天的签到记录”为基准（该日 streak_day 是被补签日连续的锚点），
 * 前一天未签则视为该段连续从第 1 天开始。
 */
async function inferRemedyPoints(q: any, uid: number, date: string): Promise<{ points: number; streakDay: number }> {
  const prevDay = addDays(date, -1);
  const prev = (await q.select().from(signInRecord)
    .where(and(eq(signInRecord.user_id, uid), eq(signInRecord.sign_date, prevDay)))
    .limit(1).execute())[0];
  const streakDay = prev ? (prev.streak_day ?? 0) + 1 : 1;
  const cycleIdx = (streakDay - 1) % 7;
  return { points: CYCLE_POINTS[cycleIdx], streakDay };
}

/** POST：补签（消耗 1 张补签卡，仅本月内漏签日期；记录 + 汇总 + 发积分一个事务内完成） */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const uid = authUser.userId;
    const body = await request.json();
    const date = String(body?.date || '');
    const t = today();

    // 校验：格式、当月、非未来、非今天
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: '日期格式不正确' }, { status: 400 });
    }
    if (date.slice(0, 7) !== t.slice(0, 7)) {
      return NextResponse.json({ success: false, code: 'REMEDY_OUT_OF_MONTH', error: '只能补签本月内的漏签日期' }, { status: 400 });
    }
    if (date >= t) {
      return NextResponse.json({ success: false, error: '只能补签过去的日期' }, { status: 400 });
    }

    // 该日期是否已签
    const exist = (await db.select().from(signInRecord)
      .where(and(eq(signInRecord.user_id, uid), eq(signInRecord.sign_date, date)))
      .limit(1).execute())[0];
    if (exist) {
      return NextResponse.json({ success: false, error: '该日期已签到' }, { status: 409 });
    }

    const summaryPre = await getOrCreateSummary(uid);
    if ((summaryPre.remedy_cards ?? 0) < 1) {
      return NextResponse.json({ success: false, code: 'NO_REMEDY_CARD', error: '补签卡不足，可在积分商城兑换' }, { status: 400 });
    }

    let result;
    try {
      result = await db.transaction(async (tx) => {
        // 事务内重新校验补签卡
        const summary = await getOrCreateSummaryOn(tx, uid);
        if ((summary.remedy_cards ?? 0) < 1) {
          throw Object.assign(new Error('NO_REMEDY_CARD'), { status: 400 });
        }

        // 补签按该日真实连续位置取档位（不叠加连续加成）
        const { points, streakDay } = await inferRemedyPoints(tx, uid, date);

        await tx.insert(signInRecord).values({
          user_id: uid, sign_date: date, streak_day: streakDay, points, source: 'remedy', created_at: nowStr(),
        }).execute();

        await tx.update(signInSummary).set({
          remedy_cards: (summary.remedy_cards ?? 0) - 1,
          total_days: (summary.total_days ?? 0) + 1,
          month_days: (summary.month_days ?? 0) + 1,
          year_days: (summary.year_days ?? 0) + 1,
          updated_at: nowStr(),
        }).where(eq(signInSummary.user_id, uid)).execute();

        const award = await awardPointsTx(tx, {
          user_id: uid,
          amount: points,
          biz_type: 'checkin',
          biz_ref: date,
          remark: `补签 ${date}`,
          idempotency_key: `earn:remedy:${uid}:${date}`,
        });

        return { award, remedy_cards: (summary.remedy_cards ?? 0) - 1 };
      });
    } catch (e) {
      // 并发/重复补签：sign_in_record 唯一索引冲突 → 409
      if (isUniqueViolation(e)) {
        return NextResponse.json({ success: false, error: '该日期已签到' }, { status: 409 });
      }
      if ((e as any)?.status) {
        return NextResponse.json({ success: false, code: 'NO_REMEDY_CARD', error: '补签卡不足，可在积分商城兑换' }, { status: 400 });
      }
      throw e;
    }

    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({
      success: true,
      data: { date, points: result.award.amount, remedy_cards: result.remedy_cards, balance: result.award.balance },
    });
  } catch (e) {
    console.error('Remedy signin error:', e);
    return NextResponse.json({ error: '补签失败' }, { status: 500 });
  }
}
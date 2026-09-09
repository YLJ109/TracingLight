/**
 * 积分服务 —— 所有积分变动的唯一入口
 *
 * 设计要点：
 * 1. 双口径：total_earned（总积分，只增不减，排行榜依据）与 balance（可用积分，可消费）
 *    不变式：balance = total_earned - total_spent - expired
 * 2. 幂等：idempotency_key 唯一；幂等判断与写入置于同一事务内，避免并发 TOCTOU 双重入账
 * 3. 日上限：同一 biz_type 每日获取上限，超限返回 capped（不报错，积分为 0）
 * 4. 事务：读账户→更新账户→写流水整体包进 db.transaction，任一步失败整体回滚
 * 5. 原子扣减：消费用条件更新（WHERE user_id=? AND balance>=?）+ 受影响行数判定，防透支/超卖
 * 6. PostgreSQL：事务自动提交/回滚，无需手动 saveDb（保留为兼容性 no-op）。
 */
import { getDb } from '@/storage/database/db';
import { pointsAccount, pointsLedger } from '@/storage/database/shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core';

/** PostgreSQL 数据库 / 事务句柄（宽泛泛型以兼容实际 schema 实例） */
type PointsDb = PgDatabase<any, any, any>;
type PointsTx = PgTransaction<any, any, any>;
type PointsQ = PointsDb | PointsTx;

export type PointsDirection = 'earn' | 'spend' | 'refund' | 'expire' | 'adjust';
export type BizType =
  | 'checkin' | 'homework' | 'homework_submit' | 'review' | 'practice'
  | 'qa' | 'reading' | 'teacher_grant' | 'redeem' | 'remedy';

/** 各来源每日获取上限（0 表示不限） */
const DAILY_CAP: Record<string, number> = {
  checkin: 0,        // 由唯一索引控制，不重复
  homework: 100,
  homework_submit: 0,
  review: 30,
  practice: 30,
  qa: 20,
  reading: 15,
  teacher_grant: 0,
};

export interface AwardParams {
  user_id: number;
  amount: number;
  biz_type: BizType;
  biz_ref?: string;
  remark?: string;
  idempotency_key?: string;
  operator_id?: number;
}

export interface SpendParams {
  user_id: number;
  amount: number;
  biz_type: BizType;
  biz_ref?: string;
  remark?: string;
  idempotency_key?: string;
  operator_id?: number;
}

export interface PointsResult {
  ok: boolean;
  amount: number;
  balance: number;
  total_earned: number;
  capped?: boolean;
  duplicate?: boolean;
  error?: string;
}

const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** 唯一约束冲突判定 */
function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /unique|constraint|duplicate key/i.test(msg);
}

/** 新账户的插入值（getOrCreate 用，事务内/事务外共用） */
function accountInsertValues(user_id: number) {
  return {
    user_id,
    total_earned: 0,
    balance: 0,
    total_spent: 0,
    expired: 0,
    frozen: 0,
    version: 0,
    level: 1,
    rank_visible: true,
    updated_at: nowStr(),
  };
}

/** 在给定句柄（db 或 tx）上获取（或惰性创建）账户；并发首建的 UNIQUE 冲突用 INSERT+重查规避 */
async function getOrCreateAccountOn(q: PointsQ, user_id: number) {
  const rows = await q.select().from(pointsAccount)
    .where(eq(pointsAccount.user_id, user_id)).limit(1).execute();
  let acc = rows[0];
  if (!acc) {
    try {
      await q.insert(pointsAccount).values(accountInsertValues(user_id)).execute();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    const rows2 = await q.select().from(pointsAccount)
      .where(eq(pointsAccount.user_id, user_id)).limit(1).execute();
    acc = rows2[0];
  }
  return acc;
}

/** 获取（或惰性创建）积分账户（事务外便捷入口） */
export async function getOrCreateAccount(user_id: number) {
  return getOrCreateAccountOn(getDb(), user_id);
}

/** 查询某来源今日已获得积分 */
async function todayEarnedOn(q: PointsQ, user_id: number, biz_type: string): Promise<number> {
  const rows = await q.select({ total: sql<number>`COALESCE(SUM(${pointsLedger.amount}), 0)` })
    .from(pointsLedger)
    .where(and(
      eq(pointsLedger.user_id, user_id),
      eq(pointsLedger.biz_type, biz_type),
      eq(pointsLedger.direction, 'earn'),
      sql`CAST(${pointsLedger.created_at} AS date) = CAST(${nowStr()} AS date)`,
    ))
    .execute();
  return Number(rows[0]?.total || 0);
}

/**
 * 事务内发放积分（总积分与可用积分同时增加）。
 * 幂等检查 + 写流水 + 更新账户整体在同一事务内完成，避免并发 TOCTOU 双重入账。
 * 不自行提交，由调用方事务统一管理。
 */
export async function awardPointsTx(tx: PointsTx, p: AwardParams): Promise<PointsResult> {
  const amount = Math.max(0, Math.floor(p.amount));
  const acc = await getOrCreateAccountOn(tx, p.user_id);
  if (amount === 0) {
    return { ok: true, amount: 0, balance: acc.balance ?? 0, total_earned: acc.total_earned ?? 0 };
  }

  // 幂等：先插入流水（idempotency_key 唯一约束 + 同一事务内，冲突即重复/已处理），再更新账户。
  if (p.idempotency_key) {
    const exist = (await tx.select().from(pointsLedger)
      .where(eq(pointsLedger.idempotency_key, p.idempotency_key)).limit(1).execute())[0];
    if (exist) {
      const cur = await getOrCreateAccountOn(tx, p.user_id);
      return { ok: true, amount: 0, balance: cur.balance ?? 0, total_earned: cur.total_earned ?? 0, duplicate: true };
    }
  }

  // 日上限
  const cap = DAILY_CAP[p.biz_type] ?? 0;
  if (cap > 0 && await todayEarnedOn(tx, p.user_id, p.biz_type) >= cap) {
    return { ok: true, amount: 0, balance: acc.balance ?? 0, total_earned: acc.total_earned ?? 0, capped: true };
  }

  const newTotal = (acc.total_earned || 0) + amount;
  const newBalance = (acc.balance || 0) + amount;

  await tx.insert(pointsLedger).values({
    user_id: p.user_id,
    direction: 'earn',
    amount,
    balance_after: newBalance,
    biz_type: p.biz_type,
    biz_ref: p.biz_ref || null,
    idempotency_key: p.idempotency_key || null,
    remark: p.remark || null,
    operator_id: p.operator_id || null,
    created_at: nowStr(),
  }).execute();

  await tx.update(pointsAccount)
    .set({ total_earned: newTotal, balance: newBalance, version: (acc.version ?? 0) + 1, updated_at: nowStr() })
    .where(eq(pointsAccount.user_id, p.user_id))
    .execute();

  return { ok: true, amount, balance: newBalance, total_earned: newTotal };
}

/** 发放积分（自管理事务） */
export async function awardPoints(p: AwardParams): Promise<PointsResult> {
  return getDb().transaction(async (tx) => awardPointsTx(tx, p));
}

/**
 * 消费积分（只扣可用积分与累计消耗，不动总积分 —— 消费不掉排行）
 * 用条件更新（WHERE balance >= ?）原子扣减 + 受影响行数判定，防透支/超卖
 */
export async function spendPointsTx(tx: PointsTx, p: SpendParams): Promise<PointsResult> {
  const amount = Math.max(0, Math.floor(p.amount));
  const acc = await getOrCreateAccountOn(tx, p.user_id);

  // 幂等：与写入同事务，命中已处理流水则视为重复返回
  if (p.idempotency_key) {
    const exist = (await tx.select().from(pointsLedger)
      .where(eq(pointsLedger.idempotency_key, p.idempotency_key)).limit(1).execute())[0];
    if (exist) {
      return { ok: true, amount: 0, balance: acc.balance ?? 0, total_earned: acc.total_earned ?? 0, duplicate: true };
    }
  }

  // 快速路径：余额不足直接返回
  if ((acc.balance || 0) < amount) {
    return { ok: false, amount: 0, balance: acc.balance ?? 0, total_earned: acc.total_earned ?? 0, error: 'INSUFFICIENT_POINTS' };
  }

  // 原子扣减：条件更新，以受影响行数判定是否透支（与上一步同事务，防并发超卖）
  const updated = await tx.update(pointsAccount)
    .set({
      balance: sql`${pointsAccount.balance} - ${amount}`,
      total_spent: sql`${pointsAccount.total_spent} + ${amount}`,
      version: sql`${pointsAccount.version} + 1`,
      updated_at: nowStr(),
    })
    .where(and(
      eq(pointsAccount.user_id, p.user_id),
      sql`${pointsAccount.balance} >= ${amount}`,
    ))
    .returning({ id: pointsAccount.id });

  if (updated.length < 1) {
    const cur = (await tx.select().from(pointsAccount)
      .where(eq(pointsAccount.user_id, p.user_id)).limit(1).execute())[0];
    return { ok: false, amount: 0, balance: (cur?.balance ?? 0), total_earned: (cur?.total_earned ?? 0), error: 'INSUFFICIENT_POINTS' };
  }

  const newBalance = (acc.balance || 0) - amount;
  const newSpent = (acc.total_spent || 0) + amount;

  await tx.insert(pointsLedger).values({
    user_id: p.user_id,
    direction: 'spend',
    amount,
    balance_after: newBalance,
    biz_type: p.biz_type,
    biz_ref: p.biz_ref || null,
    idempotency_key: p.idempotency_key || null,
    remark: p.remark || null,
    operator_id: p.operator_id || null,
    created_at: nowStr(),
  }).execute();

  return { ok: true, amount, balance: newBalance, total_earned: acc.total_earned ?? 0 };
}

/** 消费积分（自管理事务） */
export async function spendPoints(p: SpendParams): Promise<PointsResult> {
  return getDb().transaction(async (tx) => spendPointsTx(tx, p));
}

/** 退款：事务内回滚消费（可用积分返还，累计消耗回退；总积分不变） */
export async function refundPointsTx(tx: PointsTx, p: SpendParams & { original_ref?: string }): Promise<PointsResult> {
  const amount = Math.max(0, Math.floor(p.amount));
  const acc = await getOrCreateAccountOn(tx, p.user_id);
  const newBalance = (acc.balance || 0) + amount;
  const newSpent = Math.max(0, (acc.total_spent || 0) - amount);

  await tx.insert(pointsLedger).values({
    user_id: p.user_id,
    direction: 'refund',
    amount,
    balance_after: newBalance,
    biz_type: p.biz_type,
    biz_ref: p.biz_ref || null,
    idempotency_key: p.idempotency_key || null,
    remark: p.remark || '订单取消退款',
    operator_id: p.operator_id || null,
    created_at: nowStr(),
  }).execute();

  await tx.update(pointsAccount)
    .set({ balance: newBalance, total_spent: newSpent, version: (acc.version ?? 0) + 1, updated_at: nowStr() })
    .where(eq(pointsAccount.user_id, p.user_id))
    .execute();

  return { ok: true, amount, balance: newBalance, total_earned: acc.total_earned ?? 0 };
}

/** 退款（自管理事务） */
export async function refundPoints(p: SpendParams & { original_ref?: string }): Promise<PointsResult> {
  return getDb().transaction(async (tx) => refundPointsTx(tx, p));
}

/**
 * 对账：balance 应等于 total_earned - total_spent - expired
 * 不一致时以流水重算修正，返回差异
 */
export async function reconcile(user_id: number): Promise<{ ok: boolean; diff: number; fixed: boolean }> {
  const db = getDb();
  const acc = await getOrCreateAccount(user_id);
  const rows = await db.select({ direction: pointsLedger.direction, total: sql<number>`COALESCE(SUM(${pointsLedger.amount}), 0)` })
    .from(pointsLedger)
    .where(eq(pointsLedger.user_id, user_id))
    .groupBy(pointsLedger.direction)
    .execute();

  let earned = 0, spent = 0, refunded = 0, expired = 0;
  for (const r of rows) {
    const v = Number(r.total || 0);
    if (r.direction === 'earn') earned += v;
    else if (r.direction === 'spend') spent += v;
    else if (r.direction === 'refund') refunded += v;
    else if (r.direction === 'expire') expired += v;
  }
  const expected = earned - spent + refunded - expired;
  const diff = expected - (acc.balance || 0);
  if (diff !== 0) {
    await db.update(pointsAccount)
      .set({
        balance: expected,
        total_earned: earned,
        total_spent: spent - refunded,
        expired,
        updated_at: nowStr(),
      })
      .where(eq(pointsAccount.user_id, user_id))
      .execute();
    return { ok: false, diff, fixed: true };
  }
  return { ok: true, diff: 0, fixed: false };
}
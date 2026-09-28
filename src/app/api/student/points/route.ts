import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { pointsAccount, pointsLedger } from '@/storage/database/shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { getOrCreateAccount } from '@/services/points.service';

/** GET：积分账户（总积分 + 可用积分 双口径）、班级排名与流水 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const uid = authUser.userId;
    const acc = getOrCreateAccount(uid);

    const { searchParams } = new URL(request.url);
    const bizType = searchParams.get('biz_type');
    const limit = Math.min(100, Number(searchParams.get('limit') || 20));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));

    const conds = [eq(pointsLedger.user_id, uid)];
    if (bizType) conds.push(eq(pointsLedger.biz_type, bizType));

    const ledger = db.select().from(pointsLedger)
      .where(and(...conds))
      .orderBy(desc(pointsLedger.id))
      .limit(limit)
      .offset(offset)
      .all()
      .map((l) => ({
        id: l.id,
        direction: l.direction,
        amount: l.amount,
        balance_after: l.balance_after,
        biz_type: l.biz_type,
        remark: l.remark,
        created_at: l.created_at,
      }));

    // 排名（按总积分，超过多少人 + 1）
    const rankRow = db.select({ cnt: sql`COUNT(*) + 1` })
      .from(pointsAccount)
      .where(sql`total_earned > ${acc.total_earned ?? 0}`)
      .all();
    const rank = Number(rankRow[0]?.cnt ?? 1);

    return NextResponse.json({
      success: true,
      data: {
        total_earned: acc.total_earned ?? 0,
        balance: acc.balance ?? 0,
        total_spent: acc.total_spent ?? 0,
        level: acc.level ?? 1,
        rank_visible: acc.rank_visible !== false,
        rank,
        ledger,
      },
    });
  } catch (e) {
    console.error('Points query error:', e);
    return NextResponse.json({ error: '获取积分失败' }, { status: 500 });
  }
}

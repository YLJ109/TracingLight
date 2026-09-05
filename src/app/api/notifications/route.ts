import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc } from 'drizzle-orm';
import { notification } from '@/storage/database/shared/schema';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const rows = db.select()
      .from(notification)
      .where(eq(notification.user_id, authUser.userId))
      .orderBy(desc(notification.id))
      .limit(30)
      .all();

    const data = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.content,
      link: n.link,
      read: !!n.is_read,
      time: n.created_at,
    }));

    const unread = data.filter((n) => !n.read).length;

    return NextResponse.json({ success: true, data, unread });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get notifications error:', e);
    return NextResponse.json({ error: '获取通知失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const { id, all } = body;

    if (all) {
      db.update(notification).set({ is_read: true })
        .where(eq(notification.user_id, authUser.userId)).run();
    } else if (id) {
      // 校验通知归属，防止越权标记他人通知
      const target = db.select({ id: notification.id, user_id: notification.user_id })
        .from(notification)
        .where(eq(notification.id, Number(id)))
        .limit(1)
        .all();
      if (!target[0] || target[0].user_id !== authUser.userId) {
        return NextResponse.json({ error: '无权操作' }, { status: 403 });
      }
      db.update(notification).set({ is_read: true })
        .where(eq(notification.id, Number(id))).run();
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Mark notification read error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

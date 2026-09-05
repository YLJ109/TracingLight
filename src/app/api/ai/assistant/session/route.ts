import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { qaSession, qaMessage } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * AI 答疑 · 会话管理（豆包式多会话）
 * GET    ?id=          取单会话消息（归属校验）
 * POST                 新建空会话 {title?}
 * PUT    {id, action, title?}  action: 'rename' 重命名 | 'clear' 清空消息（保留会话）
 * DELETE ?id=          删除会话（连同消息）
 */

/** 校验会话归属；返回会话或 null */
function ownedSession(db: ReturnType<typeof getDb>, sessionId: number, userId: number) {
  return db.select().from(qaSession)
    .where(and(eq(qaSession.id, sessionId), eq(qaSession.user_id, userId)))
    .limit(1).all()[0] || null;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    const db = getDb();
    if (!ownedSession(db, id, authUser.userId)) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }
    const messages = db.select().from(qaMessage)
      .where(eq(qaMessage.session_id, id))
      .orderBy(qaMessage.id)
      .all();
    return NextResponse.json({ success: true, data: { session_id: id, messages } });
  } catch (e) {
    console.error('Session get error:', e);
    return NextResponse.json({ error: '获取消息失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    let title = '新的对话';
    try {
      const body = await request.json();
      if (body?.title && String(body.title).trim()) title = String(body.title).trim().slice(0, 50);
    } catch { /* 无 body 也可 */ }
    const created = db.insert(qaSession).values({
      user_id: authUser.userId,
      title,
      updated_at: new Date().toISOString(),
    }).returning().all();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true, data: created[0] });
  } catch (e) {
    console.error('Session create error:', e);
    return NextResponse.json({ error: '创建会话失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const id = Number(body?.id);
    const action = body?.action;
    if (!id || !['rename', 'clear'].includes(action)) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    if (!ownedSession(db, id, authUser.userId)) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }

    if (action === 'rename') {
      const title = String(body?.title || '').trim();
      if (!title) return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
      db.update(qaSession).set({ title: title.slice(0, 50) }).where(eq(qaSession.id, id)).run();
    } else {
      // clear：清空该会话全部消息（保留会话本体）
      db.delete(qaMessage).where(eq(qaMessage.session_id, id)).run();
    }
    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Session update error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    if (!ownedSession(db, id, authUser.userId)) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }
    db.delete(qaMessage).where(eq(qaMessage.session_id, id)).run();
    db.delete(qaSession).where(eq(qaSession.id, id)).run();
    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Session delete error:', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}

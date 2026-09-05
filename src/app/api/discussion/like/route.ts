import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, and } from 'drizzle-orm';
import { discussionPost, discussionReply, discussionLike } from '@/storage/database/shared/schema';
import { canAccessCourse } from '@/lib/course-access';

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const targetType = body.target_type; // post / reply
    const targetId = Number(body.target_id);

    if (!['post', 'reply'].includes(targetType) || !targetId) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    // 归属校验：先确认目标属于当前用户可见课程
    if (targetType === 'post') {
      const post = db.select({ course_id: discussionPost.course_id }).from(discussionPost).where(eq(discussionPost.id, targetId)).limit(1).all()[0];
      if (!post) return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
      if (!canAccessCourse(authUser, post.course_id)) return NextResponse.json({ error: '无权操作' }, { status: 403 });
    } else {
      const reply = db.select({ post_id: discussionReply.post_id }).from(discussionReply).where(eq(discussionReply.id, targetId)).limit(1).all()[0];
      if (!reply) return NextResponse.json({ error: '回复不存在' }, { status: 404 });
      const post = db.select({ course_id: discussionPost.course_id }).from(discussionPost).where(eq(discussionPost.id, reply.post_id)).limit(1).all()[0];
      if (!post || !canAccessCourse(authUser, post.course_id)) return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    const existing = db.select().from(discussionLike)
      .where(
        and(
          eq(discussionLike.target_type, targetType),
          eq(discussionLike.target_id, targetId),
          eq(discussionLike.user_id, authUser.userId),
        ),
      )
      .all()[0];

    if (existing) {
      // 取消点赞
      db.delete(discussionLike).where(eq(discussionLike.id, existing.id)).run();
      if (targetType === 'post') {
        const post = db.select({ like_count: discussionPost.like_count }).from(discussionPost).where(eq(discussionPost.id, targetId)).limit(1).all()[0];
        db.update(discussionPost).set({ like_count: Math.max(0, (post?.like_count || 0) - 1) }).where(eq(discussionPost.id, targetId)).run();
      } else {
        const reply = db.select({ like_count: discussionReply.like_count }).from(discussionReply).where(eq(discussionReply.id, targetId)).limit(1).all()[0];
        db.update(discussionReply).set({ like_count: Math.max(0, (reply?.like_count || 0) - 1) }).where(eq(discussionReply.id, targetId)).run();
      }
      saveDb();
      return NextResponse.json({ success: true, liked: false });
    }

    // 点赞
    db.insert(discussionLike).values({
      target_type: targetType,
      target_id: targetId,
      user_id: authUser.userId,
    }).run();
    if (targetType === 'post') {
      const post = db.select({ like_count: discussionPost.like_count }).from(discussionPost).where(eq(discussionPost.id, targetId)).limit(1).all()[0];
      db.update(discussionPost).set({ like_count: (post?.like_count || 0) + 1 }).where(eq(discussionPost.id, targetId)).run();
    } else {
      const reply = db.select({ like_count: discussionReply.like_count }).from(discussionReply).where(eq(discussionReply.id, targetId)).limit(1).all()[0];
      db.update(discussionReply).set({ like_count: (reply?.like_count || 0) + 1 }).where(eq(discussionReply.id, targetId)).run();
    }
    saveDb();
    return NextResponse.json({ success: true, liked: true });
  } catch (e) {
    // 并发重复点赞：唯一索引冲突可忽略
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|constraint/i.test(msg)) {
      return NextResponse.json({ success: true });
    }
    console.error('Toggle like error:', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
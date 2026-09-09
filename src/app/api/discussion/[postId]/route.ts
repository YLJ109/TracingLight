import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, and } from 'drizzle-orm';
import { discussionPost, discussionReply, discussionLike, course } from '@/storage/database/shared/schema';
import { canAccessCourse, resolveAuthorInfo } from '@/lib/course-access';

function cleanText(input: unknown, maxLen: number): string {
  const s = String(input ?? '').trim();
  return s.replace(/<[^>]*>/g, '').slice(0, maxLen);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { postId } = await params;
    const pid = Number(postId);

    const post = (await db.select().from(discussionPost).where(eq(discussionPost.id, pid)).limit(1).execute())[0];
    if (!post) return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
    if (!canAccessCourse(authUser, post.course_id)) {
      return NextResponse.json({ error: '无权访问该课程' }, { status: 403 });
    }

    const courseRow = (await db.select({ name: course.name }).from(course).where(eq(course.id, post.course_id)).limit(1).execute())[0];
    const replies = await db.select().from(discussionReply)
      .where(eq(discussionReply.post_id, pid))
      .orderBy(desc(discussionReply.created_at))
      .execute();

    // 当前用户点赞状态
    const myPostLike = (await db.select().from(discussionLike)
      .where(and(eq(discussionLike.target_type, 'post'), eq(discussionLike.target_id, pid), eq(discussionLike.user_id, authUser.userId)))
      .execute())[0];
    const likedReplyIds = new Set<number>();
    if (replies.length > 0) {
      const myLikes = await db.select().from(discussionLike)
        .where(and(eq(discussionLike.target_type, 'reply'), eq(discussionLike.user_id, authUser.userId)))
        .execute();
      for (const l of myLikes) likedReplyIds.add(l.target_id);
    }

    const author = resolveAuthorInfo(post.author_id);

    return NextResponse.json({
      success: true,
      data: {
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          is_pinned: !!post.is_pinned,
          like_count: post.like_count || 0,
          reply_count: post.reply_count || 0,
          created_at: post.created_at,
          course_name: courseRow?.name || '',
          author,
          liked: !!myPostLike,
          can_delete: post.author_id === authUser.userId || authUser.role === 'admin' || authUser.role === 'teacher',
        },
        replies: replies.map((r) => ({
          id: r.id,
          content: r.content,
          like_count: r.like_count || 0,
          created_at: r.created_at,
          author: resolveAuthorInfo(r.author_id),
          liked: likedReplyIds.has(r.id),
          can_delete: r.author_id === authUser.userId || authUser.role === 'admin',
        })),
      },
    });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get discussion detail error:', e);
    return NextResponse.json({ error: '获取讨论详情失败' }, { status: 500 });
  }
}

// 新增回复
export async function POST(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { postId } = await params;
    const pid = Number(postId);

    const post = (await db.select().from(discussionPost).where(eq(discussionPost.id, pid)).limit(1).execute())[0];
    if (!post) return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
    if (!canAccessCourse(authUser, post.course_id)) {
      return NextResponse.json({ error: '无权在该课程发言' }, { status: 403 });
    }

    const body = await request.json();
    const content = cleanText(body.content, 2000);
    if (!content) return NextResponse.json({ error: '请输入回复内容' }, { status: 400 });

    const ret = await db.insert(discussionReply).values({
      post_id: pid,
      author_id: authUser.userId,
      content,
    }).returning().execute();
    await db.update(discussionPost).set({
      reply_count: (post.reply_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).where(eq(discussionPost.id, pid)).execute();
    saveDb();

    const insertId = (ret as { id: number }[])[0]?.id;
    return NextResponse.json({ success: true, reply_id: Number(insertId) });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Create reply error:', e);
    return NextResponse.json({ error: '回复失败' }, { status: 500 });
  }
}

// 删除帖子
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { postId } = await params;
    const pid = Number(postId);

    const post = (await db.select().from(discussionPost).where(eq(discussionPost.id, pid)).limit(1).execute())[0];
    if (!post) return NextResponse.json({ error: '帖子不存在' }, { status: 404 });
    const isOwner = post.author_id === authUser.userId;
    const isModerator = authUser.role === 'admin' || authUser.role === 'teacher';
    if (!isOwner && !isModerator) {
      return NextResponse.json({ error: '无权删除该帖子' }, { status: 403 });
    }
    // 教师/管理员仅能删本人可见课程下的帖子
    if (!isOwner && !canAccessCourse(authUser, post.course_id)) {
      return NextResponse.json({ error: '无权删除该帖子' }, { status: 403 });
    }

    await db.delete(discussionPost).where(eq(discussionPost.id, pid)).execute();
    saveDb();
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Delete discussion error:', e);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
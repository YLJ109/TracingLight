import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuthWithStatus } from '@/lib/server-auth';
import { eq, and, inArray } from 'drizzle-orm';
import { announcement , notification, course, user} from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';
import { sanitizeRichHTML, htmlToPlainText } from '@/lib/rich-text';

// GET /api/teacher/announcements - 获取公告列表
export async function GET(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');

    const filters = [eq(announcement.teacher_id, authUser.userId)];
    if (courseId) {
      filters.push(eq(announcement.course_id, Number(courseId)));
    }

    const data = db.select().from(announcement)
      .where(and(...filters))
      .orderBy(announcement.created_at)
      .all();

    // Reverse to get descending order (newest first)
    data.reverse();

    return NextResponse.json({ data });
  } catch (e: any) {
    console.error('Get announcements error:', e);
    return NextResponse.json({ error: '获取公告列表失败' }, { status: 500 });
  }
}

// POST /api/teacher/announcements - 发布新公告
export async function POST(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const db = getDb();
    const body = await request.json();
    const { title, content, course_id } = body;

    if (!title || !content) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 防伪造作者：一律使用当前登录教师，不接受请求体覆盖
    let targetCourseId: number | null = null;
    if (course_id !== undefined && course_id !== null && course_id !== '') {
      const cid = Number(course_id);
      if (!Number.isInteger(cid) || cid <= 0) {
        return NextResponse.json({ error: '课程参数无效' }, { status: 400 });
      }
      // 校验课程属于当前教师授课课程，防跨班广播
      if (!getTeacherCourseIds(authUser.userId).includes(cid)) {
        return NextResponse.json({ error: '无权向该课程发布公告' }, { status: 403 });
      }
      targetCourseId = cid;
    }

    // 落库前白名单清洗：标题剥 HTML 标签，正文按富文本白名单消毒（防存储型 XSS）
    const safeTitle = htmlToPlainText(String(title ?? '')).trim() || '未命名公告';
    const safeContent = sanitizeRichHTML(String(content ?? ''));

    const result = db.insert(announcement).values({
      teacher_id: authUser.userId,
      title: safeTitle,
      content: safeContent,
      course_id: targetCourseId,
      is_pinned: false,
      target_type: 'all',
    }).returning().all();

    // 通知扇出：公告面向的课程班级学生收到通知（学生在通知中心查看）
    try {
      let targets: Array<{ id: number }>;
      if (targetCourseId) {
        const cls = db.select({ class_id: course.class_id }).from(course)
          .where(eq(course.id, targetCourseId)).limit(1).all()[0];
        targets = cls?.class_id
          ? db.select({ id: user.id }).from(user)
              .where(and(eq(user.role, 'student'), eq(user.class_id, cls.class_id)))
              .all()
          : [];
      } else {
        targets = db.select({ id: user.id }).from(user).where(eq(user.role, 'student')).all();
      }
      const sid = result[0]?.id;
      if (targets.length > 0) {
        db.insert(notification).values(targets.map((t) => ({
          user_id: t.id,
          type: 'system',
          title: '新公告',
          content: `${authUser.username.includes('teacher') ? '老师' : '管理员'}发布了公告「${String(safeTitle).slice(0, 30)}」`,
          link: sid ? `/student/announcements?aid=${sid}` : '/student/announcements',
        }))).run();
        try { saveDb(); } catch { /* 定时持久化兜底 */ }
      }
    } catch (notifyErr) {
      console.error('Announcement notify error:', notifyErr);
    }

    return NextResponse.json({ data: result[0] || null });
  } catch (e: any) {
    console.error('Create announcement error:', e);
    return NextResponse.json({ error: '发布公告失败' }, { status: 500 });
  }
}

// PUT /api/teacher/announcements - 更新公告
export async function PUT(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const db = getDb();
    const body = await request.json();
    const { id, title, content, is_pinned } = body;
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    // 校验归属，防止越权修改他人公告（IDOR）
    const target = db.select({ id: announcement.id, teacher_id: announcement.teacher_id })
      .from(announcement)
      .where(eq(announcement.id, Number(id)))
      .limit(1)
      .all();
    if (!target[0] || target[0].teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权操作该公告' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = htmlToPlainText(String(title)).trim();
    if (content !== undefined) updates.content = sanitizeRichHTML(String(content));
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;

    db.update(announcement).set(updates).where(eq(announcement.id, id)).run();

    const data = db.select().from(announcement)
      .where(eq(announcement.id, id))
      .get();

    return NextResponse.json({ data });
  } catch (e: any) {
    console.error('Update announcement error:', e);
    return NextResponse.json({ error: '更新公告失败' }, { status: 500 });
  }
}

// DELETE /api/teacher/announcements - 删除公告
export async function DELETE(request: NextRequest) {
  try {
    const { user: authUser, status } = await requireAuthWithStatus(request, 'teacher');
    if (!authUser) return NextResponse.json({ error: status === 403 ? '权限不足' : '未登录' }, { status });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少ID' }, { status: 400 });

    // 校验归属，防止越权删除他人公告（IDOR）
    const target = db.select({ id: announcement.id, teacher_id: announcement.teacher_id })
      .from(announcement)
      .where(eq(announcement.id, Number(id)))
      .limit(1)
      .all();
    if (!target[0] || target[0].teacher_id !== authUser.userId) {
      return NextResponse.json({ error: '无权操作该公告' }, { status: 403 });
    }

    db.delete(announcement).where(eq(announcement.id, Number(id))).run();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete announcement error:', e);
    return NextResponse.json({ error: '删除公告失败' }, { status: 500 });
  }
}

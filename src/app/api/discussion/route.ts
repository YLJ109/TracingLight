import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { discussionPost, course } from '@/storage/database/shared/schema';
import { canAccessCourse, getAccessibleCourseIds, resolveAuthorInfo } from '@/lib/course-access';
import { writeAudit } from '@/lib/audit';

/** 输入白名单清洗：讨论帖内容仅保留纯文本，杜绝脚本注入 */
function cleanText(input: unknown, maxLen: number): string {
  const s = String(input ?? '').trim();
  return s.replace(/<[^>]*>/g, '').slice(0, maxLen);
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const sp = request.nextUrl.searchParams;
    const courseIdArg = sp.get('course_id');
    const courseId = courseIdArg ? Number(courseIdArg) : null;

    // 可访问课程范围
    const accessible = getAccessibleCourseIds(authUser);
    if (courseId && !canAccessCourse(authUser, courseId)) {
      return NextResponse.json({ error: '无权访问该课程' }, { status: 403 });
    }
    const filterCourseIds = courseId ? [courseId] : accessible;
    if (filterCourseIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const posts = db.select().from(discussionPost)
      .where(inArray(discussionPost.course_id, filterCourseIds))
      .orderBy(desc(discussionPost.is_pinned), desc(discussionPost.created_at))
      .all();

    // 课程名映射
    const courses = db.select({ id: course.id, name: course.name })
      .from(course)
      .where(inArray(course.id, filterCourseIds))
      .all();
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));

    const data = posts.map((p) => {
      const author = resolveAuthorInfo(p.author_id);
      return {
        id: p.id,
        course_id: p.course_id,
        course_name: courseMap.get(p.course_id) || '',
        title: p.title,
        content: p.content,
        is_pinned: !!p.is_pinned,
        like_count: p.like_count || 0,
        reply_count: p.reply_count || 0,
        created_at: p.created_at,
        author,
        can_delete: p.author_id === authUser.userId || authUser.role === 'admin' || authUser.role === 'teacher',
      };
    });

    // 教师/管理员额外返回可访问课程列表，供前端课程筛选与「发帖选课」使用（避免缺 course_id 导致发帖 400）
    // 学生端仍只消费 data 数组，附加字段不破坏兼容。
    const coursesForPicker = authUser.role === 'teacher' || authUser.role === 'admin'
      ? [...courseMap.entries()].map(([id, name]) => ({ id, name }))
      : undefined;

    return NextResponse.json({ success: true, data, courses: coursesForPicker });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Get discussions error:', e);
    return NextResponse.json({ error: '获取讨论失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();

    const body = await request.json();
    const courseId = Number(body.course_id);
    const title = cleanText(body.title, 120);
    const content = cleanText(body.content, 5000);

    if (!courseId) return NextResponse.json({ error: '缺少课程' }, { status: 400 });
    if (!title) return NextResponse.json({ error: '请输入标题' }, { status: 400 });
    if (!content) return NextResponse.json({ error: '请输入内容' }, { status: 400 });
    if (!canAccessCourse(authUser, courseId)) {
      return NextResponse.json({ error: '无权在该课程发布讨论' }, { status: 403 });
    }

    db.insert(discussionPost).values({
      course_id: courseId,
      author_id: authUser.userId,
      title,
      content,
      is_pinned: authUser.role === 'teacher' ? !!body.is_pinned : false,
      updated_at: new Date().toISOString(),
    }).run();
    saveDb();

    // 讨论发布/置顶埋点（静默，失败不影响响应）
    const isPinned = authUser.role === 'teacher' ? !!body.is_pinned : false;
    writeAudit({
      operatorId: authUser.userId,
      operatorName: authUser.username,
      action: isPinned ? 'discussion_pin' : 'discussion_create',
      targetType: 'discussion_post',
      detail: `${authUser.role === 'teacher' ? '教师' : '用户'}发布讨论「${title}」${isPinned ? '并置顶' : ''}`,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e && typeof (e as { status?: number }).status === 'number') return e as NextResponse;
    console.error('Create discussion error:', e);
    return NextResponse.json({ error: '发布讨论失败' }, { status: 500 });
  }
}
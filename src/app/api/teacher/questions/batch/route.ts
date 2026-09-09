import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { inArray } from 'drizzle-orm';
import { question } from '@/storage/database/shared/schema';
import { getTeacherCourseIds } from '@/lib/teacher-scope';

export const dynamic = 'force-dynamic';

// 批量操作：仅支持 PATCH
// body: { ids: number[], op: 'set_difficulty'|'set_locked', difficulty?: 'easy'|'medium'|'hard', locked?: boolean }
export async function PATCH(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, 'teacher');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await req.json();

    const ids: number[] = (body.ids || []).map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n));
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '未选择任何题目' }, { status: 400 });
    }
    const op = body.op;
    if (op !== 'set_difficulty' && op !== 'set_locked') {
      return NextResponse.json({ success: false, error: '不支持的批量操作' }, { status: 400 });
    }

    // 逐一校验归属：所有目标题目必须属于本人课程
    const myCourseIds = await getTeacherCourseIds(authUser.userId);
    const rows = await db.select({ id: question.id, course_id: question.course_id })
      .from(question)
      .where(inArray(question.id, ids))
      .execute();
    const validIds = rows.filter((r) => myCourseIds.includes(r.course_id)).map((r) => r.id);
    if (validIds.length !== ids.length) {
      return NextResponse.json({ success: false, error: '存在无权操作的题目' }, { status: 403 });
    }

    const setObj: Record<string, unknown> = {};
    if (op === 'set_difficulty') {
      const difficulty = body.difficulty;
      if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
        return NextResponse.json({ success: false, error: '无效的难度' }, { status: 400 });
      }
      setObj.difficulty = difficulty;
    } else {
      setObj.locked = body.locked === true;
    }

    await db.update(question)
      .set(setObj)
      .where(inArray(question.id, validIds))
      .execute();
    saveDb();

    return NextResponse.json({ success: true, updated: validIds.length });
  } catch (error) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error('Batch update question error:', error);
    return NextResponse.json({ success: false, error: '批量操作失败' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { studentSchedule } from "@/storage/database/shared/schema";
import { eq, asc } from "drizzle-orm";

// GET - 获取学生课表和个人安排
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getDb();
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const sid = user.userId;

    const schedules = db.select()
      .from(studentSchedule)
      .where(eq(studentSchedule.student_id, sid))
      .orderBy(asc(studentSchedule.start_time))
      .all();

    // 按星期几分组 (day_of_week is JSON array in schema)
    const grouped: Record<number, Array<typeof studentSchedule.$inferSelect>> = {};
    if (schedules) {
      for (const s of schedules) {
        const days = Array.isArray(s.day_of_week) ? (s.day_of_week as number[]) : [s.day_of_week as unknown as number || 0];
        for (const day of days) {
          if (!grouped[day]) grouped[day] = [];
          grouped[day].push(s);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        schedules,
        grouped,
        total: schedules?.length || 0,
      },
    });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// POST - 添加个人安排
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { title, day_of_week, start_time, end_time, schedule_type, category } = body;

    if (!title || day_of_week === undefined) {
      return NextResponse.json({ success: false, error: "缺少必填字段" }, { status: 400 });
    }

    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = user.userId;

    // Insert and get back the created row
    const result = db.insert(studentSchedule)
      .values({
        student_id: studentId,
        title,
        day_of_week: [day_of_week] as unknown as number[],
        start_time: start_time || "08:00",
        end_time: end_time || "09:00",
        schedule_type: schedule_type || "personal",
        category: category || "个人",
        is_active: true,
        priority: 1,
      })
      .returning()
      .all();

    const data = result[0] || null;

    // 关键写路径即时落盘
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("Catch error:", error);
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// PUT - 编辑个人安排（归属校验）
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const body = await request.json();
    const { id, title, day_of_week, start_time, end_time } = body;
    if (!id || !title || day_of_week === undefined) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    const target = db.select({ id: studentSchedule.id, student_id: studentSchedule.student_id })
      .from(studentSchedule)
      .where(eq(studentSchedule.id, Number(id)))
      .limit(1)
      .all();
    if (!target[0] || target[0].student_id !== user.userId) {
      return NextResponse.json({ success: false, error: '无权操作该安排' }, { status: 403 });
    }

    db.update(studentSchedule)
      .set({
        title: String(title).slice(0, 50),
        day_of_week: [day_of_week] as unknown as number[],
        start_time: start_time || '08:00',
        end_time: end_time || '09:00',
      })
      .where(eq(studentSchedule.id, Number(id)))
      .run();

    try { saveDb(); } catch { /* 定时持久化兜底 */ }
    const updated = db.select().from(studentSchedule).where(eq(studentSchedule.id, Number(id))).limit(1).all()[0];
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === 'number') return error as NextResponse;
    console.error('Schedule update error:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

// DELETE - 删除个人安排
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少id" }, { status: 400 });
    }

    // 校验归属，防止越权删除他人课表
    const target = db.select({ id: studentSchedule.id, student_id: studentSchedule.student_id })
      .from(studentSchedule)
      .where(eq(studentSchedule.id, parseInt(id)))
      .limit(1)
      .all();
    if (!target[0] || target[0].student_id !== user.userId) {
      return NextResponse.json({ success: false, error: "无权操作" }, { status: 403 });
    }

    db.delete(studentSchedule)
      .where(eq(studentSchedule.id, parseInt(id)))
      .run();

    // 关键写路径即时落盘
    try { saveDb(); } catch { /* 定时持久化兜底 */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const errMsg = "操作失败，请稍后重试";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

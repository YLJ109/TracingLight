import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/db";
import { requireAuth } from "@/lib/server-auth";
import { studentSchedule } from "@/storage/database/shared/schema";
import { eq, asc } from "drizzle-orm";

// GET - 获取学生课表和个人安排
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = await requireAuth(request, 'student');
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const studentId = searchParams.get("student_id");

    if (!studentId) {
      return NextResponse.json({ success: false, error: "缺少student_id" }, { status: 400 });
    }

    const db = getDb();
    const sid = parseInt(studentId);

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
    const errMsg = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// POST - 添加个人安排
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { student_id, title, day_of_week, start_time, end_time, schedule_type, category } = body;

    if (!student_id || !title || day_of_week === undefined) {
      return NextResponse.json({ success: false, error: "缺少必填字段" }, { status: 400 });
    }

    // Insert and get back the created row
    const result = db.insert(studentSchedule)
      .values({
        student_id,
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

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    console.error("Catch error:", error);
    const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// DELETE - 删除个人安排
export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少id" }, { status: 400 });
    }

    db.delete(studentSchedule)
      .where(eq(studentSchedule.id, parseInt(id)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error && typeof (error as { status?: number }).status === "number") return error as NextResponse;
    const errMsg = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

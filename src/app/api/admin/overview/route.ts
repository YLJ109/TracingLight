import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { user, course, school, college, major, classInfo, question, assignment, examSchedule } from '@/storage/database/shared/schema';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'admin');
    if (!authUser) return NextResponse.json({ error: '未登录或无权访问' }, { status: 401 });
    const db = getDb();

    const users = db.select().from(user).all();
    const courses = db.select().from(course).all();
    const schools = db.select().from(school).all();
    const colleges = db.select().from(college).all();
    const majors = db.select().from(major).all();
    const classes = db.select().from(classInfo).all();
    const questions = db.select({ id: question.id, question_type: question.question_type })
      .from(question).where(eq(question.is_active, true)).all();
    const assignments = db.select().from(assignment).all();
    const exams = db.select().from(examSchedule).all();

    const roleCount = users.reduce((acc: Record<string, number>, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    const typeCount = questions.reduce((acc: Record<string, number>, q) => {
      const t = q.question_type || 'other';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    // 用户精简（不含密码/哈希等敏感字段）
    const safeUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      real_name: u.real_name,
      role: u.role,
      class_id: u.class_id,
      student_level: u.student_level,
      is_active: u.is_active,
      created_at: u.created_at,
    }));

    return NextResponse.json({
      success: true,
      data: {
        users: safeUsers,
        courses,
        organization: { schools, colleges, majors, classes },
        stats: {
          totalUsers: users.length,
          totalCourses: courses.length,
          totalClasses: classes.length,
          totalQuestions: questions.length,
          totalAssignments: assignments.length,
          totalExams: exams.length,
          roleCount,
          typeCount,
        },
      },
    });
  } catch (e) {
    console.error('Admin overview error:', e);
    return NextResponse.json({ error: '获取数据失败' }, { status: 500 });
  }
}

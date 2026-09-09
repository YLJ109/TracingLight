import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { getAccessibleCourseIds } from '@/lib/course-access';
import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  abilityPoint, ideologyPoint, abilityKnowledge, ideologyKnowledge, knowledgePoint,
  gradingTask, knowledgeMasteryLog,
} from '@/storage/database/shared/schema';

// 内存缓存（能力/思政图谱数据相对静态，缓存 5 分钟）
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown) {
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, 'student');
    if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'ability'; // ability | ideology
    // 无 course_id 时自动取该学生第一门可访问课程，杜绝硬编码幻数 id
    const courseId = parseInt(searchParams.get('course_id') || '', 10) || (await getAccessibleCourseIds(authUser))[0] || 0;
    // 数据归属强制绑定当前登录用户，杜绝越权（IDOR）
    const studentId = authUser.userId;
    const db = getDb();

    const cacheKey = `tg:${type}:${courseId}:${studentId ?? 'anon'}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json({ success: true, data: cached, cached: true });

    const courseKps = await db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
      .from(knowledgePoint)
      .where(eq(knowledgePoint.course_id, courseId))
      .execute();
    const allKps = await db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
      .from(knowledgePoint).execute();
    const kpIdToCourse = new Map(allKps.map((k) => [k.id, k]));

    // ── 与知识图谱同一套掌握度口径：knowledgeMasteryLog > grading_task > 模拟 ──
    const realMasteries: Record<number, number> = {};
    const logMasteries: Record<number, number> = {};
    if (studentId && courseKps.length > 0) {
      const courseKpIds = courseKps.map((k) => k.id);
      const logs = await db.select({
        knowledge_point_id: knowledgeMasteryLog.knowledge_point_id,
        mastery_rate: knowledgeMasteryLog.mastery_rate,
        recorded_at: knowledgeMasteryLog.recorded_at,
      })
        .from(knowledgeMasteryLog)
        .where(and(
          eq(knowledgeMasteryLog.student_id, studentId),
          inArray(knowledgeMasteryLog.knowledge_point_id, courseKpIds)
        ))
        .execute();
      if (logs && logs.length > 0) {
        const best: Record<number, { rate: number; date: string }> = {};
        for (const log of logs) {
          const k = log.knowledge_point_id;
          const d = log.recorded_at || '';
          const cur = best[k];
          if (!cur || d >= cur.date) best[k] = { rate: Number(log.mastery_rate), date: d };
        }
        for (const [k, v] of Object.entries(best)) logMasteries[Number(k)] = v.rate;
      }
      const grades = await db.select({
        knowledge_point_id: gradingTask.knowledge_point_id,
        total_score: sql<number>`COALESCE(${gradingTask.teacher_override_score}, ${gradingTask.total_score})`,
      })
        .from(gradingTask)
        .where(and(
          eq(gradingTask.student_id, studentId),
          inArray(gradingTask.knowledge_point_id, courseKpIds)
        ))
        .execute();
      if (grades && grades.length > 0) {
        const sums: Record<number, { total: number; count: number }> = {};
        for (const g of grades) {
          if (!sums[g.knowledge_point_id]) sums[g.knowledge_point_id] = { total: 0, count: 0 };
          sums[g.knowledge_point_id].total += Number(g.total_score);
          sums[g.knowledge_point_id].count += 1;
        }
        for (const [kpIdStr, s] of Object.entries(sums)) {
          realMasteries[Number(kpIdStr)] = Math.round(Math.min(100, s.total / s.count * 10));
        }
      }
    }

    const getMastery = (kpId: number): number | null => {
      if (!studentId) return null;
      if (logMasteries[kpId] !== undefined) return logMasteries[kpId];
      if (realMasteries[kpId] !== undefined) return realMasteries[kpId];
      // 与知识图谱保持一致：无真实掌握度记录 → null（未学习），绝不臆造模拟值
      return null;
    };

    const abilityLevel = (s: number) =>
      s >= 80 ? { label: '熟练', color: '#10b981' }
        : s >= 60 ? { label: '基本具备', color: '#22c55e' }
        : s >= 40 ? { label: '薄弱', color: '#f59e0b' }
        : { label: '待加强', color: '#ef4444' };

    if (type === 'ability') {
      const abilities = await db.select().from(abilityPoint)
        .where(eq(abilityPoint.course_id, courseId)).execute();
      const links = await db.select().from(abilityKnowledge).execute();
      const data = abilities.map((a) => {
        const linked = links
          .filter((l) => l.ability_id === a.id)
          .map((l) => ({ id: l.knowledge_id, weight: Number(l.weight || 1) }))
          .filter((lk) => kpIdToCourse.has(lk.id));
        let totalW = 0, weighted = 0;
        const kps = linked.map((lk) => {
          const m = getMastery(lk.id);
          // 仅将"有真实掌握度"的知识点纳入能力加权，避免未学习知识点按 0 拉低能力分
          if (m != null) { totalW += lk.weight; weighted += m * lk.weight; }
          return {
            id: lk.id,
            name: kpIdToCourse.get(lk.id)?.name || '',
            mastery: m,
            mastery_color: m == null ? '#94a3b8' : (m >= 80 ? '#10b981' : m >= 60 ? '#22c55e' : m >= 40 ? '#f59e0b' : '#ef4444'),
            weak: m != null && m < 60,
          };
        });
        const hasScored = totalW > 0;
        const score = hasScored ? Math.round(weighted / totalW) : null;
        const lvl = hasScored ? abilityLevel(score!) : { label: '暂无数据', color: '#94a3b8' };
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          score,
          level: lvl.label,
          color: lvl.color,
          kps,
          weak_kps: kps.filter((k) => k.weak).map((k) => k.name),
        };
      }).sort((x, y) => (x.score ?? Infinity) - (y.score ?? Infinity)); // 薄弱在前，暂无数据(score=null)排最后
      setCache(cacheKey, data);
      return NextResponse.json({ success: true, data });
    }

    const ideologies = await db.select().from(ideologyPoint)
      .where(eq(ideologyPoint.course_id, courseId)).execute();
    const links = await db.select().from(ideologyKnowledge).execute();
    const data = ideologies.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      knowledge: links
        .filter((l) => l.ideology_id === i.id)
        .map((l) => kpIdToCourse.get(l.knowledge_id)?.name)
        .filter(Boolean),
    }));
    setCache(cacheKey, data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Get triple graph error:', e);
    return NextResponse.json({ error: '获取图谱失败' }, { status: 500 });
  }
}

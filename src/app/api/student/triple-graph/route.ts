import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { eq } from 'drizzle-orm';
import {
  abilityPoint, ideologyPoint, abilityKnowledge, ideologyKnowledge, knowledgePoint,
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
    const courseId = parseInt(searchParams.get('course_id') || '1');
    const db = getDb();

    const cacheKey = `tg:${type}:${courseId}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json({ success: true, data: cached, cached: true });

    const kps = db.select({ id: knowledgePoint.id, name: knowledgePoint.name })
      .from(knowledgePoint).all();

    if (type === 'ability') {
      const abilities = db.select().from(abilityPoint)
        .where(eq(abilityPoint.course_id, courseId)).all();
      const links = db.select().from(abilityKnowledge).all();
      const data = abilities.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        knowledge: links
          .filter((l) => l.ability_id === a.id)
          .map((l) => kps.find((k) => k.id === l.knowledge_id)?.name)
          .filter(Boolean),
      }));
      setCache(cacheKey, data);
      return NextResponse.json({ success: true, data });
    }

    const ideologies = db.select().from(ideologyPoint)
      .where(eq(ideologyPoint.course_id, courseId)).all();
    const links = db.select().from(ideologyKnowledge).all();
    const data = ideologies.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      knowledge: links
        .filter((l) => l.ideology_id === i.id)
        .map((l) => kps.find((k) => k.id === l.knowledge_id)?.name)
        .filter(Boolean),
    }));
    setCache(cacheKey, data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Get triple graph error:', e);
    return NextResponse.json({ error: '获取图谱失败' }, { status: 500 });
  }
}

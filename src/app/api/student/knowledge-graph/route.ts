import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/db';
import { requireAuth } from '@/lib/server-auth';
import { course, knowledgePoint, gradingTask } from '@/storage/database/shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

// ─── Simple in-memory cache with TTL ───
interface CacheEntry { data: any; timestamp: number; }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (cache.size > 50) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

// ─── Chapter color families ── 6 distinct clusters ───
const CHAPTER_COLORS: Record<number, { dark: string; mid: string; light: string }> = {
  1: { dark: '#0d9488', mid: '#14b8a6', light: '#99f6e4' },
  2: { dark: '#2563eb', mid: '#3b82f6', light: '#bfdbfe' },
  3: { dark: '#7c3aed', mid: '#8b5cf6', light: '#ddd6fe' },
  4: { dark: '#db2777', mid: '#ec4899', light: '#fbcfe8' },
  5: { dark: '#d97706', mid: '#f59e0b', light: '#fde68a' },
  6: { dark: '#0891b2', mid: '#06b6d4', light: '#a5f3fc' },
};

// ─── Standard textbook curriculum ───
const CURRICULUM: Record<number, {
  textbook: string;
  chapters: { ch: number; name: string; sections: { sec: number; name: string; kpIds: number[] }[] }[];
}> = {
  1: {
    textbook: '《Python程序设计（第3版）》董付国 清华大学出版社',
    chapters: [
      { ch: 1, name: 'Python基础语法', sections: [
        { sec: 1, name: '基本语法元素', kpIds: [1, 2] },
        { sec: 2, name: '输入与输出', kpIds: [19, 20] },
        { sec: 3, name: '代码规范', kpIds: [21, 22] },
      ]},
      { ch: 2, name: '流程控制', sections: [
        { sec: 1, name: '条件分支', kpIds: [3] },
        { sec: 2, name: '循环结构', kpIds: [4] },
        { sec: 3, name: '循环控制', kpIds: [23, 24] },
      ]},
      { ch: 3, name: '函数与模块', sections: [
        { sec: 1, name: '函数定义', kpIds: [5] },
        { sec: 2, name: '参数传递', kpIds: [25, 26] },
        { sec: 3, name: '模块与包', kpIds: [27, 28] },
        { sec: 4, name: '高级函数', kpIds: [29, 30] },
      ]},
      { ch: 4, name: '复合数据类型', sections: [
        { sec: 1, name: '列表与元组', kpIds: [6] },
        { sec: 2, name: '字典与集合', kpIds: [7] },
        { sec: 3, name: '字符串处理', kpIds: [31, 32] },
        { sec: 4, name: '推导式与生成器', kpIds: [33, 34] },
      ]},
      { ch: 5, name: '文件与异常', sections: [
        { sec: 1, name: '文件读写', kpIds: [8] },
        { sec: 2, name: '异常处理', kpIds: [9] },
        { sec: 3, name: '上下文管理', kpIds: [35, 36] },
      ]},
      { ch: 6, name: '面向对象编程', sections: [
        { sec: 1, name: '类与对象', kpIds: [10] },
        { sec: 2, name: '继承与多态', kpIds: [37, 38] },
        { sec: 3, name: '封装与属性', kpIds: [39, 40] },
        { sec: 4, name: '特殊方法', kpIds: [41, 42] },
      ]},
    ],
  },
  2: {
    textbook: '《数据结构（C语言版）》严蔚敏 清华大学出版社',
    chapters: [
      { ch: 1, name: '线性结构', sections: [
        { sec: 1, name: '线性表', kpIds: [11] },
        { sec: 2, name: '栈与队列', kpIds: [12] },
        { sec: 3, name: '链表进阶', kpIds: [13] },
        { sec: 4, name: '串与数组', kpIds: [43, 44] },
        { sec: 5, name: '广义表', kpIds: [45] },
      ]},
      { ch: 2, name: '树与图', sections: [
        { sec: 1, name: '树与二叉树', kpIds: [14] },
        { sec: 2, name: '哈夫曼树', kpIds: [46] },
        { sec: 3, name: '图的存储与遍历', kpIds: [15] },
        { sec: 4, name: '图的应用', kpIds: [47, 48] },
      ]},
      { ch: 3, name: '查找与排序', sections: [
        { sec: 1, name: '查找算法', kpIds: [16] },
        { sec: 2, name: '二叉排序树', kpIds: [49] },
        { sec: 3, name: '插入与选择排序', kpIds: [17] },
        { sec: 4, name: '交换与归并排序', kpIds: [50] },
      ]},
      { ch: 4, name: '算法分析', sections: [
        { sec: 1, name: '时间复杂度', kpIds: [18] },
        { sec: 2, name: '空间复杂度', kpIds: [51] },
        { sec: 3, name: '算法优化策略', kpIds: [52] },
      ]},
    ],
  },
};

function masteryColor(m: number): string {
  if (m >= 80) return '#10b981';
  if (m >= 60) return '#f59e0b';
  if (m >= 30) return '#ef4444';
  return '#94a3b8';
}

function simulateMastery(studentId: number, kpId: number): number {
  const seed = ((studentId * 7 + kpId * 13) % 100);
  return Math.max(15, Math.min(95, seed + 10));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = await requireAuth(req, 'student');
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const courseId = parseInt(searchParams.get('course_id') || '1', 10);
  const studentIdRaw = searchParams.get('student_id');
  const studentId = studentIdRaw ? parseInt(studentIdRaw, 10) : null;

  // ─── Check cache ───
  const cacheKey = `kg:${courseId}:${studentId ?? 'anon'}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, data: cached, cached: true });
  }

  const db = getDb();

  // ─── Load course ───
  const courseRows = db.select({
    id: course.id,
    name: course.name,
  })
    .from(course)
    .where(eq(course.id, courseId))
    .limit(1)
    .all();
  const courseData = courseRows[0] || null;
  if (!courseData) return NextResponse.json({ success: false, error: '课程不存在' }, { status: 404 });

  // ─── Load knowledge points ───
  const kps = db.select({
    id: knowledgePoint.id,
    name: knowledgePoint.name,
    description: knowledgePoint.description,
  })
    .from(knowledgePoint)
    .where(eq(knowledgePoint.course_id, courseId))
    .orderBy(knowledgePoint.id)
    .all();

  if (!kps || kps.length === 0) return NextResponse.json({ success: false, error: '知识点数据为空' }, { status: 500 });

  const kpMap = new Map(kps.map((k) => [k.id, k]));

  // ─── Load mastery (from grading_task or simulate) ───
  const kpIds = kps.map((k) => k.id);
  let realMasteries: Record<number, number> = {};

  if (studentId) {
    const grades = db.select({
      knowledge_point_id: gradingTask.knowledge_point_id,
      total_score: gradingTask.total_score,
    })
      .from(gradingTask)
      .where(and(
        eq(gradingTask.student_id, studentId),
        inArray(gradingTask.knowledge_point_id, kpIds)
      ))
      .all();

    if (grades && grades.length > 0) {
      const sums: Record<number, { total: number; count: number }> = {};
      for (const g of grades) {
        if (!sums[g.knowledge_point_id]) sums[g.knowledge_point_id] = { total: 0, count: 0 };
        sums[g.knowledge_point_id].total += Number(g.total_score);
        sums[g.knowledge_point_id].count += 1;
      }
      for (const [kpIdStr, s] of Object.entries(sums)) {
        const avg = s.total / s.count;
        realMasteries[Number(kpIdStr)] = Math.round(Math.min(100, avg * 10));
      }
    }
  }

  const getMastery = (kpId: number): number | null => {
    if (!studentId) return null;
    if (realMasteries[kpId] !== undefined) return realMasteries[kpId];
    return simulateMastery(studentId, kpId);
  };

  // ─── Build hierarchy ───
  const curriculum = CURRICULUM[courseId] || CURRICULUM[1];
  const nodes: any[] = [];
  const edges: any[] = [];

  // Root node
  const shortName = courseId === 1 ? 'Python' : '数据结构';
  nodes.push({
    id: `course_${courseId}`,
    name: shortName,
    category: 0,
    node_level: 0,
    symbolSize: 70,
    color: '#1e293b',
    itemStyle: { color: '#1e293b', borderColor: '#334155', borderWidth: 3 },
    label: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
    source: 'database',
    source_table: 'course',
    data_id: courseId,
    chapter_no: '-',
    course_id: courseId,
    mastery: null,
    mastery_color: null,
  });

  const stats = { mastered: 0, basics: 0, weak: 0, unlearned: 0, total: kps.length };
  const chapterList: any[] = [];

  for (const ch of curriculum.chapters) {
    const colors = CHAPTER_COLORS[ch.ch] || CHAPTER_COLORS[1];
    const chId = `ch_${courseId}_${ch.ch}`;

    // Chapter node
    nodes.push({
      id: chId,
      name: `第${ch.ch}章 ${ch.name}`,
      category: ch.ch,
      node_level: 1,
      symbolSize: 52,
      color: colors.dark,
      itemStyle: { color: colors.dark, borderColor: colors.mid, borderWidth: 2 },
      label: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
      source: 'textbook_ref',
      source_table: 'knowledge_point',
      data_id: null,
      chapter_no: String(ch.ch),
      course_id: courseId,
      group_color: colors.dark,
      mastery: null,
      mastery_color: null,
    });
    edges.push({ source: `course_${courseId}`, target: chId, type: 'belong_to', lineStyle: { color: colors.mid, width: 2, opacity: 0.7 } });

    const sections: any[] = [];

    for (const sec of ch.sections) {
      const secId = `sec_${courseId}_${ch.ch}_${sec.sec}`;

      nodes.push({
        id: secId,
        name: `${ch.ch}.${sec.sec} ${sec.name}`,
        category: ch.ch,
        node_level: 2,
        symbolSize: 40,
        color: colors.mid,
        itemStyle: { color: colors.mid, borderColor: colors.light, borderWidth: 1.5 },
        label: { fontSize: 11, color: '#475569' },
        source: 'textbook_ref',
        source_table: 'knowledge_point',
        data_id: null,
        chapter_no: `${ch.ch}.${sec.sec}`,
        course_id: courseId,
        group_color: colors.mid,
        mastery: null,
        mastery_color: null,
      });
      edges.push({ source: chId, target: secId, type: 'belong_to', lineStyle: { color: colors.light, width: 1.5, opacity: 0.6 } });

      const kpNodes: any[] = [];
      for (const kpId of sec.kpIds) {
        const kp = kpMap.get(kpId) as { id: number; name: string; description: string } | undefined;
        if (!kp) continue;

        const m = getMastery(kpId);
        const mc = m !== null ? masteryColor(m) : null;

        if (m !== null) {
          if (m >= 80) stats.mastered++;
          else if (m >= 60) stats.basics++;
          else if (m >= 30) stats.weak++;
          else stats.unlearned++;
        } else {
          stats.unlearned++;
        }

        nodes.push({
          id: `kp_${kpId}`,
          name: kp.name,
          description: kp.description || '',
          category: ch.ch,
          node_level: 3,
          symbolSize: m !== null ? 30 : 26,
          color: colors.light,
          itemStyle: {
            color: colors.light,
            borderColor: mc || colors.mid,
            borderWidth: m !== null ? 3 : 1,
          },
          label: { fontSize: 10, color: '#64748b' },
          source: 'database',
          source_table: 'knowledge_point',
          data_id: kpId,
          chapter_no: `${ch.ch}.${sec.sec}`,
          course_id: courseId,
          group_color: colors.light,
          mastery: m,
          mastery_color: mc,
        });
        edges.push({ source: secId, target: `kp_${kpId}`, type: 'belong_to', lineStyle: { color: colors.light, width: 1, opacity: 0.5 } });

        kpNodes.push({ id: kpId, name: kp.name, mastery: m, mastery_color: mc });
      }

      sections.push({
        id: secId,
        name: `${ch.ch}.${sec.sec} ${sec.name}`,
        group_color: colors.mid,
        kps: kpNodes,
      });
    }

    chapterList.push({
      id: chId,
      name: `第${ch.ch}章 ${ch.name}`,
      group_color: colors.dark,
      sections,
    });
  }

  // Cross-chapter related edges (prerequisite/related)
  const addedPairs = new Set<string>();
  for (let i = 0; i < kps.length; i++) {
    for (let j = i + 1; j < kps.length; j++) {
      const pairKey = `${kps[i].id}-${kps[j].id}`;
      if (addedPairs.has(pairKey)) continue;
      // Add prerequisite edges for KPs in adjacent chapters
      const kpA = kps[i];
      const kpB = kps[j];
      if ((kpA.id % 4 === 1 && kpB.id === kpA.id + 1) || (kpB.id % 4 === 1 && kpA.id === kpB.id + 1)) {
        edges.push({
          source: `kp_${kpA.id}`,
          target: `kp_${kpB.id}`,
          type: 'prerequisite',
          lineStyle: { color: '#cbd5e1', width: 0.8, type: 'dashed', opacity: 0.5 },
        });
        addedPairs.add(pairKey);
      }
    }
  }

  // ─── Build response payload ───
  const payload = {
    course: { id: courseData.id, name: courseData.name, short_name: shortName },
    textbook: curriculum.textbook,
    nodes,
    edges,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    chapters: chapterList,
    masteryStats: stats,
  };

  // ─── Cache & return ───
  setCache(cacheKey, payload);
  return NextResponse.json({ success: true, data: payload });
}

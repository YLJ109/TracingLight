/**
 * 模块2：知识点 + 知识图谱
 * 覆盖：knowledge_point / knowledge_graph_node / knowledge_graph_edge
 * 保持环状放射布局所需结构：课程(level1) -> 章节(level2) -> 知识点(level3·叶子)。
 * 前置关系边基于真实隶属链（相邻知识点异章时连 prerequisite），不用取模伪数据。
 * 每课程内容按真实课程主题展开（4 章 × 5 知识点 = 20 个大纲知识点），保证图谱数据充足。
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';

/** 每课程独立的知识地图：chapter -> kps[{name, diff}] */
const COURSE_MAPS: Array<{ match: string; title: string; chapters: Array<{ chapter: string; kps: Array<{ name: string; diff: 'easy' | 'medium' | 'hard' }> }> }> = [
  {
    match: 'Python',
    title: 'Python 程序设计',
    chapters: [
      { chapter: '第1章 语法基础', kps: [
        { name: '变量与基本类型', diff: 'easy' },
        { name: '常见数据结构', diff: 'easy' },
        { name: '流程控制语句', diff: 'medium' },
        { name: '字符串处理', diff: 'medium' },
        { name: '列表与元组', diff: 'medium' },
      ] },
      { chapter: '第2章 函数与模块', kps: [
        { name: '函数定义与调用', diff: 'easy' },
        { name: '参数传递与默认值', diff: 'medium' },
        { name: '作用域与命名空间', diff: 'hard' },
        { name: '模块与包结构', diff: 'medium' },
        { name: '标准库常用模块', diff: 'easy' },
      ] },
      { chapter: '第3章 面向对象', kps: [
        { name: '类与对象', diff: 'medium' },
        { name: '继承关系', diff: 'hard' },
        { name: '多态与魔术方法', diff: 'hard' },
        { name: '封装与属性', diff: 'medium' },
        { name: '异常与断言', diff: 'medium' },
      ] },
      { chapter: '第4章 文件与综合应用', kps: [
        { name: '文件读写', diff: 'easy' },
        { name: '上下文管理器', diff: 'medium' },
        { name: '正则表达式', diff: 'hard' },
        { name: '函数式编程', diff: 'hard' },
        { name: '综合项目实践', diff: 'hard' },
      ] },
    ],
  },
  {
    match: '数据结构与算法',
    title: '数据结构与算法',
    chapters: [
      { chapter: '第1章 绪论', kps: [
        { name: '抽象数据类型', diff: 'easy' },
        { name: '算法复杂度分析', diff: 'medium' },
        { name: '时空权衡', diff: 'medium' },
        { name: '递归思想', diff: 'medium' },
        { name: '基本排序', diff: 'medium' },
      ] },
      { chapter: '第2章 线性结构', kps: [
        { name: '顺序表与链表', diff: 'easy' },
        { name: '栈的应用', diff: 'medium' },
        { name: '队列结构', diff: 'medium' },
        { name: '字符串与KMP', diff: 'hard' },
        { name: '分治与归并排序', diff: 'hard' },
      ] },
      { chapter: '第3章 树与图', kps: [
        { name: '二叉树遍历', diff: 'medium' },
        { name: '二叉搜索树', diff: 'medium' },
        { name: '平衡树与堆', diff: 'hard' },
        { name: '图的存储与遍历', diff: 'hard' },
        { name: '最短路径', diff: 'hard' },
      ] },
      { chapter: '第4章 查找与综合', kps: [
        { name: '顺序与二分查找', diff: 'easy' },
        { name: '散列查找', diff: 'medium' },
        { name: '动态规划入门', diff: 'hard' },
        { name: '贪心与回溯', diff: 'hard' },
        { name: '算法综合应用', diff: 'hard' },
      ] },
    ],
  },
  {
    match: '数据库',
    title: '数据库原理与应用',
    chapters: [
      { chapter: '第1章 数据库基础', kps: [
        { name: '关系模型', diff: 'easy' },
        { name: 'E-R 模型', diff: 'medium' },
        { name: '关系代数', diff: 'medium' },
        { name: 'SQL 基础', diff: 'easy' },
        { name: '数据定义语言', diff: 'easy' },
      ] },
      { chapter: '第2章 查询与完整性', kps: [
        { name: '单表查询', diff: 'easy' },
        { name: '多表连接查询', diff: 'medium' },
        { name: '子查询与聚合', diff: 'medium' },
        { name: '视图与索引', diff: 'medium' },
        { name: '完整性约束', diff: 'medium' },
      ] },
      { chapter: '第3章 设计理论', kps: [
        { name: '函数依赖', diff: 'medium' },
        { name: '范式与规范化', diff: 'hard' },
        { name: '模式分解', diff: 'hard' },
        { name: '事务特性ACID', diff: 'medium' },
        { name: '并发控制', diff: 'hard' },
      ] },
      { chapter: '第4章 优化与综合', kps: [
        { name: '查询优化', diff: 'hard' },
        { name: '日志与恢复', diff: 'hard' },
        { name: '数据库安全', diff: 'medium' },
        { name: 'NoSQL 概述', diff: 'easy' },
        { name: '课程设计实践', diff: 'hard' },
      ] },
    ],
  },
  {
    match: '操作系统',
    title: '操作系统原理',
    chapters: [
      { chapter: '第1章 操作系统概述', kps: [
        { name: '操作系统功能', diff: 'easy' },
        { name: '系统调用', diff: 'easy' },
        { name: '中断与异常', diff: 'medium' },
        { name: '体系结构', diff: 'medium' },
        { name: '内核模式', diff: 'medium' },
      ] },
      { chapter: '第2章 进程与线程', kps: [
        { name: '进程管理与状态', diff: 'easy' },
        { name: '进程调度算法', diff: 'medium' },
        { name: '线程与同步', diff: 'medium' },
        { name: '死锁与处理', diff: 'hard' },
        { name: '信号量与管程', diff: 'hard' },
      ] },
      { chapter: '第3章 内存管理', kps: [
        { name: '连续分配', diff: 'medium' },
        { name: '分页机制', diff: 'medium' },
        { name: '分段与段页式', diff: 'hard' },
        { name: '虚拟内存', diff: 'hard' },
        { name: '页面置换算法', diff: 'hard' },
      ] },
      { chapter: '第4章 文件与综合', kps: [
        { name: '文件系统结构', diff: 'easy' },
        { name: '目录与磁盘管理', diff: 'medium' },
        { name: 'I/O 设备管理', diff: 'medium' },
        { name: '多核并发', diff: 'hard' },
        { name: '系统综合实践', diff: 'hard' },
      ] },
    ],
  },
];

// 图谱节点颜色（环状放射布局六色系）
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

export function seedKnowledge(db: Drizzle, ctx: SeedCtx) {
  const { nextId } = ctx;

  for (const cid of ctx.courseIds) {
    const courseName = ctx.courseName.get(cid) ?? `课程${cid}`;
    const map = COURSE_MAPS.find((m) => courseName.includes(m.match)) ?? COURSE_MAPS[0];
    const chapters = map.chapters;

    // 根节点（level=1 课程）
    const courseKpId = nextId();
    ctx.lastKpId = Math.max(ctx.lastKpId, courseKpId);
    db.insert(schema.knowledgePoint).values({
      id: courseKpId, course_id: cid, name: `课程总览 ${courseName}`, difficulty: 'medium',
      description: '课程整体知识框架', parent_id: null, sort_order: 0,
    } as any).run();
    const courseRootNode = nextId();
    db.insert(schema.knowledgeGraphNode).values({
      id: courseRootNode, knowledge_point_id: courseKpId, course_id: cid,
      node_name: courseName, node_level: 1, parent_node_id: null,
      display_order: 1, color_hex: COLORS[0], is_leaf: false,
    } as any).run();
    ctx.courseRootNode.set(cid, courseRootNode);
    ctx.graphNodes.push({
      id: courseRootNode, knowledge_point_id: courseKpId, course_id: cid, node_name: courseName,
      node_level: 1, parent_node_id: null, display_order: 1, color_hex: COLORS[0], is_leaf: false,
    });

    chapters.forEach((ch, chIdx) => {
      // 章节级占位知识点（父=课程占位知识点）
      const chapterKpId = nextId();
      ctx.lastKpId = Math.max(ctx.lastKpId, chapterKpId);
      db.insert(schema.knowledgePoint).values({
        id: chapterKpId, course_id: cid, name: ch.chapter, difficulty: 'medium',
        description: ch.chapter, parent_id: courseKpId, sort_order: 0,
      } as any).run();
      const chNodeId = nextId();
      const chColor = COLORS[(chIdx + 1) % COLORS.length];
      db.insert(schema.knowledgeGraphNode).values({
        id: chNodeId, knowledge_point_id: chapterKpId, course_id: cid,
        node_name: ch.chapter, node_level: 2, parent_node_id: courseRootNode,
        display_order: chIdx + 1, color_hex: chColor, is_leaf: false,
      } as any).run();
      ctx.graphNodes.push({
        id: chNodeId, knowledge_point_id: chapterKpId, course_id: cid, node_name: ch.chapter,
        node_level: 2, parent_node_id: courseRootNode, display_order: chIdx + 1,
        color_hex: chColor, is_leaf: false,
      });

      ch.kps.forEach((kp, kIdx) => {
        const kpId = nextId();
        ctx.lastKpId = Math.max(ctx.lastKpId, kpId);
        db.insert(schema.knowledgePoint).values({
          id: kpId, course_id: cid, name: kp.name, difficulty: kp.diff,
          description: `${ch.chapter} · ${kp.name}`, parent_id: chapterKpId, sort_order: kIdx + 1,
        } as any).run();
        const leafNodeId = nextId();
        db.insert(schema.knowledgeGraphNode).values({
          id: leafNodeId, knowledge_point_id: kpId, course_id: cid,
          node_name: kp.name, node_level: 3, parent_node_id: chNodeId,
          display_order: kIdx + 1, color_hex: chColor, is_leaf: true,
        } as any).run();
        ctx.kpNodeId.set(kpId, leafNodeId);
        if (!ctx.courseKps.has(cid)) ctx.courseKps.set(cid, []);
        ctx.courseKps.get(cid)!.push({
          chapter: ch.chapter, chapterOrder: chIdx + 1, name: kp.name, desc: kp.name,
          diff: kp.diff, kpId, sortOrder: kIdx + 1,
        });
        ctx.graphNodes.push({
          id: leafNodeId, knowledge_point_id: kpId, course_id: cid, node_name: kp.name,
          node_level: 3, parent_node_id: chNodeId, display_order: kIdx + 1,
          color_hex: chColor, is_leaf: true,
        });
      });
    });
  }

  // ========== 前置关系边：按 kpId 排序后，相邻(跨章节)知识点连接 prerequisite ==========
  for (const cid of ctx.courseIds) {
    const kps = ctx.courseKps.get(cid) ?? [];
    const sorted = [...kps].sort((a, b) => {
      if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder;
      return a.sortOrder - b.sortOrder;
    });
    for (let i = 1; i < sorted.length; i++) {
      const fromId = ctx.kpNodeId.get(sorted[i - 1].kpId)!;
      const toId = ctx.kpNodeId.get(sorted[i].kpId)!;
      db.insert(schema.knowledgeGraphEdge).values({
        id: nextId(), from_node_id: fromId, to_node_id: toId, relation_type: 'prerequisite',
        description: '前一知识点为后一知识点的基础',
      } as any).run();
      ctx.graphEdges.push({ from_node_id: fromId, to_node_id: toId, relation_type: 'prerequisite', description: '' });
    }
  }
}
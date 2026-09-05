/**
 * 溯光 TracingLight V3.0 — 模拟学情数据生成引擎
 *
 * 设计原则：
 * 1. 固定随机种子，保证多次生成数据稳定可复现
 * 2. 所有数值边界受业务规则约束（完成率 0-100%、分数 0-100 等）
 * 3. 基于 student_id 生成个性化但合理的数据分布
 * 4. 分层学生（top/medium/weak）有差异化特征
 */

// ==================== 种子随机数 ====================
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  /** 返回 [0, 1) */
  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  /** 返回 [min, max] 整数 */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  /** 返回正态分布近似值 [min, max]，mean 偏中间 */
  normal(mean: number, stdDev: number, min: number, max: number): number {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const val = mean + z * stdDev;
    return Math.max(min, Math.min(max, Math.round(val)));
  }
  pick<T>(arr: T[]): T { return arr[this.int(0, arr.length - 1)]; }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ==================== 知识点定义（3门课程 × 10个知识点） ====================
export interface KnowledgePointDef {
  id: number; courseId: number; courseName: string; courseShort: string;
  name: string; chapter: string; difficulty: 'easy' | 'medium' | 'hard';
  parentId: number | null; sortOrder: number;
}

export const KNOWLEDGE_POINTS: KnowledgePointDef[] = [
  // Python程序设计 (courseId=1)
  { id: 1, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '变量与数据类型', chapter: '第1章 基础语法', difficulty: 'easy', parentId: null, sortOrder: 1 },
  { id: 2, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '运算符与表达式', chapter: '第1章 基础语法', difficulty: 'easy', parentId: 1, sortOrder: 2 },
  { id: 3, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '流程控制if-else', chapter: '第2章 流程控制', difficulty: 'easy', parentId: null, sortOrder: 3 },
  { id: 4, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: 'for/while循环', chapter: '第2章 流程控制', difficulty: 'medium', parentId: 3, sortOrder: 4 },
  { id: 5, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '函数定义与参数', chapter: '第3章 函数', difficulty: 'medium', parentId: null, sortOrder: 5 },
  { id: 6, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '列表与元组操作', chapter: '第4章 复合数据类型', difficulty: 'medium', parentId: null, sortOrder: 6 },
  { id: 7, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '字典与集合', chapter: '第4章 复合数据类型', difficulty: 'medium', parentId: 6, sortOrder: 7 },
  { id: 8, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '文件读写操作', chapter: '第5章 文件与异常', difficulty: 'hard', parentId: null, sortOrder: 8 },
  { id: 9, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '异常处理机制', chapter: '第5章 文件与异常', difficulty: 'hard', parentId: 8, sortOrder: 9 },
  { id: 10, courseId: 1, courseName: 'Python程序设计', courseShort: 'Python', name: '面向对象编程', chapter: '第6章 OOP', difficulty: 'hard', parentId: 5, sortOrder: 10 },
  // 数据结构与算法 (courseId=2)
  { id: 11, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '数组与链表', chapter: '第1章 线性结构', difficulty: 'medium', parentId: null, sortOrder: 1 },
  { id: 12, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '栈与队列', chapter: '第1章 线性结构', difficulty: 'medium', parentId: 11, sortOrder: 2 },
  { id: 13, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '树与二叉树', chapter: '第2章 树结构', difficulty: 'hard', parentId: null, sortOrder: 3 },
  { id: 14, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '二叉搜索树', chapter: '第2章 树结构', difficulty: 'hard', parentId: 13, sortOrder: 4 },
  { id: 15, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '堆与优先队列', chapter: '第2章 树结构', difficulty: 'hard', parentId: 13, sortOrder: 5 },
  { id: 16, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '哈希表', chapter: '第3章 查找', difficulty: 'medium', parentId: null, sortOrder: 6 },
  { id: 17, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '排序算法', chapter: '第4章 排序', difficulty: 'medium', parentId: null, sortOrder: 7 },
  { id: 18, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '图的基本概念', chapter: '第5章 图', difficulty: 'hard', parentId: null, sortOrder: 8 },
  { id: 19, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: 'DFS与BFS', chapter: '第5章 图', difficulty: 'hard', parentId: 18, sortOrder: 9 },
  { id: 20, courseId: 2, courseName: '数据结构与算法', courseShort: 'DS', name: '最短路径算法', chapter: '第5章 图', difficulty: 'hard', parentId: 18, sortOrder: 10 },
  // 数据库原理 (courseId=3)
  { id: 21, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '关系模型基础', chapter: '第1章 数据库概论', difficulty: 'easy', parentId: null, sortOrder: 1 },
  { id: 22, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: 'ER图设计', chapter: '第1章 数据库概论', difficulty: 'easy', parentId: 21, sortOrder: 2 },
  { id: 23, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: 'SQL基础查询', chapter: '第2章 SQL语言', difficulty: 'easy', parentId: null, sortOrder: 3 },
  { id: 24, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '多表连接查询', chapter: '第2章 SQL语言', difficulty: 'medium', parentId: 23, sortOrder: 4 },
  { id: 25, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '子查询与聚合', chapter: '第2章 SQL语言', difficulty: 'medium', parentId: 23, sortOrder: 5 },
  { id: 26, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '索引与查询优化', chapter: '第3章 性能优化', difficulty: 'hard', parentId: null, sortOrder: 6 },
  { id: 27, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '事务与并发控制', chapter: '第4章 事务管理', difficulty: 'hard', parentId: null, sortOrder: 7 },
  { id: 28, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '范式与规范化', chapter: '第5章 数据库设计', difficulty: 'medium', parentId: 21, sortOrder: 8 },
  { id: 29, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '存储过程', chapter: '第6章 高级特性', difficulty: 'hard', parentId: null, sortOrder: 9 },
  { id: 30, courseId: 3, courseName: '数据库原理', courseShort: 'DB', name: '数据库安全', chapter: '第6章 高级特性', difficulty: 'hard', parentId: 29, sortOrder: 10 },
];

// ==================== 学生分层参数 ====================
const STUDENT_LEVELS: Record<string, { masteryMean: number; masteryStd: number; errorRate: number }> = {
  top: { masteryMean: 88, masteryStd: 8, errorRate: 0.08 },
  medium: { masteryMean: 68, masteryStd: 12, errorRate: 0.18 },
  weak: { masteryMean: 45, masteryStd: 15, errorRate: 0.35 },
};

// ==================== 核心生成函数 ====================

/** 根据 studentId 生成该学生的完整学情数据 */
export function generateStudentData(studentId: number) {
  const seed = studentId * 9973 + 42;
  const rng = new SeededRandom(seed);

  // 根据 studentId 确定分层
  const levelKey = studentId <= 4 ? 'top' : studentId <= 6 ? 'top' : studentId <= 9 ? 'medium' : 'weak';
  const level = STUDENT_LEVELS[levelKey];

  // 1. 知识点掌握度
  const masteryData = generateMasteryData(rng, studentId, level);

  // 2. 核心指标
  const indicators = generateIndicators(rng, level, masteryData);

  // 3. 能力雷达（8维度）
  const radarData = generateRadarData(rng, level);

  // 4. 知识掌握分层统计
  const knowledgeStats = generateKnowledgeStats(masteryData);

  // 5. 薄弱知识点 TOP10
  const weakTop10 = generateWeakTop10(rng, masteryData);

  // 6. 错题数据
  const errorData = generateErrorData(rng, studentId, masteryData);

  // 7. 学习趋势
  const trendData = generateTrendData(rng, level);

  // 8. 学习计划
  const studyPlan = generateStudyPlan(rng, masteryData);

  // 9. 课程对比
  const courseComparison = generateCourseComparison(masteryData);

  // 10. 考试安排
  const examSchedule = generateExamSchedule(rng);

  // 11. 薄弱分析
  const weakAnalysis = generateWeakAnalysis(rng, masteryData, errorData);

  // 12. 习题推荐
  const exerciseRecommend = generateExerciseRecommend(rng, masteryData);

  return {
    indicators,
    radarData,
    knowledgeStats,
    weakTop10,
    errorData,
    trendData,
    studyPlan,
    courseComparison,
    examSchedule,
    weakAnalysis,
    exerciseRecommend,
    masteryData,
  };
}

// ==================== 子模块生成 ====================

function generateMasteryData(rng: SeededRandom, studentId: number, level: typeof STUDENT_LEVELS['top']) {
  const rng2 = new SeededRandom(studentId * 7919 + 137);
  const raw = KNOWLEDGE_POINTS.map(kp => {
    const mastery = rng2.normal(level.masteryMean, level.masteryStd, 5, 100);
    const errorCount = Math.max(0, Math.round((100 - mastery) / 100 * level.errorRate * 50));
    return { ...kp, mastery, errorCount };
  });
  // Percentile-based tier assignment: bottom 30%=weak, middle 40%=medium, top 30%=strong
  const sorted = [...raw].sort((a, b) => a.mastery - b.mastery);
  const n = sorted.length;
  const weakCutoff = Math.floor(n * 0.3);
  const strongCutoff = Math.floor(n * 0.7);
  const tierMap = new Map<number, 'strong' | 'medium' | 'weak'>();
  sorted.forEach((kp, i) => {
    if (i < weakCutoff) tierMap.set(kp.id, 'weak');
    else if (i < strongCutoff) tierMap.set(kp.id, 'medium');
    else tierMap.set(kp.id, 'strong');
  });
  return raw.map(kp => ({ ...kp, level: tierMap.get(kp.id)! }));
}

function generateIndicators(rng: SeededRandom, level: typeof STUDENT_LEVELS['top'], masteryData: ReturnType<typeof generateMasteryData>) {
  const avgMastery = Math.round(masteryData.reduce((s, m) => s + m.mastery, 0) / masteryData.length);
  const completionRate = Math.min(100, Math.max(0, rng.normal(level.masteryMean + 5, 10, 30, 100)));
  const onTimeRate = Math.min(100, Math.max(0, rng.normal(level.masteryMean + 2, 8, 40, 100)));
  const correctionRate = Math.min(100, Math.max(0, rng.normal(level.masteryMean - 5, 12, 20, 100)));
  const totalQuestions = rng.int(80, 300);
  const totalErrors = Math.round(totalQuestions * level.errorRate);
  const redoCorrectRate = Math.min(100, Math.max(0, rng.normal(level.masteryMean - 10, 15, 15, 100)));

  return [
    { key: 'completionRate', label: '作业完成率', value: completionRate, unit: '%', change: rng.int(-5, 8), trend: 'up' as const },
    { key: 'onTimeRate', label: '按时提交率', value: onTimeRate, unit: '%', change: rng.int(-3, 5), trend: 'up' as const },
    { key: 'avgScore', label: '平均得分', value: avgMastery, unit: '分', change: rng.int(-8, 10), trend: avgMastery > 70 ? 'up' as const : 'down' as const },
    { key: 'correctionRate', label: '订正完成率', value: correctionRate, unit: '%', change: rng.int(-5, 12), trend: 'up' as const },
    { key: 'totalQuestions', label: '累计做题量', value: totalQuestions, unit: '题', change: rng.int(10, 30), trend: 'up' as const },
    { key: 'totalErrors', label: '错题总数', value: totalErrors, unit: '题', change: rng.int(-15, 5), trend: totalErrors > 30 ? 'down' as const : 'up' as const },
    { key: 'redoCorrectRate', label: '重做正确率', value: redoCorrectRate, unit: '%', change: rng.int(-3, 8), trend: 'up' as const },
  ];
}

function generateRadarData(rng: SeededRandom, level: typeof STUDENT_LEVELS['top']) {
  const dimensions = [
    { key: 'basic_memory', label: '基础识记', icon: 'Brain' },
    { key: 'calculation', label: '计算运算', icon: 'Calculator' },
    { key: 'logic_reasoning', label: '逻辑推理', icon: 'Lightbulb' },
    { key: 'comprehensive', label: '综合应用', icon: 'Puzzle' },
    { key: 'experiment', label: '实验探究', icon: 'FlaskConical' },
    { key: 'question_analysis', label: '审题分析', icon: 'Search' },
    { key: 'answer_standard', label: '答题规范', icon: 'FileCheck' },
    { key: 'innovation', label: '拓展创新', icon: 'Sparkles' },
  ];

  return dimensions.map(d => {
    const score = rng.normal(level.masteryMean, level.masteryStd, 10, 100);
    const history = [rng.int(score - 15, score + 5), rng.int(score - 10, score + 8), score].map(v => Math.max(0, Math.min(100, v)));
    const errorCount = Math.max(0, Math.round((100 - score) / 10));
    return { ...d, score, history, errorCount };
  });
}

function generateKnowledgeStats(masteryData: ReturnType<typeof generateMasteryData>) {
  const strong = masteryData.filter(m => m.level === 'strong').map(m => ({
    id: m.id, name: m.name, chapter: m.chapter, courseName: m.courseName,
    mastery: m.mastery, questionCount: m.errorCount + Math.round(Math.random() * 20 + 10),
    lastPracticeDate: randomDate(7),
  }));
  const medium = masteryData.filter(m => m.level === 'medium').map(m => ({
    id: m.id, name: m.name, chapter: m.chapter, courseName: m.courseName,
    mastery: m.mastery, questionCount: m.errorCount + Math.round(Math.random() * 15 + 5),
    lastPracticeDate: randomDate(14),
  }));
  const weak = masteryData.filter(m => m.level === 'weak').map(m => ({
    id: m.id, name: m.name, chapter: m.chapter, courseName: m.courseName,
    mastery: m.mastery, questionCount: m.errorCount + Math.round(Math.random() * 10 + 3),
    lastPracticeDate: randomDate(21),
  }));
  return { strong, medium, weak, strongCount: strong.length, mediumCount: medium.length, weakCount: weak.length };
}

function generateWeakTop10(rng: SeededRandom, masteryData: ReturnType<typeof generateMasteryData>) {
  const sorted = [...masteryData]
    .filter(m => m.level === 'weak')
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5);

  return sorted.map((m, i) => ({
    rank: i + 1,
    knowledgePointId: m.id,
    name: m.name,
    chapter: m.chapter,
    courseName: m.courseName,
    masteryRate: m.mastery,
    errorCount: m.errorCount,
    lossWeight: Math.round((100 - m.mastery) * (1 + m.errorCount * 0.3)),
    priority: m.mastery < 40 ? ('P0' as const) : m.mastery < 60 ? ('P1' as const) : ('P2' as const),
    relatedExerciseCount: rng.int(3, 15),
  }));
}

function generateErrorData(rng: SeededRandom, studentId: number, masteryData: ReturnType<typeof generateMasteryData>) {
  const errorTypes = ['concept_confusion', 'calculation_error', 'logic_error', 'knowledge_missing', 'careless', 'method_unknown', 'step_missing', 'typo'];
  const errorTypeLabels: Record<string, string> = {
    concept_confusion: '概念混淆', calculation_error: '计算失误', logic_error: '逻辑错误',
    knowledge_missing: '知识漏洞', careless: '粗心大意', method_unknown: '方法不会',
    step_missing: '步骤缺失', typo: '书写错误',
  };

  const weakKps = masteryData.filter(m => m.level === 'weak' || m.level === 'medium');
  const rawErrors: Array<{
    id: number; knowledgePointId: number; knowledgePointName: string;
    errorType: string; errorTypeLabel: string; difficulty: string;
    questionContent: string; correctAnswer: string; studentAnswer: string;
    errorAnalysis: string; createdAt: string; reviewStatus: string;
  }> = [];

  const questionTemplates = [
    { content: '下列Python代码的输出结果是？print(type(3.14))', answer: '<class \'float\'>', wrong: '<class \'int\'>' },
    { content: '在Python中，如何定义一个空列表？', answer: '[] 或 list()', wrong: '{}' },
    { content: 'for i in range(5): print(i) 的输出是？', answer: '0 1 2 3 4', wrong: '1 2 3 4 5' },
    { content: '二叉树的先序遍历顺序是？', answer: '根-左-右', wrong: '左-根-右' },
    { content: 'SQL中用于去重的关键字是？', answer: 'DISTINCT', wrong: 'UNIQUE' },
    { content: '栈的特点是？', answer: '先进后出(FILO)', wrong: '先进先出(FIFO)' },
    { content: 'Python中lambda函数的作用是？', answer: '创建匿名函数', wrong: '定义类' },
    { content: '数据库事务的ACID特性不包括？', answer: '持久性(Durability)', wrong: '分布性(Distribution)' },
  ];

  const rng2 = new SeededRandom(studentId * 6271 + 251);
  for (let i = 0; i < rng2.int(8, 20); i++) {
    const kp = rng2.pick(weakKps);
    const et = rng2.pick(errorTypes);
    const qt = rng2.pick(questionTemplates);
    rawErrors.push({
      id: studentId * 1000 + i,
      knowledgePointId: kp.id,
      knowledgePointName: kp.name,
      errorType: et,
      errorTypeLabel: errorTypeLabels[et] || et,
      difficulty: kp.difficulty,
      questionContent: qt.content,
      correctAnswer: qt.answer,
      studentAnswer: qt.wrong,
      errorAnalysis: `在「${kp.name}」上出现${errorTypeLabels[et]}，建议回顾${kp.chapter}相关内容。`,
      createdAt: randomDate(30),
      reviewStatus: rng2.pick(['pending', 'reviewed', 'mastered']),
    });
  }

  // 错题类型分布（饼图数据）- aggregated by error type
  const typeDist: Record<string, number> = {};
  for (const e of rawErrors) {
    typeDist[e.errorType] = (typeDist[e.errorType] || 0) + 1;
  }
  const totalErrors = rawErrors.length;
  const errorTypeDistribution = Object.entries(typeDist).map(([type, count]) => ({
    errorType: type,
    errorTypeLabel: errorTypeLabels[type] || type,
    count,
    percentage: Math.round((count / totalErrors) * 100),
  }));

  return { errors: errorTypeDistribution, rawErrors, errorTypeDistribution, totalErrors };
}

function generateTrendData(rng: SeededRandom, level: typeof STUDENT_LEVELS['top']) {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    weeks.push(`第${7 - i}周`);
  }

  let base = level.masteryMean - rng.int(5, 15);
  return weeks.map(week => {
    base = Math.min(100, Math.max(10, base + rng.int(-5, 12)));
    const avgScore = base;
    const completionRate = Math.min(100, Math.max(50, base + rng.int(-10, 15)));
    const errorCount = Math.max(0, Math.round((100 - base) / 10));
    return { week, avgScore, completionRate, errorCount };
  });
}

function generateStudyPlan(rng: SeededRandom, masteryData: ReturnType<typeof generateMasteryData>) {
  const weakKps = masteryData.filter(m => m.level === 'weak').slice(0, 6);
  const mediumKps = masteryData.filter(m => m.level === 'medium').slice(0, 4);

  const shortTermTasks = weakKps.slice(0, 3).map((kp, i) => ({
    id: 100 + i,
    type: 'short' as const,
    duration: '3天',
    knowledgePointId: kp.id,
    knowledgePointName: kp.name,
    courseName: kp.courseName,
    suggestMinutes: rng.int(30, 60),
    exerciseCount: rng.int(5, 10),
    targetMastery: Math.min(100, kp.mastery + rng.int(15, 30)),
    checkStandard: `完成${rng.int(5, 10)}道练习题，正确率达到${Math.min(100, kp.mastery + 20)}%以上`,
    status: 'pending' as const,
  }));

  const midTermTasks = [...weakKps.slice(3), ...mediumKps.slice(0, 2)].map((kp, i) => ({
    id: 200 + i,
    type: 'mid' as const,
    duration: '7天',
    knowledgePointId: kp.id,
    knowledgePointName: kp.name,
    courseName: kp.courseName,
    suggestMinutes: rng.int(45, 90),
    exerciseCount: rng.int(8, 15),
    targetMastery: Math.min(100, kp.mastery + rng.int(20, 40)),
    checkStandard: `完成${rng.int(8, 15)}道练习题，正确率达到${Math.min(100, kp.mastery + 25)}%以上`,
    status: 'pending' as const,
  }));

  return { shortTermTasks, midTermTasks, totalTasks: shortTermTasks.length + midTermTasks.length };
}

function generateCourseComparison(masteryData: ReturnType<typeof generateMasteryData>) {
  const courses = [
    { courseId: 1, name: 'Python程序设计', shortName: 'Python' },
    { courseId: 2, name: '数据结构与算法', shortName: 'DS' },
    { courseId: 3, name: '数据库原理', shortName: 'DB' },
  ];

  return courses.map(c => {
    const kps = masteryData.filter(m => m.courseId === c.courseId);
    const avgMastery = kps.length > 0 ? Math.round(kps.reduce((s, m) => s + m.mastery, 0) / kps.length) : 0;
    const errorCount = kps.reduce((s, m) => s + m.errorCount, 0);
    return { ...c, avgMastery, kpCount: kps.length, errorCount };
  });
}

function generateExamSchedule(rng: SeededRandom) {
  const now = new Date();
  return [
    { id: 1, title: 'Python期中测验', courseName: 'Python程序设计', examDate: addDays(now, rng.int(5, 14)).toISOString().split('T')[0], location: '教学楼A301', daysUntil: rng.int(5, 14) },
    { id: 2, title: '数据结构单元测试', courseName: '数据结构与算法', examDate: addDays(now, rng.int(15, 25)).toISOString().split('T')[0], location: '教学楼B202', daysUntil: rng.int(15, 25) },
    { id: 3, title: '数据库期末考核', courseName: '数据库原理', examDate: addDays(now, rng.int(26, 40)).toISOString().split('T')[0], location: '实验楼C101', daysUntil: rng.int(26, 40) },
  ];
}

function generateWeakAnalysis(rng: SeededRandom, masteryData: ReturnType<typeof generateMasteryData>, errorData: ReturnType<typeof generateErrorData>) {
  // 共性错题类型分析
  const errorTypeAnalysis = errorData.errorTypeDistribution.map(e => ({
    ...e,
    percentage: Math.round((e.count / errorData.totalErrors) * 100),
  }));

  // 近期失分趋势（近6次作业）
  const scoreTrend: Array<{ label: string; score: number }> = [];
  let baseScore = rng.int(55, 80);
  for (let i = 1; i <= 6; i++) {
    baseScore = Math.max(20, Math.min(100, baseScore + rng.int(-12, 15)));
    scoreTrend.push({ label: `作业${i}`, score: baseScore });
  }

  // 高频出错章节统计
  const chapterErrors: Record<string, { chapter: string; courseName: string; errorCount: number; kpCount: number }> = {};
  for (const e of errorData.rawErrors) {
    const kp = masteryData.find(m => m.id === e.knowledgePointId);
    if (!kp) continue;
    const key = kp.chapter;
    if (!chapterErrors[key]) chapterErrors[key] = { chapter: key, courseName: kp.courseName, errorCount: 0, kpCount: 0 };
    chapterErrors[key].errorCount++;
    chapterErrors[key].kpCount = masteryData.filter(m => m.chapter === key).length;
  }
  const chapterRanking = Object.values(chapterErrors).sort((a, b) => b.errorCount - a.errorCount).slice(0, 8);

  return { errorTypeAnalysis, scoreTrend, chapterRanking };
}

function generateExerciseRecommend(rng: SeededRandom, masteryData: ReturnType<typeof generateMasteryData>) {
  const weakKps = masteryData.filter(m => m.level === 'weak');
  const questionTypes = ['选择题', '填空题', '简答题', '综合大题', '编程题'];

  return weakKps.slice(0, 8).map((kp, i) => ({
    id: 300 + i,
    knowledgePointId: kp.id,
    knowledgePointName: kp.name,
    courseName: kp.courseName,
    questionType: rng.pick(questionTypes),
    difficulty: kp.difficulty,
    estimatedMinutes: rng.int(5, 25),
    exerciseCount: rng.int(3, 8),
    source: rng.pick(['教材课后习题', '历年真题', '题库精选', 'AI生成']),
  }));
}

// ==================== 知识图谱数据生成 ====================

export function generateKnowledgeGraph(studentId: number, courseId: number) {
  const rng = new SeededRandom(studentId * 7919 + courseId * 3571 + 137);
  const studentData = generateStudentData(studentId);
  const courseKps = KNOWLEDGE_POINTS.filter(kp => kp.courseId === courseId);

  const course = courseKps[0];
  if (!course) return { nodes: [], edges: [], categories: [] };

  // 章节分组
  const chapterMap = new Map<string, KnowledgePointDef[]>();
  for (const kp of courseKps) {
    if (!chapterMap.has(kp.chapter)) chapterMap.set(kp.chapter, []);
    chapterMap.get(kp.chapter)!.push(kp);
  }

  const chapterColors = ['#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<Record<string, unknown>> = [];

  // Root node
  nodes.push({
    id: 'root',
    name: course.courseShort,
    category: 'root',
    symbolSize: 70,
    itemStyle: { color: '#1e293b' },
    label: { fontSize: 16, fontWeight: 'bold' as const },
    description: `${course.courseName}知识体系`,
  });

  let chapterIdx = 0;
  for (const [chapterName, kps] of chapterMap) {
    const chapterId = `chapter_${chapterIdx}`;
    const color = chapterColors[chapterIdx % chapterColors.length];
    // Extract short chapter name (remove "第N章 " prefix)
    const shortName = chapterName.replace(/^第\d+章\s*/, '');

    nodes.push({
      id: chapterId,
      name: shortName,
      category: 'chapter',
      symbolSize: 50,
      itemStyle: { color, borderRadius: 8 },
      label: { fontSize: 13, fontWeight: 'bold' as const },
      description: `${chapterName} - ${kps.length}个知识点`,
    });

    edges.push({
      source: 'root',
      target: chapterId,
      lineStyle: { color, width: 2.5, curveness: 0.2, opacity: 0.8 },
    });

    // Knowledge point nodes
    for (const kp of kps) {
      const mastery = studentData.masteryData.find(m => m.id === kp.id)?.mastery;
      let nodeColor = '#94a3b8';
      let symbolSize = 28;

      if (mastery !== undefined) {
        if (mastery >= 80) { nodeColor = '#10b981'; symbolSize = 36; }
        else if (mastery >= 60) { nodeColor = '#f59e0b'; symbolSize = 32; }
        else if (mastery > 0) { nodeColor = '#ef4444'; symbolSize = 28; }
      }

      nodes.push({
        id: `kp_${kp.id}`,
        name: kp.name,
        category: kp.difficulty,
        symbolSize,
        itemStyle: { color: nodeColor },
        label: { fontSize: 10 },
        mastery: mastery ?? null,
        description: `${kp.name}\n掌握度：${mastery ?? '未学习'}%`,
      });

      edges.push({
        source: chapterId,
        target: `kp_${kp.id}`,
        lineStyle: { color, width: 1.5, curveness: 0.2, opacity: 0.6 },
      });
    }

    // 知识点间依赖边
    for (const kp of kps) {
      if (kp.parentId) {
        const parent = courseKps.find(p => p.id === kp.parentId);
        if (parent && chapterMap.get(chapterName)?.some(k => k.id === parent.id)) {
          edges.push({
            source: `kp_${parent.id}`,
            target: `kp_${kp.id}`,
            lineStyle: { color: '#94a3b8', width: 1, curveness: 0.3, opacity: 0.4, type: 'dashed' },
          });
        }
      }
    }

    chapterIdx++;
  }

  return {
    course: { id: course.courseId, name: course.courseName, short_name: course.courseShort },
    nodes,
    edges,
    categories: [
      { name: '已掌握', color: '#10b981' },
      { name: '基本掌握', color: '#f59e0b' },
      { name: '未掌握', color: '#ef4444' },
      { name: '未学习', color: '#94a3b8' },
    ],
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
}

// ==================== 工具函数 ====================

function randomDate(maxDaysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * maxDaysAgo));
  return d.toISOString();
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 溯光 TracingLight V3.0 种子数据 (SQLite + Drizzle)
 * 运行: npx tsx src/storage/database/seed.ts
 */
import { initDb, getDb, saveDb, getSqlite } from './db';
import {
  school, college, major, classInfo, user, course,
  knowledgePoint, knowledgeGraphNode, knowledgeGraphEdge,
  question, assignment, answer, gradingTask, errorBook,
  knowledgeMasteryLog,
} from './shared/schema';
import * as fs from 'fs';
import * as path from 'path';

async function seed() {
  console.log('🌱 开始插入种子数据...\n');

  // 删除旧文件
  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
  if (fs.existsSync(dbPath)) { fs.unlinkSync(dbPath); console.log('🗑️  旧数据库已删除\n'); }

  await initDb();
  const db = getDb();
  console.log('✅ 数据库已初始化\n');

  // ===================== 1. 基础数据 =====================
  console.log('📚 插入学校/学院/专业/班级...');
  db.insert(school).values({ id: 1, name: '福州大学', short_name: 'FZU' }).run();
  db.insert(college).values({ id: 1, school_id: 1, name: '计算机与大数据学院', short_name: 'CS' }).run();
  db.insert(major).values({ id: 1, college_id: 1, name: '计算机科学与技术', short_name: '计科' }).run();
  db.insert(classInfo).values([
    { id: 1, major_id: 1, name: '计科2401', grade: '2024' },
    { id: 2, major_id: 1, name: '计科2402', grade: '2024' },
  ]).run();
  console.log('  ✅ 学校/学院/专业/班级完成');

  // ===================== 2. 用户 =====================
  console.log('👤 插入用户...');
  db.insert(user).values([
    { id: 1, username: 'teacher_wang', real_name: '王老师', role: 'teacher', class_id: 1 },
    { id: 2, username: 'teacher_li', real_name: '李老师', role: 'teacher', class_id: 1 },
    { id: 3, username: 'stu_zhang', real_name: '张同学', role: 'student', class_id: 1, student_level: 'top' },
    { id: 4, username: 'stu_li', real_name: '李同学', role: 'student', class_id: 1, student_level: 'top' },
    { id: 5, username: 'stu_wang', real_name: '王同学', role: 'student', class_id: 1, student_level: 'top' },
    { id: 6, username: 'stu_zhao', real_name: '赵同学', role: 'student', class_id: 1, student_level: 'top' },
    { id: 7, username: 'stu_chen', real_name: '陈同学', role: 'student', class_id: 1, student_level: 'medium' },
    { id: 8, username: 'stu_liu', real_name: '刘同学', role: 'student', class_id: 1, student_level: 'medium' },
    { id: 9, username: 'stu_zhou', real_name: '周同学', role: 'student', class_id: 1, student_level: 'medium' },
    { id: 10, username: 'stu_wu', real_name: '吴同学', role: 'student', class_id: 1, student_level: 'weak' },
    { id: 11, username: 'stu_sun', real_name: '孙同学', role: 'student', class_id: 1, student_level: 'weak' },
    { id: 12, username: 'stu_ma', real_name: '马同学', role: 'student', class_id: 1, student_level: 'weak' },
  ]).run();
  console.log('  ✅ 用户完成 (2教师 + 10学生)');

  // ===================== 3. 课程 =====================
  console.log('📖 插入课程...');
  db.insert(course).values([
    { id: 1, name: 'Python程序设计', short_name: 'Python', description: 'Python基础语法与编程实践', teacher_id: 1, class_id: 1, semester: '2025-2026-2' },
    { id: 2, name: '数据结构与算法', short_name: 'DS', description: '常用数据结构与算法分析', teacher_id: 1, class_id: 1, semester: '2025-2026-2' },
    { id: 3, name: '数据库原理', short_name: 'DB', description: '关系数据库理论与SQL实践', teacher_id: 2, class_id: 1, semester: '2025-2026-2' },
  ]).run();
  console.log('  ✅ 课程完成 (3门)');

  // ===================== 4. 知识点 =====================
  console.log('🧠 插入知识点...');
  db.insert(knowledgePoint).values([
    { id: 1, course_id: 1, name: '变量与数据类型', difficulty: 'easy', sort_order: 1 },
    { id: 2, course_id: 1, name: '运算符与表达式', difficulty: 'easy', sort_order: 2 },
    { id: 3, course_id: 1, name: '流程控制', difficulty: 'easy', sort_order: 3 },
    { id: 4, course_id: 1, name: '循环结构', difficulty: 'medium', sort_order: 4 },
    { id: 5, course_id: 1, name: '函数定义与调用', difficulty: 'medium', sort_order: 5 },
    { id: 6, course_id: 1, name: '列表与元组', difficulty: 'medium', sort_order: 6 },
    { id: 7, course_id: 1, name: '字典与集合', difficulty: 'medium', sort_order: 7 },
    { id: 8, course_id: 1, name: '文件操作', difficulty: 'hard', sort_order: 8 },
    { id: 9, course_id: 1, name: '异常处理', difficulty: 'hard', sort_order: 9 },
    { id: 10, course_id: 1, name: '面向对象基础', difficulty: 'hard', sort_order: 10 },
    { id: 11, course_id: 2, name: '数组与链表', difficulty: 'medium', sort_order: 1 },
    { id: 12, course_id: 2, name: '栈与队列', difficulty: 'medium', sort_order: 2 },
    { id: 13, course_id: 2, name: '树与二叉树', difficulty: 'hard', sort_order: 3 },
    { id: 14, course_id: 2, name: '排序算法', difficulty: 'hard', sort_order: 4 },
    { id: 15, course_id: 3, name: '关系模型与ER图', difficulty: 'medium', sort_order: 1 },
    { id: 16, course_id: 3, name: 'SQL基础查询', difficulty: 'easy', sort_order: 2 },
    { id: 17, course_id: 3, name: 'SQL高级查询', difficulty: 'hard', sort_order: 3 },
    { id: 18, course_id: 3, name: '索引与优化', difficulty: 'hard', sort_order: 4 },
  ]).run();
  console.log('  ✅ 知识点完成 (18个)');

  // ===================== 5. 知识图谱 =====================
  console.log('🗺️  插入知识图谱...');
  db.insert(knowledgeGraphNode).values([
    { id: 1, knowledge_point_id: 1, course_id: 1, node_name: 'Python程序设计', node_level: 1, parent_node_id: null, display_order: 1, color_hex: '#1e293b', is_leaf: false },
    { id: 2, knowledge_point_id: 11, course_id: 2, node_name: '数据结构与算法', node_level: 1, parent_node_id: null, display_order: 2, color_hex: '#1e293b', is_leaf: false },
    { id: 3, knowledge_point_id: 15, course_id: 3, node_name: '数据库原理', node_level: 1, parent_node_id: null, display_order: 3, color_hex: '#1e293b', is_leaf: false },
    { id: 4, knowledge_point_id: 1, course_id: 1, node_name: '基础语法', node_level: 2, parent_node_id: 1, display_order: 1, color_hex: '#0d9488', is_leaf: false },
    { id: 5, knowledge_point_id: 5, course_id: 1, node_name: '函数', node_level: 2, parent_node_id: 1, display_order: 2, color_hex: '#0d9488', is_leaf: false },
    { id: 6, knowledge_point_id: 6, course_id: 1, node_name: '数据结构', node_level: 2, parent_node_id: 1, display_order: 3, color_hex: '#0d9488', is_leaf: false },
    { id: 7, knowledge_point_id: 10, course_id: 1, node_name: '面向对象', node_level: 2, parent_node_id: 1, display_order: 4, color_hex: '#0d9488', is_leaf: false },
    { id: 8, knowledge_point_id: 11, course_id: 2, node_name: '线性结构', node_level: 2, parent_node_id: 2, display_order: 1, color_hex: '#0d9488', is_leaf: false },
    { id: 9, knowledge_point_id: 13, course_id: 2, node_name: '树形结构', node_level: 2, parent_node_id: 2, display_order: 2, color_hex: '#0d9488', is_leaf: false },
    { id: 10, knowledge_point_id: 15, course_id: 3, node_name: '数据库设计', node_level: 2, parent_node_id: 3, display_order: 1, color_hex: '#0d9488', is_leaf: false },
    { id: 11, knowledge_point_id: 16, course_id: 3, node_name: 'SQL查询', node_level: 2, parent_node_id: 3, display_order: 2, color_hex: '#0d9488', is_leaf: false },
    { id: 12, knowledge_point_id: 1, course_id: 1, node_name: '变量与数据类型', node_level: 3, parent_node_id: 4, display_order: 1, color_hex: '#f59e0b', is_leaf: true },
    { id: 13, knowledge_point_id: 3, course_id: 1, node_name: '流程控制', node_level: 3, parent_node_id: 4, display_order: 2, color_hex: '#f59e0b', is_leaf: true },
    { id: 14, knowledge_point_id: 4, course_id: 1, node_name: '循环结构', node_level: 3, parent_node_id: 4, display_order: 3, color_hex: '#f59e0b', is_leaf: true },
    { id: 15, knowledge_point_id: 5, course_id: 1, node_name: '函数定义与调用', node_level: 3, parent_node_id: 5, display_order: 1, color_hex: '#f59e0b', is_leaf: true },
    { id: 16, knowledge_point_id: 6, course_id: 1, node_name: '列表与元组', node_level: 3, parent_node_id: 6, display_order: 1, color_hex: '#f59e0b', is_leaf: true },
    { id: 17, knowledge_point_id: 7, course_id: 1, node_name: '字典与集合', node_level: 3, parent_node_id: 6, display_order: 2, color_hex: '#f59e0b', is_leaf: true },
    { id: 18, knowledge_point_id: 11, course_id: 2, node_name: '数组与链表', node_level: 3, parent_node_id: 8, display_order: 1, color_hex: '#f59e0b', is_leaf: true },
    { id: 19, knowledge_point_id: 12, course_id: 2, node_name: '栈与队列', node_level: 3, parent_node_id: 8, display_order: 2, color_hex: '#f59e0b', is_leaf: true },
    { id: 20, knowledge_point_id: 16, course_id: 3, node_name: 'SQL基础查询', node_level: 3, parent_node_id: 11, display_order: 1, color_hex: '#f59e0b', is_leaf: true },
    { id: 21, knowledge_point_id: 17, course_id: 3, node_name: 'SQL高级查询', node_level: 3, parent_node_id: 11, display_order: 2, color_hex: '#f59e0b', is_leaf: true },
  ]).run();
  db.insert(knowledgeGraphEdge).values([
    { id: 1, from_node_id: 12, to_node_id: 13, relation_type: 'prerequisite', description: '变量是流程控制的基础' },
    { id: 2, from_node_id: 13, to_node_id: 14, relation_type: 'prerequisite', description: '流程控制是循环结构的基础' },
    { id: 3, from_node_id: 12, to_node_id: 15, relation_type: 'prerequisite', description: '变量是函数定义的基础' },
    { id: 4, from_node_id: 12, to_node_id: 16, relation_type: 'prerequisite', description: '变量是列表元组的基础' },
    { id: 5, from_node_id: 16, to_node_id: 17, relation_type: 'related', description: '列表与字典同为数据结构' },
    { id: 6, from_node_id: 18, to_node_id: 19, relation_type: 'prerequisite', description: '数组是栈与队列的基础' },
    { id: 7, from_node_id: 20, to_node_id: 21, relation_type: 'prerequisite', description: '基础查询是高级查询的前提' },
    { id: 8, from_node_id: 4, to_node_id: 5, relation_type: 'prerequisite', description: '基础语法是函数的前提' },
    { id: 9, from_node_id: 5, to_node_id: 7, relation_type: 'prerequisite', description: '函数是面向对象的前提' },
  ]).run();
  console.log('  ✅ 知识图谱完成 (21节点 + 9边)');

  // ===================== 6. 题目 =====================
  console.log('📝 插入题目...');
  db.insert(question).values([
    { id: 1, course_id: 1, knowledge_point_id: 1, question_type: 'single_choice', difficulty: 'easy', content: 'Python中，以下哪个是可变数据类型？', options: { A: 'int', B: 'str', C: 'list', D: 'tuple' }, answer: 'C', analysis: 'list是可变序列，int、str、tuple都是不可变类型', default_score: 10, source: 'ai' },
    { id: 2, course_id: 1, knowledge_point_id: 1, question_type: 'single_choice', difficulty: 'easy', content: '以下哪个不是Python的合法变量名？', options: { A: '_name', B: 'name1', C: '1name', D: 'name_1' }, answer: 'C', analysis: '变量名不能以数字开头', default_score: 5, source: 'ai' },
    { id: 3, course_id: 1, knowledge_point_id: 1, question_type: 'judgment', difficulty: 'easy', content: 'Python中字符串是不可变类型，创建后不能修改。', options: null, answer: '正确', analysis: 'Python字符串创建后不可修改', default_score: 5, source: 'ai' },
    { id: 4, course_id: 1, knowledge_point_id: 3, question_type: 'single_choice', difficulty: 'easy', content: 'if语句的条件表达式结果必须是？', options: { A: '整数', B: '布尔值', C: '字符串', D: '任意类型' }, answer: 'B', analysis: 'if条件表达式会被隐式转换为布尔值', default_score: 5, source: 'ai' },
    { id: 5, course_id: 1, knowledge_point_id: 3, question_type: 'fill_blank', difficulty: 'easy', content: 'Python中用于获取变量类型的函数是____', options: null, answer: 'type()', analysis: 'type()函数返回对象的类型', default_score: 5, source: 'ai' },
    { id: 6, course_id: 1, knowledge_point_id: 4, question_type: 'single_choice', difficulty: 'medium', content: 'for i in range(1, 5)循环执行几次？', options: { A: '3次', B: '4次', C: '5次', D: '6次' }, answer: 'B', analysis: 'range(1,5)生成1,2,3,4共4个数', default_score: 5, source: 'ai' },
    { id: 7, course_id: 1, knowledge_point_id: 5, question_type: 'short_answer', difficulty: 'medium', content: '请编写一个函数，接收两个参数a和b，返回它们的和。', options: null, answer: 'def add(a, b):\n    return a + b', analysis: '考察函数定义与返回值', default_score: 10, source: 'ai' },
    { id: 8, course_id: 1, knowledge_point_id: 6, question_type: 'code', difficulty: 'medium', content: '请用Python实现一个函数，判断一个数是否为素数。', options: null, answer: 'def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True', analysis: '考察循环和条件判断', default_score: 15, source: 'ai' },
    { id: 9, course_id: 1, knowledge_point_id: 7, question_type: 'single_choice', difficulty: 'medium', content: '字典的键必须是？', options: { A: '整数', B: '字符串', C: '不可变类型', D: '任意类型' }, answer: 'C', analysis: '字典的键必须是不可变类型', default_score: 10, source: 'ai' },
    { id: 10, course_id: 1, knowledge_point_id: 7, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是Python的内置数据类型？（多选）', options: { A: 'list', B: 'dict', C: 'array', D: 'set' }, answer: 'ABD', analysis: 'array不是Python内置类型', default_score: 10, source: 'ai' },
    { id: 11, course_id: 1, knowledge_point_id: 8, question_type: 'short_answer', difficulty: 'hard', content: '请编写代码，打开一个文件并读取所有行。', options: null, answer: 'with open("file.txt", "r") as f:\n    lines = f.readlines()', analysis: '考察文件操作与with语句', default_score: 10, source: 'ai' },
    { id: 12, course_id: 1, knowledge_point_id: 9, question_type: 'single_choice', difficulty: 'hard', content: 'try-except语句中，finally块什么时候执行？', options: { A: '仅当没有异常时', B: '仅当有异常时', C: '无论是否有异常都执行', D: '仅在except块执行后' }, answer: 'C', analysis: 'finally块无论是否发生异常都会执行', default_score: 10, source: 'ai' },
    { id: 13, course_id: 1, knowledge_point_id: 9, question_type: 'judgment', difficulty: 'medium', content: 'Python中，except块可以捕获所有类型的异常。', options: null, answer: '正确', analysis: 'except Exception可以捕获所有常规异常', default_score: 5, source: 'ai' },
    { id: 14, course_id: 1, knowledge_point_id: 10, question_type: 'short_answer', difficulty: 'hard', content: '请定义一个Student类，包含name和score属性，以及一个方法判断是否及格（score>=60）。', options: null, answer: 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', analysis: '考察面向对象编程基础', default_score: 15, source: 'ai' },
    { id: 15, course_id: 1, knowledge_point_id: 10, question_type: 'code', difficulty: 'hard', content: '请用Python实现一个栈类，包含push、pop、is_empty方法。', options: null, answer: 'class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        return self.items.pop()\n    def is_empty(self):\n        return len(self.items) == 0', analysis: '考察类实现和栈的基本操作', default_score: 15, source: 'ai' },
    { id: 16, course_id: 2, knowledge_point_id: 11, question_type: 'single_choice', difficulty: 'medium', content: '链表的优点是？', options: { A: '随机访问快', B: '插入删除快', C: '内存连续', D: '查找快' }, answer: 'B', analysis: '链表插入删除时间复杂度O(1)', default_score: 10, source: 'ai' },
    { id: 17, course_id: 2, knowledge_point_id: 11, question_type: 'fill_blank', difficulty: 'medium', content: '单链表中，每个节点包含数据域和____域。', options: null, answer: '指针', analysis: '单链表节点包含数据域和指针域', default_score: 5, source: 'ai' },
    { id: 18, course_id: 2, knowledge_point_id: 12, question_type: 'single_choice', difficulty: 'medium', content: '栈的特点是？', options: { A: 'FIFO', B: 'LIFO', C: '随机访问', D: '双端操作' }, answer: 'B', analysis: '栈是后进先出(LIFO)结构', default_score: 10, source: 'ai' },
    { id: 19, course_id: 2, knowledge_point_id: 12, question_type: 'judgment', difficulty: 'easy', content: '队列是先进先出(FIFO)的数据结构。', options: null, answer: '正确', analysis: '队列遵循先进先出原则', default_score: 5, source: 'ai' },
    { id: 20, course_id: 2, knowledge_point_id: 13, question_type: 'short_answer', difficulty: 'hard', content: '请写出二叉树的前序遍历序列（根->左->右）。树结构：根A，左子B，右子C，B的左子D，B的右子E。', options: null, answer: 'A B D E C', analysis: '前序遍历：先根再左后右', default_score: 15, source: 'ai' },
    { id: 21, course_id: 2, knowledge_point_id: 13, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是二叉树的遍历方式？（多选）', options: { A: '前序遍历', B: '中序遍历', C: '后序遍历', D: '随机遍历' }, answer: 'ABC', analysis: '二叉树有三种基本遍历方式', default_score: 10, source: 'ai' },
    { id: 22, course_id: 2, knowledge_point_id: 14, question_type: 'single_choice', difficulty: 'hard', content: '快速排序的平均时间复杂度是？', options: { A: 'O(n)', B: 'O(n log n)', C: 'O(n²)', D: 'O(log n)' }, answer: 'B', analysis: '快速排序平均时间复杂度O(n log n)', default_score: 10, source: 'ai' },
    { id: 23, course_id: 2, knowledge_point_id: 14, question_type: 'code', difficulty: 'hard', content: '请用Python实现冒泡排序算法。', options: null, answer: 'def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr', analysis: '考察排序算法实现', default_score: 15, source: 'ai' },
    { id: 24, course_id: 3, knowledge_point_id: 16, question_type: 'single_choice', difficulty: 'easy', content: 'SQL中，SELECT语句用于？', options: { A: '插入数据', B: '查询数据', C: '更新数据', D: '删除数据' }, answer: 'B', analysis: 'SELECT用于数据查询', default_score: 10, source: 'ai' },
    { id: 25, course_id: 3, knowledge_point_id: 16, question_type: 'fill_blank', difficulty: 'easy', content: 'SQL中，用于删除表的关键字是____ TABLE。', options: null, answer: 'DROP', analysis: 'DROP TABLE用于删除表', default_score: 5, source: 'ai' },
    { id: 26, course_id: 3, knowledge_point_id: 16, question_type: 'short_answer', difficulty: 'easy', content: '请写出查询students表中所有记录的SQL语句。', options: null, answer: 'SELECT * FROM students;', analysis: '基础查询语句', default_score: 10, source: 'ai' },
    { id: 27, course_id: 3, knowledge_point_id: 17, question_type: 'short_answer', difficulty: 'hard', content: '请写出查询每个班级平均分的SQL语句（假设有scores表和classes表）。', options: null, answer: 'SELECT c.class_name, AVG(s.score) as avg_score\nFROM scores s\nJOIN classes c ON s.class_id = c.id\nGROUP BY c.class_name;', analysis: '考察JOIN和GROUP BY', default_score: 15, source: 'ai' },
    { id: 28, course_id: 3, knowledge_point_id: 17, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是SQL的聚合函数？（多选）', options: { A: 'COUNT', B: 'SUM', C: 'AVG', D: 'PRINT' }, answer: 'ABC', analysis: 'COUNT、SUM、AVG是聚合函数', default_score: 10, source: 'ai' },
    { id: 29, course_id: 3, knowledge_point_id: 18, question_type: 'single_choice', difficulty: 'hard', content: '数据库索引的主要作用是？', options: { A: '节省存储空间', B: '加快查询速度', C: '保证数据完整性', D: '简化SQL语句' }, answer: 'B', analysis: '索引用于加速数据检索', default_score: 10, source: 'ai' },
    { id: 30, course_id: 3, knowledge_point_id: 18, question_type: 'judgment', difficulty: 'hard', content: '数据库表应该尽可能多地建立索引以提高查询性能。', options: null, answer: '错误', analysis: '过多索引会增加存储开销和写入延迟', default_score: 10, source: 'ai' },
  ]).run();
  console.log('  ✅ 题目完成 (30题)');

  // ===================== 7. 作业 =====================
  console.log('📋 插入作业...');
  db.insert(assignment).values([
    { id: 1, course_id: 1, teacher_id: 1, title: 'Python第一次作业', description: '涵盖变量与数据类型、控制流程、函数基础等核心知识点', question_ids: [1, 2, 3, 4, 5, 6], total_score: 100, start_time: '2026-07-15T08:00:00+08:00', end_time: '2026-07-18T23:59:00+08:00', status: 'published' },
    { id: 2, course_id: 1, teacher_id: 1, title: 'Python第二次作业', description: '涵盖字典集合、文件操作、异常处理、面向对象等进阶知识点', question_ids: [7, 8, 9, 10, 11], total_score: 100, start_time: '2026-07-18T08:00:00+08:00', end_time: '2026-07-22T23:59:00+08:00', status: 'published' },
    { id: 3, course_id: 2, teacher_id: 1, title: '数据结构第一次作业', description: '涵盖数组链表、栈队列、树、排序算法等核心知识点', question_ids: [12, 13, 14, 15, 16], total_score: 100, start_time: '2026-07-20T08:00:00+08:00', end_time: '2026-07-25T23:59:00+08:00', status: 'published' },
    { id: 4, course_id: 2, teacher_id: 1, title: '数据结构第二次作业', description: '涵盖图的遍历、最短路径、二分查找等知识点', question_ids: [17, 18, 19, 20, 21], total_score: 100, start_time: '2026-07-22T08:00:00+08:00', end_time: '2026-07-28T23:59:00+08:00', status: 'published' },
    { id: 5, course_id: 3, teacher_id: 1, title: '数据库原理第一次作业', description: '涵盖SQL查询、JOIN、子查询等核心知识点', question_ids: [17, 18, 19, 20, 21], total_score: 100, start_time: '2026-07-25T08:00:00+08:00', end_time: '2026-07-30T23:59:00+08:00', status: 'published' },
    { id: 6, course_id: 3, teacher_id: 1, title: '数据库原理第二次作业', description: '涵盖数据库范式、索引优化、事务等高级知识点', question_ids: [1, 2, 3, 4, 5, 6], total_score: 100, start_time: '2026-07-28T08:00:00+08:00', end_time: '2026-08-05T23:59:00+08:00', status: 'published' },
  ]).run();
  console.log('  ✅ 作业完成 (6个)');

  // ===================== 8. 作答 + 批改 + 错题 =====================
  console.log('✍️  插入作答/批改/错题...');
  let ansId = 0, gtId = 0, ebId = 0;

  // 作业1: 10学生 x 6题
  const a1Data = [
    { sid: 3, ans: ['C', 'C', '正确', 'B', 'type()', 'B'], scr: [22, 11, 11, 11, 23, 22] },
    { sid: 4, ans: ['C', 'C', '正确', 'B', 'type()', 'B'], scr: [22, 11, 11, 11, 23, 22] },
    { sid: 5, ans: ['C', 'C', '正确', 'A', 'type()', 'B'], scr: [22, 11, 11, 0, 23, 22] },
    { sid: 6, ans: ['C', 'C', '正确', 'B', 'type()', 'B'], scr: [22, 11, 11, 11, 18, 22] },
    { sid: 7, ans: ['C', 'C', '正确', 'B', 'type', 'B'], scr: [22, 11, 11, 11, 15, 0] },
    { sid: 8, ans: ['C', 'A', '正确', 'B', 'type()', 'B'], scr: [22, 0, 11, 11, 23, 22] },
    { sid: 9, ans: ['C', 'C', '正确', 'B', 'type()', 'B'], scr: [22, 11, 11, 11, 23, 22] },
    { sid: 10, ans: ['A', 'C', '错误', 'C', 'type', 'B'], scr: [0, 11, 0, 0, 10, 0] },
    { sid: 11, ans: ['C', 'C', '正确', 'B', 'type()', 'B'], scr: [22, 11, 11, 11, 23, 22] },
    { sid: 12, ans: ['B', 'C', '正确', 'B', 'type()', 'B'], scr: [0, 11, 11, 11, 12, 22] },
  ];
  const a1Full = [22, 11, 11, 11, 23, 22];
  const a1Ref = ['C', 'C', '正确', 'B', 'type()', 'B'];
  const a1Kps = [1, 1, 1, 3, 3, 4];

  for (const d of a1Data) {
    for (let qi = 0; qi < 6; qi++) {
      ansId++; gtId++;
      db.insert(answer).values({ id: ansId, assignment_id: 1, student_id: d.sid, question_id: qi + 1, student_answer: d.ans[qi], is_submitted: true, submitted_at: '2026-07-17T20:00:00+08:00' }).run();
      db.insert(gradingTask).values({ id: gtId, answer_id: ansId, assignment_id: 1, student_id: d.sid, question_id: qi + 1, knowledge_point_id: a1Kps[qi], full_score: a1Full[qi], question_type: qi < 4 ? 'single_choice' : (qi === 4 ? 'fill_blank' : 'code'), reference_answer: a1Ref[qi], student_answer: d.ans[qi], total_score: d.scr[qi], status: 'completed', overall_comment: d.scr[qi] >= a1Full[qi] * 0.8 ? '优秀' : d.scr[qi] > 0 ? '需加强' : '未掌握', completed_at: '2026-07-18T10:00:00+08:00' }).run();
      if (d.scr[qi] < a1Full[qi] * 0.8) {
        ebId++;
        const et = d.scr[qi] === 0 ? 'empty' : ['knowledge', 'logic', 'careless', 'concept_confusion', 'method_error'][qi % 5];
        db.insert(errorBook).values({ id: ebId, student_id: d.sid, question_id: qi + 1, knowledge_point_id: a1Kps[qi], assignment_id: 1, grading_task_id: gtId, student_answer: d.ans[qi], correct_answer: a1Ref[qi], error_type: et, error_analysis: `得分${d.scr[qi]}/${a1Full[qi]}`, review_status: 'pending' }).run();
      }
    }
  }

  // 作业2: 5学生 x 5题
  const a2Data = [
    { sid: 3, ans: ['C', 'with open("file.txt", "r") as f:\n    lines = f.readlines()', 'C', 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', 'B'], scr: [20, 20, 20, 20, 20] },
    { sid: 4, ans: ['C', 'with open("file.txt", "r") as f:\n    lines = f.readlines()', 'C', 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', 'B'], scr: [20, 20, 20, 20, 20] },
    { sid: 5, ans: ['C', 'with open("file.txt", "r") as f:\n    lines = f.readlines()', 'C', 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', 'B'], scr: [20, 20, 20, 20, 20] },
    { sid: 7, ans: ['B', 'f = open("file.txt"); lines = f.read()', 'C', 'class Student:\n    pass', 'A'], scr: [0, 8, 20, 0, 0] },
    { sid: 10, ans: ['A', '', 'B', '', 'A'], scr: [0, 0, 0, 0, 0] },
  ];
  const a2Full = [20, 20, 20, 20, 20];
  const a2Ref = ['C', 'with open("file.txt", "r") as f:\n    lines = f.readlines()', 'C', 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', 'B'];
  const a2Kps = [7, 8, 9, 10, 10];

  for (const d of a2Data) {
    for (let qi = 0; qi < 5; qi++) {
      ansId++; gtId++;
      db.insert(answer).values({ id: ansId, assignment_id: 2, student_id: d.sid, question_id: qi + 7, student_answer: d.ans[qi], is_submitted: true, submitted_at: '2026-07-21T20:00:00+08:00' }).run();
      db.insert(gradingTask).values({ id: gtId, answer_id: ansId, assignment_id: 2, student_id: d.sid, question_id: qi + 7, knowledge_point_id: a2Kps[qi], full_score: a2Full[qi], question_type: qi <= 2 ? 'single_choice' : 'short_answer', reference_answer: a2Ref[qi], student_answer: d.ans[qi], total_score: d.scr[qi], status: 'completed', overall_comment: d.scr[qi] >= 10 ? '优秀' : d.scr[qi] > 0 ? '需加强' : '未掌握', completed_at: '2026-07-22T10:00:00+08:00' }).run();
      if (d.scr[qi] < 10) {
        ebId++;
        db.insert(errorBook).values({ id: ebId, student_id: d.sid, question_id: qi + 7, knowledge_point_id: a2Kps[qi], assignment_id: 2, grading_task_id: gtId, student_answer: d.ans[qi], correct_answer: a2Ref[qi], error_type: d.scr[qi] === 0 ? 'empty' : 'knowledge', error_analysis: `得分${d.scr[qi]}/${a2Full[qi]}`, review_status: 'pending' }).run();
      }
    }
  }

  // 作业3: 4学生 x 5题
  const a3Data = [
    { sid: 3, ans: ['B', '指针', 'B', '正确', 'A B D E C'], scr: [20, 20, 20, 20, 20] },
    { sid: 4, ans: ['B', '指针', 'B', '正确', 'A B D E C'], scr: [20, 20, 20, 20, 20] },
    { sid: 5, ans: ['B', '指针', 'B', '正确', 'A B D E C'], scr: [20, 20, 20, 20, 20] },
    { sid: 8, ans: ['B', '指针', 'B', '错误', 'A B C D E'], scr: [20, 20, 20, 0, 0] },
  ];
  const a3Full = [20, 20, 20, 20, 20];
  const a3Ref = ['B', '指针', 'B', '正确', 'A B D E C'];
  const a3Kps = [11, 11, 12, 12, 13];

  for (const d of a3Data) {
    for (let qi = 0; qi < 5; qi++) {
      ansId++; gtId++;
      db.insert(answer).values({ id: ansId, assignment_id: 3, student_id: d.sid, question_id: qi + 12, student_answer: d.ans[qi], is_submitted: true, submitted_at: '2026-07-23T20:00:00+08:00' }).run();
      db.insert(gradingTask).values({ id: gtId, answer_id: ansId, assignment_id: 3, student_id: d.sid, question_id: qi + 12, knowledge_point_id: a3Kps[qi], full_score: a3Full[qi], question_type: qi <= 1 ? 'single_choice' : (qi === 3 ? 'judgment' : 'short_answer'), reference_answer: a3Ref[qi], student_answer: d.ans[qi], total_score: d.scr[qi], status: 'completed', overall_comment: d.scr[qi] >= 16 ? '优秀' : d.scr[qi] > 0 ? '需加强' : '未掌握', completed_at: '2026-07-24T10:00:00+08:00' }).run();
      if (d.scr[qi] < 16) {
        ebId++;
        db.insert(errorBook).values({ id: ebId, student_id: d.sid, question_id: qi + 12, knowledge_point_id: a3Kps[qi], assignment_id: 3, grading_task_id: gtId, student_answer: d.ans[qi], correct_answer: a3Ref[qi], error_type: d.scr[qi] === 0 ? 'empty' : 'knowledge', error_analysis: `得分${d.scr[qi]}/${a3Full[qi]}`, review_status: 'pending' }).run();
      }
    }
  }
  console.log(`  ✅ 作答${ansId}条, 批改${gtId}条, 错题${ebId}条`);

  // ===================== 9. 知识掌握度 =====================
  console.log('📈 插入知识掌握度...');
  const masteryValues: any[] = [];
  let mlId = 0;
  for (const studentId of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const level = studentId <= 4 ? 'top' : studentId <= 9 ? 'medium' : 'weak';
    const base = { top: 90, medium: 72, weak: 48 }[level];
    const noise = { top: 7, medium: 10, weak: 14 }[level];
    for (let kp = 1; kp <= 10; kp++) {
      const decline = Math.floor((kp - 1) / 2) * 4;
      const adj = (kp % 3 === 0) ? -3 : 2;
      const n = ((Math.random() + Math.random() + Math.random() + Math.random()) / 2 - 1) * noise;
      const mastery = Math.round(Math.min(100, Math.max(5, base - decline + adj + n)));
      mlId++;
      masteryValues.push({ id: mlId, student_id: studentId, knowledge_point_id: kp, mastery_rate: mastery, error_count: Math.max(0, Math.round((level === 'top' ? 0.3 : level === 'medium' ? 0.8 : 1.5) + Math.floor((kp - 1) / 2) * 0.4)), recorded_at: `2026-07-${String(20 + Math.floor((kp - 1) / 2) * 3).padStart(2, '0')}` });
    }
  }
  db.insert(knowledgeMasteryLog).values(masteryValues).run();
  console.log(`  ✅ 知识掌握度完成 (${masteryValues.length}条)`);

  // ===================== 保存 + 验证 =====================
  saveDb();
  console.log('\n💾 已保存到磁盘');

  // 验证
  const vMem = db.select().from(user).all();
  const Sql = await (require('sql.js').default || require('sql.js'))();
  const raw = fs.readFileSync(dbPath);
  const db2 = new Sql.Database(new Uint8Array(raw));
  const vDisk = db2.exec('SELECT count(*) AS c FROM user');
  db2.close();

  console.log(`🔍 验证: 内存${vMem.length}用户 / 磁盘${vDisk[0].values[0][0]}用户`);

  if (vMem.length === 0 || vDisk[0].values[0][0] === 0) {
    console.error('❌ 种子数据写入失败！');
    process.exit(1);
  }

  console.log('\n🎉 种子数据插入完成！');
  console.log('================================');
  console.log(`  教师:2 学生:10 课程:3 题目:30 作业:6`);
  console.log(`  作答:${ansId} 批改:${gtId} 错题:${ebId}`);
  console.log('================================');
}

seed().catch(err => { console.error('❌', err); process.exit(1); });

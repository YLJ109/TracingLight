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
    { id: 4, name: '深度学习框架', short_name: 'DL', description: 'TensorFlow/PyTorch框架与深度学习实践', teacher_id: 2, class_id: 1, semester: '2025-2026-2' },
  ]).run();
  console.log('  ✅ 课程完成 (4门)');

  // ===================== 4. 知识点 =====================
  console.log('🧠 插入知识点...');
  const kpValues = [
    // Python (id 1-10) — 保持不变
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
    // 数据结构 (id 11-27) — 保持11-14名称不变, 新增15-27
    { id: 11, course_id: 2, name: '数组与链表', difficulty: 'medium', sort_order: 1 },
    { id: 12, course_id: 2, name: '栈与队列', difficulty: 'medium', sort_order: 2 },
    { id: 13, course_id: 2, name: '树与二叉树', difficulty: 'hard', sort_order: 3 },
    { id: 14, course_id: 2, name: '排序算法', difficulty: 'hard', sort_order: 4 },
    { id: 15, course_id: 2, name: '链表进阶', difficulty: 'hard', sort_order: 5 },
    { id: 16, course_id: 2, name: '串与数组', difficulty: 'medium', sort_order: 6 },
    { id: 17, course_id: 2, name: '广义表', difficulty: 'hard', sort_order: 7 },
    { id: 18, course_id: 2, name: '哈夫曼树', difficulty: 'hard', sort_order: 8 },
    { id: 19, course_id: 2, name: '图的存储与遍历', difficulty: 'hard', sort_order: 9 },
    { id: 20, course_id: 2, name: '图的应用', difficulty: 'hard', sort_order: 10 },
    { id: 21, course_id: 2, name: '查找算法', difficulty: 'medium', sort_order: 11 },
    { id: 22, course_id: 2, name: '二叉排序树', difficulty: 'hard', sort_order: 12 },
    { id: 23, course_id: 2, name: '插入与选择排序', difficulty: 'medium', sort_order: 13 },
    { id: 24, course_id: 2, name: '交换与归并排序', difficulty: 'hard', sort_order: 14 },
    { id: 25, course_id: 2, name: '时间复杂度', difficulty: 'easy', sort_order: 15 },
    { id: 26, course_id: 2, name: '空间复杂度', difficulty: 'easy', sort_order: 16 },
    { id: 27, course_id: 2, name: '算法优化策略', difficulty: 'hard', sort_order: 17 },
    // 数据库原理 (id 28-41) — 原15-18重新编号为28-31
    { id: 28, course_id: 3, name: '关系模型与ER图', difficulty: 'medium', sort_order: 1 },
    { id: 29, course_id: 3, name: 'SQL基础查询', difficulty: 'easy', sort_order: 2 },
    { id: 30, course_id: 3, name: 'SQL高级查询', difficulty: 'hard', sort_order: 3 },
    { id: 31, course_id: 3, name: '索引与优化', difficulty: 'hard', sort_order: 4 },
    { id: 32, course_id: 3, name: '事务与并发控制', difficulty: 'hard', sort_order: 5 },
    { id: 33, course_id: 3, name: '数据库范式', difficulty: 'medium', sort_order: 6 },
    { id: 34, course_id: 3, name: '存储过程与触发器', difficulty: 'hard', sort_order: 7 },
    { id: 35, course_id: 3, name: '视图与权限管理', difficulty: 'medium', sort_order: 8 },
    { id: 36, course_id: 3, name: '数据库备份与恢复', difficulty: 'medium', sort_order: 9 },
    { id: 37, course_id: 3, name: 'NoSQL数据库简介', difficulty: 'easy', sort_order: 10 },
    { id: 38, course_id: 3, name: '数据库设计方法论', difficulty: 'medium', sort_order: 11 },
    { id: 39, course_id: 3, name: 'JDBC与数据库连接', difficulty: 'medium', sort_order: 12 },
    { id: 40, course_id: 3, name: '数据库安全与加密', difficulty: 'hard', sort_order: 13 },
    { id: 41, course_id: 3, name: '分布式数据库', difficulty: 'hard', sort_order: 14 },
    // 深度学习框架 (id 42-143) — 102个知识点
    { id: 42, course_id: 4, name: '人工智能的概念', difficulty: 'easy', sort_order: 1 },
    { id: 43, course_id: 4, name: '机器学习的定义', difficulty: 'easy', sort_order: 2 },
    { id: 44, course_id: 4, name: '深度学习的定义', difficulty: 'easy', sort_order: 3 },
    { id: 45, course_id: 4, name: 'AI/ML/DL三者关系', difficulty: 'medium', sort_order: 4 },
    { id: 46, course_id: 4, name: '监督学习', difficulty: 'easy', sort_order: 5 },
    { id: 47, course_id: 4, name: '无监督学习', difficulty: 'medium', sort_order: 6 },
    { id: 48, course_id: 4, name: '半监督学习', difficulty: 'medium', sort_order: 7 },
    { id: 49, course_id: 4, name: '强化学习', difficulty: 'hard', sort_order: 8 },
    { id: 50, course_id: 4, name: '训练数据与模型', difficulty: 'medium', sort_order: 9 },
    { id: 51, course_id: 4, name: '分类、决策与预测任务', difficulty: 'medium', sort_order: 10 },
    { id: 52, course_id: 4, name: '图像识别', difficulty: 'medium', sort_order: 11 },
    { id: 53, course_id: 4, name: '人脸识别', difficulty: 'hard', sort_order: 12 },
    { id: 54, course_id: 4, name: '图像分割', difficulty: 'hard', sort_order: 13 },
    { id: 55, course_id: 4, name: '自然语言处理', difficulty: 'hard', sort_order: 14 },
    { id: 56, course_id: 4, name: '语音识别', difficulty: 'hard', sort_order: 15 },
    { id: 57, course_id: 4, name: 'TensorFlow框架', difficulty: 'medium', sort_order: 16 },
    { id: 58, course_id: 4, name: 'Keras高级接口', difficulty: 'easy', sort_order: 17 },
    { id: 59, course_id: 4, name: 'PyTorch框架', difficulty: 'medium', sort_order: 18 },
    { id: 60, course_id: 4, name: '主流框架比较', difficulty: 'medium', sort_order: 19 },
    { id: 61, course_id: 4, name: '深度学习工程流程', difficulty: 'medium', sort_order: 20 },
    { id: 62, course_id: 4, name: 'NumPy数据类型', difficulty: 'medium', sort_order: 21 },
    { id: 63, course_id: 4, name: 'ndarray数组对象', difficulty: 'medium', sort_order: 22 },
    { id: 64, course_id: 4, name: '数组创建函数', difficulty: 'easy', sort_order: 23 },
    { id: 65, course_id: 4, name: '数组属性', difficulty: 'easy', sort_order: 24 },
    { id: 66, course_id: 4, name: '数组索引', difficulty: 'easy', sort_order: 25 },
    { id: 67, course_id: 4, name: '数组切片', difficulty: 'medium', sort_order: 26 },
    { id: 68, course_id: 4, name: '数组广播', difficulty: 'hard', sort_order: 27 },
    { id: 69, course_id: 4, name: '数组逐元素运算', difficulty: 'easy', sort_order: 28 },
    { id: 70, course_id: 4, name: 'NumPy随机函数', difficulty: 'medium', sort_order: 29 },
    { id: 71, course_id: 4, name: '数组形状变换', difficulty: 'medium', sort_order: 30 },
    { id: 72, course_id: 4, name: 'Matplotlib图形要素', difficulty: 'medium', sort_order: 31 },
    { id: 73, course_id: 4, name: '折线图绘制', difficulty: 'easy', sort_order: 32 },
    { id: 74, course_id: 4, name: '直方图绘制', difficulty: 'easy', sort_order: 33 },
    { id: 75, course_id: 4, name: '饼图绘制', difficulty: 'easy', sort_order: 34 },
    { id: 76, course_id: 4, name: '绘图基本步骤', difficulty: 'easy', sort_order: 35 },
    { id: 77, course_id: 4, name: 'scikit-learn数据集', difficulty: 'medium', sort_order: 36 },
    { id: 78, course_id: 4, name: 'scikit-learn模型训练', difficulty: 'medium', sort_order: 37 },
    { id: 79, course_id: 4, name: '训练集验证集测试集', difficulty: 'medium', sort_order: 38 },
    { id: 80, course_id: 4, name: '模型评估指标', difficulty: 'medium', sort_order: 39 },
    { id: 81, course_id: 4, name: '张量的维度', difficulty: 'hard', sort_order: 40 },
    { id: 82, course_id: 4, name: 'tf.constant常量张量', difficulty: 'medium', sort_order: 41 },
    { id: 83, course_id: 4, name: '张量索引', difficulty: 'medium', sort_order: 42 },
    { id: 84, course_id: 4, name: 'tf.reshape形状变换', difficulty: 'medium', sort_order: 43 },
    { id: 85, course_id: 4, name: '张量数学运算', difficulty: 'hard', sort_order: 44 },
    { id: 86, course_id: 4, name: '自动求导GradientTape', difficulty: 'hard', sort_order: 45 },
    { id: 87, course_id: 4, name: 'TensorBoard可视化', difficulty: 'medium', sort_order: 46 },
    { id: 88, course_id: 4, name: '生物神经元与感知器', difficulty: 'medium', sort_order: 47 },
    { id: 89, course_id: 4, name: '单层感知器', difficulty: 'medium', sort_order: 48 },
    { id: 90, course_id: 4, name: '前馈神经网络', difficulty: 'hard', sort_order: 49 },
    { id: 91, course_id: 4, name: '输入层隐藏层输出层', difficulty: 'medium', sort_order: 50 },
    { id: 92, course_id: 4, name: '阶跃函数', difficulty: 'easy', sort_order: 51 },
    { id: 93, course_id: 4, name: 'Tanh函数', difficulty: 'easy', sort_order: 52 },
    { id: 94, course_id: 4, name: 'Softmax函数', difficulty: 'medium', sort_order: 53 },
    { id: 95, course_id: 4, name: '前向传播', difficulty: 'hard', sort_order: 54 },
    { id: 96, course_id: 4, name: '均方误差损失函数', difficulty: 'medium', sort_order: 55 },
    { id: 97, course_id: 4, name: '梯度下降', difficulty: 'hard', sort_order: 56 },
    { id: 98, course_id: 4, name: '反向传播', difficulty: 'hard', sort_order: 57 },
    { id: 99, course_id: 4, name: '早停法', difficulty: 'medium', sort_order: 58 },
    { id: 100, course_id: 4, name: '感受野与局部连接', difficulty: 'hard', sort_order: 59 },
    { id: 101, course_id: 4, name: '卷积层', difficulty: 'hard', sort_order: 60 },
    { id: 102, course_id: 4, name: '填充与步长', difficulty: 'medium', sort_order: 61 },
    { id: 103, course_id: 4, name: 'SAME与VALID填充', difficulty: 'medium', sort_order: 62 },
    { id: 104, course_id: 4, name: '池化层', difficulty: 'medium', sort_order: 63 },
    { id: 105, course_id: 4, name: 'Flatten层', difficulty: 'easy', sort_order: 64 },
    { id: 106, course_id: 4, name: 'VGG网络', difficulty: 'hard', sort_order: 65 },
    { id: 107, course_id: 4, name: 'LeNet网络', difficulty: 'medium', sort_order: 66 },
    { id: 108, course_id: 4, name: 'CNN图像分类流程', difficulty: 'hard', sort_order: 67 },
    { id: 109, course_id: 4, name: '词向量表示', difficulty: 'hard', sort_order: 68 },
    { id: 110, course_id: 4, name: '序列填充', difficulty: 'medium', sort_order: 69 },
    { id: 111, course_id: 4, name: '文本序列化', difficulty: 'medium', sort_order: 70 },
    { id: 112, course_id: 4, name: '循环神经网络概念', difficulty: 'hard', sort_order: 71 },
    { id: 113, course_id: 4, name: '隐藏状态', difficulty: 'hard', sort_order: 72 },
    { id: 114, course_id: 4, name: '序列输出与最终输出', difficulty: 'medium', sort_order: 73 },
    { id: 115, course_id: 4, name: '文本分类流程', difficulty: 'hard', sort_order: 74 },
    { id: 116, course_id: 4, name: 'RNN时间步展开', difficulty: 'hard', sort_order: 75 },
    { id: 117, course_id: 4, name: 'LSTM长短时记忆网络', difficulty: 'hard', sort_order: 76 },
    { id: 118, course_id: 4, name: 'LSTM遗忘门', difficulty: 'hard', sort_order: 77 },
    { id: 119, course_id: 4, name: 'LSTM输入门', difficulty: 'hard', sort_order: 78 },
    { id: 120, course_id: 4, name: 'LSTM输出门', difficulty: 'hard', sort_order: 79 },
    { id: 121, course_id: 4, name: 'GRU门控循环单元', difficulty: 'hard', sort_order: 80 },
    { id: 122, course_id: 4, name: '文本预测任务', difficulty: 'hard', sort_order: 81 },
    { id: 123, course_id: 4, name: '循环网络模型训练', difficulty: 'hard', sort_order: 82 },
    { id: 124, course_id: 4, name: '生成模型与判别模型', difficulty: 'hard', sort_order: 83 },
    { id: 125, course_id: 4, name: '随机噪声向量', difficulty: 'medium', sort_order: 84 },
    { id: 126, course_id: 4, name: '判别器损失', difficulty: 'hard', sort_order: 85 },
    { id: 127, course_id: 4, name: '生成器损失', difficulty: 'hard', sort_order: 86 },
    { id: 128, course_id: 4, name: '生成对抗训练', difficulty: 'hard', sort_order: 87 },
    { id: 129, course_id: 4, name: 'DCGAN深度卷积GAN', difficulty: 'hard', sort_order: 88 },
    { id: 130, course_id: 4, name: '转置卷积层', difficulty: 'hard', sort_order: 89 },
    { id: 131, course_id: 4, name: 'GAN训练步骤', difficulty: 'hard', sort_order: 90 },
    { id: 132, course_id: 4, name: '生成图像可视化', difficulty: 'medium', sort_order: 91 },
    { id: 133, course_id: 4, name: '真实样本与生成样本', difficulty: 'medium', sort_order: 92 },
    { id: 134, course_id: 4, name: 'GAN评估指标', difficulty: 'hard', sort_order: 93 },
    { id: 135, course_id: 4, name: '迁移学习概念', difficulty: 'medium', sort_order: 94 },
    { id: 136, course_id: 4, name: '特征迁移', difficulty: 'hard', sort_order: 95 },
    { id: 137, course_id: 4, name: '冻结卷积基', difficulty: 'hard', sort_order: 96 },
    { id: 138, course_id: 4, name: '微调策略', difficulty: 'hard', sort_order: 97 },
    { id: 139, course_id: 4, name: '预训练模型选择', difficulty: 'medium', sort_order: 98 },
    { id: 140, course_id: 4, name: '数据增强技术', difficulty: 'medium', sort_order: 99 },
    { id: 141, course_id: 4, name: '领域自适应', difficulty: 'hard', sort_order: 100 },
    { id: 142, course_id: 4, name: '多任务学习', difficulty: 'hard', sort_order: 101 },
    { id: 143, course_id: 4, name: '迁移学习实战流程', difficulty: 'hard', sort_order: 102 },
  ]).run();
  console.log('  ✅ 知识点完成 (143个)');

  // ===================== 5. 知识图谱节点 =====================
  console.log('🗺️  插入知识图谱...');
  const KGN: any[] = []; let nid = 0;
  const addNode = (kpId: number, cid: number, name: string, lvl: number, parentId: number|null, order: number, color: string, leaf: boolean) => {
    nid++; KGN.push({ id: nid, knowledge_point_id: kpId, course_id: cid, node_name: name, node_level: lvl, parent_node_id: parentId, display_order: order, color_hex: color, is_leaf: leaf });
    return nid;
  };

  // 课程1: Python程序设计
  const pyRoot = addNode(1,1,'Python程序设计',0,null,1,'#1e293b',false);
  const pyCh1 = addNode(1,1,'第1章 Python基础语法',1,pyRoot,1,'#0d9488',false);
  const pySec11 = addNode(1,1,'1.1 基本语法元素',2,pyCh1,1,'#14b8a6',false);
  addNode(1,1,'变量与数据类型',3,pySec11,1,'#99f6e4',true); addNode(2,1,'运算符与表达式',3,pySec11,2,'#99f6e4',true);
  const pySec12 = addNode(3,1,'1.2 输入与输出',2,pyCh1,2,'#14b8a6',false);
  addNode(3,1,'流程控制',3,pySec12,1,'#99f6e4',true); addNode(4,1,'循环结构',3,pySec12,2,'#99f6e4',true);
  const pyCh2 = addNode(5,1,'第2章 函数与模块',1,pyRoot,2,'#2563eb',false);
  const pySec21 = addNode(5,1,'2.1 函数定义',2,pyCh2,1,'#3b82f6',false);
  addNode(5,1,'函数定义与调用',3,pySec21,1,'#bfdbfe',true);
  const pySec22 = addNode(6,1,'2.2 复合数据类型',2,pyCh2,2,'#3b82f6',false);
  addNode(6,1,'列表与元组',3,pySec22,1,'#bfdbfe',true); addNode(7,1,'字典与集合',3,pySec22,2,'#bfdbfe',true);
  const pyCh3 = addNode(8,1,'第3章 文件与面向对象',1,pyRoot,3,'#7c3aed',false);
  const pySec31 = addNode(8,1,'3.1 文件与异常',2,pyCh3,1,'#8b5cf6',false);
  addNode(8,1,'文件操作',3,pySec31,1,'#ddd6fe',true); addNode(9,1,'异常处理',3,pySec31,2,'#ddd6fe',true);
  const pySec32 = addNode(10,1,'3.2 面向对象',2,pyCh3,2,'#8b5cf6',false);
  addNode(10,1,'面向对象基础',3,pySec32,1,'#ddd6fe',true);

  // 课程2: 数据结构与算法
  const dsRoot = addNode(11,2,'数据结构与算法',0,null,2,'#1e293b',false);
  const dsCh1 = addNode(11,2,'第1章 线性结构',1,dsRoot,1,'#0d9488',false);
  const dsSec11 = addNode(11,2,'1.1 线性表与链表',2,dsCh1,1,'#14b8a6',false);
  addNode(11,2,'数组与链表',3,dsSec11,1,'#99f6e4',true); addNode(15,2,'链表进阶',3,dsSec11,2,'#99f6e4',true);
  const dsSec12 = addNode(12,2,'1.2 栈与队列',2,dsCh1,2,'#14b8a6',false);
  addNode(12,2,'栈与队列',3,dsSec12,1,'#99f6e4',true); addNode(16,2,'串与数组',3,dsSec12,2,'#99f6e4',true); addNode(17,2,'广义表',3,dsSec12,3,'#99f6e4',true);
  const dsCh2 = addNode(13,2,'第2章 树与图',1,dsRoot,2,'#2563eb',false);
  const dsSec21 = addNode(13,2,'2.1 树结构',2,dsCh2,1,'#3b82f6',false);
  addNode(13,2,'树与二叉树',3,dsSec21,1,'#bfdbfe',true); addNode(18,2,'哈夫曼树',3,dsSec21,2,'#bfdbfe',true);
  const dsSec22 = addNode(19,2,'2.2 图结构',2,dsCh2,2,'#3b82f6',false);
  addNode(19,2,'图的存储与遍历',3,dsSec22,1,'#bfdbfe',true); addNode(20,2,'图的应用',3,dsSec22,2,'#bfdbfe',true);
  const dsCh3 = addNode(21,2,'第3章 查找与排序',1,dsRoot,3,'#7c3aed',false);
  const dsSec31 = addNode(21,2,'3.1 查找',2,dsCh3,1,'#8b5cf6',false);
  addNode(21,2,'查找算法',3,dsSec31,1,'#ddd6fe',true); addNode(22,2,'二叉排序树',3,dsSec31,2,'#ddd6fe',true);
  const dsSec32 = addNode(23,2,'3.2 排序',2,dsCh3,2,'#8b5cf6',false);
  addNode(23,2,'插入与选择排序',3,dsSec32,1,'#ddd6fe',true); addNode(24,2,'交换与归并排序',3,dsSec32,2,'#ddd6fe',true);
  const dsCh4 = addNode(25,2,'第4章 算法分析',1,dsRoot,4,'#db2777',false);
  const dsSec41 = addNode(25,2,'4.1 复杂度分析',2,dsCh4,1,'#ec4899',false);
  addNode(25,2,'时间复杂度',3,dsSec41,1,'#fbcfe8',true); addNode(26,2,'空间复杂度',3,dsSec41,2,'#fbcfe8',true); addNode(27,2,'算法优化策略',3,dsSec41,3,'#fbcfe8',true);

  // 课程3: 数据库原理
  const dbRoot = addNode(28,3,'数据库原理',0,null,3,'#1e293b',false);
  const dbCh1 = addNode(28,3,'第1章 数据库基础',1,dbRoot,1,'#0d9488',false);
  const dbSec11 = addNode(28,3,'1.1 关系模型',2,dbCh1,1,'#14b8a6',false);
  addNode(28,3,'关系模型与ER图',3,dbSec11,1,'#99f6e4',true); addNode(33,3,'数据库范式',3,dbSec11,2,'#99f6e4',true); addNode(38,3,'数据库设计方法论',3,dbSec11,3,'#99f6e4',true);
  const dbSec12 = addNode(29,3,'1.2 SQL基础',2,dbCh1,2,'#14b8a6',false);
  addNode(29,3,'SQL基础查询',3,dbSec12,1,'#99f6e4',true); addNode(35,3,'视图与权限管理',3,dbSec12,2,'#99f6e4',true);
  const dbCh2 = addNode(30,3,'第2章 高级SQL与优化',1,dbRoot,2,'#2563eb',false);
  const dbSec21 = addNode(30,3,'2.1 高级查询',2,dbCh2,1,'#3b82f6',false);
  addNode(30,3,'SQL高级查询',3,dbSec21,1,'#bfdbfe',true); addNode(31,3,'索引与优化',3,dbSec21,2,'#bfdbfe',true); addNode(34,3,'存储过程与触发器',3,dbSec21,3,'#bfdbfe',true);
  const dbSec22 = addNode(32,3,'2.2 事务与安全',2,dbCh2,2,'#3b82f6',false);
  addNode(32,3,'事务与并发控制',3,dbSec22,1,'#bfdbfe',true); addNode(40,3,'数据库安全与加密',3,dbSec22,2,'#bfdbfe',true); addNode(39,3,'JDBC与数据库连接',3,dbSec22,3,'#bfdbfe',true);
  const dbCh3 = addNode(36,3,'第3章 高级主题',1,dbRoot,3,'#7c3aed',false);
  const dbSec31 = addNode(36,3,'3.1 运维与NoSQL',2,dbCh3,1,'#8b5cf6',false);
  addNode(36,3,'数据库备份与恢复',3,dbSec31,1,'#ddd6fe',true); addNode(37,3,'NoSQL数据库简介',3,dbSec31,2,'#ddd6fe',true); addNode(41,3,'分布式数据库',3,dbSec31,3,'#ddd6fe',true);

  // 课程4: 深度学习框架 (7项目)
  const kpn: Record<number, string> = {};
  [42,'人工智能的概念',43,'机器学习的定义',44,'深度学习的定义',45,'AI/ML/DL三者关系',46,'监督学习',47,'无监督学习',48,'半监督学习',49,'强化学习',50,'训练数据与模型',51,'分类、决策与预测任务',52,'图像识别',53,'人脸识别',54,'图像分割',55,'自然语言处理',56,'语音识别',57,'TensorFlow框架',58,'Keras高级接口',59,'PyTorch框架',60,'主流框架比较',61,'深度学习工程流程',62,'NumPy数据类型',63,'ndarray数组对象',64,'数组创建函数',65,'数组属性',66,'数组索引',67,'数组切片',68,'数组广播',69,'数组逐元素运算',70,'NumPy随机函数',71,'数组形状变换',72,'Matplotlib图形要素',73,'折线图绘制',74,'直方图绘制',75,'饼图绘制',76,'绘图基本步骤',77,'scikit-learn数据集',78,'scikit-learn模型训练',79,'训练集验证集测试集',80,'模型评估指标',81,'张量的维度',82,'tf.constant常量张量',83,'张量索引',84,'tf.reshape形状变换',85,'张量数学运算',86,'自动求导GradientTape',87,'TensorBoard可视化',88,'生物神经元与感知器',89,'单层感知器',90,'前馈神经网络',91,'输入层隐藏层输出层',92,'阶跃函数',93,'Tanh函数',94,'Softmax函数',95,'前向传播',96,'均方误差损失函数',97,'梯度下降',98,'反向传播',99,'早停法',100,'感受野与局部连接',101,'卷积层',102,'填充与步长',103,'SAME与VALID填充',104,'池化层',105,'Flatten层',106,'VGG网络',107,'LeNet网络',108,'CNN图像分类流程',109,'词向量表示',110,'序列填充',111,'文本序列化',112,'循环神经网络概念',113,'隐藏状态',114,'序列输出与最终输出',115,'文本分类流程',116,'RNN时间步展开',117,'LSTM长短时记忆网络',118,'LSTM遗忘门',119,'LSTM输入门',120,'LSTM输出门',121,'GRU门控循环单元',122,'文本预测任务',123,'循环网络模型训练',124,'生成模型与判别模型',125,'随机噪声向量',126,'判别器损失',127,'生成器损失',128,'生成对抗训练',129,'DCGAN深度卷积GAN',130,'转置卷积层',131,'GAN训练步骤',132,'生成图像可视化',133,'真实样本与生成样本',134,'GAN评估指标',135,'迁移学习概念',136,'特征迁移',137,'冻结卷积基',138,'微调策略',139,'预训练模型选择',140,'数据增强技术',141,'领域自适应',142,'多任务学习',143,'迁移学习实战流程'].forEach((v,i,a)=>{if(typeof v==='number')kpn[v]=a[i+1] as string;});

  const dlC: [string,string,string][] = [['#0d9488','#14b8a6','#99f6e4'],['#2563eb','#3b82f6','#bfdbfe'],['#7c3aed','#8b5cf6','#ddd6fe'],['#db2777','#ec4899','#fbcfe8'],['#d97706','#f59e0b','#fde68a'],['#0891b2','#06b6d4','#a5f3fc'],['#65a30d','#84cc16','#d9f99d']];
  const dlRoot = addNode(42,4,'深度学习框架',0,null,4,'#1e293b',false);
  // 项目一
  const p1 = addNode(42,4,'项目一 搭建深度学习开发环境',1,dlRoot,1,dlC[0][0],false);
  const p1s1 = addNode(42,4,'人工智能与深度学习导论',2,p1,1,dlC[0][1],false);
  for (let i=42;i<=51;i++) addNode(i,4,kpn[i],3,p1s1,i-41,dlC[0][2],true);
  const p1s2 = addNode(52,4,'应用领域与框架生态',2,p1,2,dlC[0][1],false);
  for (let i=52;i<=61;i++) addNode(i,4,kpn[i],3,p1s2,i-51,dlC[0][2],true);
  // 项目二
  const p2 = addNode(62,4,'项目二 夯实深度学习开发基础',1,dlRoot,2,dlC[1][0],false);
  const p2s1 = addNode(62,4,'NumPy科学计算',2,p2,1,dlC[1][1],false);
  for (let i=62;i<=71;i++) addNode(i,4,kpn[i],3,p2s1,i-61,dlC[1][2],true);
  const p2s2 = addNode(72,4,'可视化与机器学习库',2,p2,2,dlC[1][1],false);
  for (let i=72;i<=80;i++) addNode(i,4,kpn[i],3,p2s2,i-71,dlC[1][2],true);
  const p2s3 = addNode(81,4,'TensorFlow基础操作',2,p2,3,dlC[1][1],false);
  for (let i=81;i<=87;i++) addNode(i,4,kpn[i],3,p2s3,i-80,dlC[1][2],true);
  // 项目三
  const p3 = addNode(88,4,'项目三 构建神经网络',1,dlRoot,3,dlC[2][0],false);
  const p3s1 = addNode(88,4,'神经元与网络结构',2,p3,1,dlC[2][1],false);
  for (let i=88;i<=91;i++) addNode(i,4,kpn[i],3,p3s1,i-87,dlC[2][2],true);
  const p3s2 = addNode(92,4,'激活函数',2,p3,2,dlC[2][1],false);
  for (let i=92;i<=94;i++) addNode(i,4,kpn[i],3,p3s2,i-91,dlC[2][2],true);
  const p3s3 = addNode(95,4,'训练与优化',2,p3,3,dlC[2][1],false);
  for (let i=95;i<=99;i++) addNode(i,4,kpn[i],3,p3s3,i-94,dlC[2][2],true);
  // 项目四
  const p4 = addNode(100,4,'项目四 卷积神经网络',1,dlRoot,4,dlC[3][0],false);
  const p4s1 = addNode(100,4,'CNN基本思想',2,p4,1,dlC[3][1],false);
  for (let i=100;i<=105;i++) addNode(i,4,kpn[i],3,p4s1,i-99,dlC[3][2],true);
  const p4s2 = addNode(106,4,'经典CNN与实践',2,p4,2,dlC[3][1],false);
  for (let i=106;i<=108;i++) addNode(i,4,kpn[i],3,p4s2,i-105,dlC[3][2],true);
  const p4s3 = addNode(109,4,'自然语言数据处理',2,p4,3,dlC[3][1],false);
  for (let i=109;i<=112;i++) addNode(i,4,kpn[i],3,p4s3,i-108,dlC[3][2],true);
  const p4s4 = addNode(113,4,'循环神经网络结构',2,p4,4,dlC[3][1],false);
  for (let i=113;i<=116;i++) addNode(i,4,kpn[i],3,p4s4,i-112,dlC[3][2],true);
  // 项目五
  const p5 = addNode(117,4,'项目五 循环神经网络',1,dlRoot,5,dlC[4][0],false);
  const p5s1 = addNode(117,4,'门控循环网络',2,p5,1,dlC[4][1],false);
  for (let i=117;i<=123;i++) addNode(i,4,kpn[i],3,p5s1,i-116,dlC[4][2],true);
  // 项目六
  const p6 = addNode(124,4,'项目六 生成对抗神经网络',1,dlRoot,6,dlC[5][0],false);
  const p6s1 = addNode(124,4,'GAN模型与训练',2,p6,1,dlC[5][1],false);
  for (let i=124;i<=132;i++) addNode(i,4,kpn[i],3,p6s1,i-123,dlC[5][2],true);
  const p6s2 = addNode(133,4,'生成对抗网络核心知识点',2,p6,2,dlC[5][1],false);
  for (let i=133;i<=134;i++) addNode(i,4,kpn[i],3,p6s2,i-132,dlC[5][2],true);
  // 项目七
  const p7 = addNode(135,4,'项目七 迁移学习',1,dlRoot,7,dlC[6][0],false);
  const p7s1 = addNode(135,4,'迁移学习原理',2,p7,1,dlC[6][1],false);
  for (let i=135;i<=143;i++) addNode(i,4,kpn[i],3,p7s1,i-134,dlC[6][2],true);

  db.insert(knowledgeGraphNode).values(KGN).run();
  console.log(`  ✅ 知识图谱节点完成 (${KGN.length}个)`);

  // ===================== 6. 知识图谱边 =====================
  console.log('🔗 插入知识图谱边...');
  const KGE: any[] = []; let eid = 0;
  const addEdge = (from:number, to:number, type:string, desc:string) => { eid++; KGE.push({id:eid, from_node_id:from, to_node_id:to, relation_type:type, description:desc}); };

  // belong_to 边 (L0→L1→L2→L3)
  [1,2,3,4].forEach(cid => {
    KGN.filter(n=>n.course_id===cid&&n.node_level===1).forEach(c=>addEdge(c.parent_node_id!,c.id,'belong_to',''));
    KGN.filter(n=>n.course_id===cid&&n.node_level===2).forEach(s=>addEdge(s.parent_node_id!,s.id,'belong_to',''));
    KGN.filter(n=>n.course_id===cid&&n.node_level===3).forEach(k=>addEdge(k.parent_node_id!,k.id,'belong_to',''));
  });

  // prerequisite 学习依赖边 — 课程1 Python
  const pyN12 = KGN.findIndex(n=>n.knowledge_point_id===1&&n.course_id===1&&n.node_level===3&&n.node_name==='变量与数据类型')+1;
  const pyN13 = KGN.findIndex(n=>n.knowledge_point_id===3&&n.course_id===1&&n.node_level===3&&n.node_name==='流程控制')+1;
  const pyN14 = KGN.findIndex(n=>n.knowledge_point_id===4&&n.course_id===1&&n.node_level===3&&n.node_name==='循环结构')+1;
  const pyN15 = KGN.findIndex(n=>n.knowledge_point_id===5&&n.course_id===1&&n.node_level===3&&n.node_name==='函数定义与调用')+1;
  const pyN16 = KGN.findIndex(n=>n.knowledge_point_id===6&&n.course_id===1&&n.node_level===3&&n.node_name==='列表与元组')+1;
  const pyN17 = KGN.findIndex(n=>n.knowledge_point_id===7&&n.course_id===1&&n.node_level===3&&n.node_name==='字典与集合')+1;
  // const pyN18 = KGN.findIndex(n=>n.knowledge_point_id===8&&n.course_id===1&&n.node_level===3&&n.node_name==='文件操作')+1;

  addEdge(pyN12,pyN13,'prerequisite','变量是流程控制的基础'); addEdge(pyN13,pyN14,'prerequisite','流程控制是循环结构的前提');
  addEdge(pyN12,pyN15,'prerequisite','变量是函数定义的基础'); addEdge(pyN15,pyN16,'prerequisite','函数是复合数据类型的基础');
  addEdge(pyN16,pyN17,'prerequisite','列表理解是字典集合学习的前提');

  // prerequisite — 课程2 DS
  const dsN11 = KGN.findIndex(n=>n.knowledge_point_id===11&&n.course_id===2&&n.node_level===3&&n.node_name==='数组与链表')+1;
  const dsN15 = KGN.findIndex(n=>n.knowledge_point_id===15&&n.course_id===2&&n.node_level===3&&n.node_name==='链表进阶')+1;
  const dsN12 = KGN.findIndex(n=>n.knowledge_point_id===12&&n.course_id===2&&n.node_level===3&&n.node_name==='栈与队列')+1;
  const dsN13 = KGN.findIndex(n=>n.knowledge_point_id===13&&n.course_id===2&&n.node_level===3&&n.node_name==='树与二叉树')+1;
  const dsN19 = KGN.findIndex(n=>n.knowledge_point_id===19&&n.course_id===2&&n.node_level===3&&n.node_name==='图的存储与遍历')+1;
  const dsN21 = KGN.findIndex(n=>n.knowledge_point_id===21&&n.course_id===2&&n.node_level===3&&n.node_name==='查找算法')+1;
  const dsN23 = KGN.findIndex(n=>n.knowledge_point_id===23&&n.course_id===2&&n.node_level===3&&n.node_name==='插入与选择排序')+1;
  addEdge(dsN11,dsN15,'prerequisite','线性表是链表进阶的基础'); addEdge(dsN15,dsN12,'prerequisite','链表是栈与队列的基础');
  addEdge(dsN12,dsN13,'prerequisite','栈队列是树结构的前提'); addEdge(dsN13,dsN19,'prerequisite','树是图结构的基础');
  addEdge(dsN19,dsN21,'prerequisite','图是查找算法的基础'); addEdge(dsN21,dsN23,'prerequisite','查找是排序的基础');

  // prerequisite — 课程3 DB
  const dbN28 = KGN.findIndex(n=>n.knowledge_point_id===28&&n.course_id===3&&n.node_level===3&&n.node_name==='关系模型与ER图')+1;
  const dbN29 = KGN.findIndex(n=>n.knowledge_point_id===29&&n.course_id===3&&n.node_level===3&&n.node_name==='SQL基础查询')+1;
  const dbN30 = KGN.findIndex(n=>n.knowledge_point_id===30&&n.course_id===3&&n.node_level===3&&n.node_name==='SQL高级查询')+1;
  const dbN31 = KGN.findIndex(n=>n.knowledge_point_id===31&&n.course_id===3&&n.node_level===3&&n.node_name==='索引与优化')+1;
  const dbN32 = KGN.findIndex(n=>n.knowledge_point_id===32&&n.course_id===3&&n.node_level===3&&n.node_name==='事务与并发控制')+1;
  addEdge(dbN28,dbN29,'prerequisite','关系模型是SQL基础的前提'); addEdge(dbN29,dbN30,'prerequisite','SQL基础是高级查询的前提');
  addEdge(dbN30,dbN31,'prerequisite','高级查询是索引优化的前提'); addEdge(dbN31,dbN32,'prerequisite','索引是事务并发的基础');

  // prerequisite — 课程4 DL 项目间 (L1级别节点)
  const dlL1 = KGN.filter(n=>n.course_id===4&&n.node_level===1).sort((a,b)=>a.display_order-b.display_order);
  for (let i=0;i<dlL1.length-1;i++) addEdge(dlL1[i].id,dlL1[i+1].id,'prerequisite','');

  // related 关联边
  addEdge(dsN11,pyN12,'related','数据结构与基础语法关联');
  addEdge(dsN13,pyN16,'related','链表与列表概念对比');
  addEdge(dbN32,dsN12,'related','事务与栈操作概念关联');

  db.insert(knowledgeGraphEdge).values(KGE).run();
  console.log(`  ✅ 知识图谱边完成 (${KGE.length}条)`);

  // ===================== 7. 题目 =====================
  console.log('📝 插入题目...');
  db.insert(question).values([
    // ===== 已有Python题 1-30 (保持ID和内容不变) =====
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
    { id: 24, course_id: 3, knowledge_point_id: 29, question_type: 'single_choice', difficulty: 'easy', content: 'SQL中，SELECT语句用于？', options: { A: '插入数据', B: '查询数据', C: '更新数据', D: '删除数据' }, answer: 'B', analysis: 'SELECT用于数据查询', default_score: 10, source: 'ai' },
    { id: 25, course_id: 3, knowledge_point_id: 29, question_type: 'fill_blank', difficulty: 'easy', content: 'SQL中，用于删除表的关键字是____ TABLE。', options: null, answer: 'DROP', analysis: 'DROP TABLE用于删除表', default_score: 5, source: 'ai' },
    { id: 26, course_id: 3, knowledge_point_id: 29, question_type: 'short_answer', difficulty: 'easy', content: '请写出查询students表中所有记录的SQL语句。', options: null, answer: 'SELECT * FROM students;', analysis: '基础查询语句', default_score: 10, source: 'ai' },
    { id: 27, course_id: 3, knowledge_point_id: 30, question_type: 'short_answer', difficulty: 'hard', content: '请写出查询每个班级平均分的SQL语句（假设有scores表和classes表）。', options: null, answer: 'SELECT c.class_name, AVG(s.score) as avg_score\nFROM scores s\nJOIN classes c ON s.class_id = c.id\nGROUP BY c.class_name;', analysis: '考察JOIN和GROUP BY', default_score: 15, source: 'ai' },
    { id: 28, course_id: 3, knowledge_point_id: 30, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是SQL的聚合函数？（多选）', options: { A: 'COUNT', B: 'SUM', C: 'AVG', D: 'PRINT' }, answer: 'ABC', analysis: 'COUNT、SUM、AVG是聚合函数', default_score: 10, source: 'ai' },
    { id: 29, course_id: 3, knowledge_point_id: 31, question_type: 'single_choice', difficulty: 'hard', content: '数据库索引的主要作用是？', options: { A: '节省存储空间', B: '加快查询速度', C: '保证数据完整性', D: '简化SQL语句' }, answer: 'B', analysis: '索引用于加速数据检索', default_score: 10, source: 'ai' },
    { id: 30, course_id: 3, knowledge_point_id: 31, question_type: 'judgment', difficulty: 'hard', content: '数据库表应该尽可能多地建立索引以提高查询性能。', options: null, answer: '错误', analysis: '过多索引会增加存储开销和写入延迟', default_score: 10, source: 'ai' },
    // ===== 深度学习题 (31-50) =====
    { id: 31, course_id: 4, knowledge_point_id: 42, question_type: 'single_choice', difficulty: 'easy', content: '人工智能、机器学习、深度学习三者的关系是？', options: { A: '深度学习⊂机器学习⊂人工智能', B: '人工智能⊂机器学习⊂深度学习', C: '机器学习⊂人工智能⊂深度学习', D: '三者并列' }, answer: 'A', analysis: '深度学习是机器学习的子集，机器学习是AI的子集', default_score: 10, source: 'ai' },
    { id: 32, course_id: 4, knowledge_point_id: 46, question_type: 'single_choice', difficulty: 'easy', content: '以下哪项属于监督学习？', options: { A: 'K-means聚类', B: 'PCA降维', C: '线性回归', D: '自编码器' }, answer: 'C', analysis: '线性回归需要标注数据，属于监督学习', default_score: 10, source: 'ai' },
    { id: 33, course_id: 4, knowledge_point_id: 57, question_type: 'single_choice', difficulty: 'medium', content: 'TensorFlow中的张量(tensor)是什么？', options: { A: '一维数组', B: '二维数组', C: '多维数组', D: '字符串' }, answer: 'C', analysis: '张量是TensorFlow中的多维数组数据结构', default_score: 10, source: 'ai' },
    { id: 34, course_id: 4, knowledge_point_id: 59, question_type: 'single_choice', difficulty: 'medium', content: 'PyTorch相比于TensorFlow的主要优势是？', options: { A: '生产部署', B: '动态计算图', C: '分布式训练', D: '模型压缩' }, answer: 'B', analysis: 'PyTorch以动态计算图和Pythonic风格著称', default_score: 10, source: 'ai' },
    { id: 35, course_id: 4, knowledge_point_id: 62, question_type: 'single_choice', difficulty: 'medium', content: 'NumPy中ndarray的核心特性不包括？', options: { A: '同质数据', B: '广播机制', C: '自动求导', D: '向量化运算' }, answer: 'C', analysis: '自动求导是TensorFlow/PyTorch的功能，非NumPy', default_score: 10, source: 'ai' },
    { id: 36, course_id: 4, knowledge_point_id: 68, question_type: 'single_choice', difficulty: 'medium', content: '数组广播(broadcasting)的作用是？', options: { A: '网络传输', B: '不同形状数组运算', C: '数据压缩', D: '类型转换' }, answer: 'B', analysis: '广播允许不同形状的数组进行算术运算', default_score: 10, source: 'ai' },
    { id: 37, course_id: 4, knowledge_point_id: 73, question_type: 'fill_blank', difficulty: 'medium', content: 'Matplotlib中用于绘制折线图的函数是____', options: null, answer: 'plot()', analysis: 'plt.plot()是Matplotlib最基础的绘图函数', default_score: 5, source: 'ai' },
    { id: 38, course_id: 4, knowledge_point_id: 78, question_type: 'single_choice', difficulty: 'medium', content: 'scikit-learn中train_test_split的作用是？', options: { A: '数据清洗', B: '划分训练集和测试集', C: '特征工程', D: '模型评估' }, answer: 'B', analysis: 'train_test_split用于将数据集划分为训练集和测试集', default_score: 10, source: 'ai' },
    { id: 39, course_id: 4, knowledge_point_id: 86, question_type: 'single_choice', difficulty: 'hard', content: 'TensorFlow中GradientTape的作用是？', options: { A: '模型保存', B: '自动微分', C: '数据加载', D: '模型可视化' }, answer: 'B', analysis: 'GradientTape用于记录操作以进行自动微分', default_score: 10, source: 'ai' },
    { id: 40, course_id: 4, knowledge_point_id: 89, question_type: 'single_choice', difficulty: 'hard', content: '以下哪项描述了单层感知器的局限性？', options: { A: '无法处理连续值', B: '无法解决XOR问题', C: '计算速度慢', D: '需要GPU加速' }, answer: 'B', analysis: '单层感知器无法解决线性不可分问题如XOR', default_score: 10, source: 'ai' },
    { id: 41, course_id: 4, knowledge_point_id: 92, question_type: 'single_choice', difficulty: 'hard', content: 'ReLU激活函数的公式是？', options: { A: 'f(x)=1/(1+e⁻ˣ)', B: 'f(x)=tanh(x)', C: 'f(x)=max(0,x)', D: 'f(x)=eˣ' }, answer: 'C', analysis: 'ReLU定义为f(x)=max(0,x)', default_score: 10, source: 'ai' },
    { id: 42, course_id: 4, knowledge_point_id: 97, question_type: 'single_choice', difficulty: 'hard', content: '梯度下降中学习率过大会导致？', options: { A: '收敛过慢', B: '震荡发散', C: '过拟合', D: '欠拟合' }, answer: 'B', analysis: '学习率过大可能导致参数在最优解附近震荡甚至发散', default_score: 10, source: 'ai' },
    { id: 43, course_id: 4, knowledge_point_id: 98, question_type: 'short_answer', difficulty: 'hard', content: '请简述反向传播算法的基本思想。', options: null, answer: '通过链式法则从输出层向输入层逐层计算损失函数对各参数的梯度，然后用梯度下降更新参数', analysis: '反向传播是神经网络训练的核心算法', default_score: 15, source: 'ai' },
    { id: 44, course_id: 4, knowledge_point_id: 101, question_type: 'single_choice', difficulty: 'hard', content: '卷积神经网络中卷积层的主要作用是？', options: { A: '全连接', B: '特征提取', C: '分类', D: '降维' }, answer: 'B', analysis: '卷积层通过卷积核提取局部特征', default_score: 10, source: 'ai' },
    { id: 45, course_id: 4, knowledge_point_id: 104, question_type: 'single_choice', difficulty: 'hard', content: 'CNN中池化层(pooling)的作用不包括？', options: { A: '降维', B: '防止过拟合', C: '增加参数', D: '平移不变性' }, answer: 'C', analysis: '池化层减少参数而非增加', default_score: 10, source: 'ai' },
    { id: 46, course_id: 4, knowledge_point_id: 113, question_type: 'single_choice', difficulty: 'hard', content: 'RNN处理长序列时面临的主要问题是？', options: { A: '计算太快', B: '梯度消失/爆炸', C: '内存不足', D: '无法并行' }, answer: 'B', analysis: 'RNN在长序列上容易出现梯度消失或梯度爆炸', default_score: 10, source: 'ai' },
    { id: 47, course_id: 4, knowledge_point_id: 118, question_type: 'single_choice', difficulty: 'hard', content: 'LSTM中遗忘门的作用是？', options: { A: '输入新信息', B: '决定丢弃哪些旧信息', C: '输出结果', D: '更新权重' }, answer: 'B', analysis: '遗忘门控制要从细胞状态中丢弃哪些信息', default_score: 10, source: 'ai' },
    { id: 48, course_id: 4, knowledge_point_id: 124, question_type: 'single_choice', difficulty: 'hard', content: 'GAN由哪两个网络组成？', options: { A: '编码器和解码器', B: '生成器和判别器', C: '卷积层和全连接层', D: 'RNN和CNN' }, answer: 'B', analysis: 'GAN由生成器(Generator)和判别器(Discriminator)组成', default_score: 10, source: 'ai' },
    { id: 49, course_id: 4, knowledge_point_id: 128, question_type: 'single_choice', difficulty: 'hard', content: 'GAN训练中常见的问题是？', options: { A: '模型过小', B: '模式坍塌', C: '数据太少', D: '学习率太低' }, answer: 'B', analysis: '模式坍塌(Model Collapse)是GAN训练的经典问题', default_score: 10, source: 'ai' },
    { id: 50, course_id: 4, knowledge_point_id: 135, question_type: 'single_choice', difficulty: 'hard', content: '迁移学习中"冻结卷积基"的含义是？', options: { A: '删除卷积层', B: '不更新预训练卷积层权重', C: '降低学习率', D: '增加卷积层' }, answer: 'B', analysis: '冻结卷积基即保持预训练模型的卷积层权重不变', default_score: 10, source: 'ai' },
  ]).run();
  console.log('  ✅ 题目完成 (50题)');

  // ===================== 8. 作业 =====================
  console.log('📋 插入作业...');
  db.insert(assignment).values([
    // 保持原有6个作业不变
    { id: 1, course_id: 1, teacher_id: 1, title: 'Python第一次作业', description: '涵盖变量与数据类型、控制流程、函数基础等核心知识点', question_ids: [1, 2, 3, 4, 5, 6], total_score: 100, start_time: '2026-07-15T08:00:00+08:00', end_time: '2026-07-18T23:59:00+08:00', status: 'published' },
    { id: 2, course_id: 1, teacher_id: 1, title: 'Python第二次作业', description: '涵盖字典集合、文件操作、异常处理、面向对象等进阶知识点', question_ids: [7, 8, 9, 10, 11], total_score: 100, start_time: '2026-07-18T08:00:00+08:00', end_time: '2026-07-22T23:59:00+08:00', status: 'published' },
    { id: 3, course_id: 2, teacher_id: 1, title: '数据结构第一次作业', description: '涵盖数组链表、栈队列、树、排序算法等核心知识点', question_ids: [12, 13, 14, 15, 16], total_score: 100, start_time: '2026-07-20T08:00:00+08:00', end_time: '2026-07-25T23:59:00+08:00', status: 'published' },
    { id: 4, course_id: 2, teacher_id: 1, title: '数据结构第二次作业', description: '涵盖图的遍历、最短路径、二分查找等知识点', question_ids: [17, 18, 19, 20, 21], total_score: 100, start_time: '2026-07-22T08:00:00+08:00', end_time: '2026-07-28T23:59:00+08:00', status: 'published' },
    { id: 5, course_id: 3, teacher_id: 1, title: '数据库原理第一次作业', description: '涵盖SQL查询、JOIN、子查询等核心知识点', question_ids: [24, 25, 26, 27, 28], total_score: 100, start_time: '2026-07-25T08:00:00+08:00', end_time: '2026-07-30T23:59:00+08:00', status: 'published' },
    { id: 6, course_id: 3, teacher_id: 1, title: '数据库原理第二次作业', description: '涵盖数据库索引、事务并发控制等高级知识点', question_ids: [29, 30], total_score: 100, start_time: '2026-07-30T08:00:00+08:00', end_time: '2026-08-05T23:59:00+08:00', status: 'published' },
    // 新增作业
    { id: 7, course_id: 4, teacher_id: 1, title: '深度学习第一次作业：基础与框架', description: '涵盖AI基础概念、框架生态、NumPy/TensorFlow基础等知识点', question_ids: [31, 32, 33, 34, 35, 36, 37, 38, 39], total_score: 100, start_time: '2026-08-01T08:00:00+08:00', end_time: '2026-08-07T23:59:00+08:00', status: 'published' },
    { id: 8, course_id: 4, teacher_id: 1, title: '深度学习第二次作业：神经网络与高级模型', description: '涵盖感知器、CNN、RNN、GAN、迁移学习等进阶知识点', question_ids: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50], total_score: 100, start_time: '2026-08-07T08:00:00+08:00', end_time: '2026-08-14T23:59:00+08:00', status: 'published' },
  ]).run();
  console.log('  ✅ 作业完成 (8个)');

  // ===================== 9. 作答 + 批改 + 错题 =====================
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

  // ===================== 10. 知识掌握度 =====================
  console.log('📈 插入知识掌握度...');
  const masteryValues: any[] = [];
  let mlId = 0;
  const allStudentIds = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const studentId of allStudentIds) {
    const level = studentId <= 4 ? 'top' : studentId <= 9 ? 'medium' : 'weak';
    const base: Record<string, number> = { top: 90, medium: 72, weak: 48 };
    const noise: Record<string, number> = { top: 7, medium: 10, weak: 14 };
    // 覆盖所有143个知识点
    const maxKp = 143;
    const kpList = level === 'weak'
      ? [...Array(maxKp)].map((_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, 30)
      : [...Array(maxKp)].map((_, i) => i + 1);
    for (const kp of kpList) {
      let decl: number;
      if (kp <= 10) decl = 0;
      else if (kp <= 27) decl = 4;
      else if (kp <= 41) decl = 8;
      else decl = Math.floor((kp - 42) / 20) * 3 + 8;
      const adj = (kp % 5 === 0) ? -3 : (kp % 7 === 0) ? 3 : 1;
      const n = ((Math.random() + Math.random() + Math.random() + Math.random()) / 2 - 1) * noise[level];
      const mastery = Math.round(Math.min(100, Math.max(5, base[level] - decl + adj + n)));
      mlId++;
      masteryValues.push({ id: mlId, student_id: studentId, knowledge_point_id: kp, mastery_rate: mastery, error_count: Math.max(1, Math.round((level === 'top' ? 1 : level === 'medium' ? 2 : 3) + Math.floor(Math.max(0, decl - 4) / 4) * 0.5)), recorded_at: `2026-07-${String(20 + Math.floor(decl / 4)).padStart(2, '0')}` });
    }
  }
  db.insert(knowledgeMasteryLog).values(masteryValues).run();
  console.log(`  ✅ 知识掌握度完成 (${masteryValues.length}条)`);

  // ===================== 保存 + 验证 =====================
  saveDb();
  console.log('\n💾 已保存到磁盘');

  const vMem = db.select().from(user).all();
  console.log(`🔍 验证: 内存${vMem.length}用户`);

  if (vMem.length === 0) {
    console.error('❌ 种子数据写入失败！');
    process.exit(1);
  }

  console.log('\n🎉 种子数据插入完成！');
  console.log('================================');
  console.log(`  学校:1 学院:1 专业:1 班级:2`);
  console.log(`  教师:2 学生:10 课程:4 知识点:143`);
  console.log(`  知识图谱节点:${KGN.length} 边:${KGE.length}`);
  console.log(`  题目:50 作业:8`);
  console.log(`  作答:${ansId} 批改:${gtId} 错题:${ebId}`);
  console.log(`  知识掌握度:${masteryValues.length}`);
  console.log('================================');
}

seed().catch(err => { console.error('❌', err); process.exit(1); });

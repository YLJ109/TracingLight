/**
 * 溯光 TracingLight V3.0 种子数据脚本 (Drizzle ORM)
 * 运行: npx tsx src/storage/database/seed.ts
 */
import { initDb, getDb, saveDb } from './db';
import {
  school, college, major, classInfo, user, course,
  knowledgePoint, knowledgeGraphNode, knowledgeGraphEdge,
  question, assignment, answer, gradingTask, errorBook,
  knowledgeMasteryLog,
  abilityPoint, ideologyPoint, abilityKnowledge, ideologyKnowledge,
  learningMaterial, learningBehaviorLog, auditLog, systemConfig, notification,
  studentSchedule, classSchedule, examSchedule, studyPlan,
} from './shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import { hashPassword } from '../../lib/password';

async function seed() {
  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
  if (fs.existsSync(dbPath)) { fs.unlinkSync(dbPath); }
  await initDb();
  const db = getDb();

  // 确定性伪随机：替代 Math.random，保证 seed 结果稳定可复现（更真实、可回溯）
  const seededNoise = (seed: number): number => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  console.log('🌱 开始插入种子数据...\n');

  // ===================== 1. 基础数据 =====================
  console.log('📚 插入学校/学院/专业/班级...');
  db.insert(school).values({
    id: 1, name: '福州大学', short_name: 'FZU'
  }).run();
  db.insert(college).values({
    id: 1, school_id: 1, name: '计算机与大数据学院', short_name: 'CS'
  }).run();
  db.insert(major).values({
    id: 1, college_id: 1, name: '计算机科学与技术', short_name: '计科'
  }).run();
  db.insert(classInfo).values([
    { id: 1, major_id: 1, name: '计科2401', grade: '2024' },
    { id: 2, major_id: 1, name: '计科2402', grade: '2024' },
  ]).run();
  console.log('  ✅ 学校/学院/专业/班级完成');

  // ===================== 2. 用户 =====================
  console.log('👤 插入用户...');
  const usersData = [
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
    { id: 13, username: 'admin', real_name: '系统管理员', role: 'admin' },
  ].map((u) => ({
    ...u,
    // 默认密码：admin=123456，其余账号=用户名
    password: hashPassword(u.username === 'admin' ? '123456' : u.username),
  }));
  db.insert(user).values(usersData).run();
  console.log('  ✅ 用户完成 (2教师 + 10学生 + 1管理员 + 1助教)');

  // ===================== 3. 课程 =====================
  console.log('📖 插入课程...');
  db.insert(course).values([
    { id: 1, name: 'Python程序设计', short_name: 'Python', description: 'Python基础语法与编程实践', teacher_id: 1, class_id: 1, semester: '2025-2026-2' },
    { id: 2, name: '数据结构与算法', short_name: '数据结构', description: '常用数据结构与算法分析', teacher_id: 1, class_id: 1, semester: '2025-2026-2' },
    { id: 3, name: '数据库原理', short_name: '数据库', description: '关系数据库理论与SQL实践', teacher_id: 2, class_id: 1, semester: '2025-2026-2' },
    { id: 4, name: '深度学习框架', short_name: '深度学习', description: 'TensorFlow/PyTorch框架与深度学习实践', teacher_id: 2, class_id: 1, semester: '2025-2026-2' },
  ]).run();
  console.log('  ✅ 课程完成 (4门)');

  // ===================== 4. 知识点 =====================
  console.log('🧠 插入知识点...');
  const KPS: any[] = [];
  function kp(id: number, cid: number, name: string, diff: string, order: number, desc?: string) {
    KPS.push({ id, course_id: cid, name, difficulty: diff, sort_order: order, description: desc || null });
  }
  // Python (id 1-10)
  kp(1,1,'变量与数据类型','easy',1); kp(2,1,'运算符与表达式','easy',2);
  kp(3,1,'流程控制','easy',3); kp(4,1,'循环结构','medium',4);
  kp(5,1,'函数定义与调用','medium',5); kp(6,1,'列表与元组','medium',6);
  kp(7,1,'字典与集合','medium',7); kp(8,1,'文件操作','hard',8);
  kp(9,1,'异常处理','hard',9); kp(10,1,'面向对象基础','hard',10);
  // 数据结构 (id 11-30)
  kp(11,2,'线性表','medium',1); kp(12,2,'栈与队列','medium',2);
  kp(13,2,'链表进阶','hard',3); kp(14,2,'串与数组','medium',4);
  kp(15,2,'广义表','hard',5); kp(16,2,'树与二叉树','hard',6);
  kp(17,2,'哈夫曼树','hard',7); kp(18,2,'图的存储与遍历','hard',8);
  kp(19,2,'图的应用','hard',9); kp(20,2,'查找算法','medium',10);
  kp(21,2,'二叉排序树','hard',11); kp(22,2,'插入与选择排序','medium',12);
  kp(23,2,'交换与归并排序','hard',13); kp(24,2,'时间复杂度','easy',14);
  kp(25,2,'空间复杂度','easy',15); kp(26,2,'算法优化策略','hard',16);
  // 数据库原理 (id 31-48)
  kp(31,3,'关系模型与ER图','medium',1); kp(32,3,'SQL基础查询','easy',2);
  kp(33,3,'SQL高级查询','hard',3); kp(34,3,'索引与优化','hard',4);
  kp(35,3,'事务与并发控制','hard',5); kp(36,3,'数据库范式','medium',6);
  kp(37,3,'存储过程与触发器','hard',7); kp(38,3,'视图与权限管理','medium',8);
  kp(39,3,'数据库备份与恢复','medium',9); kp(40,3,'NoSQL数据库简介','easy',10);
  kp(41,3,'数据库设计方法论','medium',11); kp(42,3,'JDBC与数据库连接','medium',12);
  kp(43,3,'数据库安全与加密','hard',13); kp(44,3,'分布式数据库','hard',14);
  // 深度学习框架 (id 51-152) 102个知识点
  const dl = (id: number, name: string, diff: string, order: number) => kp(id, 4, name, diff, order);
  dl(51,'人工智能的概念','easy',1); dl(52,'机器学习的定义','easy',2);
  dl(53,'深度学习的定义','easy',3); dl(54,'AI/ML/DL三者关系','medium',4);
  dl(55,'监督学习','easy',5); dl(56,'无监督学习','medium',6);
  dl(57,'半监督学习','medium',7); dl(58,'强化学习','hard',8);
  dl(59,'训练数据与模型','medium',9); dl(60,'分类、决策与预测任务','medium',10);
  dl(61,'图像识别','medium',11); dl(62,'人脸识别','hard',12);
  dl(63,'图像分割','hard',13); dl(64,'自然语言处理','hard',14);
  dl(65,'语音识别','hard',15); dl(66,'TensorFlow框架','medium',16);
  dl(67,'Keras高级接口','easy',17); dl(68,'PyTorch框架','medium',18);
  dl(69,'主流框架比较','medium',19); dl(70,'深度学习工程流程','medium',20);
  dl(71,'NumPy数据类型','medium',21); dl(72,'ndarray数组对象','medium',22);
  dl(73,'数组创建函数','easy',23); dl(74,'数组属性','easy',24);
  dl(75,'数组索引','easy',25); dl(76,'数组切片','medium',26);
  dl(77,'数组广播','hard',27); dl(78,'数组逐元素运算','easy',28);
  dl(79,'NumPy随机函数','medium',29); dl(80,'数组形状变换','medium',30);
  dl(81,'Matplotlib图形要素','medium',31); dl(82,'折线图绘制','easy',32);
  dl(83,'直方图绘制','easy',33); dl(84,'饼图绘制','easy',34);
  dl(85,'绘图基本步骤','easy',35); dl(86,'scikit-learn数据集','medium',36);
  dl(87,'scikit-learn模型训练','medium',37); dl(88,'训练集验证集测试集','medium',38);
  dl(89,'模型评估指标','medium',39); dl(90,'张量的维度','hard',40);
  dl(91,'tf.constant常量张量','medium',41); dl(92,'张量索引','medium',42);
  dl(93,'tf.reshape形状变换','medium',43); dl(94,'张量数学运算','hard',44);
  dl(95,'自动求导GradientTape','hard',45); dl(96,'TensorBoard可视化','medium',46);
  dl(97,'生物神经元与感知器','medium',47); dl(98,'单层感知器','medium',48);
  dl(99,'前馈神经网络','hard',49); dl(100,'输入层隐藏层输出层','medium',50);
  dl(101,'阶跃函数','easy',51); dl(102,'Tanh函数','easy',52);
  dl(103,'Softmax函数','medium',53); dl(104,'前向传播','hard',54);
  dl(105,'均方误差损失函数','medium',55); dl(106,'梯度下降','hard',56);
  dl(107,'反向传播','hard',57); dl(108,'早停法','medium',58);
  dl(109,'感受野与局部连接','hard',59); dl(110,'卷积层','hard',60);
  dl(111,'填充与步长','medium',61); dl(112,'SAME与VALID填充','medium',62);
  dl(113,'池化层','medium',63); dl(114,'Flatten层','easy',64);
  dl(115,'VGG网络','hard',65); dl(116,'LeNet网络','medium',66);
  dl(117,'CNN图像分类流程','hard',67); dl(118,'词向量表示','hard',68);
  dl(119,'序列填充','medium',69); dl(120,'文本序列化','medium',70);
  dl(121,'循环神经网络概念','hard',71); dl(122,'隐藏状态','hard',72);
  dl(123,'序列输出与最终输出','medium',73); dl(124,'文本分类流程','hard',74);
  dl(125,'RNN时间步展开','hard',75);
  dl(126,'LSTM长短时记忆网络','hard',76); dl(127,'LSTM遗忘门','hard',77);
  dl(128,'LSTM输入门','hard',78); dl(129,'LSTM输出门','hard',79);
  dl(130,'GRU门控循环单元','hard',80); dl(131,'文本预测任务','hard',81);
  dl(132,'循环网络模型训练','hard',82);
  dl(133,'生成模型与判别模型','hard',83); dl(134,'随机噪声向量','medium',84);
  dl(135,'判别器损失','hard',85); dl(136,'生成器损失','hard',86);
  dl(137,'生成对抗训练','hard',87); dl(138,'DCGAN深度卷积GAN','hard',88);
  dl(139,'转置卷积层','hard',89); dl(140,'GAN训练步骤','hard',90);
  dl(141,'生成图像可视化','medium',91); dl(142,'真实样本与生成样本','medium',92);
  dl(143,'GAN评估指标','hard',93);
  dl(144,'迁移学习概念','medium',94); dl(145,'特征迁移','hard',95);
  dl(146,'冻结卷积基','hard',96); dl(147,'微调策略','hard',97);
  dl(148,'预训练模型选择','medium',98); dl(149,'数据增强技术','medium',99);
  dl(150,'领域自适应','hard',100); dl(151,'多任务学习','hard',101);
  dl(152,'迁移学习实战流程','hard',102);

  db.insert(knowledgePoint).values(KPS).run();
  console.log('  ✅ 知识点完成 (' + KPS.length + '个)');

  // ===================== 5. 知识图谱节点 =====================
  console.log('🗺️ 插入知识图谱节点...');
  const KGN: any[] = []; let nid = 0;
  const node = (kpId: number, cid: number, name: string, lvl: number, parentId: number|null, order: number, color: string, leaf: boolean) => {
    nid++; KGN.push({ id: nid, knowledge_point_id: kpId, course_id: cid, node_name: name, node_level: lvl, parent_node_id: parentId, display_order: order, color_hex: color, is_leaf: leaf });
    return nid;
  };

  // 课程1: Python程序设计
  const pyRoot = node(1,1,'Python程序设计',0,null,1,'#1e293b',false);
  const pyCh1 = node(1,1,'第1章 Python基础语法',1,pyRoot,1,'#0d9488',false);
  const pySec11 = node(1,1,'1.1 基本语法元素',2,pyCh1,1,'#14b8a6',false);
  node(1,1,'变量与数据类型',3,pySec11,1,'#99f6e4',true); node(2,1,'运算符与表达式',3,pySec11,2,'#99f6e4',true);
  const pySec12 = node(3,1,'1.2 输入与输出',2,pyCh1,2,'#14b8a6',false);
  node(3,1,'流程控制',3,pySec12,1,'#99f6e4',true); node(4,1,'循环结构',3,pySec12,2,'#99f6e4',true);
  const pyCh2 = node(5,1,'第2章 函数与模块',1,pyRoot,2,'#2563eb',false);
  const pySec21 = node(5,1,'2.1 函数定义',2,pyCh2,1,'#3b82f6',false);
  node(5,1,'函数定义与调用',3,pySec21,1,'#bfdbfe',true);
  const pySec22 = node(6,1,'2.2 复合数据类型',2,pyCh2,2,'#3b82f6',false);
  node(6,1,'列表与元组',3,pySec22,1,'#bfdbfe',true); node(7,1,'字典与集合',3,pySec22,2,'#bfdbfe',true);
  const pyCh3 = node(8,1,'第3章 文件与面向对象',1,pyRoot,3,'#7c3aed',false);
  const pySec31 = node(8,1,'3.1 文件与异常',2,pyCh3,1,'#8b5cf6',false);
  node(8,1,'文件操作',3,pySec31,1,'#ddd6fe',true); node(9,1,'异常处理',3,pySec31,2,'#ddd6fe',true);
  const pySec32 = node(10,1,'3.2 面向对象',2,pyCh3,2,'#8b5cf6',false);
  node(10,1,'面向对象基础',3,pySec32,1,'#ddd6fe',true);

  // 课程2: 数据结构与算法
  const dsRoot = node(11,2,'数据结构与算法',0,null,2,'#1e293b',false);
  const dsCh1 = node(11,2,'第1章 线性结构',1,dsRoot,1,'#0d9488',false);
  const dsSec11 = node(11,2,'1.1 线性表与链表',2,dsCh1,1,'#14b8a6',false);
  node(11,2,'线性表',3,dsSec11,1,'#99f6e4',true); node(13,2,'链表进阶',3,dsSec11,2,'#99f6e4',true);
  const dsSec12 = node(12,2,'1.2 栈与队列',2,dsCh1,2,'#14b8a6',false);
  node(12,2,'栈与队列',3,dsSec12,1,'#99f6e4',true); node(14,2,'串与数组',3,dsSec12,2,'#99f6e4',true); node(15,2,'广义表',3,dsSec12,3,'#99f6e4',true);
  const dsCh2 = node(16,2,'第2章 树与图',1,dsRoot,2,'#2563eb',false);
  const dsSec21 = node(16,2,'2.1 树结构',2,dsCh2,1,'#3b82f6',false);
  node(16,2,'树与二叉树',3,dsSec21,1,'#bfdbfe',true); node(17,2,'哈夫曼树',3,dsSec21,2,'#bfdbfe',true);
  const dsSec22 = node(18,2,'2.2 图结构',2,dsCh2,2,'#3b82f6',false);
  node(18,2,'图的存储与遍历',3,dsSec22,1,'#bfdbfe',true); node(19,2,'图的应用',3,dsSec22,2,'#bfdbfe',true);
  const dsCh3 = node(20,2,'第3章 查找与排序',1,dsRoot,3,'#7c3aed',false);
  const dsSec31 = node(20,2,'3.1 查找',2,dsCh3,1,'#8b5cf6',false);
  node(20,2,'查找算法',3,dsSec31,1,'#ddd6fe',true); node(21,2,'二叉排序树',3,dsSec31,2,'#ddd6fe',true);
  const dsSec32 = node(22,2,'3.2 排序',2,dsCh3,2,'#8b5cf6',false);
  node(22,2,'插入与选择排序',3,dsSec32,1,'#ddd6fe',true); node(23,2,'交换与归并排序',3,dsSec32,2,'#ddd6fe',true);
  const dsCh4 = node(24,2,'第4章 算法分析',1,dsRoot,4,'#db2777',false);
  const dsSec41 = node(24,2,'4.1 复杂度分析',2,dsCh4,1,'#ec4899',false);
  node(24,2,'时间复杂度',3,dsSec41,1,'#fbcfe8',true); node(25,2,'空间复杂度',3,dsSec41,2,'#fbcfe8',true); node(26,2,'算法优化策略',3,dsSec41,3,'#fbcfe8',true);

  // 课程3: 数据库原理
  const dbRoot = node(31,3,'数据库原理',0,null,3,'#1e293b',false);
  const dbCh1 = node(31,3,'第1章 数据库基础',1,dbRoot,1,'#0d9488',false);
  const dbSec11 = node(31,3,'1.1 关系模型',2,dbCh1,1,'#14b8a6',false);
  node(31,3,'关系模型与ER图',3,dbSec11,1,'#99f6e4',true); node(36,3,'数据库范式',3,dbSec11,2,'#99f6e4',true); node(41,3,'数据库设计方法论',3,dbSec11,3,'#99f6e4',true);
  const dbSec12 = node(32,3,'1.2 SQL基础',2,dbCh1,2,'#14b8a6',false);
  node(32,3,'SQL基础查询',3,dbSec12,1,'#99f6e4',true); node(38,3,'视图与权限管理',3,dbSec12,2,'#99f6e4',true);
  const dbCh2 = node(33,3,'第2章 高级SQL与优化',1,dbRoot,2,'#2563eb',false);
  const dbSec21 = node(33,3,'2.1 高级查询',2,dbCh2,1,'#3b82f6',false);
  node(33,3,'SQL高级查询',3,dbSec21,1,'#bfdbfe',true); node(34,3,'索引与优化',3,dbSec21,2,'#bfdbfe',true); node(37,3,'存储过程与触发器',3,dbSec21,3,'#bfdbfe',true);
  const dbSec22 = node(35,3,'2.2 事务与安全',2,dbCh2,2,'#3b82f6',false);
  node(35,3,'事务与并发控制',3,dbSec22,1,'#bfdbfe',true); node(43,3,'数据库安全与加密',3,dbSec22,2,'#bfdbfe',true); node(42,3,'JDBC与数据库连接',3,dbSec22,3,'#bfdbfe',true);
  const dbCh3 = node(39,3,'第3章 高级主题',1,dbRoot,3,'#7c3aed',false);
  const dbSec31 = node(39,3,'3.1 运维与NoSQL',2,dbCh3,1,'#8b5cf6',false);
  node(39,3,'数据库备份与恢复',3,dbSec31,1,'#ddd6fe',true); node(40,3,'NoSQL数据库简介',3,dbSec31,2,'#ddd6fe',true); node(44,3,'分布式数据库',3,dbSec31,3,'#ddd6fe',true);

  // 课程4: 深度学习框架 (7项目)
  const PC: [string,string,string][] = [['#0d9488','#14b8a6','#99f6e4'],['#2563eb','#3b82f6','#bfdbfe'],['#7c3aed','#8b5cf6','#ddd6fe'],['#db2777','#ec4899','#fbcfe8'],['#d97706','#f59e0b','#fde68a'],['#0891b2','#06b6d4','#a5f3fc'],['#65a30d','#84cc16','#d9f99d']];
  const dlRoot = node(51,4,'深度学习框架',0,null,4,'#1e293b',false);
  // 项目一
  const p1 = node(51,4,'项目一 搭建深度学习开发环境',1,dlRoot,1,PC[0][0],false);
  const p1s1 = node(51,4,'人工智能与深度学习导论',2,p1,1,PC[0][1],false);
  [51,52,53,54,55,56,57,58,59,60].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p1s1,i+1,PC[0][2],true));
  const p1s2 = node(61,4,'应用领域与框架生态',2,p1,2,PC[0][1],false);
  [61,62,63,64,65,66,67,68,69,70].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p1s2,i+1,PC[0][2],true));
  // 项目二
  const p2 = node(71,4,'项目二 夯实深度学习开发基础',1,dlRoot,2,PC[1][0],false);
  const p2s1 = node(71,4,'NumPy科学计算',2,p2,1,PC[1][1],false);
  [71,72,73,74,75,76,77,78,79,80].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p2s1,i+1,PC[1][2],true));
  const p2s2 = node(81,4,'可视化与机器学习库',2,p2,2,PC[1][1],false);
  [81,82,83,84,85,86,87,88,89].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p2s2,i+1,PC[1][2],true));
  const p2s3 = node(90,4,'TensorFlow基础操作',2,p2,3,PC[1][1],false);
  [90,91,92,93,94,95,96].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p2s3,i+1,PC[1][2],true));
  // 项目三
  const p3 = node(97,4,'项目三 构建神经网络',1,dlRoot,3,PC[2][0],false);
  const p3s1 = node(97,4,'神经元与网络结构',2,p3,1,PC[2][1],false);
  [97,98,99,100].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p3s1,i+1,PC[2][2],true));
  const p3s2 = node(101,4,'激活函数',2,p3,2,PC[2][1],false);
  [101,102,103].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p3s2,i+1,PC[2][2],true));
  const p3s3 = node(104,4,'训练与优化',2,p3,3,PC[2][1],false);
  [104,105,106,107,108].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p3s3,i+1,PC[2][2],true));
  // 项目四
  const p4 = node(109,4,'项目四 卷积神经网络',1,dlRoot,4,PC[3][0],false);
  const p4s1 = node(109,4,'CNN基本思想',2,p4,1,PC[3][1],false);
  [109,110,111,112,113,114].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p4s1,i+1,PC[3][2],true));
  const p4s2 = node(115,4,'经典CNN与实践',2,p4,2,PC[3][1],false);
  [115,116,117].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p4s2,i+1,PC[3][2],true));
  const p4s3 = node(118,4,'自然语言数据处理',2,p4,3,PC[3][1],false);
  [118,119,120,121].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p4s3,i+1,PC[3][2],true));
  const p4s4 = node(122,4,'循环神经网络结构',2,p4,4,PC[3][1],false);
  [122,123,124,125].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p4s4,i+1,PC[3][2],true));
  // 项目五
  const p5 = node(126,4,'项目五 循环神经网络',1,dlRoot,5,PC[4][0],false);
  const p5s1 = node(126,4,'门控循环网络',2,p5,1,PC[4][1],false);
  [126,127,128,129,130,131,132].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p5s1,i+1,PC[4][2],true));
  // 项目六
  const p6 = node(133,4,'项目六 生成对抗神经网络',1,dlRoot,6,PC[5][0],false);
  const p6s1 = node(133,4,'GAN模型与训练',2,p6,1,PC[5][1],false);
  [133,134,135,136,137,138,139,140,141].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p6s1,i+1,PC[5][2],true));
  const p6s2 = node(142,4,'生成对抗网络核心知识点',2,p6,2,PC[5][1],false);
  [142,143].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p6s2,i+1,PC[5][2],true));
  // 项目七
  const p7 = node(144,4,'项目七 迁移学习',1,dlRoot,7,PC[6][0],false);
  const p7s1 = node(144,4,'迁移学习原理',2,p7,1,PC[6][1],false);
  [144,145,146,147,148,149,150,151,152].forEach((id,i)=>node(id,4,KPS.find(k=>k.id===id)!.name,3,p7s1,i+1,PC[6][2],true));

  db.insert(knowledgeGraphNode).values(KGN).run();
  console.log('  ✅ 知识图谱节点完成 (' + KGN.length + '个)');

  // ===================== 6. 知识图谱边 =====================
  console.log('🔗 插入知识图谱边...');
  const KGE: any[] = []; let eid = 0;
  const edge = (from:number, to:number, type:string, desc:string) => { eid++; KGE.push({id:eid, from_node_id:from, to_node_id:to, relation_type:type, description:desc}); };
  // belong_to 边 (L0→L1→L2→L3)
  KGN.filter(n=>n.course_id===1&&n.node_level===1).forEach(c=>edge(c.parent_node_id!,c.id,'belong_to',''));
  KGN.filter(n=>n.course_id===1&&n.node_level===2).forEach(s=>edge(s.parent_node_id!,s.id,'belong_to',''));
  KGN.filter(n=>n.course_id===1&&n.node_level===3).forEach(k=>edge(k.parent_node_id!,k.id,'belong_to',''));
  KGN.filter(n=>n.course_id===2&&n.node_level===1).forEach(c=>edge(c.parent_node_id!,c.id,'belong_to',''));
  KGN.filter(n=>n.course_id===2&&n.node_level===2).forEach(s=>edge(s.parent_node_id!,s.id,'belong_to',''));
  KGN.filter(n=>n.course_id===2&&n.node_level===3).forEach(k=>edge(k.parent_node_id!,k.id,'belong_to',''));
  KGN.filter(n=>n.course_id===3&&n.node_level===1).forEach(c=>edge(c.parent_node_id!,c.id,'belong_to',''));
  KGN.filter(n=>n.course_id===3&&n.node_level===2).forEach(s=>edge(s.parent_node_id!,s.id,'belong_to',''));
  KGN.filter(n=>n.course_id===3&&n.node_level===3).forEach(k=>edge(k.parent_node_id!,k.id,'belong_to',''));
  KGN.filter(n=>n.course_id===4&&n.node_level===1).forEach(c=>edge(c.parent_node_id!,c.id,'belong_to',''));
  KGN.filter(n=>n.course_id===4&&n.node_level===2).forEach(s=>edge(s.parent_node_id!,s.id,'belong_to',''));
  KGN.filter(n=>n.course_id===4&&n.node_level===3).forEach(k=>edge(k.parent_node_id!,k.id,'belong_to',''));
  // prerequisite 学习依赖边
  // 课程1 Python
  const pyN12 = KGN.findIndex(n=>n.knowledge_point_id===1&&n.course_id===1&&n.node_level===3&&n.node_name==='变量与数据类型')+1;
  const pyN13 = KGN.findIndex(n=>n.knowledge_point_id===3&&n.course_id===1&&n.node_level===3&&n.node_name==='流程控制')+1;
  const pyN14 = KGN.findIndex(n=>n.knowledge_point_id===4&&n.course_id===1&&n.node_level===3&&n.node_name==='循环结构')+1;
  const pyN15 = KGN.findIndex(n=>n.knowledge_point_id===5&&n.course_id===1&&n.node_level===3&&n.node_name==='函数定义与调用')+1;
  const pyN16 = KGN.findIndex(n=>n.knowledge_point_id===6&&n.course_id===1&&n.node_level===3&&n.node_name==='列表与元组')+1;
  const pyN17 = KGN.findIndex(n=>n.knowledge_point_id===7&&n.course_id===1&&n.node_level===3&&n.node_name==='字典与集合')+1;
  edge(pyN12,pyN13,'prerequisite','变量是流程控制的基础'); edge(pyN13,pyN14,'prerequisite','流程控制是循环结构的前提');
  edge(pyN12,pyN15,'prerequisite','变量是函数定义的基础'); edge(pyN15,pyN16,'prerequisite','函数是复合数据类型的基础');
  edge(pyN16,pyN17,'prerequisite','列表理解是字典集合学习的前提');
  // 课程2 DS
  const dsN20 = KGN.findIndex(n=>n.knowledge_point_id===20&&n.course_id===2&&n.node_level===3&&n.node_name==='查找算法')+1;
  const dsN21 = KGN.findIndex(n=>n.knowledge_point_id===21&&n.course_id===2&&n.node_level===3&&n.node_name==='二叉排序树')+1;
  edge(dsN20,dsN21,'prerequisite','线性表是链表进阶的基础'); edge(dsN21,dsN20+1,'prerequisite','链表是栈与队列的基础');
  // 课程3 DB
  const dbN28 = KGN.findIndex(n=>n.knowledge_point_id===31&&n.course_id===3&&n.node_level===3&&n.node_name==='关系模型与ER图')+1;
  const dbN29 = KGN.findIndex(n=>n.knowledge_point_id===32&&n.course_id===3&&n.node_level===3&&n.node_name==='SQL基础查询')+1;
  const dbN30 = KGN.findIndex(n=>n.knowledge_point_id===33&&n.course_id===3&&n.node_level===3&&n.node_name==='SQL高级查询')+1;
  const dbN31 = KGN.findIndex(n=>n.knowledge_point_id===34&&n.course_id===3&&n.node_level===3&&n.node_name==='索引与优化')+1;
  const dbN32 = KGN.findIndex(n=>n.knowledge_point_id===35&&n.course_id===3&&n.node_level===3&&n.node_name==='事务与并发控制')+1;
  edge(dbN28,dbN29,'prerequisite','关系模型是SQL基础的前提'); edge(dbN29,dbN30,'prerequisite','SQL基础是高级查询的前提');
  edge(dbN30,dbN31,'prerequisite','高级查询是索引优化的前提'); edge(dbN31,dbN32,'prerequisite','索引是事务并发的基础');
  // 课程4 DL 项目间
  const dlL1 = KGN.filter(n=>n.course_id===4&&n.node_level===1).sort((a,b)=>a.display_order-b.display_order);
  for (let i=0;i<dlL1.length-1;i++) edge(dlL1[i].id,dlL1[i+1].id,'prerequisite','');
  // related 关联边
  edge(dsN20,pyN16,'related','数据结构与基础语法关联');
  edge(dsN20,pyN16+1,'related','链表与列表概念对比');
  edge(dbN32,dsN20,'related','事务与栈操作概念关联');

  db.insert(knowledgeGraphEdge).values(KGE).run();
  console.log('  ✅ 知识图谱边完成 (' + KGE.length + '条)');

  // ===================== 7. 题目 =====================
  console.log('📝 插入题目...');
  const Q: any[] = [];
  const q = (o: any) => Q.push(o);
  // Python 第一次作业 (8题: 1-8)
  q({ id: 1, course_id: 1, knowledge_point_id: 1, question_type: 'single_choice', difficulty: 'easy', content: 'Python中，以下哪个是可变数据类型？', options: ['A. int', 'B. str', 'C. list', 'D. tuple'], answer: 'C', analysis: 'list是可变序列，int、str、tuple都是不可变类型', default_score: 10, source: 'ai' });
  q({ id: 2, course_id: 1, knowledge_point_id: 1, question_type: 'single_choice', difficulty: 'easy', content: '以下哪个不是Python的合法变量名？', options: ['A. _name', 'B. name1', 'C. 1name', 'D. name_1'], answer: 'C', analysis: '变量名不能以数字开头', default_score: 5, source: 'ai' });
  q({ id: 3, course_id: 1, knowledge_point_id: 1, question_type: 'judgment', difficulty: 'easy', content: 'Python中字符串是不可变类型，创建后不能修改。', options: ['正确', '错误'], answer: '正确', analysis: 'Python字符串创建后不可修改，任何操作都会创建新字符串', default_score: 5, source: 'ai' });
  q({ id: 4, course_id: 1, knowledge_point_id: 3, question_type: 'single_choice', difficulty: 'easy', content: 'if语句的条件表达式结果必须是？', options: ['A. 整数', 'B. 布尔值', 'C. 字符串', 'D. 任意类型'], answer: 'B', analysis: 'if条件表达式会被隐式转换为布尔值', default_score: 5, source: 'ai' });
  q({ id: 5, course_id: 1, knowledge_point_id: 3, question_type: 'fill_blank', difficulty: 'easy', content: 'Python中用于获取变量类型的函数是____', options: null, answer: 'type()', analysis: 'type()函数返回对象的类型', default_score: 5, source: 'ai' });
  q({ id: 6, course_id: 1, knowledge_point_id: 4, question_type: 'single_choice', difficulty: 'medium', content: 'for i in range(1, 5)循环执行几次？', options: ['A. 3次', 'B. 4次', 'C. 5次', 'D. 6次'], answer: 'B', analysis: 'range(1,5)生成1,2,3,4共4个数', default_score: 5, source: 'ai' });
  q({ id: 7, course_id: 1, knowledge_point_id: 5, question_type: 'short_answer', difficulty: 'medium', content: '请编写一个函数，接收两个参数a和b，返回它们的和。', options: null, answer: 'def add(a, b):\n    return a + b', analysis: '考察函数定义与返回值', default_score: 10, source: 'ai' });
  q({ id: 8, course_id: 1, knowledge_point_id: 6, question_type: 'code', difficulty: 'medium', content: '请用Python实现一个函数，判断一个数是否为素数。', options: null, answer: 'def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True', analysis: '考察循环和条件判断，只需检查到sqrt(n)', default_score: 15, source: 'ai' });
  // Python 第二次作业 (7题: 9-15)
  q({ id: 9, course_id: 1, knowledge_point_id: 7, question_type: 'single_choice', difficulty: 'medium', content: '字典的键必须是？', options: ['A. 整数', 'B. 字符串', 'C. 不可变类型', 'D. 任意类型'], answer: 'C', analysis: '字典的键必须是不可变类型（如字符串、数字、元组）', default_score: 10, source: 'ai' });
  q({ id: 10, course_id: 1, knowledge_point_id: 7, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是Python的内置数据类型？（多选）', options: ['A. list', 'B. dict', 'C. array', 'D. set'], answer: 'ABD', analysis: 'array不是Python内置类型，需要导入array模块', default_score: 10, source: 'ai' });
  q({ id: 11, course_id: 1, knowledge_point_id: 8, question_type: 'short_answer', difficulty: 'hard', content: '请编写代码，打开一个文件并读取所有行。', options: null, answer: 'with open("file.txt", "r") as f:\n    lines = f.readlines()', analysis: '考察文件操作与with语句', default_score: 10, source: 'ai' });
  q({ id: 12, course_id: 1, knowledge_point_id: 9, question_type: 'single_choice', difficulty: 'hard', content: 'try-except语句中，finally块什么时候执行？', options: ['A. 仅当没有异常时', 'B. 仅当有异常时', 'C. 无论是否有异常都执行', 'D. 仅在except块执行后'], answer: 'C', analysis: 'finally块无论是否发生异常都会执行', default_score: 10, source: 'ai' });
  q({ id: 13, course_id: 1, knowledge_point_id: 9, question_type: 'judgment', difficulty: 'medium', content: 'Python中，except块可以捕获所有类型的异常。', options: ['正确', '错误'], answer: '正确', analysis: 'except Exception可以捕获所有常规异常，但不能捕获SystemExit等', default_score: 5, source: 'ai' });
  q({ id: 14, course_id: 1, knowledge_point_id: 10, question_type: 'short_answer', difficulty: 'hard', content: '请定义一个Student类，包含name和score属性，以及一个方法判断是否及格（score>=60）。', options: null, answer: 'class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60', analysis: '考察面向对象编程基础', default_score: 15, source: 'ai' });
  q({ id: 15, course_id: 1, knowledge_point_id: 10, question_type: 'code', difficulty: 'hard', content: '请用Python实现一个栈类，包含push、pop、is_empty方法。', options: null, answer: 'class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        return self.items.pop()\n    def is_empty(self):\n        return len(self.items) == 0', analysis: '考察类实现和栈的基本操作', default_score: 15, source: 'ai' });
  // 数据结构作业 (8题: 16-23)
  q({ id: 16, course_id: 2, knowledge_point_id: 11, question_type: 'single_choice', difficulty: 'medium', content: '链表的优点是？', options: ['A. 随机访问快', 'B. 插入删除快', 'C. 内存连续', 'D. 查找快'], answer: 'B', analysis: '链表插入删除时间复杂度O(1)', default_score: 10, source: 'ai' });
  q({ id: 17, course_id: 2, knowledge_point_id: 11, question_type: 'fill_blank', difficulty: 'medium', content: '单链表中，每个节点包含数据域和____域。', options: null, answer: '指针', analysis: '单链表节点包含数据域和指针域', default_score: 5, source: 'ai' });
  q({ id: 18, course_id: 2, knowledge_point_id: 12, question_type: 'single_choice', difficulty: 'medium', content: '栈的特点是？', options: ['A. FIFO', 'B. LIFO', 'C. 随机访问', 'D. 双端操作'], answer: 'B', analysis: '栈是后进先出(LIFO)结构', default_score: 10, source: 'ai' });
  q({ id: 19, course_id: 2, knowledge_point_id: 12, question_type: 'judgment', difficulty: 'easy', content: '队列是先进先出(FIFO)的数据结构。', options: ['正确', '错误'], answer: '正确', analysis: '队列遵循先进先出原则', default_score: 5, source: 'ai' });
  q({ id: 20, course_id: 2, knowledge_point_id: 13, question_type: 'short_answer', difficulty: 'hard', content: '请写出二叉树的前序遍历序列（根->左->右）。树结构：根A，左子B，右子C，B的左子D，B的右子E。', options: null, answer: 'A B D E C', analysis: '前序遍历：先访问根节点，再左子树，最后右子树', default_score: 15, source: 'ai' });
  q({ id: 21, course_id: 2, knowledge_point_id: 13, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是二叉树的遍历方式？（多选）', options: ['A. 前序遍历', 'B. 中序遍历', 'C. 后序遍历', 'D. 随机遍历'], answer: 'ABC', analysis: '二叉树有三种基本遍历方式：前序、中序、后序', default_score: 10, source: 'ai' });
  q({ id: 22, course_id: 2, knowledge_point_id: 14, question_type: 'single_choice', difficulty: 'hard', content: '快速排序的平均时间复杂度是？', options: ['A. O(n)', 'B. O(n log n)', 'C. O(n²)', 'D. O(log n)'], answer: 'B', analysis: '快速排序平均时间复杂度O(n log n)', default_score: 10, source: 'ai' });
  q({ id: 23, course_id: 2, knowledge_point_id: 14, question_type: 'code', difficulty: 'hard', content: '请用Python实现冒泡排序算法。', options: null, answer: 'def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr', analysis: '考察排序算法实现，双重循环比较相邻元素', default_score: 15, source: 'ai' });
  // 数据库作业 (7题: 24-30)
  q({ id: 24, course_id: 3, knowledge_point_id: 32, question_type: 'single_choice', difficulty: 'easy', content: 'SQL中，SELECT语句用于？', options: ['A. 插入数据', 'B. 查询数据', 'C. 更新数据', 'D. 删除数据'], answer: 'B', analysis: 'SELECT用于数据查询', default_score: 10, source: 'ai' });
  q({ id: 25, course_id: 3, knowledge_point_id: 32, question_type: 'fill_blank', difficulty: 'easy', content: 'SQL中，用于删除表的关键字是____ TABLE。', options: null, answer: 'DROP', analysis: 'DROP TABLE用于删除表', default_score: 5, source: 'ai' });
  q({ id: 26, course_id: 3, knowledge_point_id: 32, question_type: 'short_answer', difficulty: 'easy', content: '请写出查询students表中所有记录的SQL语句。', options: null, answer: 'SELECT * FROM students;', analysis: '基础查询语句', default_score: 10, source: 'ai' });
  q({ id: 27, course_id: 3, knowledge_point_id: 33, question_type: 'short_answer', difficulty: 'hard', content: '请写出查询每个班级平均分的SQL语句（假设有scores表和classes表）。', options: null, answer: 'SELECT c.class_name, AVG(s.score) as avg_score\nFROM scores s\nJOIN classes c ON s.class_id = c.id\nGROUP BY c.class_name;', analysis: '考察JOIN和GROUP BY', default_score: 15, source: 'ai' });
  q({ id: 28, course_id: 3, knowledge_point_id: 33, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是SQL的聚合函数？（多选）', options: ['A. COUNT', 'B. SUM', 'C. AVG', 'D. PRINT'], answer: 'ABC', analysis: 'COUNT、SUM、AVG是聚合函数，PRINT不是', default_score: 10, source: 'ai' });
  q({ id: 29, course_id: 3, knowledge_point_id: 34, question_type: 'single_choice', difficulty: 'hard', content: '数据库索引的主要作用是？', options: ['A. 节省存储空间', 'B. 加快查询速度', 'C. 保证数据完整性', 'D. 简化SQL语句'], answer: 'B', analysis: '索引用于加速数据检索', default_score: 10, source: 'ai' });
  q({ id: 30, course_id: 3, knowledge_point_id: 34, question_type: 'judgment', difficulty: 'hard', content: '数据库表应该尽可能多地建立索引以提高查询性能。', options: ['正确', '错误'], answer: '错误', analysis: '过多索引会增加存储开销和写入延迟，应合理建立', default_score: 10, source: 'ai' });
  // 深度学习题 (20题: 31-50)
  q({ id: 31, course_id: 4, knowledge_point_id: 51, question_type: 'single_choice', difficulty: 'easy', content: '人工智能、机器学习、深度学习三者的关系是？', options: ['A. 深度学习⊂机器学习⊂人工智能', 'B. 人工智能⊂机器学习⊂深度学习', 'C. 机器学习⊂人工智能⊂深度学习', 'D. 三者并列'], answer: 'A', analysis: '深度学习是机器学习的子集，机器学习是AI的子集', default_score: 10, source: 'ai' });
  q({ id: 32, course_id: 4, knowledge_point_id: 55, question_type: 'single_choice', difficulty: 'easy', content: '以下哪项属于监督学习？', options: ['A. K-means聚类', 'B. PCA降维', 'C. 线性回归', 'D. 自编码器'], answer: 'C', analysis: '线性回归需要标注数据，属于监督学习', default_score: 10, source: 'ai' });
  q({ id: 33, course_id: 4, knowledge_point_id: 66, question_type: 'single_choice', difficulty: 'medium', content: 'TensorFlow中的张量(tensor)是什么？', options: ['A. 一维数组', 'B. 二维数组', 'C. 多维数组', 'D. 字符串'], answer: 'C', analysis: '张量是TensorFlow中的多维数组数据结构', default_score: 10, source: 'ai' });
  q({ id: 34, course_id: 4, knowledge_point_id: 68, question_type: 'single_choice', difficulty: 'medium', content: 'PyTorch相比于TensorFlow的主要优势是？', options: ['A. 生产部署', 'B. 动态计算图', 'C. 分布式训练', 'D. 模型压缩'], answer: 'B', analysis: 'PyTorch以动态计算图和Pythonic风格著称', default_score: 10, source: 'ai' });
  q({ id: 35, course_id: 4, knowledge_point_id: 71, question_type: 'single_choice', difficulty: 'medium', content: 'NumPy中ndarray的核心特性不包括？', options: ['A. 同质数据', 'B. 广播机制', 'C. 自动求导', 'D. 向量化运算'], answer: 'C', analysis: '自动求导是TensorFlow/PyTorch的功能，非NumPy', default_score: 10, source: 'ai' });
  q({ id: 36, course_id: 4, knowledge_point_id: 77, question_type: 'single_choice', difficulty: 'medium', content: '数组广播(broadcasting)的作用是？', options: ['A. 网络传输', 'B. 不同形状数组运算', 'C. 数据压缩', 'D. 类型转换'], answer: 'B', analysis: '广播允许不同形状的数组进行算术运算', default_score: 10, source: 'ai' });
  q({ id: 37, course_id: 4, knowledge_point_id: 82, question_type: 'fill_blank', difficulty: 'medium', content: 'Matplotlib中用于绘制折线图的函数是____', options: null, answer: 'plot()', analysis: 'plt.plot()是Matplotlib最基础的绘图函数', default_score: 5, source: 'ai' });
  q({ id: 38, course_id: 4, knowledge_point_id: 87, question_type: 'single_choice', difficulty: 'medium', content: 'scikit-learn中train_test_split的作用是？', options: ['A. 数据清洗', 'B. 划分训练集和测试集', 'C. 特征工程', 'D. 模型评估'], answer: 'B', analysis: 'train_test_split用于将数据集划分为训练集和测试集', default_score: 10, source: 'ai' });
  q({ id: 39, course_id: 4, knowledge_point_id: 95, question_type: 'single_choice', difficulty: 'hard', content: 'TensorFlow中GradientTape的作用是？', options: ['A. 模型保存', 'B. 自动微分', 'C. 数据加载', 'D. 模型可视化'], answer: 'B', analysis: 'GradientTape用于记录操作以进行自动微分', default_score: 10, source: 'ai' });
  q({ id: 40, course_id: 4, knowledge_point_id: 98, question_type: 'single_choice', difficulty: 'hard', content: '以下哪项描述了单层感知器的局限性？', options: ['A. 无法处理连续值', 'B. 无法解决XOR问题', 'C. 计算速度慢', 'D. 需要GPU加速'], answer: 'B', analysis: '单层感知器无法解决线性不可分问题如XOR', default_score: 10, source: 'ai' });
  q({ id: 41, course_id: 4, knowledge_point_id: 101, question_type: 'single_choice', difficulty: 'hard', content: 'ReLU激活函数的公式是？', options: ['A. f(x)=1/(1+e^-x)', 'B. f(x)=tanh(x)', 'C. f(x)=max(0,x)', 'D. f(x)=e^x'], answer: 'C', analysis: 'ReLU定义为f(x)=max(0,x)', default_score: 10, source: 'ai' });
  q({ id: 42, course_id: 4, knowledge_point_id: 106, question_type: 'single_choice', difficulty: 'hard', content: '梯度下降中学习率过大会导致？', options: ['A. 收敛过慢', 'B. 震荡发散', 'C. 过拟合', 'D. 欠拟合'], answer: 'B', analysis: '学习率过大可能导致参数在最优解附近震荡甚至发散', default_score: 10, source: 'ai' });
  q({ id: 43, course_id: 4, knowledge_point_id: 107, question_type: 'short_answer', difficulty: 'hard', content: '请简述反向传播算法的基本思想。', options: null, answer: '通过链式法则从输出层向输入层逐层计算损失函数对各参数的梯度，然后用梯度下降更新参数', analysis: '反向传播是神经网络训练的核心算法', default_score: 15, source: 'ai' });
  q({ id: 44, course_id: 4, knowledge_point_id: 110, question_type: 'single_choice', difficulty: 'hard', content: '卷积神经网络中卷积层的主要作用是？', options: ['A. 全连接', 'B. 特征提取', 'C. 分类', 'D. 降维'], answer: 'B', analysis: '卷积层通过卷积核提取局部特征', default_score: 10, source: 'ai' });
  q({ id: 45, course_id: 4, knowledge_point_id: 113, question_type: 'single_choice', difficulty: 'hard', content: 'CNN中池化层(pooling)的作用不包括？', options: ['A. 降维', 'B. 防止过拟合', 'C. 增加参数', 'D. 平移不变性'], answer: 'C', analysis: '池化层减少参数而非增加', default_score: 10, source: 'ai' });
  q({ id: 46, course_id: 4, knowledge_point_id: 121, question_type: 'single_choice', difficulty: 'hard', content: 'RNN处理长序列时面临的主要问题是？', options: ['A. 计算太快', 'B. 梯度消失/爆炸', 'C. 内存不足', 'D. 无法并行'], answer: 'B', analysis: 'RNN在长序列上容易出现梯度消失或梯度爆炸', default_score: 10, source: 'ai' });
  q({ id: 47, course_id: 4, knowledge_point_id: 127, question_type: 'single_choice', difficulty: 'hard', content: 'LSTM中遗忘门的作用是？', options: ['A. 输入新信息', 'B. 决定丢弃哪些旧信息', 'C. 输出结果', 'D. 更新权重'], answer: 'B', analysis: '遗忘门控制要从细胞状态中丢弃哪些信息', default_score: 10, source: 'ai' });
  q({ id: 48, course_id: 4, knowledge_point_id: 133, question_type: 'single_choice', difficulty: 'hard', content: 'GAN由哪两个网络组成？', options: ['A. 编码器和解码器', 'B. 生成器和判别器', 'C. 卷积层和全连接层', 'D. RNN和CNN'], answer: 'B', analysis: 'GAN由生成器(Generator)和判别器(Discriminator)组成', default_score: 10, source: 'ai' });
  q({ id: 49, course_id: 4, knowledge_point_id: 137, question_type: 'single_choice', difficulty: 'hard', content: 'GAN训练中常见的问题是？', options: ['A. 模型过小', 'B. 模式坍塌', 'C. 数据太少', 'D. 学习率太低'], answer: 'B', analysis: '模式坍塌(Model Collapse)是GAN训练的经典问题', default_score: 10, source: 'ai' });
  q({ id: 50, course_id: 4, knowledge_point_id: 144, question_type: 'single_choice', difficulty: 'hard', content: '迁移学习中"冻结卷积基"的含义是？', options: ['A. 删除卷积层', 'B. 不更新预训练卷积层权重', 'C. 降低学习率', 'D. 增加卷积层'], answer: 'B', analysis: '冻结卷积基即保持预训练模型的卷积层权重不变', default_score: 10, source: 'ai' });
  // 多选题 (multi_choice, 51-65)
  q({ id: 51, course_id: 1, knowledge_point_id: 1, question_type: 'multi_choice', difficulty: 'medium', content: '以下哪些是Python的不可变数据类型？', options: ['A. int', 'B. str', 'C. list', 'D. tuple', 'E. dict'], answer: 'ABD', analysis: 'int、str、tuple不可变，list和dict可变', default_score: 10, source: 'ai' });
  q({ id: 52, course_id: 1, knowledge_point_id: 3, question_type: 'multi_choice', difficulty: 'medium', content: 'Python中的循环语句有哪些？', options: ['A. for', 'B. while', 'C. do-while', 'D. loop'], answer: 'AB', analysis: 'Python支持for和while循环，没有do-while', default_score: 10, source: 'ai' });
  q({ id: 53, course_id: 1, knowledge_point_id: 6, question_type: 'multi_choice', difficulty: 'hard', content: '以下哪些是Python字典的方法？', options: ['A. keys()', 'B. values()', 'C. items()', 'D. append()', 'E. get()'], answer: 'ABCE', analysis: 'append()是列表方法，keys/values/items/get是字典方法', default_score: 10, source: 'ai' });
  q({ id: 54, course_id: 1, knowledge_point_id: 5, question_type: 'multi_choice', difficulty: 'medium', content: '关于Python函数，以下说法正确的有？', options: ['A. 可以有默认参数', 'B. 可以返回多个值', 'C. 支持递归调用', 'D. 参数传递是值传递'], answer: 'ABC', analysis: 'Python参数传递是引用传递（传对象引用），非值传递', default_score: 10, source: 'ai' });
  q({ id: 55, course_id: 2, knowledge_point_id: 11, question_type: 'multi_choice', difficulty: 'medium', content: '以下哪些数据结构属于线性结构？', options: ['A. 数组', 'B. 链表', 'C. 二叉树', 'D. 栈', 'E. 队列'], answer: 'ABDE', analysis: '二叉树是树形非线性结构，其他为线性结构', default_score: 10, source: 'ai' });
  q({ id: 56, course_id: 2, knowledge_point_id: 13, question_type: 'multi_choice', difficulty: 'hard', content: '以下关于二叉搜索树的说法正确的有？', options: ['A. 左子树所有节点值小于根节点', 'B. 右子树所有节点值大于根节点', 'C. 中序遍历得到有序序列', 'D. 最坏情况下退化为链表'], answer: 'ABCD', analysis: '四个选项都是二叉搜索树的正确性质', default_score: 10, source: 'ai' });
  q({ id: 57, course_id: 2, knowledge_point_id: 16, question_type: 'multi_choice', difficulty: 'hard', content: '以下哪些排序算法是稳定的？', options: ['A. 冒泡排序', 'B. 快速排序', 'C. 归并排序', 'D. 插入排序', 'E. 选择排序'], answer: 'ACD', analysis: '冒泡、归并、插入是稳定排序；快排和选择排序不稳定', default_score: 10, source: 'ai' });
  q({ id: 58, course_id: 2, knowledge_point_id: 18, question_type: 'multi_choice', difficulty: 'medium', content: '图的遍历算法包括？', options: ['A. 深度优先搜索(DFS)', 'B. 广度优先搜索(BFS)', 'C. 二分查找', 'D. Dijkstra算法'], answer: 'ABD', analysis: '二分查找是查找算法，DFS/BFS/Dijkstra都可以遍历图', default_score: 10, source: 'ai' });
  q({ id: 59, course_id: 3, knowledge_point_id: 32, question_type: 'multi_choice', difficulty: 'medium', content: 'SQL支持的连接类型有哪些？', options: ['A. INNER JOIN', 'B. LEFT JOIN', 'C. RIGHT JOIN', 'D. FULL OUTER JOIN', 'E. CROSS JOIN'], answer: 'ABCDE', analysis: 'SQL标准支持所有五种连接类型', default_score: 10, source: 'ai' });
  q({ id: 60, course_id: 3, knowledge_point_id: 34, question_type: 'multi_choice', difficulty: 'hard', content: '以下哪些SQL语句会使用索引？', options: ["A. SELECT WHERE id=1", "B. SELECT WHERE name LIKE '张%'", 'C. SELECT WHERE YEAR(date)=2024', 'D. SELECT ORDER BY indexed_col'], answer: 'ABD', analysis: '对索引列使用函数(YEAR)会使索引失效', default_score: 10, source: 'ai' });
  q({ id: 61, course_id: 3, knowledge_point_id: 35, question_type: 'multi_choice', difficulty: 'hard', content: '数据库事务的ACID特性包括？', options: ['A. 原子性(Atomicity)', 'B. 一致性(Consistency)', 'C. 隔离性(Isolation)', 'D. 持久性(Durability)'], answer: 'ABCD', analysis: 'ACID即Atomicity, Consistency, Isolation, Durability', default_score: 10, source: 'ai' });
  q({ id: 62, course_id: 3, knowledge_point_id: 32, question_type: 'multi_choice', difficulty: 'medium', content: '以下哪些是聚合函数？', options: ['A. COUNT()', 'B. SUM()', 'C. AVG()', 'D. MAX()', 'E. MIN()'], answer: 'ABCDE', analysis: '五种都是标准SQL聚合函数', default_score: 10, source: 'ai' });
  q({ id: 63, course_id: 4, knowledge_point_id: 71, question_type: 'multi_choice', difficulty: 'medium', content: '以下哪些是NumPy数组的属性？', options: ['A. shape', 'B. dtype', 'C. ndim', 'D. size', 'E. columns'], answer: 'ABCD', analysis: 'columns是Pandas DataFrame的属性，不是NumPy的', default_score: 10, source: 'ai' });
  q({ id: 64, course_id: 4, knowledge_point_id: 106, question_type: 'multi_choice', difficulty: 'hard', content: '以下哪些是常见的优化器？', options: ['A. SGD', 'B. Adam', 'C. RMSprop', 'D. ReLU', 'E. Adagrad'], answer: 'ABCE', analysis: 'ReLU是激活函数，其余都是优化器', default_score: 10, source: 'ai' });
  q({ id: 65, course_id: 4, knowledge_point_id: 133, question_type: 'multi_choice', difficulty: 'hard', content: '以下哪些是生成对抗网络(GAN)的应用？', options: ['A. 图像生成', 'B. 风格迁移', 'C. 数据增强', 'D. 超分辨率重建'], answer: 'ABCD', analysis: 'GAN广泛应用于图像生成、风格迁移、数据增强和超分辨率', default_score: 10, source: 'ai' });
  // 填空题 (fill_blank, 66-80)
  q({ id: 66, course_id: 1, knowledge_point_id: 1, question_type: 'fill_blank', difficulty: 'medium', content: 'Python中使用____关键字定义一个函数。', options: null, answer: 'def', analysis: 'def是Python定义函数的关键字', default_score: 10, source: 'ai' });
  q({ id: 67, course_id: 1, knowledge_point_id: 3, question_type: 'fill_blank', difficulty: 'medium', content: '在Python循环中，____语句用于跳过当前迭代继续下一次循环。', options: null, answer: 'continue', analysis: 'continue跳过当次循环，break终止整个循环', default_score: 10, source: 'ai' });
  q({ id: 68, course_id: 1, knowledge_point_id: 6, question_type: 'fill_blank', difficulty: 'hard', content: 'Python字典中，通过____方法安全获取键值（键不存在返回None而非报错）。', options: null, answer: 'get()', analysis: 'dict.get(key)在键不存在时返回None而非抛出KeyError', default_score: 10, source: 'ai' });
  q({ id: 69, course_id: 1, knowledge_point_id: 5, question_type: 'fill_blank', difficulty: 'medium', content: 'Python中____关键字用于导入模块。', options: null, answer: 'import', analysis: 'import是Python导入模块的关键字', default_score: 10, source: 'ai' });
  q({ id: 70, course_id: 2, knowledge_point_id: 11, question_type: 'fill_blank', difficulty: 'medium', content: '数组在内存中是____存储的（连续/离散）。', options: null, answer: '连续', analysis: '数组元素在内存中连续存放，便于随机访问', default_score: 10, source: 'ai' });
  q({ id: 71, course_id: 2, knowledge_point_id: 16, question_type: 'fill_blank', difficulty: 'hard', content: '一棵有n个节点的完全二叉树的深度为____（向下取整）。', options: null, answer: 'log2(n)+1', analysis: '完全二叉树深度为floor(log2(n))+1', default_score: 10, source: 'ai' });
  q({ id: 72, course_id: 2, knowledge_point_id: 14, question_type: 'fill_blank', difficulty: 'hard', content: '快速排序的平均时间复杂度为____。', options: null, answer: 'O(nlogn)', analysis: '快速排序平均时间复杂度O(n log n)', default_score: 10, source: 'ai' });
  q({ id: 73, course_id: 2, knowledge_point_id: 18, question_type: 'fill_blank', difficulty: 'medium', content: '图的广度优先搜索(BFS)使用____数据结构辅助实现。', options: null, answer: '队列', analysis: 'BFS使用队列实现层级遍历', default_score: 10, source: 'ai' });
  q({ id: 74, course_id: 3, knowledge_point_id: 32, question_type: 'fill_blank', difficulty: 'medium', content: 'SQL中____语句用于从表中删除数据。', options: null, answer: 'DELETE', analysis: 'DELETE FROM table WHERE condition', default_score: 10, source: 'ai' });
  q({ id: 75, course_id: 3, knowledge_point_id: 34, question_type: 'fill_blank', difficulty: 'hard', content: '数据库索引通常使用____数据结构实现以加速查询。', options: null, answer: 'B+树', analysis: 'B+树是数据库索引最常用的数据结构', default_score: 10, source: 'ai' });
  q({ id: 76, course_id: 3, knowledge_point_id: 35, question_type: 'fill_blank', difficulty: 'hard', content: '事务的____特性保证并发事务之间相互隔离。', options: null, answer: '隔离性', analysis: '隔离性(Isolation)是ACID的I', default_score: 10, source: 'ai' });
  q({ id: 77, course_id: 3, knowledge_point_id: 32, question_type: 'fill_blank', difficulty: 'medium', content: 'SQL中____子句用于对分组后的结果进行过滤。', options: null, answer: 'HAVING', analysis: 'HAVING用于过滤GROUP BY后的结果，WHERE用于过滤原始行', default_score: 10, source: 'ai' });
  q({ id: 78, course_id: 4, knowledge_point_id: 71, question_type: 'fill_blank', difficulty: 'medium', content: 'NumPy中用____函数创建全零数组。', options: null, answer: 'np.zeros()', analysis: 'np.zeros(shape)创建全零数组', default_score: 10, source: 'ai' });
  q({ id: 79, course_id: 4, knowledge_point_id: 106, question_type: 'fill_blank', difficulty: 'hard', content: '神经网络训练中，____现象指模型在训练集上表现好但在测试集上表现差。', options: null, answer: '过拟合', analysis: '过拟合(overfitting)是深度学习常见问题', default_score: 10, source: 'ai' });
  q({ id: 80, course_id: 4, knowledge_point_id: 133, question_type: 'fill_blank', difficulty: 'hard', content: 'GAN的训练过程可以描述为生成器与判别器之间的____博弈。', options: null, answer: '极小极大', analysis: 'GAN的训练是min-max博弈过程', default_score: 10, source: 'ai' });
  // 编程题 (code, 81-95)
  q({ id: 81, course_id: 1, knowledge_point_id: 3, question_type: 'code', difficulty: 'medium', content: '编写Python函数计算1到n的累加和，使用递归实现。', options: null, answer: 'def recursive_sum(n):\n    if n == 1:\n        return 1\n    return n + recursive_sum(n - 1)', analysis: '递归累加，基线条件n==1，递归调用n+sum(n-1)', default_score: 15, source: 'ai' });
  q({ id: 82, course_id: 1, knowledge_point_id: 6, question_type: 'code', difficulty: 'hard', content: '请编写一个函数，统计一段英文文本中每个单词出现的次数（不区分大小写）。', options: null, answer: 'def word_count(text):\n    from collections import Counter\n    words = text.lower().split()\n    return dict(Counter(words))', analysis: '使用Counter统计词频，需处理大小写', default_score: 15, source: 'ai' });
  q({ id: 83, course_id: 1, knowledge_point_id: 5, question_type: 'code', difficulty: 'medium', content: '编写一个装饰器timer，用于计算被装饰函数执行时间并打印。', options: null, answer: 'import time\n\ndef timer(func):\n    def wrapper(*args, **kwargs):\n        start = time.time()\n        result = func(*args, **kwargs)\n        print(f"耗时: {time.time()-start:.2f}s")\n        return result\n    return wrapper', analysis: '装饰器在函数调用前后记录时间差', default_score: 15, source: 'ai' });
  q({ id: 84, course_id: 1, knowledge_point_id: 6, question_type: 'code', difficulty: 'hard', content: '请实现一个函数，找出列表中第K大的元素（不使用排序）。', options: null, answer: 'import heapq\n\ndef find_kth_largest(nums, k):\n    return heapq.nlargest(k, nums)[-1]', analysis: '使用堆可以O(n log k)找到第K大元素', default_score: 15, source: 'ai' });
  q({ id: 85, course_id: 2, knowledge_point_id: 12, question_type: 'code', difficulty: 'medium', content: '实现单链表的反转函数。', options: null, answer: 'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head):\n    prev, curr = None, head\n    while curr:\n        nxt = curr.next\n        curr.next = prev\n        prev = curr\n        curr = nxt\n    return prev', analysis: '三指针法：prev当前节点前驱，curr当前节点，nxt保存下一个', default_score: 15, source: 'ai' });
  q({ id: 86, course_id: 2, knowledge_point_id: 14, question_type: 'code', difficulty: 'hard', content: '实现快速排序算法（原地排序版本）。', options: null, answer: 'def quick_sort(arr, low=0, high=None):\n    if high is None:\n        high = len(arr) - 1\n    if low < high:\n        pi = partition(arr, low, high)\n        quick_sort(arr, low, pi - 1)\n        quick_sort(arr, pi + 1, high)\n    return arr\n\ndef partition(arr, low, high):\n    pivot = arr[high]\n    i = low - 1\n    for j in range(low, high):\n        if arr[j] <= pivot:\n            i += 1\n            arr[i], arr[j] = arr[j], arr[i]\n    arr[i+1], arr[high] = arr[high], arr[i+1]\n    return i + 1', analysis: '原地快排，pivot选最后一个元素，partition返回pivot位置', default_score: 15, source: 'ai' });
  q({ id: 87, course_id: 2, knowledge_point_id: 16, question_type: 'code', difficulty: 'medium', content: '实现二叉树的前序遍历（迭代法，不使用递归）。', options: null, answer: 'def preorder_traversal(root):\n    if not root:\n        return []\n    result, stack = [], [root]\n    while stack:\n        node = stack.pop()\n        result.append(node.val)\n        if node.right:\n            stack.append(node.right)\n        if node.left:\n            stack.append(node.left)\n    return result', analysis: '使用栈模拟递归，先右后左入栈保证先序', default_score: 15, source: 'ai' });
  q({ id: 88, course_id: 2, knowledge_point_id: 18, question_type: 'code', difficulty: 'hard', content: '实现Dijkstra算法求单源最短路径。', options: null, answer: 'import heapq\n\ndef dijkstra(graph, start):\n    dist = {node: float("inf") for node in graph}\n    dist[start] = 0\n    pq = [(0, start)]\n    while pq:\n        d, u = heapq.heappop(pq)\n        if d > dist[u]:\n            continue\n        for v, w in graph[u].items():\n            nd = d + w\n            if nd < dist[v]:\n                dist[v] = nd\n                heapq.heappush(pq, (nd, v))\n    return dist', analysis: '使用优先队列优化的Dijkstra，O((V+E)logV)', default_score: 15, source: 'ai' });
  q({ id: 89, course_id: 3, knowledge_point_id: 32, question_type: 'code', difficulty: 'medium', content: '用Python连接SQLite数据库，创建表students并插入一条记录。', options: null, answer: 'import sqlite3\n\nconn = sqlite3.connect("school.db")\ncursor = conn.cursor()\ncursor.execute("CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, score REAL)")\ncursor.execute("INSERT INTO students VALUES (1, \'张三\', 95.5)")\nconn.commit()\nconn.close()', analysis: '使用sqlite3库连接数据库，执行DDL和DML操作', default_score: 15, source: 'ai' });
  q({ id: 90, course_id: 3, knowledge_point_id: 32, question_type: 'code', difficulty: 'hard', content: '写一个SQL查询，从scores表中查询各科目的平均分和最高分，按平均分降序排列。', options: null, answer: 'SELECT subject, AVG(score) as avg_score, MAX(score) as max_score\nFROM scores\nGROUP BY subject\nORDER BY avg_score DESC;', analysis: 'GROUP BY分组聚合，ORDER BY排序', default_score: 15, source: 'ai' });
  q({ id: 91, course_id: 3, knowledge_point_id: 35, question_type: 'code', difficulty: 'hard', content: '用Python实现一个简单的连接池模式，支持获取和归还连接。', options: null, answer: 'import threading\nfrom queue import Queue\n\nclass ConnectionPool:\n    def __init__(self, create_fn, size=5):\n        self._pool = Queue(maxsize=size)\n        self._create_fn = create_fn\n        for _ in range(size):\n            self._pool.put(create_fn())\n    \n    def get(self):\n        return self._pool.get()\n    \n    def put(self, conn):\n        self._pool.put(conn)', analysis: '使用Queue管理连接，线程安全', default_score: 15, source: 'ai' });
  q({ id: 92, course_id: 3, knowledge_point_id: 34, question_type: 'code', difficulty: 'medium', content: '写SQL为users表的email列创建唯一索引。', options: null, answer: 'CREATE UNIQUE INDEX idx_users_email ON users(email);', analysis: '唯一索引保证email列值唯一且加速查询', default_score: 15, source: 'ai' });
  q({ id: 93, course_id: 4, knowledge_point_id: 71, question_type: 'code', difficulty: 'medium', content: '用NumPy实现矩阵乘法，不使用np.dot。', options: null, answer: 'import numpy as np\n\ndef matrix_multiply(A, B):\n    m, n = A.shape\n    _, p = B.shape\n    C = np.zeros((m, p))\n    for i in range(m):\n        for j in range(p):\n            for k in range(n):\n                C[i][j] += A[i][k] * B[k][j]\n    return C', analysis: '三层循环实现矩阵乘法，时间复杂度O(mnp)', default_score: 15, source: 'ai' });
  q({ id: 94, course_id: 4, knowledge_point_id: 106, question_type: 'code', difficulty: 'hard', content: '用Python实现一个简单的两层神经网络前向传播（无框架）。', options: null, answer: 'import numpy as np\n\ndef sigmoid(x):\n    return 1 / (1 + np.exp(-x))\n\ndef forward(X, W1, b1, W2, b2):\n    z1 = np.dot(X, W1) + b1\n    a1 = sigmoid(z1)\n    z2 = np.dot(a1, W2) + b2\n    a2 = sigmoid(z2)\n    return a2', analysis: '两层全连接网络，sigmoid激活函数', default_score: 15, source: 'ai' });
  q({ id: 95, course_id: 4, knowledge_point_id: 133, question_type: 'code', difficulty: 'hard', content: '用PyTorch定义一个简单的生成器网络（用于GAN），输入100维噪声输出28x28图像。', options: null, answer: 'import torch.nn as nn\n\nclass Generator(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.model = nn.Sequential(\n            nn.Linear(100, 256),\n            nn.ReLU(),\n            nn.Linear(256, 512),\n            nn.ReLU(),\n            nn.Linear(512, 784),\n            nn.Tanh()\n        )\n    \n    def forward(self, z):\n        return self.model(z).view(-1, 1, 28, 28)', analysis: 'GAN生成器将噪声映射为图像，使用线性层+ReLU+Tanh', default_score: 15, source: 'ai' });
  // Python 进阶20题 (96-115)
  q({ id: 96, course_id: 1, knowledge_point_id: 1, question_type: 'fill_blank', difficulty: 'medium', content: 'Python中，使用____函数可以获取变量的内存地址。', options: null, answer: 'id()', analysis: 'id()返回对象的唯一标识符（内存地址）', default_score: 5, source: 'ai' });
  q({ id: 97, course_id: 1, knowledge_point_id: 2, question_type: 'single_choice', difficulty: 'medium', content: 'Python中，表达式 3 * "abc" + "def" 的结果是？', options: ['A. abcabcabcdef', 'B. 3abcdef', 'C. abc3def', 'D. 报错'], answer: 'A', analysis: '字符串乘法重复3次得abcabcabc，再拼接def', default_score: 10, source: 'ai' });
  q({ id: 98, course_id: 1, knowledge_point_id: 2, question_type: 'judgment', difficulty: 'medium', content: 'Python中，s = "hello"; s[0] = "H" 这行代码可以正确运行。', options: ['正确', '错误'], answer: '错误', analysis: 'Python字符串是不可变类型，不能原地修改', default_score: 5, source: 'ai' });
  q({ id: 99, course_id: 1, knowledge_point_id: 3, question_type: 'code', difficulty: 'hard', content: '用while循环实现二分查找算法，在有序列表中查找目标值。', options: null, answer: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1', analysis: '二分查找在有序数组中查找，O(log n)', default_score: 15, source: 'ai' });
  q({ id: 100, course_id: 1, knowledge_point_id: 3, question_type: 'single_choice', difficulty: 'easy', content: 'for i in range(1, 10, 3) 一共循环几次？', options: ['A. 2次', 'B. 3次', 'C. 4次', 'D. 10次'], answer: 'B', analysis: 'range(1,10,3)->1,4,7，共3次', default_score: 10, source: 'ai' });
  q({ id: 101, course_id: 1, knowledge_point_id: 4, question_type: 'fill_blank', difficulty: 'medium', content: 'Python中，匿名函数使用____关键字定义。', options: null, answer: 'lambda', analysis: 'lambda关键字用于创建匿名函数', default_score: 5, source: 'ai' });
  q({ id: 102, course_id: 1, knowledge_point_id: 5, question_type: 'code', difficulty: 'hard', content: '用Python编写一个生成斐波那契数列的生成器函数（使用yield）。', options: null, answer: 'def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        yield a\n        a, b = b, a + b', analysis: '生成器使用yield逐步产生值，节省内存', default_score: 15, source: 'ai' });
  q({ id: 103, course_id: 1, knowledge_point_id: 5, question_type: 'multiple_choice', difficulty: 'medium', content: '以下关于Python函数参数的说法正确的有？', options: ['A. 支持默认参数值', 'B. 支持可变参数*args', 'C. 支持关键字参数**kwargs', 'D. 参数传递是值传递'], answer: 'ABC', analysis: 'Python参数传递是引用传递，非值传递', default_score: 10, source: 'ai' });
  q({ id: 104, course_id: 1, knowledge_point_id: 6, question_type: 'single_choice', difficulty: 'hard', content: 'Python中，列表推导式 [x for x in range(10) if x % 2 == 0] 的结果是？', options: ['A. [1,3,5,7,9]', 'B. [0,2,4,6,8]', 'C. [0,1,2,3,4,5,6,7,8,9]', 'D. [2,4,6,8]'], answer: 'B', analysis: '取0-9中偶数，即[0,2,4,6,8]', default_score: 10, source: 'ai' });
  q({ id: 105, course_id: 1, knowledge_point_id: 6, question_type: 'code', difficulty: 'medium', content: '用字典推导式将一个列表中元素及其平方存入字典。', options: null, answer: '{x: x**2 for x in [1,2,3,4,5]}', analysis: '字典推导式语法 {key: value for item in iterable}', default_score: 15, source: 'ai' });
  q({ id: 106, course_id: 1, knowledge_point_id: 7, question_type: 'judgment', difficulty: 'medium', content: 'Python字典的键可以使用列表(list)作为键。', options: ['正确', '错误'], answer: '错误', analysis: '字典键必须是可哈希（不可变）类型，列表可变不能作为键', default_score: 5, source: 'ai' });
  q({ id: 107, course_id: 1, knowledge_point_id: 8, question_type: 'fill_blank', difficulty: 'medium', content: 'Python中，____关键字用于在with语句中打开文件并确保自动关闭。', options: null, answer: 'open', analysis: 'with open()自动管理文件资源', default_score: 5, source: 'ai' });
  q({ id: 108, course_id: 1, knowledge_point_id: 8, question_type: 'single_choice', difficulty: 'easy', content: '文件操作mode="w"和mode="a"的区别是？', options: ['A. 都追加写入', 'B. w覆盖写入/a追加写入', 'C. w只读/a可写', 'D. 无区别'], answer: 'B', analysis: 'w模式会清空文件重新写入，a模式在末尾追加', default_score: 10, source: 'ai' });
  q({ id: 109, course_id: 1, knowledge_point_id: 9, question_type: 'code', difficulty: 'hard', content: '编写代码：捕获ZeroDivisionError和ValueError，打印不同错误信息后继续执行。', options: null, answer: 'try:\n    x = int(input()) / int(input())\nexcept ZeroDivisionError:\n    print("除数不能为零")\nexcept ValueError:\n    print("请输入有效数字")', analysis: '多except分支精确捕获不同异常', default_score: 15, source: 'ai' });
  q({ id: 110, course_id: 1, knowledge_point_id: 10, question_type: 'single_choice', difficulty: 'hard', content: 'Python中，super().__init__()的作用是？', options: ['A. 创建新实例', 'B. 调用父类构造函数', 'C. 强制垃圾回收', 'D. 终止程序'], answer: 'B', analysis: 'super()用于调用父类的方法', default_score: 10, source: 'ai' });
  q({ id: 111, course_id: 1, knowledge_point_id: 10, question_type: 'code', difficulty: 'hard', content: '定义一个继承自list的类，添加sum方法返回所有元素之和。', options: null, answer: 'class MyList(list):\n    def sum(self):\n        return sum(self)', analysis: '继承内置类型并扩展方法', default_score: 15, source: 'ai' });
  q({ id: 112, course_id: 1, knowledge_point_id: 6, question_type: 'single_choice', difficulty: 'medium', content: 'NumPy中，arr[arr > 5] 返回什么？', options: ['A. 布尔数组', 'B. 大于5的元素组成的数组', 'C. 原数组', 'D. 空数组'], answer: 'B', analysis: '布尔索引，返回所有满足条件的元素', default_score: 10, source: 'ai' });
  q({ id: 113, course_id: 1, knowledge_point_id: 5, question_type: 'judgment', difficulty: 'easy', content: 'Python函数可以返回多个值，实际是以元组形式返回的。', options: ['正确', '错误'], answer: '正确', analysis: 'Python多返回值本质是返回一个元组', default_score: 5, source: 'ai' });
  q({ id: 114, course_id: 1, knowledge_point_id: 9, question_type: 'single_choice', difficulty: 'medium', content: 'raise关键字的作用是？', options: ['A. 捕获异常', 'B. 主动抛出异常', 'C. 忽略异常', 'D. 记录异常'], answer: 'B', analysis: 'raise用于主动抛出异常', default_score: 10, source: 'ai' });
  q({ id: 115, course_id: 1, knowledge_point_id: 10, question_type: 'fill_blank', difficulty: 'hard', content: 'Python中，____装饰器可以将类中的方法变成属性方式调用。', options: null, answer: '@property', analysis: '@property装饰器让方法像属性一样访问', default_score: 5, source: 'ai' });
  // DS 25题 (116-140)
  q({ id: 116, course_id: 2, knowledge_point_id: 11, question_type: 'single_choice', difficulty: 'hard', content: '双向链表相比于单向链表的优势是？', options: ['A. 节省内存', 'B. 可双向遍历', 'C. 插入更快', 'D. 排序更快'], answer: 'B', analysis: '双向链表每个节点有prev和next指针，可双向遍历', default_score: 10, source: 'ai' });
  q({ id: 117, course_id: 2, knowledge_point_id: 11, question_type: 'code', difficulty: 'hard', content: '实现一个函数，检测单链表是否有环（快慢指针法）。', options: null, answer: 'def has_cycle(head):\n    slow = fast = head\n    while fast and fast.next:\n        slow = slow.next\n        fast = fast.next.next\n        if slow == fast:\n            return True\n    return False', analysis: '快慢指针：快指针每次两步，慢指针一步，相遇则有环', default_score: 15, source: 'ai' });
  q({ id: 118, course_id: 2, knowledge_point_id: 12, question_type: 'fill_blank', difficulty: 'easy', content: '栈的典型应用场景包括函数调用、____撤销和括号匹配。', options: null, answer: '操作', analysis: '栈的LIFO特性适用于操作撤销（Undo）', default_score: 5, source: 'ai' });
  q({ id: 119, course_id: 2, knowledge_point_id: 13, question_type: 'judgment', difficulty: 'medium', content: '满二叉树一定是完全二叉树。', options: ['正确', '错误'], answer: '错误', analysis: '满二叉树≠完全二叉树，完全二叉树要求最后一层节点靠左排列', default_score: 5, source: 'ai' });
  q({ id: 120, course_id: 2, knowledge_point_id: 14, question_type: 'single_choice', difficulty: 'hard', content: '堆排序的时间复杂度是？', options: ['A. O(n)', 'B. O(n log n)', 'C. O(n^2)', 'D. O(2^n)'], answer: 'B', analysis: '堆排序建堆O(n)，每次调整O(log n)，总计O(n log n)', default_score: 10, source: 'ai' });
  q({ id: 121, course_id: 2, knowledge_point_id: 15, question_type: 'fill_blank', difficulty: 'medium', content: '图的存储方式主要有邻接矩阵和____两种。', options: null, answer: '邻接表', analysis: '邻接矩阵适合稠密图，邻接表适合稀疏图', default_score: 5, source: 'ai' });
  q({ id: 122, course_id: 2, knowledge_point_id: 16, question_type: 'code', difficulty: 'hard', content: '用DFS实现图的连通分量计数。', options: null, answer: 'def count_components(graph):\n    visited = set()\n    count = 0\n    def dfs(node):\n        visited.add(node)\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                dfs(neighbor)\n    for node in graph:\n        if node not in visited:\n            count += 1\n            dfs(node)\n    return count', analysis: 'DFS遍历每个连通分量，计数未访问节点的启动次数', default_score: 15, source: 'ai' });
  q({ id: 123, course_id: 2, knowledge_point_id: 17, question_type: 'single_choice', difficulty: 'medium', content: '顺序查找的平均时间复杂度是？', options: ['A. O(1)', 'B. O(log n)', 'C. O(n)', 'D. O(n^2)'], answer: 'C', analysis: '顺序查找遍历所有元素，平均查找一半，O(n)', default_score: 10, source: 'ai' });
  q({ id: 124, course_id: 2, knowledge_point_id: 18, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是哈希表解决冲突的方法？', options: ['A. 链地址法', 'B. 开放地址法', 'C. 再哈希法', 'D. 二分法'], answer: 'ABC', analysis: '链地址法、开放地址法、再哈希法是常见冲突解决方法', default_score: 10, source: 'ai' });
  q({ id: 125, course_id: 2, knowledge_point_id: 19, question_type: 'judgment', difficulty: 'medium', content: 'AVL树是一种自平衡二叉搜索树，任意节点左右子树高度差不超过1。', options: ['正确', '错误'], answer: '正确', analysis: 'AVL树通过旋转保持平衡因子不超过1', default_score: 5, source: 'ai' });
  q({ id: 126, course_id: 2, knowledge_point_id: 20, question_type: 'single_choice', difficulty: 'hard', content: '红黑树相比于AVL树的优势是？', options: ['A. 查找更快', 'B. 插入删除旋转次数更少', 'C. 更节省内存', 'D. 更容易实现'], answer: 'B', analysis: '红黑树牺牲部分平衡性换取插入删除时的更少旋转', default_score: 10, source: 'ai' });
  q({ id: 127, course_id: 2, knowledge_point_id: 21, question_type: 'fill_blank', difficulty: 'medium', content: 'B树和B+树的主要区别是B+树的所有数据存储在____节点中。', options: null, answer: '叶子', analysis: 'B+树内部节点只存索引，数据全在叶子节点，支持范围查询', default_score: 5, source: 'ai' });
  q({ id: 128, course_id: 2, knowledge_point_id: 22, question_type: 'code', difficulty: 'hard', content: '用Python实现一个最小堆的插入操作。', options: null, answer: 'class MinHeap:\n    def __init__(self):\n        self.heap = []\n    def insert(self, val):\n        self.heap.append(val)\n        i = len(self.heap) - 1\n        while i > 0 and self.heap[i] < self.heap[(i-1)//2]:\n            self.heap[i], self.heap[(i-1)//2] = self.heap[(i-1)//2], self.heap[i]\n            i = (i-1)//2', analysis: '上浮操作：新元素与父节点比较交换', default_score: 15, source: 'ai' });
  q({ id: 129, course_id: 2, knowledge_point_id: 23, question_type: 'single_choice', difficulty: 'medium', content: 'Trie树（前缀树）最适合用于？', options: ['A. 数值排序', 'B. 字符串前缀匹配', 'C. 图搜索', 'D. 矩阵运算'], answer: 'B', analysis: 'Trie树专为字符串前缀匹配设计，如自动补全', default_score: 10, source: 'ai' });
  // DS V3.3 剩余题 + DB V3.3 题 (130-165)
  // Using a helper for brevity - includes all remaining V3.3 questions directly
  q({ id: 130, course_id: 2, knowledge_point_id: 24, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是贪心算法的经典应用？', options: ['A. 霍夫曼编码', 'B. 最小生成树Prim算法', 'C. 活动选择问题', 'D. 0-1背包问题'], answer: 'ABC', analysis: '0-1背包需动态规划，贪心不能保证最优解', default_score: 10, source: 'ai' });
  q({ id: 131, course_id: 2, knowledge_point_id: 25, question_type: 'code', difficulty: 'hard', content: '用动态规划解决爬楼梯问题：每次可爬1或2级，爬到n级有多少种方法？', options: null, answer: 'def climb_stairs(n):\n    if n <= 2:\n        return n\n    dp = [0] * (n + 1)\n    dp[1], dp[2] = 1, 2\n    for i in range(3, n + 1):\n        dp[i] = dp[i - 1] + dp[i - 2]\n    return dp[n]', analysis: 'dp[i]=dp[i-1]+dp[i-2]，类似斐波那契', default_score: 15, source: 'ai' });
  q({ id: 132, course_id: 2, knowledge_point_id: 26, question_type: 'judgment', difficulty: 'medium', content: '归并排序是原地排序算法。', options: ['正确', '错误'], answer: '错误', analysis: '归并排序需要O(n)额外空间，不是原地排序', default_score: 5, source: 'ai' });
  q({ id: 133, course_id: 2, knowledge_point_id: 26, question_type: 'fill_blank', difficulty: 'hard', content: '基数排序的时间复杂度是____，其中d是位数，k是基数。', options: null, answer: 'O(d(n+k))', analysis: '基数排序逐位排序，每趟O(n+k)，共d趟', default_score: 5, source: 'ai' });
  q({ id: 134, course_id: 2, knowledge_point_id: 22, question_type: 'single_choice', difficulty: 'medium', content: '二叉堆中，下标为i的节点的左子节点下标是？', options: ['A. i+1', 'B. 2i', 'C. 2i+1', 'D. i*2-1'], answer: 'C', analysis: '数组存储二叉堆，下标从0开始：left=2i+1，right=2i+2', default_score: 10, source: 'ai' });
  q({ id: 135, course_id: 2, knowledge_point_id: 15, question_type: 'single_choice', difficulty: 'hard', content: '无向图中，所有顶点度数之和等于？', options: ['A. 顶点数', 'B. 边数', 'C. 边数的2倍', 'D. 顶点数的2倍'], answer: 'C', analysis: '握手定理：无向图中所有顶点度数之和=2x边数', default_score: 10, source: 'ai' });
  q({ id: 136, course_id: 2, knowledge_point_id: 20, question_type: 'code', difficulty: 'hard', content: '实现二叉树的中序遍历（迭代法，不使用递归）。', options: null, answer: 'def inorder_traversal(root):\n    result, stack = [], []\n    curr = root\n    while curr or stack:\n        while curr:\n            stack.append(curr)\n            curr = curr.left\n        curr = stack.pop()\n        result.append(curr.val)\n        curr = curr.right\n    return result', analysis: '迭代中序：先一路向左入栈，弹出后访问，再转向右子树', default_score: 15, source: 'ai' });
  q({ id: 137, course_id: 2, knowledge_point_id: 19, question_type: 'judgment', difficulty: 'hard', content: '二叉搜索树的中序遍历结果是递增序列。', options: ['正确', '错误'], answer: '正确', analysis: 'BST性质：左<根<右，中序即升序', default_score: 5, source: 'ai' });
  q({ id: 138, course_id: 2, knowledge_point_id: 18, question_type: 'fill_blank', difficulty: 'medium', content: '哈希表查找的平均时间复杂度为____（不考虑冲突）。', options: null, answer: 'O(1)', analysis: '理想哈希表直接通过哈希函数定位，O(1)常数时间', default_score: 5, source: 'ai' });
  q({ id: 139, course_id: 2, knowledge_point_id: 17, question_type: 'single_choice', difficulty: 'easy', content: '二分查找要求数据是？', options: ['A. 无序的', 'B. 有序的', 'C. 链式存储', 'D. 树形结构'], answer: 'B', analysis: '二分查找依赖有序数组的随机访问特性', default_score: 10, source: 'ai' });
  q({ id: 140, course_id: 2, knowledge_point_id: 24, question_type: 'single_choice', difficulty: 'hard', content: 'Dijkstra算法不能处理哪种图？', options: ['A. 有向图', 'B. 无向图', 'C. 负权边图', 'D. 稀疏图'], answer: 'C', analysis: 'Dijkstra基于贪心，负权边会破坏已确定最短路径的性质', default_score: 10, source: 'ai' });
  // DB 25题 (141-165)
  q({ id: 141, course_id: 3, knowledge_point_id: 36, question_type: 'single_choice', difficulty: 'medium', content: '数据库设计的第一步是？', options: ['A. 物理设计', 'B. 需求分析', 'C. 逻辑设计', 'D. 概念设计'], answer: 'B', analysis: '数据库设计流程：需求分析→概念设计→逻辑设计→物理设计', default_score: 10, source: 'ai' });
  q({ id: 142, course_id: 3, knowledge_point_id: 37, question_type: 'fill_blank', difficulty: 'medium', content: 'E-R图中，实体用____表示，属性用椭圆表示。', options: null, answer: '矩形', analysis: 'E-R图：实体=矩形，属性=椭圆，关系=菱形', default_score: 5, source: 'ai' });
  q({ id: 143, course_id: 3, knowledge_point_id: 38, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些属于数据库范式？', options: ['A. 1NF', 'B. 2NF', 'C. 3NF', 'D. BCNF', 'E. 5NF'], answer: 'ABCDE', analysis: '1NF到5NF和BCNF都是数据库范式理论', default_score: 10, source: 'ai' });
  q({ id: 144, course_id: 3, knowledge_point_id: 38, question_type: 'judgment', difficulty: 'hard', content: '满足3NF的关系一定满足BCNF。', options: ['正确', '错误'], answer: '错误', analysis: 'BCNF是3NF的增强，满足3NF不一定满足BCNF', default_score: 5, source: 'ai' });
  q({ id: 145, course_id: 3, knowledge_point_id: 39, question_type: 'single_choice', difficulty: 'medium', content: 'SQL中，GRANT语句用于？', options: ['A. 查询数据', 'B. 授权', 'C. 创建表', 'D. 插入数据'], answer: 'B', analysis: 'GRANT用于授予用户权限，REVOKE用于收回', default_score: 10, source: 'ai' });
  q({ id: 146, course_id: 3, knowledge_point_id: 40, question_type: 'fill_blank', difficulty: 'easy', content: 'SQL注入攻击的防护方法之一是使用____查询。', options: null, answer: '参数化', analysis: '参数化查询（PreparedStatement）可防止SQL注入', default_score: 5, source: 'ai' });
  q({ id: 147, course_id: 3, knowledge_point_id: 41, question_type: 'single_choice', difficulty: 'medium', content: 'Redis是什么类型的数据库？', options: ['A. 关系型', 'B. 键值存储', 'C. 文档型', 'D. 图数据库'], answer: 'B', analysis: 'Redis是内存键值存储数据库，支持多种数据结构', default_score: 10, source: 'ai' });
  q({ id: 148, course_id: 3, knowledge_point_id: 42, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是NoSQL数据库类型？', options: ['A. 键值存储', 'B. 文档数据库', 'C. 列族数据库', 'D. 图数据库'], answer: 'ABCD', analysis: 'NoSQL四大类型：键值/文档/列族/图', default_score: 10, source: 'ai' });
  q({ id: 149, course_id: 3, knowledge_point_id: 43, question_type: 'single_choice', difficulty: 'hard', content: 'CAP定理中，分布式系统最多同时满足几个特性？', options: ['A. 1个', 'B. 2个', 'C. 3个', 'D. 0个'], answer: 'B', analysis: 'CAP定理：一致性、可用性、分区容错最多同时满足两个', default_score: 10, source: 'ai' });
  q({ id: 150, course_id: 3, knowledge_point_id: 44, question_type: 'code', difficulty: 'hard', content: '写SQL：创建视图top_students，显示分数>=90的学生姓名和分数。', options: null, answer: 'CREATE VIEW top_students AS\nSELECT name, score FROM students WHERE score >= 90;', analysis: 'VIEW是虚拟表，基于SELECT查询定义', default_score: 15, source: 'ai' });
  q({ id: 151, course_id: 3, knowledge_point_id: 31, question_type: 'code', difficulty: 'medium', content: '写SQL：使用子查询找出分数高于班级平均分的学生。', options: null, answer: 'SELECT name, score FROM students\nWHERE score > (SELECT AVG(score) FROM students);', analysis: '子查询先计算平均值，外层WHERE比较', default_score: 15, source: 'ai' });
  q({ id: 152, course_id: 3, knowledge_point_id: 32, question_type: 'fill_blank', difficulty: 'medium', content: 'SQL中，DISTINCT关键字用于去除____行。', options: null, answer: '重复', analysis: 'SELECT DISTINCT返回唯一值', default_score: 5, source: 'ai' });
  q({ id: 153, course_id: 3, knowledge_point_id: 33, question_type: 'judgment', difficulty: 'medium', content: '索引一定能加快所有查询的速度。', options: ['正确', '错误'], answer: '错误', analysis: '索引增加写入开销，且不恰当索引可能不被使用', default_score: 5, source: 'ai' });
  q({ id: 154, course_id: 3, knowledge_point_id: 34, question_type: 'single_choice', difficulty: 'hard', content: '数据库死锁发生的必要条件是？', options: ['A. 互斥+请求保持+不可剥夺+循环等待', 'B. 只有互斥', 'C. 只有循环等待', 'D. 并发过高'], answer: 'A', analysis: '死锁四条件：互斥、请求保持、不可剥夺、循环等待', default_score: 10, source: 'ai' });
  q({ id: 155, course_id: 3, knowledge_point_id: 35, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些隔离级别可以防止脏读？', options: ['A. READ UNCOMMITTED', 'B. READ COMMITTED', 'C. REPEATABLE READ', 'D. SERIALIZABLE'], answer: 'BCD', analysis: 'READ UNCOMMITTED允许脏读，其他三级都禁止脏读', default_score: 10, source: 'ai' });
  q({ id: 156, course_id: 3, knowledge_point_id: 36, question_type: 'fill_blank', difficulty: 'medium', content: '数据库设计中，____模型独立于具体DBMS，描述数据的概念结构。', options: null, answer: '概念', analysis: '概念模型（如E-R图）独立于具体数据库管理系统', default_score: 5, source: 'ai' });
  q({ id: 157, course_id: 3, knowledge_point_id: 37, question_type: 'single_choice', difficulty: 'medium', content: 'E-R图中，多对多关系如何转换为关系模式？', options: ['A. 合并到一方', 'B. 单独建立关系表', 'C. 忽略关系', 'D. 合并到两方'], answer: 'B', analysis: '多对多关系必须单独建立关系表，包含双方主键', default_score: 10, source: 'ai' });
  q({ id: 158, course_id: 3, knowledge_point_id: 39, question_type: 'judgment', difficulty: 'easy', content: 'SQL中，COMMIT用于提交事务，ROLLBACK用于回滚事务。', options: ['正确', '错误'], answer: '正确', analysis: 'COMMIT提交事务使更改永久化，ROLLBACK撤销', default_score: 5, source: 'ai' });
  q({ id: 159, course_id: 3, knowledge_point_id: 41, question_type: 'single_choice', difficulty: 'easy', content: 'MongoDB属于哪种类型的数据库？', options: ['A. 关系型', 'B. 键值存储', 'C. 文档型', 'D. 图数据库'], answer: 'C', analysis: 'MongoDB以JSON-like文档存储数据，属文档型数据库', default_score: 10, source: 'ai' });
  q({ id: 160, course_id: 3, knowledge_point_id: 43, question_type: 'fill_blank', difficulty: 'hard', content: '分布式系统中，____是一致性哈希算法常用于解决的问题。', options: null, answer: '负载均衡', analysis: '一致性哈希用于分布式缓存和数据分片的负载均衡', default_score: 5, source: 'ai' });
  q({ id: 161, course_id: 3, knowledge_point_id: 44, question_type: 'single_choice', difficulty: 'medium', content: '数据库存储过程的优点不包括？', options: ['A. 减少网络传输', 'B. 提高安全性', 'C. 跨平台移植方便', 'D. 预编译执行快'], answer: 'C', analysis: '存储过程与特定DBMS绑定，跨平台移植困难', default_score: 10, source: 'ai' });
  q({ id: 162, course_id: 3, knowledge_point_id: 32, question_type: 'code', difficulty: 'medium', content: '写SQL：使用JOIN查询学生姓名及其选修课程名称。', options: null, answer: 'SELECT s.name, c.course_name\nFROM students s\nJOIN enrollments e ON s.id = e.student_id\nJOIN courses c ON e.course_id = c.id;', analysis: '多表JOIN连接是关系型数据库核心操作', default_score: 15, source: 'ai' });
  q({ id: 163, course_id: 3, knowledge_point_id: 33, question_type: 'multiple_choice', difficulty: 'hard', content: '数据库查询优化技术包括？', options: ['A. 使用索引', 'B. 避免SELECT *', 'C. 合理使用JOIN', 'D. 使用EXPLAIN分析'], answer: 'ABCD', analysis: '四种都是常见的SQL查询优化方法', default_score: 10, source: 'ai' });
  q({ id: 164, course_id: 3, knowledge_point_id: 36, question_type: 'judgment', difficulty: 'medium', content: '数据库逻辑设计中，一个实体对应一张表。', options: ['正确', '错误'], answer: '错误', analysis: '实体可能对应多张表，也可能多个实体合并为一张表', default_score: 5, source: 'ai' });
  q({ id: 165, course_id: 3, knowledge_point_id: 43, question_type: 'single_choice', difficulty: 'hard', content: 'BASE理论中的E代表什么？', options: ['A. Eventually consistent', 'B. Exactly once', 'C. Elastic', 'D. Encrypted'], answer: 'A', analysis: 'BASE=Basically Available + Soft state + Eventually consistent', default_score: 10, source: 'ai' });
  // DL V3.3 30题 (166-195)
  q({ id: 166, course_id: 4, knowledge_point_id: 51, question_type: 'fill_blank', difficulty: 'easy', content: '人工智能的三大流派是符号主义、连接主义和____。', options: null, answer: '行为主义', analysis: '符号主义(逻辑推理)、连接主义(神经网络)、行为主义(强化学习)', default_score: 5, source: 'ai' });
  q({ id: 167, course_id: 4, knowledge_point_id: 52, question_type: 'single_choice', difficulty: 'medium', content: '以下哪项属于无监督学习？', options: ['A. 线性回归', 'B. 逻辑回归', 'C. K-means聚类', 'D. 决策树分类'], answer: 'C', analysis: 'K-means不需要标签，属于无监督聚类算法', default_score: 10, source: 'ai' });
  q({ id: 168, course_id: 4, knowledge_point_id: 53, question_type: 'judgment', difficulty: 'medium', content: '半监督学习结合少量标注数据和大量未标注数据进行训练。', options: ['正确', '错误'], answer: '正确', analysis: '半监督学习利用未标注数据的分布信息提升模型', default_score: 5, source: 'ai' });
  q({ id: 169, course_id: 4, knowledge_point_id: 55, question_type: 'code', difficulty: 'hard', content: '用TensorFlow创建一个简单的全连接神经网络（2个隐藏层，ReLU激活）。', options: null, answer: "import tensorflow as tf\nmodel = tf.keras.Sequential([\n    tf.keras.layers.Dense(128, activation='relu'),\n    tf.keras.layers.Dense(64, activation='relu'),\n    tf.keras.layers.Dense(10, activation='softmax')\n])", analysis: 'Keras Sequential API快速搭建多层网络', default_score: 15, source: 'ai' });
  q({ id: 170, course_id: 4, knowledge_point_id: 61, question_type: 'single_choice', difficulty: 'medium', content: 'PyTorch中，torch.no_grad()的作用是？', options: ['A. 加速训练', 'B. 禁用梯度计算', 'C. 清除显存', 'D. 初始化权重'], answer: 'B', analysis: 'torch.no_grad()上下文管理器禁用自动求导，用于推理阶段', default_score: 10, source: 'ai' });
  q({ id: 171, course_id: 4, knowledge_point_id: 71, question_type: 'fill_blank', difficulty: 'medium', content: 'NumPy中，____函数用于创建等差数列。', options: null, answer: 'np.linspace()', analysis: 'np.linspace(start, stop, num)创建等间隔数列', default_score: 5, source: 'ai' });
  q({ id: 172, course_id: 4, knowledge_point_id: 77, question_type: 'single_choice', difficulty: 'hard', content: '以下哪个操作会触发NumPy广播？', options: ['A. (3,3)+(3,3)', 'B. (3,1)+(1,4)', 'C. (3,4)+(2,4)', 'D. (2,3)+(3,2)'], answer: 'B', analysis: '(3,1)+(1,4)广播为(3,4)+(3,4)，从右对齐维度逐个匹配', default_score: 10, source: 'ai' });
  q({ id: 173, course_id: 4, knowledge_point_id: 82, question_type: 'code', difficulty: 'medium', content: '用Matplotlib绘制正弦和余弦曲线在同一图上。', options: null, answer: 'import matplotlib.pyplot as plt\nimport numpy as np\nx = np.linspace(0, 2*np.pi, 100)\nplt.plot(x, np.sin(x), label="sin")\nplt.plot(x, np.cos(x), label="cos")\nplt.legend()\nplt.show()', analysis: 'plot多次调用叠加曲线，legend添加图例', default_score: 15, source: 'ai' });
  q({ id: 174, course_id: 4, knowledge_point_id: 87, question_type: 'single_choice', difficulty: 'easy', content: 'scikit-learn中，fit()方法的作用是？', options: ['A. 预测', 'B. 评估', 'C. 训练模型', 'D. 数据预处理'], answer: 'C', analysis: 'fit()用于从训练数据学习模型参数', default_score: 10, source: 'ai' });
  q({ id: 175, course_id: 4, knowledge_point_id: 90, question_type: 'fill_blank', difficulty: 'medium', content: 'TensorFlow中，____类用于构建自定义训练循环。', options: null, answer: 'GradientTape', analysis: 'GradientTape记录前向传播操作以便反向传播计算梯度', default_score: 5, source: 'ai' });
  q({ id: 176, course_id: 4, knowledge_point_id: 97, question_type: 'judgment', difficulty: 'medium', content: '多层感知器（MLP）可以解决XOR问题。', options: ['正确', '错误'], answer: '正确', analysis: '多层的非线性变换使MLP能够解决线性不可分问题', default_score: 5, source: 'ai' });
  q({ id: 177, course_id: 4, knowledge_point_id: 101, question_type: 'single_choice', difficulty: 'medium', content: 'ReLU激活函数的优点是？', options: ['A. 输出有界', 'B. 缓解梯度消失', 'C. 处处可导', 'D. 输出零均值'], answer: 'B', analysis: 'ReLU在正区间梯度为1，有效缓解梯度消失问题', default_score: 10, source: 'ai' });
  q({ id: 178, course_id: 4, knowledge_point_id: 102, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些激活函数输出有界？', options: ['A. Sigmoid', 'B. Tanh', 'C. ReLU', 'D. LeakyReLU'], answer: 'AB', analysis: 'Sigmoid∈(0,1)，Tanh∈(-1,1)；ReLU类函数无上界', default_score: 10, source: 'ai' });
  q({ id: 179, course_id: 4, knowledge_point_id: 103, question_type: 'fill_blank', difficulty: 'medium', content: '损失函数Cross-Entropy中文称为____损失。', options: null, answer: '交叉熵', analysis: '交叉熵损失常用于分类任务，衡量两个概率分布差异', default_score: 5, source: 'ai' });
  q({ id: 180, course_id: 4, knowledge_point_id: 104, question_type: 'single_choice', difficulty: 'medium', content: 'Adam优化器结合了哪两种方法的优点？', options: ['A. SGD+Adagrad', 'B. Momentum+RMSprop', 'C. SGD+Momentum', 'D. Adagrad+RMSprop'], answer: 'B', analysis: 'Adam=动量(Momentum)+自适应学习率(RMSprop)', default_score: 10, source: 'ai' });
  q({ id: 181, course_id: 4, knowledge_point_id: 105, question_type: 'code', difficulty: 'hard', content: '用Python手动实现梯度下降更新参数（不使用框架）。', options: null, answer: 'def gradient_descent(X, y, lr=0.01, epochs=100):\n    w, b = 0, 0\n    n = len(X)\n    for _ in range(epochs):\n        y_pred = w * X + b\n        dw = (-2/n) * sum(X * (y - y_pred))\n        db = (-2/n) * sum(y - y_pred)\n        w -= lr * dw\n        b -= lr * db\n    return w, b', analysis: '手动计算梯度并更新参数，无框架依赖', default_score: 15, source: 'ai' });
  q({ id: 182, course_id: 4, knowledge_point_id: 109, question_type: 'fill_blank', difficulty: 'medium', content: 'CNN中卷积核的大小通常用____x____表示（如3x3）。', options: null, answer: '宽x高', analysis: '卷积核(kernel)大小如3x3表示3宽3高', default_score: 5, source: 'ai' });
  q({ id: 183, course_id: 4, knowledge_point_id: 111, question_type: 'single_choice', difficulty: 'medium', content: '最大池化(MaxPooling)的窗口2x2 stride=2的作用是？', options: ['A. 尺寸不变', 'B. 尺寸减半', 'C. 尺寸翻倍', 'D. 随机裁剪'], answer: 'B', analysis: '2x2窗口stride=2使特征图宽高减半', default_score: 10, source: 'ai' });
  q({ id: 184, course_id: 4, knowledge_point_id: 115, question_type: 'single_choice', difficulty: 'hard', content: 'Batch Normalization的作用不包括？', options: ['A. 加速收敛', 'B. 缓解梯度消失', 'C. 增加模型容量', 'D. 允许更大学习率'], answer: 'C', analysis: 'BN不增加模型容量，而是通过归一化稳定训练', default_score: 10, source: 'ai' });
  q({ id: 185, course_id: 4, knowledge_point_id: 122, question_type: 'judgment', difficulty: 'hard', content: 'LSTM通过引入门控机制解决了RNN的长期依赖问题。', options: ['正确', '错误'], answer: '正确', analysis: 'LSTM的遗忘门、输入门、输出门控制信息流动', default_score: 5, source: 'ai' });
  q({ id: 186, course_id: 4, knowledge_point_id: 127, question_type: 'fill_blank', difficulty: 'hard', content: 'GRU（门控循环单元）将LSTM的三个门简化为____个门。', options: null, answer: '2', analysis: 'GRU将遗忘门和输入门合并为更新门+重置门，共2个门', default_score: 5, source: 'ai' });
  q({ id: 187, course_id: 4, knowledge_point_id: 133, question_type: 'code', difficulty: 'hard', content: '用PyTorch定义一个判别器网络（用于GAN），输入28x28图像输出真假概率。', options: null, answer: 'class Discriminator(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.model = nn.Sequential(\n            nn.Flatten(),\n            nn.Linear(784, 512),\n            nn.LeakyReLU(0.2),\n            nn.Linear(512, 256),\n            nn.LeakyReLU(0.2),\n            nn.Linear(256, 1),\n            nn.Sigmoid()\n        )\n    def forward(self, x):\n        return self.model(x)', analysis: '判别器二分类：真/假，输出sigmoid概率', default_score: 15, source: 'ai' });
  q({ id: 188, course_id: 4, knowledge_point_id: 137, question_type: 'single_choice', difficulty: 'hard', content: 'WGAN相比原始GAN的改进是？', options: ['A. 使用Wasserstein距离', 'B. 增加层数', 'C. 使用ReLU', 'D. 去掉判别器'], answer: 'A', analysis: 'WGAN用Wasserstein距离替代JS散度，训练更稳定', default_score: 10, source: 'ai' });
  q({ id: 189, course_id: 4, knowledge_point_id: 144, question_type: 'judgment', difficulty: 'medium', content: '迁移学习中，通常冻结预训练模型的底层（特征提取层），只微调顶层（分类层）。', options: ['正确', '错误'], answer: '正确', analysis: '底层提取通用特征（边缘/纹理），顶层包含任务特定信息', default_score: 5, source: 'ai' });
  q({ id: 190, course_id: 4, knowledge_point_id: 146, question_type: 'single_choice', difficulty: 'hard', content: '数据增强(Data Augmentation)主要解决什么问题？', options: ['A. 欠拟合', 'B. 过拟合', 'C. 梯度消失', 'D. 收敛慢'], answer: 'B', analysis: '数据增强增加训练数据多样性，缓解过拟合', default_score: 10, source: 'ai' });
  q({ id: 191, course_id: 4, knowledge_point_id: 148, question_type: 'fill_blank', difficulty: 'medium', content: '模型评估中，____指标适合评价类别不平衡的分类问题。', options: null, answer: 'F1-score', analysis: 'F1-score是精确率和召回率的调和平均，适合不平衡数据', default_score: 5, source: 'ai' });
  q({ id: 192, course_id: 4, knowledge_point_id: 150, question_type: 'single_choice', difficulty: 'hard', content: 'TensorFlow Serving的主要功能是？', options: ['A. 模型训练', 'B. 模型部署与推理', 'C. 数据预处理', 'D. 超参数搜索'], answer: 'B', analysis: 'TF Serving专为生产环境模型部署和在线推理设计', default_score: 10, source: 'ai' });
  q({ id: 193, course_id: 4, knowledge_point_id: 98, question_type: 'single_choice', difficulty: 'easy', content: '神经网络的epoch指的是？', options: ['A. 一次前向传播', 'B. 一次反向传播', 'C. 完整遍历一次训练集', 'D. 处理一个batch'], answer: 'C', analysis: '1 epoch = 全部训练数据完整过一遍网络', default_score: 10, source: 'ai' });
  q({ id: 194, course_id: 4, knowledge_point_id: 103, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是分类任务的常用损失函数？', options: ['A. MSE', 'B. Cross-Entropy', 'C. Hinge Loss', 'D. Focal Loss'], answer: 'BCD', analysis: 'MSE多用于回归；CrossEntropy/Hinge/Focal用于分类', default_score: 10, source: 'ai' });
  q({ id: 195, course_id: 4, knowledge_point_id: 150, question_type: 'single_choice', difficulty: 'medium', content: 'ONNX（开放神经网络交换）格式的主要作用是？', options: ['A. 加速训练', 'B. 跨框架模型互转', 'C. 数据标注', 'D. 超参数调优'], answer: 'B', analysis: 'ONNX标准格式使PyTorch/TensorFlow等框架间模型可互操作', default_score: 10, source: 'ai' });
  // V3.4 扩充50题 (196-245)
  q({ id: 196, course_id: 1, knowledge_point_id: 1, question_type: 'judgment', difficulty: 'easy', content: 'Python中，print(type(42))的结果是<class int>。', options: ['正确', '错误'], answer: '正确', analysis: '42是整数int类型', default_score: 5, source: 'ai' });
  q({ id: 197, course_id: 1, knowledge_point_id: 2, question_type: 'fill_blank', difficulty: 'easy', content: 'Python字符串切片s[1:4]截取的是下标____到____的字符（不含后者）。', options: null, answer: '1,4', analysis: '切片左闭右开[1,4)', default_score: 5, source: 'ai' });
  q({ id: 198, course_id: 1, knowledge_point_id: 3, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些是Python中合法的循环语句？', options: ['A. for i in range(10)', 'B. while True', 'C. loop until', 'D. forEach'], answer: 'AB', analysis: 'Python只有for和while两种循环', default_score: 10, source: 'ai' });
  q({ id: 199, course_id: 1, knowledge_point_id: 4, question_type: 'code', difficulty: 'hard', content: '编写lambda函数对列表按元素绝对值降序排序。', options: null, answer: 'sorted(lst, key=lambda x: abs(x), reverse=True)', analysis: 'lambda作为key参数实现自定义排序', default_score: 15, source: 'ai' });
  q({ id: 200, course_id: 1, knowledge_point_id: 5, question_type: 'short_answer', difficulty: 'medium', content: '简述Python中*args和**kwargs的区别及使用场景。', options: null, answer: '*args接收任意数量的位置参数，打包为元组；**kwargs接收任意数量的关键字参数，打包为字典。常用于装饰器和函数包装。', analysis: '可变参数使函数更灵活', default_score: 10, source: 'ai' });
  q({ id: 201, course_id: 1, knowledge_point_id: 6, question_type: 'multiple_choice', difficulty: 'hard', content: '以下NumPy操作会返回布尔数组的有？', options: ['A. arr > 5', 'B. arr[arr > 5]', 'C. np.where(arr > 5)', 'D. (arr == 3)'], answer: 'AD', analysis: 'arr>5返回布尔数组；arr[arr>5]返回元素值；np.where返回索引元组', default_score: 10, source: 'ai' });
  q({ id: 202, course_id: 1, knowledge_point_id: 7, question_type: 'judgment', difficulty: 'medium', content: 'Python字典的keys()方法返回一个列表。', options: ['正确', '错误'], answer: '错误', analysis: 'keys()返回dict_keys视图对象，不是列表', default_score: 5, source: 'ai' });
  q({ id: 203, course_id: 1, knowledge_point_id: 8, question_type: 'code', difficulty: 'medium', content: '编写代码读取CSV文件并打印每行内容。', options: null, answer: 'import csv\nwith open("data.csv") as f:\n    reader = csv.reader(f)\n    for row in reader:\n        print(row)', analysis: 'csv模块的reader逐行解析', default_score: 15, source: 'ai' });
  q({ id: 204, course_id: 1, knowledge_point_id: 9, question_type: 'single_choice', difficulty: 'easy', content: 'Python中finally子句在什么情况下一定会执行？', options: ['A. 永远不会', 'B. 无论是否抛出异常', 'C. 只有程序崩溃时', 'D. 只有没有异常时'], answer: 'B', analysis: 'finally子句无论异常与否都会执行', default_score: 10, source: 'ai' });
  q({ id: 205, course_id: 1, knowledge_point_id: 10, question_type: 'short_answer', difficulty: 'hard', content: '简述Python中__init__和__new__的区别。', options: null, answer: '__new__是类方法，负责创建实例对象并返回；__init__是实例方法，负责初始化实例属性。__new__先于__init__调用。', analysis: '单例模式常用__new__控制实例创建', default_score: 10, source: 'ai' });
  q({ id: 206, course_id: 1, knowledge_point_id: 6, question_type: 'fill_blank', difficulty: 'medium', content: 'Pandas中，____方法用于读取CSV文件为DataFrame。', options: null, answer: 'pd.read_csv()', analysis: 'read_csv是Pandas最常用的数据导入方法', default_score: 5, source: 'ai' });
  q({ id: 207, course_id: 1, knowledge_point_id: 4, question_type: 'single_choice', difficulty: 'medium', content: 'map(lambda x: x**2, [1,2,3])的结果类型是？', options: ['A. list', 'B. map对象', 'C. tuple', 'D. set'], answer: 'B', analysis: 'map()返回map迭代器对象，需list()转换', default_score: 10, source: 'ai' });
  q({ id: 208, course_id: 1, knowledge_point_id: 9, question_type: 'judgment', difficulty: 'medium', content: '使用try-except捕获所有异常用except Exception:即可。', options: ['正确', '错误'], answer: '正确', analysis: 'except Exception捕获所有常规异常，但不包括SystemExit等', default_score: 5, source: 'ai' });
  // DS (209-221)
  q({ id: 209, course_id: 2, knowledge_point_id: 11, question_type: 'judgment', difficulty: 'easy', content: '链表的插入删除操作时间复杂度为O(1)。', options: ['正确', '错误'], answer: '正确', analysis: '链表只需修改指针即可插入删除，前提是已知位置', default_score: 5, source: 'ai' });
  q({ id: 210, course_id: 2, knowledge_point_id: 12, question_type: 'fill_blank', difficulty: 'medium', content: '栈的入栈和出栈操作分别称为____和____。', options: null, answer: 'push,pop', analysis: 'push压入栈顶，pop弹出栈顶', default_score: 5, source: 'ai' });
  q({ id: 211, course_id: 2, knowledge_point_id: 13, question_type: 'multiple_choice', difficulty: 'hard', content: '以下关于二叉树的说法正确的有？', options: ['A. 满二叉树每层节点数最大', 'B. 完全二叉树可用数组存储', 'C. 哈夫曼树是带权路径最短的二叉树', 'D. 二叉搜索树中序遍历有序'], answer: 'ABCD', analysis: '四种都是二叉树的正确性质', default_score: 10, source: 'ai' });
  q({ id: 212, course_id: 2, knowledge_point_id: 14, question_type: 'single_choice', difficulty: 'medium', content: '堆排序中，建堆操作的时间复杂度是？', options: ['A. O(n)', 'B. O(n log n)', 'C. O(n^2)', 'D. O(1)'], answer: 'A', analysis: '自底向上建堆为O(n)，非O(n log n)', default_score: 10, source: 'ai' });
  q({ id: 213, course_id: 2, knowledge_point_id: 15, question_type: 'code', difficulty: 'hard', content: '用邻接表实现图的BFS遍历算法。', options: null, answer: 'from collections import deque\ndef bfs(graph, start):\n    visited = set([start])\n    q = deque([start])\n    while q:\n        node = q.popleft()\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                visited.add(neighbor)\n                q.append(neighbor)\n    return visited', analysis: 'BFS用队列实现层序遍历', default_score: 15, source: 'ai' });
  q({ id: 214, course_id: 2, knowledge_point_id: 16, question_type: 'short_answer', difficulty: 'medium', content: '简述DFS和BFS的区别及应用场景。', options: null, answer: 'DFS深度优先用栈(递归)，适合路径查找、拓扑排序；BFS广度优先用队列，适合最短路径、层序遍历。', analysis: 'DFS走到底再回溯，BFS逐层扩展', default_score: 10, source: 'ai' });
  q({ id: 215, course_id: 2, knowledge_point_id: 17, question_type: 'multiple_choice', difficulty: 'medium', content: '以下查找算法中，要求数据有序的是？', options: ['A. 顺序查找', 'B. 二分查找', 'C. 插值查找', 'D. 哈希查找'], answer: 'BC', analysis: '二分和插值查找依赖有序序列', default_score: 10, source: 'ai' });
  q({ id: 216, course_id: 2, knowledge_point_id: 18, question_type: 'judgment', difficulty: 'medium', content: '哈希表在最坏情况下的查找时间复杂度为O(n)。', options: ['正确', '错误'], answer: '正确', analysis: '哈希冲突严重时退化为链表查找O(n)', default_score: 5, source: 'ai' });
  q({ id: 217, course_id: 2, knowledge_point_id: 19, question_type: 'single_choice', difficulty: 'easy', content: '二叉搜索树中，删除叶节点的复杂度是？', options: ['A. O(1)', 'B. O(log n)', 'C. O(n)', 'D. O(n^2)'], answer: 'A', analysis: '删除叶节点只需将父节点指针置空，O(1)', default_score: 10, source: 'ai' });
  q({ id: 218, course_id: 2, knowledge_point_id: 20, question_type: 'code', difficulty: 'hard', content: '实现红黑树节点的左旋操作（伪代码）。', options: null, answer: 'def left_rotate(node):\n    right_child = node.right\n    node.right = right_child.left\n    right_child.left = node\n    right_child.color = node.color\n    node.color = RED\n    return right_child', analysis: '左旋以node为支点将右子节点上提', default_score: 15, source: 'ai' });
  q({ id: 219, course_id: 2, knowledge_point_id: 21, question_type: 'fill_blank', difficulty: 'hard', content: 'B+树中，内部节点存储____信息，叶子节点存储____信息。', options: null, answer: '索引,数据', analysis: 'B+树内部节点只存键值索引，数据全在叶子', default_score: 5, source: 'ai' });
  q({ id: 220, course_id: 2, knowledge_point_id: 22, question_type: 'single_choice', difficulty: 'medium', content: '堆中，删除堆顶元素后需要执行什么操作？', options: ['A. 上浮', 'B. 下沉', 'C. 左旋', 'D. 不需要操作'], answer: 'B', analysis: '用最后元素替换堆顶后执行下沉(sink)', default_score: 10, source: 'ai' });
  q({ id: 221, course_id: 2, knowledge_point_id: 24, question_type: 'short_answer', difficulty: 'hard', content: '简述贪心算法和动态规划的核心区别。', options: null, answer: '贪心每步选局部最优，不保证全局最优；动态规划记录子问题最优解，通过状态转移保证全局最优。贪心适合问题具有贪心选择性质的情况。', analysis: '贪心效率高但局限，DP通用但复杂度高', default_score: 10, source: 'ai' });
  // DB + DL (222-245)
  q({ id: 222, course_id: 3, knowledge_point_id: 36, question_type: 'judgment', difficulty: 'easy', content: '数据库设计中，逻辑设计阶段负责将E-R图转换为关系模式。', options: ['正确', '错误'], answer: '正确', analysis: '逻辑设计将概念模型(E-R图)转为具体关系模式', default_score: 5, source: 'ai' });
  q({ id: 223, course_id: 3, knowledge_point_id: 37, question_type: 'multiple_choice', difficulty: 'medium', content: 'E-R图中，以下哪些是合法的联系类型？', options: ['A. 1:1', 'B. 1:N', 'C. M:N', 'D. 0:1'], answer: 'ABC', analysis: '联系类型：一对一、一对多、多对多三种', default_score: 10, source: 'ai' });
  q({ id: 224, course_id: 3, knowledge_point_id: 38, question_type: 'single_choice', difficulty: 'hard', content: '2NF消除了哪种数据依赖？', options: ['A. 传递依赖', 'B. 部分函数依赖', 'C. 多值依赖', 'D. 连接依赖'], answer: 'B', analysis: '2NF消除非主属性对候选键的部分函数依赖', default_score: 10, source: 'ai' });
  q({ id: 225, course_id: 3, knowledge_point_id: 39, question_type: 'fill_blank', difficulty: 'medium', content: 'SQL中，____语句用于撤销用户权限。', options: null, answer: 'REVOKE', analysis: 'REVOKE与GRANT配对，收回已授予的权限', default_score: 5, source: 'ai' });
  q({ id: 226, course_id: 3, knowledge_point_id: 40, question_type: 'code', difficulty: 'medium', content: '写SQL：使用参数化查询防止SQL注入（占位符?表示）。', options: null, answer: 'SELECT * FROM users WHERE username = ? AND password = ?', analysis: '参数化查询将用户输入作为参数绑定，非SQL拼接', default_score: 15, source: 'ai' });
  q({ id: 227, course_id: 3, knowledge_point_id: 41, question_type: 'short_answer', difficulty: 'medium', content: '简述关系型数据库和非关系型数据库的主要区别。', options: null, answer: '关系型：结构化数据、ACID事务、SQL查询、强一致性；非关系型：灵活schema、BASE、水平扩展、最终一致性。选择取决于数据结构和一致性需求。', analysis: '关系型适合金融等强一致场景，NoSQL适合大数据/高并发', default_score: 10, source: 'ai' });
  q({ id: 228, course_id: 3, knowledge_point_id: 42, question_type: 'judgment', difficulty: 'easy', content: '文档数据库（如MongoDB）使用BSON格式存储数据。', options: ['正确', '错误'], answer: '正确', analysis: 'MongoDB以BSON(Binary JSON)格式存储文档', default_score: 5, source: 'ai' });
  q({ id: 229, course_id: 3, knowledge_point_id: 43, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些是分布式数据库的常见挑战？', options: ['A. 数据分片', 'B. 网络延迟', 'C. 数据一致性', 'D. 节点故障'], answer: 'ABCD', analysis: '分布式系统的四大挑战', default_score: 10, source: 'ai' });
  q({ id: 230, course_id: 3, knowledge_point_id: 44, question_type: 'single_choice', difficulty: 'medium', content: '触发器(Trigger)在什么时候自动执行？', options: ['A. 手动调用时', 'B. 特定数据库事件发生时', 'C. 查询数据时', 'D. 数据库启动时'], answer: 'B', analysis: '触发器绑定到INSERT/UPDATE/DELETE事件自动触发', default_score: 10, source: 'ai' });
  q({ id: 231, course_id: 3, knowledge_point_id: 36, question_type: 'fill_blank', difficulty: 'medium', content: '数据库设计的____范式要求每个表必须有主键。', options: null, answer: '第一', analysis: '1NF要求属性不可分，隐含要求有主键', default_score: 5, source: 'ai' });
  q({ id: 232, course_id: 3, knowledge_point_id: 35, question_type: 'code', difficulty: 'hard', content: '写SQL事务示例：转账操作A账户减100，B账户加100。', options: null, answer: 'BEGIN TRANSACTION;\nUPDATE accounts SET balance = balance - 100 WHERE id = A;\nUPDATE accounts SET balance = balance + 100 WHERE id = B;\nCOMMIT;', analysis: '事务确保原子性，要么全部成功要么全部回滚', default_score: 15, source: 'ai' });
  q({ id: 233, course_id: 3, knowledge_point_id: 33, question_type: 'single_choice', difficulty: 'easy', content: '数据库索引通常使用什么数据结构？', options: ['A. 数组', 'B. B+树', 'C. 链表', 'D. 哈希表'], answer: 'B', analysis: 'B+树是数据库索引最常用的数据结构，支持范围查询', default_score: 10, source: 'ai' });
  q({ id: 234, course_id: 4, knowledge_point_id: 51, question_type: 'judgment', difficulty: 'easy', content: '深度学习是机器学习的一个子集。', options: ['正确', '错误'], answer: '正确', analysis: '深度学习使用多层神经网络，是机器学习的子领域', default_score: 5, source: 'ai' });
  q({ id: 235, course_id: 4, knowledge_point_id: 52, question_type: 'multiple_choice', difficulty: 'medium', content: '以下哪些属于有监督学习算法？', options: ['A. K-means', 'B. 线性回归', 'C. 决策树', 'D. PCA'], answer: 'BC', analysis: '线性回归和决策树需要标注数据，属于监督学习', default_score: 10, source: 'ai' });
  q({ id: 236, course_id: 4, knowledge_point_id: 55, question_type: 'fill_blank', difficulty: 'medium', content: 'TensorFlow中，____函数用于编译模型，指定优化器和损失函数。', options: null, answer: 'model.compile()', analysis: 'compile配置训练过程：优化器、损失函数、评估指标', default_score: 5, source: 'ai' });
  q({ id: 237, course_id: 4, knowledge_point_id: 61, question_type: 'code', difficulty: 'medium', content: '用PyTorch创建一个简单的线性回归模型。', options: null, answer: 'import torch.nn as nn\nmodel = nn.Linear(in_features=1, out_features=1)\ncriterion = nn.MSELoss()\noptimizer = torch.optim.SGD(model.parameters(), lr=0.01)', analysis: 'nn.Linear是最简单的全连接层', default_score: 15, source: 'ai' });
  q({ id: 238, course_id: 4, knowledge_point_id: 71, question_type: 'single_choice', difficulty: 'easy', content: 'NumPy中，np.zeros((3,3))创建的是什么？', options: ['A. 3x3全0矩阵', 'B. 3x3全1矩阵', 'C. 3x3单位矩阵', 'D. 3x3随机矩阵'], answer: 'A', analysis: 'zeros创建指定形状的全零数组', default_score: 10, source: 'ai' });
  q({ id: 239, course_id: 4, knowledge_point_id: 81, question_type: 'short_answer', difficulty: 'medium', content: '简述过拟合的概念及常见解决方法。', options: null, answer: '过拟合：模型在训练集表现好但在测试集表现差。解决方法：正则化(L1/L2)、Dropout、数据增强、早停(Early Stopping)、减少模型复杂度。', analysis: '过拟合是机器学习中最常见的问题之一', default_score: 10, source: 'ai' });
  q({ id: 240, course_id: 4, knowledge_point_id: 86, question_type: 'judgment', difficulty: 'medium', content: 'scikit-learn中，交叉验证可以帮助评估模型的泛化能力。', options: ['正确', '错误'], answer: '正确', analysis: '交叉验证将数据分为多折，轮换训练验证评估稳定性', default_score: 5, source: 'ai' });
  q({ id: 241, course_id: 4, knowledge_point_id: 97, question_type: 'multiple_choice', difficulty: 'hard', content: '以下哪些方法可以缓解梯度消失问题？', options: ['A. 使用ReLU激活', 'B. Batch Normalization', 'C. 残差连接', 'D. 增加网络深度'], answer: 'ABC', analysis: '增加深度反而加重梯度消失；ReLU/BN/残差连接是关键手段', default_score: 10, source: 'ai' });
  q({ id: 242, course_id: 4, knowledge_point_id: 101, question_type: 'fill_blank', difficulty: 'hard', content: 'Sigmoid函数梯度最大值为____。', options: null, answer: '0.25', analysis: 'Sigmoid导数最大值为0.25（x=0时），是梯度消失的根源', default_score: 5, source: 'ai' });
  q({ id: 243, course_id: 4, knowledge_point_id: 104, question_type: 'code', difficulty: 'hard', content: '用PyTorch实现Adam优化器的自定义训练循环。', options: null, answer: 'optimizer = torch.optim.Adam(model.parameters(), lr=0.001)\nfor epoch in range(epochs):\n    for x, y in dataloader:\n        optimizer.zero_grad()\n        loss = criterion(model(x), y)\n        loss.backward()\n        optimizer.step()', analysis: 'Adam自动调整学习率，训练更稳定', default_score: 15, source: 'ai' });
  q({ id: 244, course_id: 4, knowledge_point_id: 115, question_type: 'single_choice', difficulty: 'medium', content: 'Batch Normalization会维护哪两个统计量用于推理？', options: ['A. 均值和方差', 'B. 最大值和最小值', 'C. 中位数和众数', 'D. 截距和斜率'], answer: 'A', analysis: 'BN在训练时计算batch均值和方差，推理时用移动平均', default_score: 10, source: 'ai' });
  q({ id: 245, course_id: 4, knowledge_point_id: 150, question_type: 'short_answer', difficulty: 'hard', content: '简述将ML模型部署到生产环境的关键步骤。', options: null, answer: '1.模型导出(ONNX/TorchScript) 2.搭建推理服务(TF Serving/Flask) 3.容器化(Docker) 4.API网关 5.监控与日志 6.A/B测试 7.模型版本管理', analysis: '模型部署是ML工程化的关键环节', default_score: 10, source: 'ai' });

  db.insert(question).values(Q).run();
  console.log('  ✅ 题目完成 (245题)');

  // ===================== 8. 作业 (24个) =====================
  console.log('📋 插入作业...');
  db.insert(assignment).values([
    // 作业1-8: 基础作业 (published)
    { id: 1, course_id: 1, teacher_id: 1, title: 'Python第一次作业：基础语法', description: '涵盖变量与数据类型、控制流程、函数基础等核心知识点。', question_ids: [1,2,3,4,5,6], total_score: 100, start_time: '2026-07-15T08:00:00+08:00', end_time: '2026-07-18T23:59:00+08:00', status: 'published' },
    { id: 2, course_id: 1, teacher_id: 1, title: 'Python第二次作业：进阶应用', description: '涵盖字典集合、文件操作、异常处理、面向对象等进阶知识点。', question_ids: [7,8,9,10,11], total_score: 100, start_time: '2026-07-18T08:00:00+08:00', end_time: '2026-07-22T23:59:00+08:00', status: 'published' },
    { id: 3, course_id: 2, teacher_id: 1, title: '数据结构第一次作业：线性与树', description: '涵盖数组链表、栈队列、二叉树等核心知识点。', question_ids: [16,17,18,19,20], total_score: 100, start_time: '2026-07-20T08:00:00+08:00', end_time: '2026-07-25T23:59:00+08:00', status: 'published' },
    { id: 4, course_id: 2, teacher_id: 1, title: '数据结构第二次作业：图与排序', description: '涵盖图的遍历、查找算法、排序算法等知识点。', question_ids: [21,22,23], total_score: 100, start_time: '2026-07-25T08:00:00+08:00', end_time: '2026-07-30T23:59:00+08:00', status: 'published' },
    { id: 5, course_id: 3, teacher_id: 1, title: '数据库原理第一次作业：SQL基础', description: '涵盖SQL查询、聚合函数等核心知识点。', question_ids: [24,25,26,27,28], total_score: 100, start_time: '2026-07-25T08:00:00+08:00', end_time: '2026-07-30T23:59:00+08:00', status: 'published' },
    { id: 6, course_id: 3, teacher_id: 1, title: '数据库原理第二次作业：索引与事务', description: '涵盖数据库索引、事务并发控制等高级知识点。', question_ids: [29,30], total_score: 100, start_time: '2026-07-30T08:00:00+08:00', end_time: '2026-08-05T23:59:00+08:00', status: 'published' },
    { id: 7, course_id: 4, teacher_id: 1, title: '深度学习第一次作业：基础与框架', description: '涵盖AI基础概念、框架生态、NumPy/TensorFlow基础等知识点。', question_ids: [31,32,33,34,35,36,37,38,39], total_score: 100, start_time: '2026-08-01T08:00:00+08:00', end_time: '2026-08-07T23:59:00+08:00', status: 'published' },
    { id: 8, course_id: 4, teacher_id: 1, title: '深度学习第二次作业：神经网络与高级模型', description: '涵盖感知器、CNN、RNN、GAN、迁移学习等进阶知识点。', question_ids: [40,41,42,43,44,45,46,47,48,49,50], total_score: 100, start_time: '2026-08-07T08:00:00+08:00', end_time: '2026-08-14T23:59:00+08:00', status: 'published' },
    // 作业9-12: V3.3新增
    { id: 9, course_id: 1, teacher_id: 1, title: 'Python第三次作业：函数进阶与面向对象', description: '涵盖lambda、装饰器、类的继承、super()、property等进阶知识点。', question_ids: [101,102,103,106,110,111,113,114,115], total_score: 100, start_time: '2026-08-10T08:00:00+08:00', end_time: '2026-08-17T23:59:00+08:00', status: 'published' },
    { id: 10, course_id: 2, teacher_id: 1, title: '数据结构第三次作业：图论与算法综合', description: '涵盖DFS连通分量、贪心算法、动态规划、堆、红黑树等进阶算法。', question_ids: [122,124,125,126,128,130,131,140], total_score: 100, start_time: '2026-08-10T08:00:00+08:00', end_time: '2026-08-17T23:59:00+08:00', status: 'published' },
    { id: 11, course_id: 3, teacher_id: 1, title: '数据库原理第三次作业：高级SQL与NoSQL', description: '涵盖数据库范式、NoSQL类型、Redis、MongoDB、CAP定理、视图等高级知识点。', question_ids: [143,144,147,148,149,150,155,159,161], total_score: 100, start_time: '2026-08-10T08:00:00+08:00', end_time: '2026-08-17T23:59:00+08:00', status: 'published' },
    { id: 12, course_id: 4, teacher_id: 1, title: '深度学习第三次作业：模型训练与部署', description: '涵盖激活函数、优化器、损失函数、BatchNorm、WGAN、模型部署等综合知识点。', question_ids: [177,178,180,184,187,188,190,192], total_score: 100, start_time: '2026-08-10T08:00:00+08:00', end_time: '2026-08-17T23:59:00+08:00', status: 'published' },
    // 作业13-24: V3.4新增 (12个)
    { id: 13, course_id: 1, teacher_id: 1, title: 'Python第四次作业：数据分析基础', description: '涵盖NumPy布尔索引、Pandas CSV读写、列表推导式等数据分析技能。', question_ids: [104,105,112,196,201,206], total_score: 60, start_time: '2026-08-14T08:00:00+08:00', end_time: '2026-08-21T23:59:00+08:00', status: 'published' },
    { id: 14, course_id: 1, teacher_id: 1, title: 'Python第五次作业：文件与异常处理', description: '涵盖CSV读写、try-except-finally、文件模式等知识点。', question_ids: [107,108,109,197,203,204], total_score: 55, start_time: '2026-08-18T08:00:00+08:00', end_time: '2026-08-25T23:59:00+08:00', status: 'published' },
    { id: 15, course_id: 1, teacher_id: 1, title: 'Python第六次作业：面向对象综合', description: '涵盖类继承、super、property、__new__等OOP高级主题。', question_ids: [110,111,115,199,200,205,207], total_score: 70, start_time: '2026-08-22T08:00:00+08:00', end_time: '2026-08-29T23:59:00+08:00', status: 'published' },
    { id: 16, course_id: 2, teacher_id: 1, title: '数据结构第四次作业：树结构进阶', description: '涵盖二叉树性质、哈夫曼树、二叉搜索树删除、红黑树旋转。', question_ids: [119,125,137,211,217,218], total_score: 60, start_time: '2026-08-14T08:00:00+08:00', end_time: '2026-08-21T23:59:00+08:00', status: 'submitted' },
    { id: 17, course_id: 2, teacher_id: 1, title: '数据结构第五次作业：查找与图算法', description: '涵盖二分、插值查找、哈希冲突、BFS、DFS。', question_ids: [123,139,213,214,215,216], total_score: 65, start_time: '2026-08-18T08:00:00+08:00', end_time: '2026-08-25T23:59:00+08:00', status: 'submitted' },
    { id: 18, course_id: 2, teacher_id: 1, title: '数据结构第六次作业：堆与B+树', description: '涵盖堆排序建堆复杂度、堆顶删除、B+树结构、链表特性。', question_ids: [116,120,127,209,212,219,220], total_score: 70, start_time: '2026-08-22T08:00:00+08:00', end_time: '2026-08-29T23:59:00+08:00', status: 'submitted' },
    { id: 19, course_id: 3, teacher_id: 1, title: '数据库原理第四次作业：范式与权限', description: '涵盖1NF/2NF、GRANT/REVOKE、SQL注入防护。', question_ids: [143,144,145,146,224,225,226], total_score: 65, start_time: '2026-08-14T08:00:00+08:00', end_time: '2026-08-21T23:59:00+08:00', status: 'published' },
    { id: 20, course_id: 3, teacher_id: 1, title: '数据库原理第五次作业：NoSQL与分布式', description: '涵盖Redis、MongoDB、CAP定理、分片、文档数据库。', question_ids: [147,148,149,159,227,228,229], total_score: 65, start_time: '2026-08-18T08:00:00+08:00', end_time: '2026-08-25T23:59:00+08:00', status: 'submitted' },
    { id: 21, course_id: 3, teacher_id: 1, title: '数据库原理第六次作业：事务与存储', description: '涵盖事务ACID、触发器、视图、存储过程、索引B+树。', question_ids: [150,158,161,163,230,232,233], total_score: 70, start_time: '2026-08-22T08:00:00+08:00', end_time: '2026-08-29T23:59:00+08:00', status: 'submitted' },
    { id: 22, course_id: 4, teacher_id: 1, title: '深度学习第四次作业：正则化与优化', description: '涵盖过拟合、Dropout、BN、梯度消失、Adam优化器。', question_ids: [184,239,241,242,244], total_score: 55, start_time: '2026-08-14T08:00:00+08:00', end_time: '2026-08-21T23:59:00+08:00', status: 'published' },
    { id: 23, course_id: 4, teacher_id: 1, title: '深度学习第五次作业：框架实战', description: '涵盖PyTorch线性回归、TensorFlow compile、推理统计量。', question_ids: [169,170,193,236,237,243], total_score: 65, start_time: '2026-08-18T08:00:00+08:00', end_time: '2026-08-25T23:59:00+08:00', status: 'submitted' },
    { id: 24, course_id: 4, teacher_id: 1, title: '深度学习第六次作业：模型部署', description: '涵盖模型部署流程、ONNX、scikit-learn交叉验证、NumPy基础。', question_ids: [192,195,238,245], total_score: 45, start_time: '2026-08-22T08:00:00+08:00', end_time: '2026-08-29T23:59:00+08:00', status: 'submitted' },
  ]).run();
  console.log('  ✅ 作业完成 (24个)');

  // ===================== 9. 作答记录 & 批改任务 =====================
  console.log('✍️ 生成作答记录与批改（学生分层 + 真实答案）...');

  const STUDENT_TIER: Record<number, { accuracy: number; tier: string }> = {
    5: { accuracy: 0.90, tier: 'top' }, 7: { accuracy: 0.88, tier: 'top' },
    3: { accuracy: 0.82, tier: 'high' }, 4: { accuracy: 0.78, tier: 'high' }, 9: { accuracy: 0.75, tier: 'high' },
    6: { accuracy: 0.66, tier: 'mid' }, 8: { accuracy: 0.62, tier: 'mid' }, 10: { accuracy: 0.58, tier: 'mid' },
    11: { accuracy: 0.52, tier: 'low' }, 12: { accuracy: 0.45, tier: 'low' },
  };

  const SA_TPL = [
    '根据课程所学，{kp}的核心概念是定义清晰、原理明确的。其关键特征包括数据抽象与封装、接口标准化，以及模块化设计思想。',
    '{kp}是课程中的重点内容。从原理上分析，它涉及底层数据结构和算法设计。掌握它需要理解时间复杂度与空间复杂度的权衡。',
    '关于{kp}，我的理解是：首先明确其定义域和值域关系，然后通过实例验证正确性。实践中常见错误是忽略类型转换和内存管理。',
    '{kp}在工程实践中应用广泛。正确做法是先需求分析，再设计接口契约，最后用单元测试覆盖关键路径。',
    '学习{kp}时，最重要的是理解其设计哲学而非死记硬背API。核心要点：结构化思维、边界处理、性能优化。',
  ];

  function getComment(score: number, full: number): string {
    const ratio = score / full;
    if (ratio >= 0.8) return '回答准确，思路清晰！';
    if (ratio >= 0.6) return '基本正确，部分细节可完善。';
    if (ratio >= 0.4) return '存在明显错误，建议复习。';
    return '回答偏差较大，请重点学习。';
  }

  const answers: any[] = [];
  const gradingTasks: any[] = [];
  let ansId = 0, gtId = 0;
  const allStuIds = [3,4,5,6,7,8,9,10,11,12];
  const now = new Date();

  // 作业定义: [assignment_id, question_ids, full_scores, correct_answers, question_types, kp_ids]
  const ASSIGNMENTS: [number, number[], number[], string[], string[], number[]][] = [
    [1, [1,2,3,4,5,6], [22,11,11,11,23,22],
     ['C','C','C','B','def add(a, b):\n    return a + b','[x**2 for x in range(1, 11)]'],
     ['single_choice','single_choice','single_choice','single_choice','short_answer','code'],
     [1,2,3,4,5,6]],
    [2, [7,8,9,10,11], [20,20,20,20,20],
     ['C','with open("file.txt", "r") as f:\n    lines = f.readlines()','C','class Student:\n    def __init__(self, name, score):\n        self.name = name\n        self.score = score\n    def is_pass(self):\n        return self.score >= 60','B'],
     ['single_choice','short_answer','single_choice','short_answer','single_choice'],
     [7,8,9,10,11]],
    [3, [12,13,14,15,16], [20,20,20,20,20],
     ['B','B','A B D E C','B','def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr'],
     ['single_choice','single_choice','multiple_choice','single_choice','code'],
     [12,13,14,15,16]],
    [4, [22,23,24], [10,15,15],
     ['B','def is_prime(n):\n    if n < 2: return False\n    for i in range(2, int(n**0.5)+1):\n        if n % i == 0: return False\n    return True','def selection_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        min_idx = i\n        for j in range(i+1, n):\n            if arr[j] < arr[min_idx]:\n                min_idx = j\n        arr[i], arr[min_idx] = arr[min_idx], arr[i]\n    return arr'],
     ['single_choice','code','code'],
     [22,23,24]],
    [5, [24,25,26,27,28], [10,5,10,15,10],
     ['B','DROP','SELECT * FROM students;','SELECT c.name, AVG(s.score) FROM course c JOIN score s ON c.id = s.course_id GROUP BY c.name','ABC'],
     ['single_choice','fill_blank','short_answer','short_answer','multiple_choice'],
     [32,32,32,33,33]],
    [6, [29,30], [10,10],
     ['B','错误'],
     ['single_choice','judgment'],
     [34,35]],
    [7, [31,32,33,34,35,36,37,38,39], [10,10,10,10,10,10,5,10,10],
     ['A','C','C','B','C','B','plot()','B','B'],
     ['single_choice','single_choice','single_choice','single_choice','single_choice','single_choice','fill_blank','single_choice','single_choice'],
     [51,52,55,61,71,76,81,86,90]],
    [8, [40,41,42,43,44,45,46,47,48,49,50], [10,10,10,15,10,10,10,10,10,10,10],
     ['B','C','B','通过链式法则从输出层向输入层逐层计算损失函数对各参数的梯度','B','C','B','B','B','B','B'],
     ['single_choice','single_choice','single_choice','short_answer','single_choice','single_choice','single_choice','single_choice','single_choice','single_choice','single_choice'],
     [97,101,104,105,109,111,122,127,133,137,144]],
  ];

  for (const [asgnId, qIds, fullScores, correctAnswers, questionTypes, kpIds] of ASSIGNMENTS) {
    for (const sid of allStuIds) {
      const tier = STUDENT_TIER[sid];
      if (!tier) continue;
      const acc = tier.accuracy;
      for (let qi = 0; qi < qIds.length; qi++) {
        const qid = qIds[qi]; const fullScore = fullScores[qi];
        const correctAns = correctAnswers[qi]; const qt = questionTypes[qi];
        const kpId = kpIds[qi]; let studentAns: string; let score: number;

        if (qt === 'single_choice' || qt === 'multiple_choice' || qt === 'multi_choice') {
          if (Math.random() < acc) { studentAns = correctAns; score = fullScore; }
          else { const wrongs = ['A','B','C','D'].filter(c => !correctAns.includes(c)); studentAns = wrongs[Math.floor(Math.random() * wrongs.length)] || 'A'; score = 0; }
        } else if (qt === 'judgment') {
          if (Math.random() < acc) { studentAns = correctAns; score = fullScore; }
          else { studentAns = correctAns === '正确' ? '错误' : '正确'; score = 0; }
        } else if (qt === 'fill_blank') {
          if (Math.random() < acc) { studentAns = correctAns; score = fullScore; }
          else { studentAns = '___'; score = 0; }
        } else {
          studentAns = SA_TPL[Math.floor(Math.random() * SA_TPL.length)].replace('{kp}', '知识点'+kpId);
          score = fullScore * (0.3 + acc * 0.30 + Math.random() * 0.1);
        }
        score = Math.max(1, Math.min(fullScore, Math.round(score)));

        const isObj = qt === 'single_choice' || qt === 'multiple_choice' || qt === 'multi_choice' || qt === 'judgment' || qt === 'fill_blank';
        const dim = isObj
          ? (score > 0
              ? { knowledge_accuracy: 10, logic_completeness: 10, expression_clarity: 10, expansion: 10 }
              : { knowledge_accuracy: 0, logic_completeness: 0, expression_clarity: 0, expansion: 0 })
          : {
              knowledge_accuracy: Math.round(Math.max(0, Math.min(10, score / fullScore * 10 + (Math.random() * 3 - 1.5))) * 10) / 10,
              logic_completeness: Math.round(Math.max(0, Math.min(10, score / fullScore * 10 + (Math.random() * 3 - 1.5))) * 10) / 10,
              expression_clarity: Math.round(Math.max(0, Math.min(10, score / fullScore * 10 + (Math.random() * 3 - 1.5))) * 10) / 10,
              expansion: Math.round(Math.max(0, Math.min(10, score / fullScore * 10 + (Math.random() * 2 - 1))) * 10) / 10,
            };

        ansId++; gtId++;
        const subDate = new Date(now.getTime() - (Math.random() * 10 + 3) * 86400000);
        answers.push({
          id: ansId, assignment_id: asgnId, student_id: sid,
          question_id: qid, student_answer: studentAns,
          is_submitted: true, submitted_at: subDate.toISOString(),
        });
        if (asgnId <= 16) {  // First 16 assignments get grading (已批改), last 8 are submitted-only (已提交待批改)
          gradingTasks.push({
            id: gtId, answer_id: ansId, assignment_id: asgnId, student_id: sid,
            question_id: qid, knowledge_point_id: kpId,
            full_score: fullScore, question_type: qt,
            student_answer: studentAns,
            total_score: score,
            dimension_scores: dim,
            annotations: [{ content:'评价', type:'comment', comment: getComment(score, fullScore), point_deduction: fullScore - score }],
            status: 'completed',
            completed_at: new Date(subDate.getTime() + 86400000).toISOString(),
          });
        }
      }
    }
  }

  db.insert(answer).values(answers).run();
  console.log('  ✅ 作答记录完成 (' + answers.length + '条)');
  db.insert(gradingTask).values(gradingTasks).run();
  console.log('  ✅ 批改任务完成 (' + gradingTasks.length + '条)');

  // ===================== 10. 错题本 =====================
  console.log('📕 插入错题本...');
  const errorBooks: any[] = [];
  const ERROR_TYPES_ARR = ['knowledge', 'logic', 'careless', 'concept_confusion', 'method_error', 'calculation', 'expression', 'empty'];
  let ebId = 0;
  for (const gt of gradingTasks) {
    const fullScore = gt.full_score;
    if (gt.total_score < fullScore * 0.80) {
      ebId++;
      const scoreRatio = gt.total_score / fullScore;
      let errorType: string;
      if (gt.total_score === 0) { errorType = seededNoise(gt.id) < 0.4 ? 'empty' : 'knowledge'; }
      else if (scoreRatio < 0.4) { errorType = ['knowledge', 'logic', 'concept_confusion', 'method_error'][Math.floor(seededNoise(gt.id) * 4)]; }
      else { errorType = ['careless', 'calculation', 'expression', 'logic'][Math.floor(seededNoise(gt.id + 1) * 4)]; }
      const labels: Record<string, string> = {
        knowledge: '知识点错误', logic: '逻辑错误', careless: '粗心大意',
        concept_confusion: '概念混淆', method_error: '方法错误', calculation: '计算错误',
        expression: '表达问题', empty: '未作答',
      };
      errorBooks.push({
        id: ebId, student_id: gt.student_id, question_id: gt.question_id,
        knowledge_point_id: gt.knowledge_point_id, assignment_id: gt.assignment_id,
        grading_task_id: gt.id, student_answer: gt.student_answer,
        correct_answer: '参见题目标准答案',
        error_type: errorType,
        error_analysis: '[' + labels[errorType] + '] 得分' + gt.total_score + '/' + fullScore + '，需要加强相关知识点的学习与练习',
        review_status: 'pending',
      });
    }
  }
  // Batch insert errors (100 per batch)
  for (let i = 0; i < errorBooks.length; i += 100) {
    const batch = errorBooks.slice(i, i + 100);
    try { db.insert(errorBook).values(batch).run(); }
    catch (e) { console.error('    批次' + Math.floor(i/100+1) + '失败:', e); }
  }
  console.log('  ✅ 错题本已入库 (' + errorBooks.length + '条)');

  // ===================== 11. 知识掌握度日志 =====================
  console.log('📈 插入知识掌握度日志...');
  const masteryLogs: any[] = [];
  let mlId = 0;
  const allStudentIds = allStuIds.map(String);
  for (const sid of allStudentIds) {
    const studentId = parseInt(sid);
    const level = studentId <= 4 ? 'top' : studentId <= 9 ? 'medium' : 'weak';
    const baseMap: Record<string, number> = { top: 88, medium: 70, weak: 50 };
    const spreadMap: Record<string, number> = { top: 8, medium: 12, weak: 18 };
    const baseMastery = baseMap[level];
    const spread = spreadMap[level];
    // 覆盖全部知识点（真实学生应掌握整门课程），用确定性噪声保证可复现
    for (let kp = 1; kp <= 152; kp++) {
      let courseIdx: number;
      if (kp <= 10) courseIdx = 0; else if (kp <= 26) courseIdx = 1; else if (kp <= 44) courseIdx = 2; else courseIdx = 3;
      const dlBonus = courseIdx === 3 ? Math.floor((kp - 45) / 20) * 4 : 0;
      const decline = courseIdx * 3 + dlBonus; // 越靠后越难，掌握度略降
      const noise = (seededNoise(studentId * 1000 + kp) - 0.5) * 2 * spread; // 确定性波动
      const weakSpot = (kp % 17 === 0 || kp % 23 === 0) ? -12 : 0; // 部分知识点为共性弱项
      const mastery = Math.round(Math.min(100, Math.max(5, baseMastery - decline + noise + weakSpot)));
      const errorCount = Math.max(0, Math.round((100 - mastery) / 15 + seededNoise(studentId * 2000 + kp) * 2));
      mlId++;
      const recDay = 20 + courseIdx * 5 + Math.floor(seededNoise(studentId * 3 + kp) * 5);
      masteryLogs.push({
        id: mlId, student_id: studentId, knowledge_point_id: kp,
        mastery_rate: mastery, error_count: errorCount,
        recorded_at: new Date(2026, 6, recDay).toISOString().slice(0, 10),
      });
    }
  }
  db.insert(knowledgeMasteryLog).values(masteryLogs).run();
  console.log('  ✅ 知识掌握度日志完成 (' + masteryLogs.length + '条)');

  // ===================== 能力图谱 + 思政图谱 =====================
  console.log('🧩 插入能力点与思政点...');
  const abilities = [
    { id: 1, name: '计算思维', description: '将问题抽象为可计算模型的思维能力', course_id: 1 },
    { id: 2, name: '逻辑推理', description: '程序逻辑与流程控制推理能力', course_id: 1 },
    { id: 3, name: '编程实践', description: '编写、调试与优化代码的动手能力', course_id: 1 },
    { id: 4, name: '工程规范', description: '代码规范、文档与工程化能力', course_id: 1 },
  ];
  const ideologies = [
    { id: 1, name: '家国情怀', description: '科技报国、服务国家战略', course_id: 1 },
    { id: 2, name: '科学精神', description: '求真务实、严谨治学', course_id: 1 },
    { id: 3, name: '工程伦理', description: '技术应用的伦理责任', course_id: 1 },
    { id: 4, name: '创新意识', description: '勇于探索、开拓创新', course_id: 1 },
  ];
  db.insert(abilityPoint).values(abilities).run();
  db.insert(ideologyPoint).values(ideologies).run();

  const abilityLinks = [
    { ability_id: 1, knowledge_id: 1 }, { ability_id: 1, knowledge_id: 3 },
    { ability_id: 2, knowledge_id: 3 }, { ability_id: 2, knowledge_id: 4 },
    { ability_id: 3, knowledge_id: 5 }, { ability_id: 3, knowledge_id: 6 },
    { ability_id: 3, knowledge_id: 8 }, { ability_id: 4, knowledge_id: 10 },
  ];
  const ideologyLinks = [
    { ideology_id: 1, knowledge_id: 8 }, { ideology_id: 1, knowledge_id: 10 },
    { ideology_id: 2, knowledge_id: 1 }, { ideology_id: 2, knowledge_id: 2 },
    { ideology_id: 3, knowledge_id: 9 }, { ideology_id: 4, knowledge_id: 5 },
    { ideology_id: 4, knowledge_id: 6 },
  ];
  db.insert(abilityKnowledge).values(abilityLinks).run();
  db.insert(ideologyKnowledge).values(ideologyLinks).run();
  console.log('  ✅ 能力点(4) + 思政点(4) + 关联完成');

  // ===================== 学习材料 + 行为日志 =====================
  console.log('📖 插入学习材料与行为日志...');
  const materials = [
    { id: 1, course_id: 1, teacher_id: 1, title: '变量与数据类型', type: 'document', content: 'Python 中的变量是对象的引用，无需显式声明类型。核心数据类型包括 int、float、str、bool，以及序列类型 list、tuple 和映射类型 dict。理解可变与不可变类型是掌握 Python 的关键。', url: '', duration_minutes: 20, knowledge_point_ids: [1, 2] },
    { id: 2, course_id: 1, teacher_id: 1, title: '流程控制：if / else', type: 'slide', content: '条件判断是程序分支的基础。掌握 if / elif / else 的语法、缩进规则与逻辑运算（and / or / not），并注意比较运算符的优先级。', url: '', duration_minutes: 15, knowledge_point_ids: [3] },
    { id: 3, course_id: 1, teacher_id: 1, title: '循环结构 for / while', type: 'document', content: '循环用于重复执行代码块。for 遍历序列，while 按条件循环。重点掌握 break / continue 与 else 子句，以及嵌套循环的时间复杂度意识。', url: '', duration_minutes: 25, knowledge_point_ids: [4] },
    { id: 4, course_id: 1, teacher_id: 1, title: '函数定义与调用', type: 'video', content: '函数是代码复用的基本单元。掌握 def 定义、参数传递（位置/关键字/默认/可变参数）、返回值，以及作用域规则（LEGB）。', url: '', duration_minutes: 30, knowledge_point_ids: [5] },
    { id: 5, course_id: 1, teacher_id: 1, title: '列表与元组', type: 'document', content: '列表是可变的序列类型，元组是不可变的。掌握切片、列表推导式、常用方法（append/extend/pop/sort），以及元组的打包与解包。', url: '', duration_minutes: 20, knowledge_point_ids: [6] },
    { id: 6, course_id: 2, teacher_id: 1, title: '查找算法：二分查找', type: 'video', content: '二分查找在有序序列中每次折半缩小范围，时间复杂度 O(log n)。重点理解边界条件（left/right 的更新）与终止条件。', url: '', duration_minutes: 20, knowledge_point_ids: [20] },
    { id: 7, course_id: 2, teacher_id: 1, title: '二叉排序树', type: 'slide', content: '二叉排序树（BST）左小右大，中序遍历得到有序序列。掌握插入、查找、删除三大操作，理解退化为链表的最坏情况。', url: '', duration_minutes: 25, knowledge_point_ids: [21] },
  ];
  db.insert(learningMaterial).values(materials).run();

  // 行为日志：体现「停留时长/重看次数 → 薄弱推断」的多样性
  const behaviors = [
    // 张同学(top)：材料1完整学完，材料3反复看3次(可能没懂循环)
    { student_id: 3, material_id: 1, watch_duration: 640, progress: 100, review_count: 1, is_completed: true, last_watched_at: '2026-08-20 10:30:00' },
    { student_id: 3, material_id: 3, watch_duration: 1420, progress: 100, review_count: 3, is_completed: true, last_watched_at: '2026-08-22 14:10:00' },
    // 李同学(top)：材料1快速学完，材料4看完
    { student_id: 4, material_id: 1, watch_duration: 520, progress: 100, review_count: 1, is_completed: true, last_watched_at: '2026-08-19 09:00:00' },
    { student_id: 4, material_id: 4, watch_duration: 1500, progress: 100, review_count: 2, is_completed: true, last_watched_at: '2026-08-23 16:00:00' },
    // 王同学(medium)：材料2只看了30%(跳过)，材料5反复看4次(列表没掌握)
    { student_id: 5, material_id: 2, watch_duration: 120, progress: 30, review_count: 1, is_completed: false, last_watched_at: '2026-08-21 11:00:00' },
    { student_id: 5, material_id: 5, watch_duration: 1800, progress: 100, review_count: 4, is_completed: true, last_watched_at: '2026-08-24 20:00:00' },
    // 吴同学(weak)：材料1反复看5次(基础薄弱)
    { student_id: 10, material_id: 1, watch_duration: 2400, progress: 100, review_count: 5, is_completed: true, last_watched_at: '2026-08-25 15:00:00' },
    // 陈同学(medium)：材料6视频看完
    { student_id: 7, material_id: 6, watch_duration: 700, progress: 100, review_count: 1, is_completed: true, last_watched_at: '2026-08-26 10:00:00' },
  ];
  db.insert(learningBehaviorLog).values(behaviors).run();
  console.log('  ✅ 学习材料(7) + 行为日志(' + behaviors.length + ')完成');

  // ===================== 系统配置 + 审计日志 =====================
  console.log('⚙️ 插入系统配置与审计日志...');
  db.insert(systemConfig).values([
    { key: 'ai_model', value: 'glm-4-flash', description: '默认 AI 模型' },
    { key: 'ai_provider', value: '智谱 AI', description: 'AI 服务提供商' },
    { key: 'platform_name', value: '溯光 TracingLight', description: '平台名称' },
    { key: 'review_spot_ratio', value: '20', description: '主观题抽查比例(%)' },
    { key: 'auto_backup', value: 'off', description: '自动备份开关' },
  ]).run();
  db.insert(auditLog).values([
    { operator_id: 13, operator_name: '系统管理员', action: 'update_config', target_type: 'system_config', target_id: 'ai_model', detail: '设置 AI 模型为 glm-4-flash' },
  ]).run();
  console.log('  ✅ 系统配置(5) + 审计日志(2)完成');

  // ===================== 通知 =====================
  console.log('🔔 插入通知...');
  db.insert(notification).values([
    { user_id: 3, type: 'assignment', title: '新作业发布', content: '王老师在《Python程序设计》发布了作业：Python基础练习（一）', link: '/student/assignments', is_read: false },
    { user_id: 3, type: 'grade', title: '作业已批改', content: '你的作业《变量与数据类型练习》已批改完成，得分 85 分', link: '/student/assignments', is_read: false },
    { user_id: 3, type: 'system', title: '欢迎使用溯光', content: '欢迎使用溯光智慧教育平台，开启你的学习之旅', link: '/student/overview', is_read: true },
    { user_id: 1, type: 'system', title: '批改提醒', content: '你有 3 份主观题作业待复核', link: '/teacher/assignments', is_read: false },
  ]).run();
  console.log('  ✅ 通知(4)完成');

  // ===================== 课表 + 考试 + 学习计划（动态日期，真实化） =====================
  console.log('📅 插入班级课表 / 个人安排 / 考试 / 学习计划...');
  const today = new Date();
  const fmtDate = (offsetDays: number) => {
    const d = new Date(today.getTime() + offsetDays * 86400000);
    return d.toISOString().split('T')[0];
  };
  const dayOfWeek = today.getDay(); // 0=周日

  // 班级课表（class_schedule）
  db.insert(classSchedule).values([
    { course_id: 1, class_id: 1, day_of_week: 1, start_time: '08:00', end_time: '09:40', location: '教1-301' },
    { course_id: 1, class_id: 1, day_of_week: 3, start_time: '10:00', end_time: '11:40', location: '实验楼B203' },
    { course_id: 2, class_id: 1, day_of_week: 2, start_time: '08:00', end_time: '09:40', location: '教2-105' },
    { course_id: 2, class_id: 1, day_of_week: 4, start_time: '14:00', end_time: '15:40', location: '教2-105' },
    { course_id: 3, class_id: 1, day_of_week: 1, start_time: '14:00', end_time: '15:40', location: '教3-208' },
    { course_id: 3, class_id: 1, day_of_week: 5, start_time: '10:00', end_time: '11:40', location: '实验楼A105' },
    { course_id: 4, class_id: 1, day_of_week: 3, start_time: '14:00', end_time: '15:40', location: '实验楼B402' },
  ]).run();

  // 学生个人安排（student_schedule，给几个学生）
  db.insert(studentSchedule).values([
    { student_id: 3, title: '晨跑锻炼', category: 'exercise', schedule_type: 'fixed', day_of_week: [1, 3, 5], start_time: '06:30', end_time: '07:10', priority: 2 },
    { student_id: 3, title: '编程社活动', category: 'club', schedule_type: 'fixed', day_of_week: [4], start_time: '19:00', end_time: '21:00', priority: 3 },
    { student_id: 4, title: '兼职助教', category: 'parttime', schedule_type: 'fixed', day_of_week: [2, 4], start_time: '16:00', end_time: '18:00', priority: 1 },
    { student_id: 7, title: '篮球训练', category: 'exercise', schedule_type: 'fixed', day_of_week: [2, 6], start_time: '17:30', end_time: '19:00', priority: 2 },
  ]).run();

  // 考试安排（exam_schedule，未来日期）
  db.insert(examSchedule).values([
    { course_id: 1, class_id: 1, exam_name: 'Python程序设计 期中考试', exam_date: fmtDate(10), start_time: '09:00', end_time: '11:00', knowledge_scope: [1, 2, 3, 4, 5] },
    { course_id: 2, class_id: 1, exam_name: '数据结构与算法 单元测验', exam_date: fmtDate(17), start_time: '14:00', end_time: '15:30', knowledge_scope: [20, 21] },
    { course_id: 3, class_id: 1, exam_name: '数据库原理 期中考试', exam_date: fmtDate(24), start_time: '09:00', end_time: '11:00', knowledge_scope: [31, 32, 33] },
  ]).run();

  // 预置学习计划（study_plan，动态未来日期，避免学习规划页反复生成）
  const planSeed = [
    { student_id: 3, subject: 'Python程序设计', content: '复习变量与数据类型，完成5道练习题', plan_type: 'review', time_slot: '19:00-20:00', duration: 60, day: 1 },
    { student_id: 3, subject: 'Python程序设计', content: '流程控制专项练习（if/else 与循环）', plan_type: 'practice', time_slot: '19:00-20:30', duration: 90, day: 2 },
    { student_id: 3, subject: '数据结构与算法', content: '复习二分查找原理，刷3道题', plan_type: 'review', time_slot: '20:00-21:00', duration: 60, day: 3 },
    { student_id: 3, subject: 'Python程序设计', content: '函数定义与作用域整理笔记', plan_type: 'review', time_slot: '16:00-17:00', duration: 60, day: 4 },
    { student_id: 3, subject: '数据库原理', content: '关系模型与ER图预习', plan_type: 'preview', time_slot: '19:30-20:30', duration: 60, day: 5 },
    { student_id: 3, subject: '数据结构与算法', content: '二叉排序树插入删除练习', plan_type: 'practice', time_slot: '10:00-11:30', duration: 90, day: 6 },
    { student_id: 4, subject: 'Python程序设计', content: '列表推导式与切片练习', plan_type: 'practice', time_slot: '19:00-20:00', duration: 60, day: 1 },
    { student_id: 4, subject: 'Python程序设计', content: '字典与集合方法整理', plan_type: 'review', time_slot: '19:00-20:00', duration: 60, day: 2 },
    { student_id: 5, subject: 'Python程序设计', content: '循环结构重点复习（薄弱点）', plan_type: 'review', time_slot: '18:30-20:00', duration: 90, day: 1 },
  ].map((p) => ({
    student_id: p.student_id,
    course_id: p.subject === '数据结构与算法' ? 2 : p.subject === '数据库原理' ? 3 : 1,
    plan_name: `${p.subject} - ${p.content}`,
    plan_type: 'weekly',
    start_date: fmtDate(0),
    end_date: fmtDate(6),
    total_sessions: 6,
    completed_sessions: 0,
    status: 'pending',
    plan_date: fmtDate(p.day),
    time_slot: p.time_slot,
    subject: p.subject,
    content: p.content,
    duration_minutes: p.duration,
    is_ai_generated: true,
  }));
  db.insert(studyPlan).values(planSeed).run();
  console.log('  ✅ 班级课表(7) + 个人安排(4) + 考试(3) + 学习计划(' + planSeed.length + ')完成');

  saveDb();

  console.log('\n🎉 种子数据插入完成！');
  console.log('================================');
  console.log('  学校: 1 | 学院: 1 | 专业: 1 | 班级: 2');
  console.log('  教师: 2 | 学生: 10');
  console.log('  课程: 4 | 知识点: 152');
  console.log('  知识图谱节点: ' + KGN.length + ' | 边: ' + KGE.length);
  console.log('  题目: 245 | 作业: 24');
  console.log('  作答记录: ' + answers.length + ' | 批改任务: ' + gradingTasks.length);
  console.log('  错题本: ' + errorBooks.length + ' | 掌握度日志: ' + masteryLogs.length);
  console.log('================================');
}

seed().catch(err => { console.error('❌ 种子数据插入失败:', err); process.exit(1); });


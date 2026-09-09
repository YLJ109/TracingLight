/**
 * 种子共享上下文：跨模块传递已生成的实体索引，保证“连续 id / 无悬空引用 / 链表一致”。
 */
import type { Rng } from '../../../lib/seed/rng';
import { makeRng } from '../../../lib/seed/rng';

export interface SeedCtx {
  // 全局 id 生成器（跨所有表唯一递增，杜绝断档），以及统一随机源
  nextId: () => number;
  rng: Rng;
  // 组织
  schoolId: number;
  collegeIds: number[];
  majorIds: number[];
  classId: number[]; // 班级 id 列表
  classMajor: Map<number, number>; // classId -> majorId
  classGrade: Map<number, string>; // classId -> grade(年份)
  // 用户
  teachers: number[]; // 教师 userId
  assistants: number[];
  admins: number[];
  students: number[]; // 全部学生 userId
  userClass: Map<number, number>; // userId -> classId
  userName: Map<number, string>; // userId -> real_name
  classMap: Map<string, number>; // username -> userId
  teacherMajor: Map<number, number>; // teacherUserId -> majorIdx
  levelOf: Map<number, string>; // studentId -> top/medium/weak
  classStudents: Map<number, number[]>; // classId -> student userId[]
  // 课程
  courseIds: number[]; // 课程 id（Flatten 顺序）
  courseTeacher: Map<number, number>; // courseId -> teacherId
  courseClass: Map<number, number>; // courseId -> classId
  courseSemester: Map<number, string>;
  courseName: Map<number, string>; // courseId -> name
  // 知识点：courseId -> { chapters: {chapter, order, name, desc, kps: [{id,name,diff,parent?}] , kpIds:[]} }
  courseKps: Map<number, Array<{ chapter: string; chapterOrder: number; name: string; desc: string; diff: 'easy' | 'medium' | 'hard'; kpId: number; sortOrder: number }>>;
  lastKpId: number;
  // 图谱节点：courseId -> 一级节点(node_level=1) id 列表；及 knowledgePointId -> node_id
  courseRootNode: Map<number, number>;
  kpNodeId: Map<number, number>; // knowledgePointId -> knowledge_graph_node.id (level=3)
  graphNodes: Array<{ id: number; knowledge_point_id: number; course_id: number; node_name: string; node_level: number; parent_node_id: number | null; display_order: number; color_hex: string | null; is_leaf: boolean }>;
  graphEdges: Array<{ from_node_id: number; to_node_id: number; relation_type: string; description: string | null }>;
  // 题目：courseId -> question[]（供作业/考试组卷）
  questionsByCourse: Map<number, Array<number>>; // courseId -> questionId[]
  questionKp: Map<number, number>; // questionId -> kpId
  questionMeta: Map<number, { type: string; difficulty: string; kpId: number; score: number; answer: string; analysis: string }>;
  masteryAcc: Map<string, { sum: number; cnt: number; kpid: number }>; // "sid_kpid" -> 累加掌握度
}

export function createCtx(salt = 'tracinglight-seed-v1'): SeedCtx {
  const rng = makeRng(salt);
  let idCounter = 0;
  const nextId = () => ++idCounter;
  return {
    nextId,
    rng,
    schoolId: 0,
    collegeIds: [],
    majorIds: [],
    classId: [],
    classMajor: new Map(),
    classGrade: new Map(),
    teachers: [],
    assistants: [],
    admins: [],
    students: [],
    userClass: new Map(),
    userName: new Map(),
    classMap: new Map(),
    teacherMajor: new Map(),
    levelOf: new Map(),
    classStudents: new Map(),
    courseIds: [],
    courseTeacher: new Map(),
    courseClass: new Map(),
    courseSemester: new Map(),
    courseName: new Map(),
    courseKps: new Map(),
    lastKpId: 0,
    courseRootNode: new Map(),
    kpNodeId: new Map(),
    graphNodes: [],
    graphEdges: [],
    questionsByCourse: new Map(),
    questionKp: new Map(),
    questionMeta: new Map(),
    masteryAcc: new Map(),
  };
}
/**
 * 演示账号台账（单一事实源）
 * 与种子账号口径一致：学生 stu_{class}_{idx}（共 20），教师 teacher_0_{idx}（共 2），管理员 admin（1）。
 * 密码规则：管理员固定 123456，其余 = 用户名。
 * 该模块为纯数据，可被前端（登录抽屉）与服务端（seed 冒烟断言）同时引用。
 */

export interface DemoUser {
  username: string;
  real_name: string;
  role: 'student' | 'teacher' | 'admin';
  level?: string;
}

export const DEMO_ADMIN: DemoUser = { username: 'admin', real_name: '谢磊（管理员）', role: 'admin' };

export const DEMO_TEACHERS: DemoUser[] = [
  { username: 'teacher_0_0', real_name: '萧涵棋老师', role: 'teacher' },
  { username: 'teacher_0_1', real_name: '郑洁老师', role: 'teacher' },
];

// 全部 20 名学生（与种子一一对应，真实姓名 + 学业分层）
export const DEMO_STUDENTS: DemoUser[] = [
  { username: 'stu_0_0', real_name: '蒋哲', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_1', real_name: '赵妍', role: 'student', level: '学霸层' },
  { username: 'stu_0_2', real_name: '曾萌蕾', role: 'student', level: '学霸层' },
  { username: 'stu_0_3', real_name: '林妍', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_4', real_name: '林远', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_5', real_name: '唐鹏明', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_6', real_name: '梁波超', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_7', real_name: '朱彤', role: 'student', level: '勤奋中等层' },
  { username: 'stu_0_8', real_name: '曹燕', role: 'student', level: '学霸层' },
  { username: 'stu_0_9', real_name: '萧婧', role: 'student', level: '勤奋中等层' },
  { username: 'stu_1_0', real_name: '徐莹', role: 'student', level: '学霸层' },
  { username: 'stu_1_1', real_name: '苏峰', role: 'student', level: '学霸层' },
  { username: 'stu_1_2', real_name: '陈悦', role: 'student', level: '勤奋中等层' },
  { username: 'stu_1_3', real_name: '田斌', role: 'student', level: '勤奋中等层' },
  { username: 'stu_1_4', real_name: '吴棋', role: 'student', level: '学霸层' },
  { username: 'stu_1_5', real_name: '曹松', role: 'student', level: '提升层' },
  { username: 'stu_1_6', real_name: '曹梦', role: 'student', level: '学霸层' },
  { username: 'stu_1_7', real_name: '蒋斌军', role: 'student', level: '提升层' },
  { username: 'stu_1_8', real_name: '许浩', role: 'student', level: '学霸层' },
  { username: 'stu_1_9', real_name: '许雪', role: 'student', level: '勤奋中等层' },
];

/** 密码规则：管理员固定 123456，其余 = 用户名 */
export const demoPassword = (username: string): string =>
  username === 'admin' ? '123456' : username;

// 便捷按角色取默认账号
export const demoOfRole = (role: 'student' | 'teacher' | 'admin'): DemoUser => {
  if (role === 'admin') return DEMO_ADMIN;
  if (role === 'teacher') return DEMO_TEACHERS[0];
  return DEMO_STUDENTS[0];
};

// 冒烟断言常量：与种子生成数严格一致
export const DEMO_COUNTS = {
  students: DEMO_STUDENTS.length,
  teachers: DEMO_TEACHERS.length,
  admin: 1,
  total: DEMO_STUDENTS.length + DEMO_TEACHERS.length + 1,
} as const;
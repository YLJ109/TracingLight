import { sqliteTable, integer, real, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ===================== 基础数据层 =====================

export const school = sqliteTable("school", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  short_name: text("short_name"),
  logo_url: text("logo_url"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const college = sqliteTable("college", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  school_id: integer("school_id").notNull().references(() => school.id),
  name: text("name").notNull(),
  short_name: text("short_name"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [index("college_school_id_idx").on(table.school_id)]);

export const major = sqliteTable("major", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  college_id: integer("college_id").notNull().references(() => college.id),
  name: text("name").notNull(),
  short_name: text("short_name"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [index("major_college_id_idx").on(table.college_id)]);

export const classInfo = sqliteTable("class", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  major_id: integer("major_id").notNull().references(() => major.id),
  name: text("name").notNull(),
  grade: text("grade"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [index("class_major_id_idx").on(table.major_id)]);

export const user = sqliteTable("user", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  real_name: text("real_name").notNull(),
  role: text("role").notNull(), // teacher / student
  password: text("password"), // sha256 哈希（本地演示）
  class_id: integer("class_id").references(() => classInfo.id),
  student_level: text("student_level"), // top / medium / weak
  avatar_url: text("avatar_url"),
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
  token_version: integer("token_version").default(0), // 改密/禁用时递增，使旧 JWT 全部失效
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("user_role_idx").on(table.role),
  index("user_class_id_idx").on(table.class_id),
]);

export const course = sqliteTable("course", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  short_name: text("short_name"),
  description: text("description"),
  teacher_id: integer("teacher_id").references(() => user.id),
  class_id: integer("class_id").references(() => classInfo.id),
  semester: text("semester"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("course_teacher_id_idx").on(table.teacher_id),
  index("course_class_id_idx").on(table.class_id),
]);

// ===================== 教学资源层 =====================

export const knowledgePoint = sqliteTable("knowledge_point", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  name: text("name").notNull(),
  description: text("description"),
  difficulty: text("difficulty"), // easy / medium / hard
  parent_id: integer("parent_id"),
  sort_order: integer("sort_order").default(0),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("kp_course_id_idx").on(table.course_id),
  index("kp_parent_id_idx").on(table.parent_id),
]);

export const knowledgeGraphNode = sqliteTable("knowledge_graph_node", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id, { onDelete: "cascade" }),
  course_id: integer("course_id").notNull().references(() => course.id),
  node_name: text("node_name").notNull(),
  node_level: integer("node_level").notNull(), // 1=course 2=module 3=knowledge 4=sub-knowledge
  parent_node_id: integer("parent_node_id"),
  display_order: integer("display_order").default(0),
  color_hex: text("color_hex"),
  is_leaf: integer("is_leaf", { mode: 'boolean' }).default(false),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("kgn_course_id_idx").on(table.course_id),
  index("kgn_parent_node_id_idx").on(table.parent_node_id),
  index("kgn_node_level_idx").on(table.node_level),
  // 同一知识点可出现在图谱的多个层级，故不用 uniqueIndex
]);

export const knowledgeGraphEdge = sqliteTable("knowledge_graph_edge", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  from_node_id: integer("from_node_id").notNull().references(() => knowledgeGraphNode.id, { onDelete: "cascade" }),
  to_node_id: integer("to_node_id").notNull().references(() => knowledgeGraphNode.id, { onDelete: "cascade" }),
  relation_type: text("relation_type").notNull(), // prerequisite / related / expands
  description: text("description"),
}, (table) => [
  index("kge_from_node_id_idx").on(table.from_node_id),
  index("kge_to_node_id_idx").on(table.to_node_id),
  uniqueIndex("kge_unique_idx").on(table.from_node_id, table.to_node_id, table.relation_type),
]);

export const question = sqliteTable("question", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  question_type: text("question_type").notNull(), // single_choice / multi_choice / judgment / fill_blank / short_answer / programming
  difficulty: text("difficulty").notNull(), // easy / medium / hard
  content: text("content").notNull(),
  options: text("options", { mode: 'json' }),
  answer: text("answer").notNull(),
  analysis: text("analysis"),
  default_score: integer("default_score").default(10),
  source: text("source").default("ai"),
  version: integer("version").default(1),
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
  locked: integer("locked", { mode: 'boolean' }).default(false), // 锁定后选题/组卷不可选
  min_chars: integer("min_chars"), // 主观题作答最低字数（NULL=不限）
  max_chars: integer("max_chars"), // 主观题作答最高字数（NULL=不限）
  min_select: integer("min_select"), // 多选至少选择项数（NULL=不限）
  max_select: integer("max_select"), // 多选最多选择项数（NULL=不限）
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("q_course_id_idx").on(table.course_id),
  index("q_kp_id_idx").on(table.knowledge_point_id),
  index("q_type_idx").on(table.question_type),
  index("q_difficulty_idx").on(table.difficulty),
]);

// ===================== 业务流转层 =====================

export const assignment = sqliteTable("assignment", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  teacher_id: integer("teacher_id").notNull().references(() => user.id),
  title: text("title").notNull(),
  description: text("description"),
  question_ids: text("question_ids", { mode: 'json' }).notNull(), // integer array as JSON
  total_score: real("total_score").default(100),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  status: text("status").default("published"), // draft / published / closed
  allow_resubmit: integer("allow_resubmit", { mode: 'boolean' }).default(false),
  review_mode: text("review_mode").default("auto"), // auto / teacher_review
  has_subjective: integer("has_subjective", { mode: 'boolean' }).default(false),
  grades_published: integer("grades_published", { mode: 'boolean' }).default(false), // 成绩是否已发布给学生（发布前学生不可见批改分数）
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("asgn_course_id_idx").on(table.course_id),
  index("asgn_status_idx").on(table.status),
]);

export const answer = sqliteTable("answer", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  assignment_id: integer("assignment_id").notNull().references(() => assignment.id, { onDelete: "cascade" }),
  student_id: integer("student_id").notNull().references(() => user.id),
  question_id: integer("question_id").notNull().references(() => question.id),
  student_answer: text("student_answer"),
  is_submitted: integer("is_submitted", { mode: 'boolean' }).default(false),
  submitted_at: text("submitted_at"),
  returned: integer("returned", { mode: 'boolean' }).default(false), // 教师退回重做标记
  returned_at: text("returned_at"),
  return_comment: text("return_comment"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("ans_assignment_id_idx").on(table.assignment_id),
  index("ans_student_id_idx").on(table.student_id),
  uniqueIndex("ans_unique_idx").on(table.assignment_id, table.student_id, table.question_id),
]);

export const gradingTask = sqliteTable("grading_task", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  answer_id: integer("answer_id").notNull().references(() => answer.id, { onDelete: "cascade" }),
  assignment_id: integer("assignment_id").notNull().references(() => assignment.id),
  student_id: integer("student_id").notNull().references(() => user.id),
  question_id: integer("question_id").notNull().references(() => question.id),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  full_score: real("full_score").notNull(),
  question_type: text("question_type").notNull(),
  reference_answer: text("reference_answer"),
  student_answer: text("student_answer"),
  rubric_json: text("rubric_json", { mode: 'json' }),
  total_score: real("total_score"),
  dimension_scores: text("dimension_scores", { mode: 'json' }),
  annotations: text("annotations", { mode: 'json' }),
  unmastered_knowledge_ids: text("unmastered_knowledge_ids", { mode: 'json' }),
  error_type: text("error_type"),
  overall_comment: text("overall_comment"),
  status: text("status").default("pending"), // pending / processing / completed / failed
  retry_count: integer("retry_count").default(0),
  max_retries: integer("max_retries").default(3),
  error_message: text("error_message"),
  teacher_override_score: real("teacher_override_score"),
  teacher_override_comment: text("teacher_override_comment"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  completed_at: text("completed_at"),
}, (table) => [
  index("gt_status_idx").on(table.status),
  index("gt_assignment_id_idx").on(table.assignment_id),
  index("gt_student_id_idx").on(table.student_id),
]);

export const errorBook = sqliteTable("error_book", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  question_id: integer("question_id").references(() => question.id),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  assignment_id: integer("assignment_id").references(() => assignment.id),
  grading_task_id: integer("grading_task_id").references(() => gradingTask.id),
  content: text("content"),
  student_answer: text("student_answer"),
  correct_answer: text("correct_answer"),
  error_type: text("error_type"),
  error_analysis: text("error_analysis"),
  knowledge_explanation: text("knowledge_explanation"),
  similar_questions: text("similar_questions", { mode: 'json' }),
  learning_suggestion: text("learning_suggestion"),
  review_status: text("review_status").default("pending"), // pending / reviewing / mastered
  reviewed_at: text("reviewed_at"),
  next_review_at: text("next_review_at"), // 间隔复习到期时间（1/3/7 天）
  review_count: integer("review_count").default(0), // 已复习次数（推进间隔用）
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("eb_student_id_idx").on(table.student_id),
  index("eb_kp_id_idx").on(table.knowledge_point_id),
  index("eb_review_status_idx").on(table.review_status),
]);

export const knowledgeMasteryLog = sqliteTable("knowledge_mastery_log", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  mastery_rate: real("mastery_rate").notNull(),
  error_count: integer("error_count").default(0),
  recorded_at: text("recorded_at").notNull().default(sql`(CURRENT_DATE)`),
}, (table) => [
  index("kml_student_id_idx").on(table.student_id),
  index("kml_recorded_at_idx").on(table.recorded_at),
  uniqueIndex("kml_unique_idx").on(table.student_id, table.knowledge_point_id, table.recorded_at),
]);

// ===================== 互动管理层 =====================

export const questionRecord = sqliteTable("question_record", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  teacher_id: integer("teacher_id").references(() => user.id),
  course_id: integer("course_id").references(() => course.id),
  knowledge_point_id: integer("knowledge_point_id").references(() => knowledgePoint.id),
  error_record_id: integer("error_record_id").references(() => errorBook.id),
  assignment_id: integer("assignment_id").references(() => assignment.id),
  question_text: text("question_text").notNull(),
  answer_text: text("answer_text"),
  status: text("status").default("pending"), // pending / answered / resolved / closed
  is_public: integer("is_public", { mode: 'boolean' }).default(false),
  student_rating: integer("student_rating"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  answered_at: text("answered_at"),
  resolved_at: text("resolved_at"),
}, (table) => [
  index("qr_student_id_idx").on(table.student_id),
  index("qr_teacher_id_idx").on(table.teacher_id),
  index("qr_status_idx").on(table.status),
  index("qr_course_id_idx").on(table.course_id),
]);

export const announcement = sqliteTable("announcement", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  teacher_id: integer("teacher_id").notNull().references(() => user.id),
  course_id: integer("course_id").references(() => course.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  is_pinned: integer("is_pinned", { mode: 'boolean' }).default(false),
  target_type: text("target_type").default("all"), // all / specific
  target_student_ids: text("target_student_ids", { mode: 'json' }),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
}, (table) => [
  index("ann_teacher_id_idx").on(table.teacher_id),
  index("ann_course_id_idx").on(table.course_id),
]);

export const announcementRead = sqliteTable("announcement_read", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  announcement_id: integer("announcement_id").notNull().references(() => announcement.id, { onDelete: "cascade" }),
  student_id: integer("student_id").notNull().references(() => user.id),
  read_at: text("read_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("ar_announcement_id_idx").on(table.announcement_id),
  index("ar_student_id_idx").on(table.student_id),
  uniqueIndex("ar_unique_idx").on(table.announcement_id, table.student_id),
]);

// ===================== 学习规划层 =====================

export const studentSchedule = sqliteTable("student_schedule", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  title: text("title").notNull(),
  category: text("category").notNull(), // driving / parttime / exercise / club / other
  schedule_type: text("schedule_type").notNull(), // fixed / once
  day_of_week: text("day_of_week", { mode: 'json' }), // integer array
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  date_start: text("date_start"),
  date_end: text("date_end"),
  priority: integer("priority").default(3),
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [index("ss_student_id_idx").on(table.student_id)]);

export const classSchedule = sqliteTable("class_schedule", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  class_id: integer("class_id").notNull().references(() => classInfo.id),
  day_of_week: integer("day_of_week").notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  location: text("location"),
  week_pattern: text("week_pattern").default("every"),
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
}, (table) => [
  index("cs_course_id_idx").on(table.course_id),
  index("cs_class_id_idx").on(table.class_id),
]);

export const examSchedule = sqliteTable("exam_schedule", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  class_id: integer("class_id").notNull().references(() => classInfo.id),
  exam_name: text("exam_name").notNull(),
  exam_date: text("exam_date").notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  knowledge_scope: text("knowledge_scope", { mode: 'json' }),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("es_course_id_idx").on(table.course_id),
  index("es_class_id_idx").on(table.class_id),
]);

export const studyPlan = sqliteTable("study_plan", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  plan_name: text("plan_name"),
  plan_type: text("plan_type"), // weekly / sprint / daily
  start_date: text("start_date"),
  end_date: text("end_date"),
  focus_knowledge_ids: text("focus_knowledge_ids", { mode: 'json' }),
  total_sessions: integer("total_sessions"),
  completed_sessions: integer("completed_sessions").default(0),
  status: text("status").default("active"), // active / completed / abandoned
  generated_at: text("generated_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
  // AI-generated plan item fields
  course_id: integer("course_id"),
  plan_date: text("plan_date"),
  time_slot: text("time_slot"),
  subject: text("subject"),
  content: text("content"),
  duration_minutes: integer("duration_minutes"),
  is_ai_generated: integer("is_ai_generated", { mode: 'boolean' }).default(false),
}, (table) => [index("sp_student_id_idx").on(table.student_id)]);

export const studySession = sqliteTable("study_session", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  plan_id: integer("plan_id").notNull().references(() => studyPlan.id, { onDelete: "cascade" }),
  session_date: text("session_date").notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  session_type: text("session_type").notNull(), // review / practice / preview
  resources: text("resources", { mode: 'json' }),
  is_completed: integer("is_completed", { mode: 'boolean' }).default(false),
  completed_at: text("completed_at"),
  student_feedback: text("student_feedback"), // too_easy / just_right / too_hard / skip
  scheduled_duration: integer("scheduled_duration"),
  actual_duration: integer("actual_duration"),
  notes: text("notes"),
}, (table) => [
  index("ss_plan_id_idx").on(table.plan_id),
  index("ss_session_date_idx").on(table.session_date),
]);

export const abilityPoint = sqliteTable("ability_point", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  course_id: integer("course_id").notNull().references(() => course.id),
});

export const ideologyPoint = sqliteTable("ideology_point", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  course_id: integer("course_id").notNull().references(() => course.id),
});

export const abilityKnowledge = sqliteTable("ability_knowledge", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  ability_id: integer("ability_id").notNull().references(() => abilityPoint.id),
  knowledge_id: integer("knowledge_id").notNull().references(() => knowledgePoint.id),
  weight: real("weight").default(1),
}, (table) => [
  uniqueIndex("ak_unique_idx").on(table.ability_id, table.knowledge_id),
]);

export const ideologyKnowledge = sqliteTable("ideology_knowledge", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  ideology_id: integer("ideology_id").notNull().references(() => ideologyPoint.id),
  knowledge_id: integer("knowledge_id").notNull().references(() => knowledgePoint.id),
}, (table) => [
  uniqueIndex("ik_unique_idx").on(table.ideology_id, table.knowledge_id),
]);

// ===================== 学习材料与行为分析 =====================

export const learningMaterial = sqliteTable("learning_material", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  teacher_id: integer("teacher_id").notNull().references(() => user.id),
  title: text("title").notNull(),
  type: text("type").notNull(), // video / document / slide
  content: text("content"), // 课件正文/摘要
  url: text("url"),
  duration_minutes: integer("duration_minutes"),
  knowledge_point_ids: text("knowledge_point_ids", { mode: 'json' }),
  chapter: text("chapter"), // 章节名（课程知识定位）
  is_required: integer("is_required", { mode: 'boolean' }).default(false), // 必学任务点标记
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("lm_course_id_idx").on(table.course_id),
]);

export const learningBehaviorLog = sqliteTable("learning_behavior_log", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  student_id: integer("student_id").notNull().references(() => user.id),
  material_id: integer("material_id").notNull().references(() => learningMaterial.id),
  watch_duration: integer("watch_duration").default(0), // 累计停留秒数
  progress: integer("progress").default(0), // 0-100
  review_count: integer("review_count").default(0), // 重看次数
  is_completed: integer("is_completed", { mode: 'boolean' }).default(false),
  last_watched_at: text("last_watched_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("lbl_unique_idx").on(table.student_id, table.material_id),
  index("lbl_student_id_idx").on(table.student_id),
]);

// ===================== 激励体系：积分 / 签到 / 商店 =====================

/** 积分账户（每学生一行）：总积分 total_earned 只增不减（排行榜依据），balance 可用积分（商城消费） */
export const pointsAccount = sqliteTable("points_account", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => user.id).unique(),
  total_earned: integer("total_earned").default(0), // 总积分（累计获得，只增不减）
  balance: integer("balance").default(0),           // 可用积分（可消费）
  total_spent: integer("total_spent").default(0),   // 累计消耗
  expired: integer("expired").default(0),           // 累计过期（预留）
  frozen: integer("frozen").default(0),             // 冻结（预留）
  version: integer("version").default(0),           // 乐观锁
  level: integer("level").default(1),
  rank_visible: integer("rank_visible", { mode: 'boolean' }).default(true),
  updated_at: text("updated_at"),
});

/** 积分流水：每笔变动必留痕，balance_after 快照用于对账 */
export const pointsLedger = sqliteTable("points_ledger", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  direction: text("direction").notNull(), // earn / spend / refund / expire / adjust
  amount: integer("amount").notNull(),
  balance_after: integer("balance_after").notNull(),
  biz_type: text("biz_type").notNull(),   // checkin / homework / review / practice / qa / reading / teacher_grant / redeem / remedy
  biz_ref: text("biz_ref"),
  idempotency_key: text("idempotency_key").unique(),
  remark: text("remark"),
  expire_at: text("expire_at"),
  operator_id: integer("operator_id"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [index("pl_user_time_idx").on(table.user_id, table.created_at)]);

/** 签到记录：UNIQUE(user_id, sign_date) 数据库层防重复 */
export const signInRecord = sqliteTable("sign_in_record", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  sign_date: text("sign_date").notNull(), // YYYY-MM-DD
  streak_day: integer("streak_day").notNull(),
  points: integer("points").notNull(),
  source: text("source").notNull().default("normal"), // normal / remedy
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [uniqueIndex("sr_user_date_uq").on(table.user_id, table.sign_date)]);

/** 签到汇总：避免每次聚合 */
export const signInSummary = sqliteTable("sign_in_summary", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().unique(),
  current_streak: integer("current_streak").default(0),
  max_streak: integer("max_streak").default(0),
  last_sign_date: text("last_sign_date"),
  total_days: integer("total_days").default(0),
  month: text("month"),
  month_days: integer("month_days").default(0),
  year_days: integer("year_days").default(0),
  remedy_cards: integer("remedy_cards").default(1),
  updated_at: text("updated_at"),
});

/** 商城商品 */
export const shopItem = sqliteTable("shop_item", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),       // decoration / benefit / physical
  subtype: text("subtype").notNull(), // avatar_frame / chat_bubble / name_color / font / profile_theme / title / effect / consumable
  rarity: text("rarity").default("common"), // common / rare / epic / limited
  description: text("description"),
  config_key: text("config_key"),     // 装饰样式键
  config_value: text("config_value"), // 样式值（色值/字体栈）
  preview: text("preview"),
  points_price: integer("points_price").notNull(),
  stock: integer("stock").default(-1), // -1 不限
  per_user_limit: integer("per_user_limit").default(0),
  need_teacher_review: integer("need_teacher_review", { mode: 'boolean' }).default(false),
  status: text("status").default("on_shelf"), // on_shelf / off_shelf
  start_at: text("start_at"),
  end_at: text("end_at"),
  version: integer("version").default(0),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
});

/** 兑换订单 */
export const redeemOrder = sqliteTable("redeem_order", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  order_no: text("order_no").notNull().unique(),
  user_id: integer("user_id").notNull(),
  item_id: integer("item_id").notNull(),
  quantity: integer("quantity").default(1),
  points_cost: integer("points_cost").notNull(),
  status: text("status").notNull().default("completed"), // pending / paid / shipped / completed / cancelled / refunded
  receiver_info: text("receiver_info"),
  idempotency_key: text("idempotency_key").unique(),
  handled_by: integer("handled_by"),
  remark: text("remark"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
});

/** 用户装饰背包与装备：同 subtype 只能装备 1 个 */
export const userDecoration = sqliteTable("user_decoration", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull(),
  item_id: integer("item_id"),
  subtype: text("subtype").notNull(),
  config_key: text("config_key"),
  config_value: text("config_value"),
  source: text("source").default("purchase"), // purchase / achievement / grant
  is_equipped: integer("is_equipped", { mode: 'boolean' }).default(false),
  acquired_at: text("acquired_at").default(sql`(CURRENT_TIMESTAMP)`),
  expire_at: text("expire_at"),
}, (table) => [index("ud_user_subtype_idx").on(table.user_id, table.subtype)]);

// ===================== 教师批改规则配置 =====================

export const gradingConfig = sqliteTable("grading_config", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  teacher_id: integer("teacher_id").notNull().references(() => user.id),
  name: text("name").notNull(),
  course_id: integer("course_id"), // 可选：限定课程（null = 全部课程）
  question_type: text("question_type"), // 可选：限定题型（null = 全部题型）
  scoring_criteria: text("scoring_criteria"), // 评分标准
  deduction_rules: text("deduction_rules"), // 扣分规则
  comment_style: text("comment_style"), // 评语风格
  grade_levels: text("grade_levels", { mode: 'json' }), // [{min:90,label:'优秀'}]
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
}, (table) => [index("gc_teacher_id_idx").on(table.teacher_id)]);

// ===================== 管理后台：审计日志 + 系统配置 =====================

export const auditLog = sqliteTable("audit_log", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  operator_id: integer("operator_id").references(() => user.id),
  operator_name: text("operator_name"),
  action: text("action").notNull(), // create_user / disable_user / reset_password / change_role / update_config
  target_type: text("target_type"),
  target_id: text("target_id"),
  detail: text("detail"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("al_operator_idx").on(table.operator_id),
  index("al_created_at_idx").on(table.created_at),
]);

export const systemConfig = sqliteTable("system_config", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  updated_at: text("updated_at"),
}, (table) => [
  uniqueIndex("sc_key_idx").on(table.key),
]);

// ===================== 通知 =====================

export const notification = sqliteTable("notification", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => user.id),
  type: text("type").notNull(), // assignment / grade / system
  title: text("title"),
  content: text("content"),
  link: text("link"),
  is_read: integer("is_read", { mode: 'boolean' }).default(false),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("notif_user_id_idx").on(table.user_id),
]);

// ===================== AI 答疑会话 =====================

export const qaSession = sqliteTable("qa_session", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => user.id),
  title: text("title"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
}, (table) => [
  index("qs_user_id_idx").on(table.user_id),
]);

export const qaMessage = sqliteTable("qa_message", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  session_id: integer("session_id").notNull().references(() => qaSession.id),
  role: text("role").notNull(), // user / assistant
  content: text("content").notNull(),
  attachment: text("attachment"), // JSON: {type:'image'|'file', name, size, dataUrl?} 用户上传附件
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("qm_session_id_idx").on(table.session_id),
]);

// ===================== 主观题复核留痕 =====================

export const reviewRecord = sqliteTable("review_record", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  grading_task_id: integer("grading_task_id").notNull().references(() => gradingTask.id),
  reviewer_id: integer("reviewer_id").notNull().references(() => user.id),
  reviewer_role: text("reviewer_role"), // teacher / assistant
  action: text("action").notNull(), // adopt / modify / reject / appeal
  ai_score: real("ai_score"),
  final_score: real("final_score"),
  comment: text("comment"),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("rr_task_id_idx").on(table.grading_task_id),
]);

// ===================== 讨论区 =====================

export const discussionPost = sqliteTable("discussion_post", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  course_id: integer("course_id").notNull().references(() => course.id),
  author_id: integer("author_id").notNull().references(() => user.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  is_pinned: integer("is_pinned", { mode: 'boolean' }).default(false),
  like_count: integer("like_count").default(0),
  reply_count: integer("reply_count").default(0),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updated_at: text("updated_at"),
}, (table) => [
  index("dp_course_id_idx").on(table.course_id),
  index("dp_created_at_idx").on(table.created_at),
]);

export const discussionReply = sqliteTable("discussion_reply", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  post_id: integer("post_id").notNull().references(() => discussionPost.id, { onDelete: "cascade" }),
  author_id: integer("author_id").notNull().references(() => user.id),
  content: text("content").notNull(),
  like_count: integer("like_count").default(0),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("dr_post_id_idx").on(table.post_id),
]);

export const discussionLike = sqliteTable("discussion_like", {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  target_type: text("target_type").notNull(), // post / reply
  target_id: integer("target_id").notNull(),
  user_id: integer("user_id").notNull().references(() => user.id),
  created_at: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("dl_unique_idx").on(table.target_type, table.target_id, table.user_id),
]);

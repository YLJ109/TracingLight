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
  class_id: integer("class_id").references(() => classInfo.id),
  student_level: text("student_level"), // top / medium / weak
  avatar_url: text("avatar_url"),
  is_active: integer("is_active", { mode: 'boolean' }).default(true),
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
  question_id: integer("question_id").notNull().references(() => question.id),
  knowledge_point_id: integer("knowledge_point_id").notNull().references(() => knowledgePoint.id),
  assignment_id: integer("assignment_id").notNull().references(() => assignment.id),
  grading_task_id: integer("grading_task_id").notNull().references(() => gradingTask.id),
  student_answer: text("student_answer"),
  correct_answer: text("correct_answer"),
  error_type: text("error_type"),
  error_analysis: text("error_analysis"),
  knowledge_explanation: text("knowledge_explanation"),
  similar_questions: text("similar_questions", { mode: 'json' }),
  learning_suggestion: text("learning_suggestion"),
  review_status: text("review_status").default("pending"), // pending / reviewing / mastered
  reviewed_at: text("reviewed_at"),
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

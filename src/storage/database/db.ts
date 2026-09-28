/**
 * 数据库客户端 - SQLite via sql.js + Drizzle ORM
 * 使用 globalThis 共享实例，避免 tsup 和 Next.js 模块隔离问题
 */
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from './shared/schema';
import * as relations from './shared/relations';
import * as fs from 'fs';
import * as path from 'path';

// 全局共享状态（tsup bundle 和 .next chunks 共享同一个实例）
const g = globalThis as unknown as {
  __TL_DB?: ReturnType<typeof drizzle>;
  __TL_SQLJS?: SqlJsDatabase;
  __TL_INIT_PROMISE?: Promise<ReturnType<typeof drizzle>>;
  __TL_SAVE_INTERVAL?: NodeJS.Timeout;
};

function getDbPath(): string {
  return process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
}

function saveToDisk(silent = false) {
  if (g.__TL_SQLJS) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = g.__TL_SQLJS.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    if (!silent) console.log(`  DB saved (${(data.length / 1024).toFixed(0)}KB) to ${dbPath}`);
  } else if (!silent) {
    console.log('  DB save skipped: no SQLJS instance');
  }
}

export function isDbReady(): boolean {
  const g = globalThis as unknown as { __TL_DB?: unknown; __TL_INIT_PROMISE?: Promise<unknown> };
  return !!g.__TL_DB || !!g.__TL_INIT_PROMISE;
}

export function getDb() {
  if (!g.__TL_DB) throw new Error('Database not initialized. Call initDb() first.');
  return g.__TL_DB;
}

function getCreateTableSQL(): string {
  // 全量建表 DDL：由 drizzle-kit generate 从 schema.ts 生成（覆盖全部表）
  const statements = [
      `CREATE TABLE \`ability_knowledge\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`ability_id\` integer NOT NULL,
	\`knowledge_id\` integer NOT NULL,
	\`weight\` real DEFAULT 1,
	FOREIGN KEY (\`ability_id\`) REFERENCES \`ability_point\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`ak_unique_idx\` ON \`ability_knowledge\` (\`ability_id\`,\`knowledge_id\`);`,
      `CREATE TABLE \`ability_point\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text,
	\`course_id\` integer NOT NULL,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE TABLE \`announcement\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`teacher_id\` integer NOT NULL,
	\`course_id\` integer,
	\`title\` text NOT NULL,
	\`content\` text NOT NULL,
	\`is_pinned\` integer DEFAULT false,
	\`target_type\` text DEFAULT 'all',
	\`target_student_ids\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ann_teacher_id_idx\` ON \`announcement\` (\`teacher_id\`);`,
      `CREATE INDEX \`ann_course_id_idx\` ON \`announcement\` (\`course_id\`);`,
      `CREATE TABLE \`announcement_read\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`announcement_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`read_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`announcement_id\`) REFERENCES \`announcement\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ar_announcement_id_idx\` ON \`announcement_read\` (\`announcement_id\`);`,
      `CREATE INDEX \`ar_student_id_idx\` ON \`announcement_read\` (\`student_id\`);`,
      `CREATE UNIQUE INDEX \`ar_unique_idx\` ON \`announcement_read\` (\`announcement_id\`,\`student_id\`);`,
      `CREATE TABLE \`answer\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`assignment_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`student_answer\` text,
	\`is_submitted\` integer DEFAULT false,
	\`submitted_at\` text,
	\`returned\` integer DEFAULT false,
	\`returned_at\` text,
	\`return_comment\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ans_assignment_id_idx\` ON \`answer\` (\`assignment_id\`);`,
      `CREATE INDEX \`ans_student_id_idx\` ON \`answer\` (\`student_id\`);`,
      `CREATE UNIQUE INDEX \`ans_unique_idx\` ON \`answer\` (\`assignment_id\`,\`student_id\`,\`question_id\`);`,
      `CREATE TABLE \`answer_monitor\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`assignment_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`copy_count\` integer DEFAULT 0,
	\`paste_count\` integer DEFAULT 0,
	\`blur_count\` integer DEFAULT 0,
	\`blur_seconds\` integer DEFAULT 0,
	\`time_spent_seconds\` integer DEFAULT 0,
	\`paste_records\` text,
	\`suspicious_flag\` integer DEFAULT false,
	\`suspicious_reason\` text,
	\`monitor_snapshot\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`am_assignment_id_idx\` ON \`answer_monitor\` (\`assignment_id\`);`,
      `CREATE INDEX \`am_student_id_idx\` ON \`answer_monitor\` (\`student_id\`);`,
      `CREATE UNIQUE INDEX \`am_unique_idx\` ON \`answer_monitor\` (\`assignment_id\`,\`student_id\`);`,
      `CREATE TABLE \`assignment\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`teacher_id\` integer NOT NULL,
	\`title\` text NOT NULL,
	\`description\` text,
	\`question_ids\` text NOT NULL,
	\`total_score\` real DEFAULT 100,
	\`start_time\` text NOT NULL,
	\`end_time\` text NOT NULL,
	\`status\` text DEFAULT 'published',
	\`allow_resubmit\` integer DEFAULT false,
	\`review_mode\` text DEFAULT 'auto',
	\`has_subjective\` integer DEFAULT false,
	\`grades_published\` integer DEFAULT false,
	\`question_scores\` text,
	\`monitor_config\` text,
	\`peer_review\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`asgn_course_id_idx\` ON \`assignment\` (\`course_id\`);`,
      `CREATE INDEX \`asgn_status_idx\` ON \`assignment\` (\`status\`);`,
      `CREATE TABLE \`audit_log\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`operator_id\` integer,
	\`operator_name\` text,
	\`action\` text NOT NULL,
	\`target_type\` text,
	\`target_id\` text,
	\`detail\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`operator_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`al_operator_idx\` ON \`audit_log\` (\`operator_id\`);`,
      `CREATE INDEX \`al_created_at_idx\` ON \`audit_log\` (\`created_at\`);`,
      `CREATE TABLE \`class\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`major_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`grade\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`major_id\`) REFERENCES \`major\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`class_major_id_idx\` ON \`class\` (\`major_id\`);`,
      `CREATE TABLE \`class_schedule\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`class_id\` integer NOT NULL,
	\`day_of_week\` integer NOT NULL,
	\`start_time\` text NOT NULL,
	\`end_time\` text NOT NULL,
	\`location\` text,
	\`week_pattern\` text DEFAULT 'every',
	\`is_active\` integer DEFAULT true,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`class_id\`) REFERENCES \`class\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`cs_course_id_idx\` ON \`class_schedule\` (\`course_id\`);`,
      `CREATE INDEX \`cs_class_id_idx\` ON \`class_schedule\` (\`class_id\`);`,
      `CREATE TABLE \`college\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`school_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`short_name\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`school_id\`) REFERENCES \`school\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`college_school_id_idx\` ON \`college\` (\`school_id\`);`,
      `CREATE TABLE \`course\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`short_name\` text,
	\`description\` text,
	\`teacher_id\` integer,
	\`class_id\` integer,
	\`semester\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`class_id\`) REFERENCES \`class\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`course_teacher_id_idx\` ON \`course\` (\`teacher_id\`);`,
      `CREATE INDEX \`course_class_id_idx\` ON \`course\` (\`class_id\`);`,
      `CREATE TABLE \`discussion_like\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`target_type\` text NOT NULL,
	\`target_id\` integer NOT NULL,
	\`user_id\` integer NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`dl_unique_idx\` ON \`discussion_like\` (\`target_type\`,\`target_id\`,\`user_id\`);`,
      `CREATE TABLE \`discussion_post\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`author_id\` integer NOT NULL,
	\`title\` text NOT NULL,
	\`content\` text NOT NULL,
	\`is_pinned\` integer DEFAULT false,
	\`like_count\` integer DEFAULT 0,
	\`reply_count\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`author_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`dp_course_id_idx\` ON \`discussion_post\` (\`course_id\`);`,
      `CREATE INDEX \`dp_created_at_idx\` ON \`discussion_post\` (\`created_at\`);`,
      `CREATE TABLE \`discussion_reply\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`post_id\` integer NOT NULL,
	\`author_id\` integer NOT NULL,
	\`content\` text NOT NULL,
	\`like_count\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`post_id\`) REFERENCES \`discussion_post\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`author_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`dr_post_id_idx\` ON \`discussion_reply\` (\`post_id\`);`,
      `CREATE TABLE \`error_book\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer,
	\`knowledge_point_id\` integer NOT NULL,
	\`assignment_id\` integer,
	\`grading_task_id\` integer,
	\`exam_id\` integer,
	\`content\` text,
	\`student_answer\` text,
	\`correct_answer\` text,
	\`error_type\` text,
	\`error_analysis\` text,
	\`knowledge_explanation\` text,
	\`similar_questions\` text,
	\`learning_suggestion\` text,
	\`review_status\` text DEFAULT 'pending',
	\`reviewed_at\` text,
	\`next_review_at\` text,
	\`review_count\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`grading_task_id\`) REFERENCES \`grading_task\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`eb_student_id_idx\` ON \`error_book\` (\`student_id\`);`,
      `CREATE INDEX \`eb_kp_id_idx\` ON \`error_book\` (\`knowledge_point_id\`);`,
      `CREATE INDEX \`eb_review_status_idx\` ON \`error_book\` (\`review_status\`);`,
      `CREATE TABLE \`exam\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`teacher_id\` integer NOT NULL,
	\`title\` text NOT NULL,
	\`description\` text,
	\`exam_type\` text DEFAULT 'unit',
	\`time_mode\` text DEFAULT 'fixed',
	\`start_at\` text NOT NULL,
	\`end_at\` text,
	\`duration\` integer DEFAULT 60,
	\`auto_submit\` integer DEFAULT true,
	\`allow_resubmit\` integer DEFAULT false,
	\`publish_mode\` text DEFAULT 'manual',
	\`publish_at\` text,
	\`grades_published\` integer DEFAULT false,
	\`question_ids\` text NOT NULL,
	\`question_scores\` text,
	\`total_score\` real DEFAULT 100,
	\`has_subjective\` integer DEFAULT false,
	\`proctor_config\` text,
	\`randomized\` integer DEFAULT true,
	\`status\` text DEFAULT 'draft',
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`exam_course_id_idx\` ON \`exam\` (\`course_id\`);`,
      `CREATE INDEX \`exam_status_idx\` ON \`exam\` (\`status\`);`,
      `CREATE TABLE \`exam_answer\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`attempt_id\` integer NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`student_answer\` text,
	\`is_answered\` integer DEFAULT false,
	\`revise_count\` integer DEFAULT 0,
	\`duration_ms\` integer DEFAULT 0,
	\`marked\` integer DEFAULT false,
	\`saved_at\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`attempt_id\`) REFERENCES \`exam_attempt\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`xans_attempt_id_idx\` ON \`exam_answer\` (\`attempt_id\`);`,
      `CREATE INDEX \`xans_exam_id_idx\` ON \`exam_answer\` (\`exam_id\`);`,
      `CREATE UNIQUE INDEX \`xans_attempt_q_idx\` ON \`exam_answer\` (\`attempt_id\`,\`question_id\`);`,
      `CREATE TABLE \`exam_appeal\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`grading_id\` integer,
	\`reason\` text NOT NULL,
	\`status\` text DEFAULT 'pending',
	\`teacher_comment\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`handled_at\` text,
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`grading_id\`) REFERENCES \`exam_grading\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`xap_exam_id_idx\` ON \`exam_appeal\` (\`exam_id\`);`,
      `CREATE INDEX \`xap_student_id_idx\` ON \`exam_appeal\` (\`student_id\`);`,
      `CREATE TABLE \`exam_attempt\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`enroll_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`started_at\` text NOT NULL,
	\`deadline\` text NOT NULL,
	\`submitted_at\` text,
	\`status\` text DEFAULT 'in_progress',
	\`device_fp\` text,
	\`ip\` text,
	\`face_verified\` integer DEFAULT false,
	\`face_verified_at\` text,
	\`face_strategy\` text,
	\`risk_score\` real DEFAULT 0,
	\`risk_flags\` text,
	\`switch_count\` integer DEFAULT 0,
	\`fullscreen_exit_count\` integer DEFAULT 0,
	\`submitted_via\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`enroll_id\`) REFERENCES \`exam_enroll\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ea_exam_id_idx\` ON \`exam_attempt\` (\`exam_id\`);`,
      `CREATE INDEX \`ea_student_id_idx\` ON \`exam_attempt\` (\`student_id\`);`,
      `CREATE UNIQUE INDEX \`ea_unique_idx\` ON \`exam_attempt\` (\`exam_id\`,\`student_id\`);`,
      `CREATE TABLE \`exam_enroll\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`class_id\` integer,
	\`allow\` integer DEFAULT true,
	\`enroll_status\` text DEFAULT 'normal',
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`class_id\`) REFERENCES \`class\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ee_exam_id_idx\` ON \`exam_enroll\` (\`exam_id\`);`,
      `CREATE UNIQUE INDEX \`ee_unique_idx\` ON \`exam_enroll\` (\`exam_id\`,\`student_id\`);`,
      `CREATE TABLE \`exam_grading\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`answer_id\` integer NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`full_score\` real NOT NULL,
	\`question_type\` text NOT NULL,
	\`reference_answer\` text,
	\`student_answer\` text,
	\`rubric_json\` text,
	\`total_score\` real,
	\`dimension_scores\` text,
	\`annotations\` text,
	\`unmastered_knowledge_ids\` text,
	\`error_type\` text,
	\`overall_comment\` text,
	\`status\` text DEFAULT 'pending',
	\`teacher_override_score\` real,
	\`ai_generated_probability\` real,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`completed_at\` text,
	FOREIGN KEY (\`answer_id\`) REFERENCES \`exam_answer\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`xg_answer_id_idx\` ON \`exam_grading\` (\`answer_id\`);`,
      `CREATE INDEX \`xg_exam_id_idx\` ON \`exam_grading\` (\`exam_id\`);`,
      `CREATE INDEX \`xg_student_id_idx\` ON \`exam_grading\` (\`student_id\`);`,
      `CREATE TABLE \`exam_proctor_event\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`exam_id\` integer NOT NULL,
	\`attempt_id\` integer,
	\`student_id\` integer NOT NULL,
	\`type\` text NOT NULL,
	\`severity\` text DEFAULT 'warn',
	\`detail\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`exam_id\`) REFERENCES \`exam\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`attempt_id\`) REFERENCES \`exam_attempt\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`xpe_exam_id_idx\` ON \`exam_proctor_event\` (\`exam_id\`);`,
      `CREATE INDEX \`xpe_attempt_id_idx\` ON \`exam_proctor_event\` (\`attempt_id\`);`,
      `CREATE INDEX \`xpe_student_id_idx\` ON \`exam_proctor_event\` (\`student_id\`);`,
      `CREATE TABLE \`exam_schedule\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`class_id\` integer NOT NULL,
	\`exam_name\` text NOT NULL,
	\`exam_date\` text NOT NULL,
	\`start_time\` text NOT NULL,
	\`end_time\` text NOT NULL,
	\`knowledge_scope\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`class_id\`) REFERENCES \`class\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`es_course_id_idx\` ON \`exam_schedule\` (\`course_id\`);`,
      `CREATE INDEX \`es_class_id_idx\` ON \`exam_schedule\` (\`class_id\`);`,
      `CREATE TABLE \`grading_config\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`teacher_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`course_id\` integer,
	\`question_type\` text,
	\`scoring_criteria\` text,
	\`deduction_rules\` text,
	\`comment_style\` text,
	\`grade_levels\` text,
	\`is_active\` integer DEFAULT true,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`gc_teacher_id_idx\` ON \`grading_config\` (\`teacher_id\`);`,
      `CREATE TABLE \`grading_task\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`answer_id\` integer NOT NULL,
	\`assignment_id\` integer NOT NULL,
	\`student_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`full_score\` real NOT NULL,
	\`question_type\` text NOT NULL,
	\`reference_answer\` text,
	\`student_answer\` text,
	\`rubric_json\` text,
	\`total_score\` real,
	\`dimension_scores\` text,
	\`annotations\` text,
	\`unmastered_knowledge_ids\` text,
	\`error_type\` text,
	\`overall_comment\` text,
	\`status\` text DEFAULT 'pending',
	\`retry_count\` integer DEFAULT 0,
	\`max_retries\` integer DEFAULT 3,
	\`error_message\` text,
	\`teacher_override_score\` real,
	\`teacher_override_comment\` text,
	\`ai_generated_probability\` real,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`completed_at\` text,
	FOREIGN KEY (\`answer_id\`) REFERENCES \`answer\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`gt_status_idx\` ON \`grading_task\` (\`status\`);`,
      `CREATE INDEX \`gt_assignment_id_idx\` ON \`grading_task\` (\`assignment_id\`);`,
      `CREATE INDEX \`gt_student_id_idx\` ON \`grading_task\` (\`student_id\`);`,
      `CREATE TABLE \`ideology_knowledge\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`ideology_id\` integer NOT NULL,
	\`knowledge_id\` integer NOT NULL,
	FOREIGN KEY (\`ideology_id\`) REFERENCES \`ideology_point\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`ik_unique_idx\` ON \`ideology_knowledge\` (\`ideology_id\`,\`knowledge_id\`);`,
      `CREATE TABLE \`ideology_point\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text,
	\`course_id\` integer NOT NULL,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE TABLE \`knowledge_graph_edge\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`from_node_id\` integer NOT NULL,
	\`to_node_id\` integer NOT NULL,
	\`relation_type\` text NOT NULL,
	\`description\` text,
	FOREIGN KEY (\`from_node_id\`) REFERENCES \`knowledge_graph_node\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`to_node_id\`) REFERENCES \`knowledge_graph_node\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`,
      `CREATE INDEX \`kge_from_node_id_idx\` ON \`knowledge_graph_edge\` (\`from_node_id\`);`,
      `CREATE INDEX \`kge_to_node_id_idx\` ON \`knowledge_graph_edge\` (\`to_node_id\`);`,
      `CREATE UNIQUE INDEX \`kge_unique_idx\` ON \`knowledge_graph_edge\` (\`from_node_id\`,\`to_node_id\`,\`relation_type\`);`,
      `CREATE TABLE \`knowledge_graph_node\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`course_id\` integer NOT NULL,
	\`node_name\` text NOT NULL,
	\`node_level\` integer NOT NULL,
	\`parent_node_id\` integer,
	\`display_order\` integer DEFAULT 0,
	\`color_hex\` text,
	\`is_leaf\` integer DEFAULT false,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`kgn_course_id_idx\` ON \`knowledge_graph_node\` (\`course_id\`);`,
      `CREATE INDEX \`kgn_parent_node_id_idx\` ON \`knowledge_graph_node\` (\`parent_node_id\`);`,
      `CREATE INDEX \`kgn_node_level_idx\` ON \`knowledge_graph_node\` (\`node_level\`);`,
      `CREATE TABLE \`knowledge_mastery_log\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`mastery_rate\` real NOT NULL,
	\`error_count\` integer DEFAULT 0,
	\`recorded_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`kml_student_id_idx\` ON \`knowledge_mastery_log\` (\`student_id\`);`,
      `CREATE INDEX \`kml_recorded_at_idx\` ON \`knowledge_mastery_log\` (\`recorded_at\`);`,
      `CREATE UNIQUE INDEX \`kml_unique_idx\` ON \`knowledge_mastery_log\` (\`student_id\`,\`knowledge_point_id\`,\`recorded_at\`);`,
      `CREATE TABLE \`knowledge_point\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text,
	\`difficulty\` text,
	\`parent_id\` integer,
	\`sort_order\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`kp_course_id_idx\` ON \`knowledge_point\` (\`course_id\`);`,
      `CREATE INDEX \`kp_parent_id_idx\` ON \`knowledge_point\` (\`parent_id\`);`,
      `CREATE TABLE \`learning_behavior_log\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`material_id\` integer NOT NULL,
	\`watch_duration\` integer DEFAULT 0,
	\`progress\` integer DEFAULT 0,
	\`review_count\` integer DEFAULT 0,
	\`is_completed\` integer DEFAULT false,
	\`last_watched_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`material_id\`) REFERENCES \`learning_material\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`lbl_unique_idx\` ON \`learning_behavior_log\` (\`student_id\`,\`material_id\`);`,
      `CREATE INDEX \`lbl_student_id_idx\` ON \`learning_behavior_log\` (\`student_id\`);`,
      `CREATE TABLE \`learning_material\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`teacher_id\` integer NOT NULL,
	\`title\` text NOT NULL,
	\`type\` text NOT NULL,
	\`content\` text,
	\`url\` text,
	\`duration_minutes\` integer,
	\`knowledge_point_ids\` text,
	\`chapter\` text,
	\`is_required\` integer DEFAULT false,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`lm_course_id_idx\` ON \`learning_material\` (\`course_id\`);`,
      `CREATE TABLE \`major\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`college_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`short_name\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`college_id\`) REFERENCES \`college\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`major_college_id_idx\` ON \`major\` (\`college_id\`);`,
      `CREATE TABLE \`notification\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`type\` text NOT NULL,
	\`title\` text,
	\`content\` text,
	\`link\` text,
	\`is_read\` integer DEFAULT false,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`notif_user_id_idx\` ON \`notification\` (\`user_id\`);`,
      `CREATE TABLE \`peer_review\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`assignment_id\` integer NOT NULL,
	\`question_id\` integer NOT NULL,
	\`reviewer_id\` integer NOT NULL,
	\`reviewee_id\` integer NOT NULL,
	\`total_score\` real,
	\`dimension_scores\` text,
	\`comment\` text,
	\`status\` text DEFAULT 'completed',
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`question_id\`) REFERENCES \`question\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`reviewer_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`reviewee_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`pr_assignment_id_idx\` ON \`peer_review\` (\`assignment_id\`);`,
      `CREATE INDEX \`pr_question_id_idx\` ON \`peer_review\` (\`question_id\`);`,
      `CREATE INDEX \`pr_reviewer_id_idx\` ON \`peer_review\` (\`reviewer_id\`);`,
      `CREATE INDEX \`pr_reviewee_id_idx\` ON \`peer_review\` (\`reviewee_id\`);`,
      `CREATE UNIQUE INDEX \`pr_unique_idx\` ON \`peer_review\` (\`assignment_id\`,\`question_id\`,\`reviewer_id\`,\`reviewee_id\`);`,
      `CREATE TABLE \`points_account\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`total_earned\` integer DEFAULT 0,
	\`balance\` integer DEFAULT 0,
	\`total_spent\` integer DEFAULT 0,
	\`expired\` integer DEFAULT 0,
	\`frozen\` integer DEFAULT 0,
	\`version\` integer DEFAULT 0,
	\`level\` integer DEFAULT 1,
	\`rank_visible\` integer DEFAULT true,
	\`updated_at\` text,
	FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`points_account_user_id_unique\` ON \`points_account\` (\`user_id\`);`,
      `CREATE TABLE \`points_ledger\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`direction\` text NOT NULL,
	\`amount\` integer NOT NULL,
	\`balance_after\` integer NOT NULL,
	\`biz_type\` text NOT NULL,
	\`biz_ref\` text,
	\`idempotency_key\` text,
	\`remark\` text,
	\`expire_at\` text,
	\`operator_id\` integer,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP)
);`,
      `CREATE UNIQUE INDEX \`points_ledger_idempotency_key_unique\` ON \`points_ledger\` (\`idempotency_key\`);`,
      `CREATE INDEX \`pl_user_time_idx\` ON \`points_ledger\` (\`user_id\`,\`created_at\`);`,
      `CREATE TABLE \`qa_message\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`session_id\` integer NOT NULL,
	\`role\` text NOT NULL,
	\`content\` text NOT NULL,
	\`attachment\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`session_id\`) REFERENCES \`qa_session\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`qm_session_id_idx\` ON \`qa_message\` (\`session_id\`);`,
      `CREATE TABLE \`qa_session\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`title\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`qs_user_id_idx\` ON \`qa_session\` (\`user_id\`);`,
      `CREATE TABLE \`question\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`course_id\` integer NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`question_type\` text NOT NULL,
	\`difficulty\` text NOT NULL,
	\`content\` text NOT NULL,
	\`options\` text,
	\`answer\` text NOT NULL,
	\`analysis\` text,
	\`default_score\` integer DEFAULT 10,
	\`source\` text DEFAULT 'ai',
	\`version\` integer DEFAULT 1,
	\`is_active\` integer DEFAULT true,
	\`locked\` integer DEFAULT false,
	\`min_chars\` integer,
	\`max_chars\` integer,
	\`min_select\` integer,
	\`max_select\` integer,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`q_course_id_idx\` ON \`question\` (\`course_id\`);`,
      `CREATE INDEX \`q_kp_id_idx\` ON \`question\` (\`knowledge_point_id\`);`,
      `CREATE INDEX \`q_type_idx\` ON \`question\` (\`question_type\`);`,
      `CREATE INDEX \`q_difficulty_idx\` ON \`question\` (\`difficulty\`);`,
      `CREATE TABLE \`question_record\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`teacher_id\` integer,
	\`course_id\` integer,
	\`knowledge_point_id\` integer,
	\`error_record_id\` integer,
	\`assignment_id\` integer,
	\`question_text\` text NOT NULL,
	\`answer_text\` text,
	\`status\` text DEFAULT 'pending',
	\`is_public\` integer DEFAULT false,
	\`student_rating\` integer,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`answered_at\` text,
	\`resolved_at\` text,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`teacher_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`course_id\`) REFERENCES \`course\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`error_record_id\`) REFERENCES \`error_book\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`assignment\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`qr_student_id_idx\` ON \`question_record\` (\`student_id\`);`,
      `CREATE INDEX \`qr_teacher_id_idx\` ON \`question_record\` (\`teacher_id\`);`,
      `CREATE INDEX \`qr_status_idx\` ON \`question_record\` (\`status\`);`,
      `CREATE INDEX \`qr_course_id_idx\` ON \`question_record\` (\`course_id\`);`,
      `CREATE TABLE \`redeem_order\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`order_no\` text NOT NULL,
	\`user_id\` integer NOT NULL,
	\`item_id\` integer NOT NULL,
	\`quantity\` integer DEFAULT 1,
	\`points_cost\` integer NOT NULL,
	\`status\` text DEFAULT 'completed' NOT NULL,
	\`receiver_info\` text,
	\`idempotency_key\` text,
	\`handled_by\` integer,
	\`remark\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text
);`,
      `CREATE UNIQUE INDEX \`redeem_order_order_no_unique\` ON \`redeem_order\` (\`order_no\`);`,
      `CREATE UNIQUE INDEX \`redeem_order_idempotency_key_unique\` ON \`redeem_order\` (\`idempotency_key\`);`,
      `CREATE TABLE \`review_record\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`grading_task_id\` integer NOT NULL,
	\`reviewer_id\` integer NOT NULL,
	\`reviewer_role\` text,
	\`action\` text NOT NULL,
	\`ai_score\` real,
	\`final_score\` real,
	\`comment\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`grading_task_id\`) REFERENCES \`grading_task\`(\`id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`reviewer_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`rr_task_id_idx\` ON \`review_record\` (\`grading_task_id\`);`,
      `CREATE TABLE \`school\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`short_name\` text,
	\`logo_url\` text,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP)
);`,
      `CREATE TABLE \`shop_item\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`type\` text NOT NULL,
	\`subtype\` text NOT NULL,
	\`rarity\` text DEFAULT 'common',
	\`description\` text,
	\`config_key\` text,
	\`config_value\` text,
	\`preview\` text,
	\`points_price\` integer NOT NULL,
	\`stock\` integer DEFAULT -1,
	\`per_user_limit\` integer DEFAULT 0,
	\`need_teacher_review\` integer DEFAULT false,
	\`status\` text DEFAULT 'on_shelf',
	\`start_at\` text,
	\`end_at\` text,
	\`version\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text
);`,
      `CREATE TABLE \`sign_in_record\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`sign_date\` text NOT NULL,
	\`streak_day\` integer NOT NULL,
	\`points\` integer NOT NULL,
	\`source\` text DEFAULT 'normal' NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP)
);`,
      `CREATE UNIQUE INDEX \`sr_user_date_uq\` ON \`sign_in_record\` (\`user_id\`,\`sign_date\`);`,
      `CREATE TABLE \`sign_in_summary\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`current_streak\` integer DEFAULT 0,
	\`max_streak\` integer DEFAULT 0,
	\`last_sign_date\` text,
	\`total_days\` integer DEFAULT 0,
	\`month\` text,
	\`month_days\` integer DEFAULT 0,
	\`year_days\` integer DEFAULT 0,
	\`remedy_cards\` integer DEFAULT 1,
	\`updated_at\` text
);`,
      `CREATE UNIQUE INDEX \`sign_in_summary_user_id_unique\` ON \`sign_in_summary\` (\`user_id\`);`,
      `CREATE TABLE \`student_schedule\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`title\` text NOT NULL,
	\`category\` text NOT NULL,
	\`schedule_type\` text NOT NULL,
	\`day_of_week\` text,
	\`start_time\` text NOT NULL,
	\`end_time\` text NOT NULL,
	\`date_start\` text,
	\`date_end\` text,
	\`priority\` integer DEFAULT 3,
	\`is_active\` integer DEFAULT true,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ss_student_id_idx\` ON \`student_schedule\` (\`student_id\`);`,
      `CREATE TABLE \`study_plan\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`student_id\` integer NOT NULL,
	\`plan_name\` text,
	\`plan_type\` text,
	\`start_date\` text,
	\`end_date\` text,
	\`focus_knowledge_ids\` text,
	\`total_sessions\` integer,
	\`completed_sessions\` integer DEFAULT 0,
	\`status\` text DEFAULT 'active',
	\`generated_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`updated_at\` text,
	\`course_id\` integer,
	\`plan_date\` text,
	\`time_slot\` text,
	\`subject\` text,
	\`content\` text,
	\`duration_minutes\` integer,
	\`is_ai_generated\` integer DEFAULT false,
	FOREIGN KEY (\`student_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`sp_student_id_idx\` ON \`study_plan\` (\`student_id\`);`,
      `CREATE TABLE \`study_session\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`plan_id\` integer NOT NULL,
	\`session_date\` text NOT NULL,
	\`start_time\` text NOT NULL,
	\`end_time\` text NOT NULL,
	\`knowledge_point_id\` integer NOT NULL,
	\`session_type\` text NOT NULL,
	\`resources\` text,
	\`is_completed\` integer DEFAULT false,
	\`completed_at\` text,
	\`student_feedback\` text,
	\`scheduled_duration\` integer,
	\`actual_duration\` integer,
	\`notes\` text,
	FOREIGN KEY (\`plan_id\`) REFERENCES \`study_plan\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_point\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE INDEX \`ss_plan_id_idx\` ON \`study_session\` (\`plan_id\`);`,
      `CREATE INDEX \`ss_session_date_idx\` ON \`study_session\` (\`session_date\`);`,
      `CREATE TABLE \`system_config\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`key\` text NOT NULL,
	\`value\` text,
	\`description\` text,
	\`updated_at\` text
);`,
      `CREATE UNIQUE INDEX \`system_config_key_unique\` ON \`system_config\` (\`key\`);`,
      `CREATE UNIQUE INDEX \`sc_key_idx\` ON \`system_config\` (\`key\`);`,
      `CREATE TABLE \`user\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`username\` text NOT NULL,
	\`real_name\` text NOT NULL,
	\`role\` text NOT NULL,
	\`password\` text,
	\`class_id\` integer,
	\`student_level\` text,
	\`student_no\` text,
	\`email\` text,
	\`phone\` text,
	\`gender\` text,
	\`birth_date\` text,
	\`entrance_year\` integer,
	\`title\` text,
	\`bio\` text,
	\`avatar_url\` text,
	\`is_active\` integer DEFAULT true,
	\`token_version\` integer DEFAULT 0,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (\`class_id\`) REFERENCES \`class\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE UNIQUE INDEX \`user_username_unique\` ON \`user\` (\`username\`);`,
      `CREATE UNIQUE INDEX \`user_student_no_unique\` ON \`user\` (\`student_no\`);`,
      `CREATE UNIQUE INDEX \`user_email_unique\` ON \`user\` (\`email\`);`,
      `CREATE INDEX \`user_role_idx\` ON \`user\` (\`role\`);`,
      `CREATE INDEX \`user_class_id_idx\` ON \`user\` (\`class_id\`);`,
      `CREATE TABLE \`user_decoration\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`user_id\` integer NOT NULL,
	\`item_id\` integer,
	\`subtype\` text NOT NULL,
	\`config_key\` text,
	\`config_value\` text,
	\`source\` text DEFAULT 'purchase',
	\`is_equipped\` integer DEFAULT false,
	\`acquired_at\` text DEFAULT (CURRENT_TIMESTAMP),
	\`expire_at\` text
);`,
      `CREATE INDEX \`ud_user_subtype_idx\` ON \`user_decoration\` (\`user_id\`,\`subtype\`);`,
  ];
  return statements.join(';\n');

}

export async function initDb(): Promise<ReturnType<typeof drizzle>> {
  if (g.__TL_DB) return g.__TL_DB;
  if (g.__TL_INIT_PROMISE) return g.__TL_INIT_PROMISE;

  g.__TL_INIT_PROMISE = (async () => {
    // 显式定位 wasm 文件：server 环境下 emscripten 的相对路径解析会指向错误目录（如 D://ROOT//...）。
    // 路径用运行时拼接 + try/catch，避免被 Turbopack 静态分析当作模块编译（.wasm 会触发 wasm loader 报错）。
    let wasmPath = '';
    try {
      wasmPath = require.resolve(['sql.js', 'dist', 'sql-wasm.wasm'].join('/'));
    } catch {
      wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    }
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const isNew = !fs.existsSync(dbPath);

    if (!isNew) {
      g.__TL_SQLJS = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
    } else {
      g.__TL_SQLJS = new SQL.Database();
    }

    g.__TL_SQLJS.run('PRAGMA foreign_keys = ON');

    if (isNew) {
      const stmts = getCreateTableSQL()
        .split(';')
        .map(s => s.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      for (const stmt of stmts) {
        try { g.__TL_SQLJS.run(stmt + ';'); } catch (e: any) {
          if (!e.message?.includes('already exists')) console.warn('SQL:', (e.message || '').slice(0, 80));
        }
      }
      console.log(`  Tables created (${stmts.length} statements)`);
    }

    // 轻量列迁移：旧库缺新列时 ALTER 补齐（已存在则忽略）
    const MIGRATIONS = [
      'ALTER TABLE answer ADD COLUMN returned INTEGER DEFAULT 0',
      'ALTER TABLE answer ADD COLUMN returned_at TEXT',
      'ALTER TABLE answer ADD COLUMN return_comment TEXT',
      'ALTER TABLE error_book ADD COLUMN next_review_at TEXT',
      'ALTER TABLE error_book ADD COLUMN review_count INTEGER DEFAULT 0',
      `CREATE TABLE IF NOT EXISTS grading_config (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES user(id), name TEXT NOT NULL, course_id INTEGER, question_type TEXT, scoring_criteria TEXT, deduction_rules TEXT, comment_style TEXT, grade_levels TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT)`,
    ];
    for (const stmt of MIGRATIONS) {
      try { g.__TL_SQLJS.run(stmt); } catch { /* 列已存在 */ }
    }

    g.__TL_DB = drizzle(g.__TL_SQLJS, { schema: { ...schema, ...relations } });
    if (isNew) saveToDisk();

    // 进程退出时自动保存（Ctrl+C / 正常关闭）
    const doSave = () => { try { saveToDisk(); } catch {} };
    process.on('exit', doSave);
    process.on('SIGINT', () => { doSave(); process.exit(); });
    process.on('SIGTERM', () => { doSave(); process.exit(); });

    // 定时自动持久化兜底：运行时写操作（提交/批改/改错题等）不再依赖进程退出才落盘，
    // 每 30 秒静默保存一次，强杀/崩溃时最多丢 30 秒数据
    if (!g.__TL_SAVE_INTERVAL) {
      g.__TL_SAVE_INTERVAL = setInterval(() => {
        try { saveToDisk(true); } catch {}
      }, 30 * 1000);
      g.__TL_SAVE_INTERVAL.unref?.();
    }

    return g.__TL_DB;
  })();

  return g.__TL_INIT_PROMISE;
}

export function closeDb() {
  if (g.__TL_SQLJS) {
    try { saveToDisk(); } catch {}
    g.__TL_SQLJS.close();
  }
  g.__TL_SQLJS = undefined;
  g.__TL_DB = undefined;
  g.__TL_INIT_PROMISE = undefined;
}

export function saveDb() { saveToDisk(); }

export function getSqlite(): SqlJsDatabase {
  if (!g.__TL_SQLJS) throw new Error('Database not initialized');
  return g.__TL_SQLJS;
}

export { schema };

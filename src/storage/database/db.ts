/**
 * 数据库客户端 - SQLite via better-sqlite3 + Drizzle ORM
 * 使用 globalThis 共享实例，避免 tsup 和 Next.js 模块隔离问题
 * better-sqlite3 每次写事务即实时落盘，无需手动 export/save。
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './shared/schema';
import * as relations from './shared/relations';
import * as fs from 'fs';
import * as path from 'path';

// 全局共享状态（tsup bundle 和 .next chunks 共享同一个实例）
const g = globalThis as unknown as {
  __TL_DB?: ReturnType<typeof drizzle>;
  __TL_BSQLITE?: Database.Database;
  __TL_INIT_PROMISE?: Promise<ReturnType<typeof drizzle>>;
};

function getDbPath(): string {
  return process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
}

// better-sqlite3 每次写事务即落盘；保留该函数仅为兼容既有调用点（saveDb/closeDb）
function saveToDisk(_silent = false) {
  /* no-op: 数据已实时落盘 */
}

export function getDb() {
  if (!g.__TL_DB) throw new Error('Database not initialized. Call initDb() first.');
  return g.__TL_DB;
}

function getCreateTableSQL(): string {
  return `
CREATE TABLE IF NOT EXISTS school (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, short_name TEXT, logo_url TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE TABLE IF NOT EXISTS college (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL REFERENCES school(id), name TEXT NOT NULL, short_name TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS college_school_id_idx ON college(school_id);
CREATE TABLE IF NOT EXISTS major (id INTEGER PRIMARY KEY AUTOINCREMENT, college_id INTEGER NOT NULL REFERENCES college(id), name TEXT NOT NULL, short_name TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS major_college_id_idx ON major(college_id);
CREATE TABLE IF NOT EXISTS class (id INTEGER PRIMARY KEY AUTOINCREMENT, major_id INTEGER NOT NULL REFERENCES major(id), name TEXT NOT NULL, grade TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS class_major_id_idx ON class(major_id);
CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, real_name TEXT NOT NULL, role TEXT NOT NULL, password TEXT, class_id INTEGER REFERENCES class(id), student_level TEXT, avatar_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS user_role_idx ON user(role);
CREATE INDEX IF NOT EXISTS user_class_id_idx ON user(class_id);
CREATE TABLE IF NOT EXISTS course (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, short_name TEXT, description TEXT, teacher_id INTEGER REFERENCES user(id), class_id INTEGER REFERENCES class(id), semester TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS course_teacher_id_idx ON course(teacher_id);
CREATE INDEX IF NOT EXISTS course_class_id_idx ON course(class_id);
CREATE TABLE IF NOT EXISTS knowledge_point (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), name TEXT NOT NULL, description TEXT, difficulty TEXT, parent_id INTEGER REFERENCES knowledge_point(id), sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS kp_course_id_idx ON knowledge_point(course_id);
CREATE INDEX IF NOT EXISTS kp_parent_id_idx ON knowledge_point(parent_id);
CREATE TABLE IF NOT EXISTS knowledge_graph_node (id INTEGER PRIMARY KEY AUTOINCREMENT, knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id) ON DELETE CASCADE, course_id INTEGER NOT NULL REFERENCES course(id), node_name TEXT NOT NULL, node_level INTEGER NOT NULL, parent_node_id INTEGER REFERENCES knowledge_graph_node(id) ON DELETE CASCADE, display_order INTEGER DEFAULT 0, color_hex TEXT, is_leaf INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS kgn_course_id_idx ON knowledge_graph_node(course_id);
CREATE INDEX IF NOT EXISTS kgn_parent_node_id_idx ON knowledge_graph_node(parent_node_id);
CREATE INDEX IF NOT EXISTS kgn_node_level_idx ON knowledge_graph_node(node_level);
CREATE TABLE IF NOT EXISTS knowledge_graph_edge (id INTEGER PRIMARY KEY AUTOINCREMENT, from_node_id INTEGER NOT NULL REFERENCES knowledge_graph_node(id) ON DELETE CASCADE, to_node_id INTEGER NOT NULL REFERENCES knowledge_graph_node(id) ON DELETE CASCADE, relation_type TEXT NOT NULL, description TEXT);
CREATE INDEX IF NOT EXISTS kge_from_node_id_idx ON knowledge_graph_edge(from_node_id);
CREATE INDEX IF NOT EXISTS kge_to_node_id_idx ON knowledge_graph_edge(to_node_id);
CREATE UNIQUE INDEX IF NOT EXISTS kge_unique_idx ON knowledge_graph_edge(from_node_id, to_node_id, relation_type);
CREATE TABLE IF NOT EXISTS question (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), question_type TEXT NOT NULL, difficulty TEXT NOT NULL, content TEXT NOT NULL, options TEXT, answer TEXT NOT NULL, analysis TEXT, default_score INTEGER DEFAULT 10, source TEXT DEFAULT 'ai', version INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, locked INTEGER DEFAULT 0, min_chars INTEGER, max_chars INTEGER, min_select INTEGER, max_select INTEGER, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS q_course_id_idx ON question(course_id);
CREATE INDEX IF NOT EXISTS q_kp_id_idx ON question(knowledge_point_id);
CREATE INDEX IF NOT EXISTS q_type_idx ON question(question_type);
CREATE INDEX IF NOT EXISTS q_difficulty_idx ON question(difficulty);
CREATE TABLE IF NOT EXISTS assignment (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), teacher_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, description TEXT, question_ids TEXT NOT NULL, total_score REAL DEFAULT 100, start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT DEFAULT 'published', allow_resubmit INTEGER DEFAULT 0, review_mode TEXT DEFAULT 'auto', has_subjective INTEGER DEFAULT 0, grades_published INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS asgn_course_id_idx ON assignment(course_id);
CREATE INDEX IF NOT EXISTS asgn_status_idx ON assignment(status);
CREATE TABLE IF NOT EXISTS answer (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER NOT NULL REFERENCES question(id), student_answer TEXT, is_submitted INTEGER DEFAULT 0, submitted_at TEXT, returned INTEGER DEFAULT 0, returned_at TEXT, return_comment TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE TABLE IF NOT EXISTS grading_config (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES user(id), name TEXT NOT NULL, course_id INTEGER, question_type TEXT, scoring_criteria TEXT, deduction_rules TEXT, comment_style TEXT, grade_levels TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE TABLE IF NOT EXISTS points_account (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES user(id), total_earned INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, total_spent INTEGER DEFAULT 0, expired INTEGER DEFAULT 0, frozen INTEGER DEFAULT 0, version INTEGER DEFAULT 0, level INTEGER DEFAULT 1, rank_visible INTEGER DEFAULT 1, updated_at TEXT);
CREATE TABLE IF NOT EXISTS points_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, direction TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, biz_type TEXT NOT NULL, biz_ref TEXT, idempotency_key TEXT UNIQUE, remark TEXT, expire_at TEXT, operator_id INTEGER, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS pl_user_time_idx ON points_ledger(user_id, created_at);
CREATE TABLE IF NOT EXISTS sign_in_record (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sign_date TEXT NOT NULL, streak_day INTEGER NOT NULL, points INTEGER NOT NULL, source TEXT DEFAULT 'normal', created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE UNIQUE INDEX IF NOT EXISTS sr_user_date_uq ON sign_in_record(user_id, sign_date);
CREATE TABLE IF NOT EXISTS sign_in_summary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, current_streak INTEGER DEFAULT 0, max_streak INTEGER DEFAULT 0, last_sign_date TEXT, total_days INTEGER DEFAULT 0, month TEXT, month_days INTEGER DEFAULT 0, year_days INTEGER DEFAULT 0, remedy_cards INTEGER DEFAULT 1, updated_at TEXT);
CREATE TABLE IF NOT EXISTS shop_item (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, subtype TEXT NOT NULL, rarity TEXT DEFAULT 'common', description TEXT, config_key TEXT, config_value TEXT, preview TEXT, points_price INTEGER NOT NULL, stock INTEGER DEFAULT -1, per_user_limit INTEGER DEFAULT 0, need_teacher_review INTEGER DEFAULT 0, status TEXT DEFAULT 'on_shelf', start_at TEXT, end_at TEXT, version INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE TABLE IF NOT EXISTS redeem_order (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL, item_id INTEGER NOT NULL, quantity INTEGER DEFAULT 1, points_cost INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'completed', receiver_info TEXT, idempotency_key TEXT UNIQUE, handled_by INTEGER, remark TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE TABLE IF NOT EXISTS user_decoration (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, item_id INTEGER, subtype TEXT NOT NULL, config_key TEXT, config_value TEXT, source TEXT DEFAULT 'purchase', is_equipped INTEGER DEFAULT 0, acquired_at TEXT DEFAULT (CURRENT_TIMESTAMP), expire_at TEXT);
CREATE INDEX IF NOT EXISTS ud_user_subtype_idx ON user_decoration(user_id, subtype);
CREATE INDEX IF NOT EXISTS ans_assignment_id_idx ON answer(assignment_id);
CREATE INDEX IF NOT EXISTS ans_student_id_idx ON answer(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS ans_unique_idx ON answer(assignment_id, student_id, question_id);
CREATE TABLE IF NOT EXISTS grading_task (id INTEGER PRIMARY KEY AUTOINCREMENT, answer_id INTEGER NOT NULL REFERENCES answer(id) ON DELETE CASCADE, assignment_id INTEGER NOT NULL REFERENCES assignment(id), student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER NOT NULL REFERENCES question(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), full_score REAL NOT NULL, question_type TEXT NOT NULL, reference_answer TEXT, student_answer TEXT, rubric_json TEXT, total_score REAL, dimension_scores TEXT, annotations TEXT, unmastered_knowledge_ids TEXT, error_type TEXT, overall_comment TEXT, status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3, error_message TEXT, teacher_override_score REAL, teacher_override_comment TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), completed_at TEXT);
CREATE INDEX IF NOT EXISTS gt_status_idx ON grading_task(status);
CREATE INDEX IF NOT EXISTS gt_assignment_id_idx ON grading_task(assignment_id);
CREATE INDEX IF NOT EXISTS gt_student_id_idx ON grading_task(student_id);
CREATE TABLE IF NOT EXISTS error_book (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER REFERENCES question(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), assignment_id INTEGER REFERENCES assignment(id), grading_task_id INTEGER REFERENCES grading_task(id), content TEXT, student_answer TEXT, correct_answer TEXT, error_type TEXT, error_analysis TEXT, knowledge_explanation TEXT, similar_questions TEXT, learning_suggestion TEXT, review_status TEXT DEFAULT 'pending', reviewed_at TEXT, next_review_at TEXT, review_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS eb_student_id_idx ON error_book(student_id);
CREATE INDEX IF NOT EXISTS eb_kp_id_idx ON error_book(knowledge_point_id);
CREATE INDEX IF NOT EXISTS eb_review_status_idx ON error_book(review_status);
CREATE TABLE IF NOT EXISTS knowledge_mastery_log (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), mastery_rate REAL NOT NULL, error_count INTEGER DEFAULT 0, recorded_at TEXT NOT NULL DEFAULT (CURRENT_DATE));
CREATE INDEX IF NOT EXISTS kml_student_id_idx ON knowledge_mastery_log(student_id);
CREATE INDEX IF NOT EXISTS kml_recorded_at_idx ON knowledge_mastery_log(recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS kml_unique_idx ON knowledge_mastery_log(student_id, knowledge_point_id, recorded_at);
CREATE TABLE IF NOT EXISTS question_record (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), teacher_id INTEGER REFERENCES user(id), course_id INTEGER REFERENCES course(id), knowledge_point_id INTEGER REFERENCES knowledge_point(id), error_record_id INTEGER REFERENCES error_book(id), assignment_id INTEGER REFERENCES assignment(id), question_text TEXT NOT NULL, answer_text TEXT, status TEXT DEFAULT 'pending', is_public INTEGER DEFAULT 0, student_rating INTEGER, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), answered_at TEXT, resolved_at TEXT);
CREATE INDEX IF NOT EXISTS qr_student_id_idx ON question_record(student_id);
CREATE INDEX IF NOT EXISTS qr_teacher_id_idx ON question_record(teacher_id);
CREATE INDEX IF NOT EXISTS qr_status_idx ON question_record(status);
CREATE INDEX IF NOT EXISTS qr_course_id_idx ON question_record(course_id);
CREATE TABLE IF NOT EXISTS announcement (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES user(id), course_id INTEGER REFERENCES course(id), title TEXT NOT NULL, content TEXT NOT NULL, is_pinned INTEGER DEFAULT 0, target_type TEXT DEFAULT 'all', target_student_ids TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE INDEX IF NOT EXISTS ann_teacher_id_idx ON announcement(teacher_id);
CREATE INDEX IF NOT EXISTS ann_course_id_idx ON announcement(course_id);
CREATE TABLE IF NOT EXISTS announcement_read (id INTEGER PRIMARY KEY AUTOINCREMENT, announcement_id INTEGER NOT NULL REFERENCES announcement(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES user(id), read_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS ar_announcement_id_idx ON announcement_read(announcement_id);
CREATE INDEX IF NOT EXISTS ar_student_id_idx ON announcement_read(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS ar_unique_idx ON announcement_read(announcement_id, student_id);
CREATE TABLE IF NOT EXISTS student_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, category TEXT NOT NULL, schedule_type TEXT NOT NULL, day_of_week TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, date_start TEXT, date_end TEXT, priority INTEGER DEFAULT 3, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS ss_student_id_idx ON student_schedule(student_id);
CREATE TABLE IF NOT EXISTS class_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), class_id INTEGER NOT NULL REFERENCES class(id), day_of_week INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, location TEXT, week_pattern TEXT DEFAULT 'every', is_active INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS cs_course_id_idx ON class_schedule(course_id);
CREATE INDEX IF NOT EXISTS cs_class_id_idx ON class_schedule(class_id);
CREATE TABLE IF NOT EXISTS exam_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), class_id INTEGER NOT NULL REFERENCES class(id), exam_name TEXT NOT NULL, exam_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, knowledge_scope TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS es_course_id_idx ON exam_schedule(course_id);
CREATE INDEX IF NOT EXISTS es_class_id_idx ON exam_schedule(class_id);
CREATE TABLE IF NOT EXISTS study_plan (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), plan_name TEXT, plan_type TEXT, start_date TEXT, end_date TEXT, focus_knowledge_ids TEXT, total_sessions INTEGER, completed_sessions INTEGER DEFAULT 0, status TEXT DEFAULT 'active', generated_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT, course_id INTEGER, plan_date TEXT, time_slot TEXT, subject TEXT, content TEXT, duration_minutes INTEGER, is_ai_generated INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS sp_student_id_idx ON study_plan(student_id);
CREATE TABLE IF NOT EXISTS study_session (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL REFERENCES study_plan(id) ON DELETE CASCADE, session_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), session_type TEXT NOT NULL, resources TEXT, is_completed INTEGER DEFAULT 0, completed_at TEXT, student_feedback TEXT, scheduled_duration INTEGER, actual_duration INTEGER, notes TEXT);
CREATE INDEX IF NOT EXISTS ss_plan_id_idx ON study_session(plan_id);
CREATE INDEX IF NOT EXISTS ss_session_date_idx ON study_session(session_date);
CREATE TABLE IF NOT EXISTS ability_point (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, course_id INTEGER NOT NULL REFERENCES course(id));
CREATE TABLE IF NOT EXISTS ideology_point (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, course_id INTEGER NOT NULL REFERENCES course(id));
CREATE TABLE IF NOT EXISTS ability_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, ability_id INTEGER NOT NULL REFERENCES ability_point(id), knowledge_id INTEGER NOT NULL REFERENCES knowledge_point(id), weight REAL DEFAULT 1);
CREATE UNIQUE INDEX IF NOT EXISTS ak_unique_idx ON ability_knowledge(ability_id, knowledge_id);
CREATE TABLE IF NOT EXISTS ideology_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, ideology_id INTEGER NOT NULL REFERENCES ideology_point(id), knowledge_id INTEGER NOT NULL REFERENCES knowledge_point(id));
CREATE UNIQUE INDEX IF NOT EXISTS ik_unique_idx ON ideology_knowledge(ideology_id, knowledge_id);
CREATE TABLE IF NOT EXISTS learning_material (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), teacher_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, type TEXT NOT NULL, content TEXT, url TEXT, duration_minutes INTEGER, knowledge_point_ids TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS lm_course_id_idx ON learning_material(course_id);
CREATE TABLE IF NOT EXISTS learning_behavior_log (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), material_id INTEGER NOT NULL REFERENCES learning_material(id), watch_duration INTEGER DEFAULT 0, progress INTEGER DEFAULT 0, review_count INTEGER DEFAULT 0, is_completed INTEGER DEFAULT 0, last_watched_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE UNIQUE INDEX IF NOT EXISTS lbl_unique_idx ON learning_behavior_log(student_id, material_id);
CREATE INDEX IF NOT EXISTS lbl_student_id_idx ON learning_behavior_log(student_id);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, operator_id INTEGER REFERENCES user(id), operator_name TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, detail TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS al_operator_idx ON audit_log(operator_id);
CREATE INDEX IF NOT EXISTS al_created_at_idx ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS system_config (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT, description TEXT, updated_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS sc_key_idx ON system_config(key);
CREATE TABLE IF NOT EXISTS notification (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES user(id), type TEXT NOT NULL, title TEXT, content TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS notif_user_id_idx ON notification(user_id);
CREATE TABLE IF NOT EXISTS qa_session (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES user(id), title TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE INDEX IF NOT EXISTS qs_user_id_idx ON qa_session(user_id);
CREATE TABLE IF NOT EXISTS qa_message (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES qa_session(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS qm_session_id_idx ON qa_message(session_id);
CREATE TABLE IF NOT EXISTS review_record (id INTEGER PRIMARY KEY AUTOINCREMENT, grading_task_id INTEGER NOT NULL REFERENCES grading_task(id), reviewer_id INTEGER NOT NULL REFERENCES user(id), reviewer_role TEXT, action TEXT NOT NULL, ai_score REAL, final_score REAL, comment TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS rr_task_id_idx ON review_record(grading_task_id);
CREATE TABLE IF NOT EXISTS discussion_post (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), author_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, content TEXT NOT NULL, is_pinned INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT);
CREATE INDEX IF NOT EXISTS dp_course_id_idx ON discussion_post(course_id);
CREATE INDEX IF NOT EXISTS dp_created_at_idx ON discussion_post(created_at);
CREATE TABLE IF NOT EXISTS discussion_reply (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES discussion_post(id) ON DELETE CASCADE, author_id INTEGER NOT NULL REFERENCES user(id), content TEXT NOT NULL, like_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS dr_post_id_idx ON discussion_reply(post_id);
CREATE TABLE IF NOT EXISTS discussion_like (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, user_id INTEGER NOT NULL REFERENCES user(id), created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE UNIQUE INDEX IF NOT EXISTS dl_unique_idx ON discussion_like(target_type, target_id, user_id);
`;
}

export async function initDb(): Promise<ReturnType<typeof drizzle>> {
  if (g.__TL_DB) return g.__TL_DB;
  if (g.__TL_INIT_PROMISE) return g.__TL_INIT_PROMISE;

  g.__TL_INIT_PROMISE = (async () => {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const isNew = !fs.existsSync(dbPath);

    const sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    g.__TL_BSQLITE = sqlite;

    if (isNew) {
      const stmts = getCreateTableSQL()
        .split(';')
        .map(s => s.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      for (const stmt of stmts) {
        try { sqlite.exec(stmt + ';'); } catch (e: any) {
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
      'CREATE TABLE IF NOT EXISTS points_account (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES user(id), total_earned INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, total_spent INTEGER DEFAULT 0, expired INTEGER DEFAULT 0, frozen INTEGER DEFAULT 0, version INTEGER DEFAULT 0, level INTEGER DEFAULT 1, rank_visible INTEGER DEFAULT 1, updated_at TEXT)',
      'CREATE TABLE IF NOT EXISTS points_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, direction TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, biz_type TEXT NOT NULL, biz_ref TEXT, idempotency_key TEXT UNIQUE, remark TEXT, expire_at TEXT, operator_id INTEGER, created_at TEXT DEFAULT (CURRENT_TIMESTAMP))',
      'CREATE UNIQUE INDEX IF NOT EXISTS sr_user_date_uq ON sign_in_record(user_id, sign_date)',
      `CREATE TABLE IF NOT EXISTS grading_config (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES user(id), name TEXT NOT NULL, course_id INTEGER, question_type TEXT, scoring_criteria TEXT, deduction_rules TEXT, comment_style TEXT, grade_levels TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT)`,
      'ALTER TABLE user ADD COLUMN token_version INTEGER DEFAULT 0',
      'ALTER TABLE assignment ADD COLUMN grades_published INTEGER DEFAULT 0',
      'ALTER TABLE question ADD COLUMN locked INTEGER DEFAULT 0',
      'ALTER TABLE question ADD COLUMN min_chars INTEGER',
      'ALTER TABLE question ADD COLUMN max_chars INTEGER',
      'ALTER TABLE question ADD COLUMN min_select INTEGER',
      'ALTER TABLE question ADD COLUMN max_select INTEGER',
      'ALTER TABLE learning_material ADD COLUMN chapter TEXT',
      'ALTER TABLE learning_material ADD COLUMN is_required INTEGER DEFAULT 0',
      'ALTER TABLE qa_message ADD COLUMN attachment TEXT',
      `CREATE TABLE IF NOT EXISTS discussion_post (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL, author_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, is_pinned INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS discussion_reply (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, author_id INTEGER NOT NULL, content TEXT NOT NULL, like_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS dr_post_id_idx ON discussion_reply(post_id)`,
      `CREATE TABLE IF NOT EXISTS discussion_like (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT DEFAULT (CURRENT_TIMESTAMP))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS dl_unique_idx ON discussion_like(target_type, target_id, user_id)`,
      // 学校名称统一（幂等）：历史库沿用旧名时改名
      `UPDATE school SET name = '福州理工学院', short_name = 'FIT' WHERE name = '福州大学'`,
    ];
    for (const stmt of MIGRATIONS) {
      try { sqlite.exec(stmt); } catch { /* 列已存在 */ }
    }

    // error_book 结构升级：question_id/assignment_id/grading_task_id 放宽为可空，并新增 content 列
    // （支持练习类错题——AI 即时练习不入题库、不属某次作业，以 content 存题面）。
    // SQLite 不能 ALTER 修改列约束，需重建表并保数据。
    migrateErrorBook(sqlite);

    g.__TL_DB = drizzle(sqlite, { schema: { ...schema, ...relations } });

    // 启动后兜底补齐轻量列：旧库缺列时补 ALTER
    ensureColumn('qa_message', 'attachment', 'ALTER TABLE qa_message ADD COLUMN attachment TEXT');

    return g.__TL_DB;
  })();

  return g.__TL_INIT_PROMISE;
}

export function closeDb() {
  if (g.__TL_BSQLITE) {
    try { g.__TL_BSQLITE.close(); } catch {}
  }
  g.__TL_BSQLITE = undefined;
  g.__TL_DB = undefined;
  g.__TL_INIT_PROMISE = undefined;
}

export function saveDb() { /* better-sqlite3 已实时落盘，无需额外操作 */ }

/**
 * error_book 结构升级迁移：question_id/assignment_id/grading_task_id 放宽为可空 + 新增 content 列。
 * SQLite 无法 ALTER 修改列约束，采用「备份→重建→回填→重建索引」。
 * 幂等：已迁移（含 content 列且 question_id 可空）则跳过；任何异常回滚不阻塞启动。
 */
export function migrateErrorBook(sqlite: Database.Database): void {
  try {
    const info = sqlite.prepare('PRAGMA table_info(error_book)').all() as Array<{ name: string; notnull: number }>;
    const hasContent = info.some((r) => r.name === 'content');
    const qNullable = info.find((r) => r.name === 'question_id')?.notnull === 0;
    if (hasContent && qNullable) return;

    sqlite.exec('PRAGMA foreign_keys=OFF;');
    sqlite.exec('BEGIN;');
    try {
      sqlite.exec('ALTER TABLE error_book RENAME TO error_book_tmp;');
      sqlite.exec(`CREATE TABLE error_book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES user(id),
        question_id INTEGER REFERENCES question(id),
        knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id),
        assignment_id INTEGER REFERENCES assignment(id),
        grading_task_id INTEGER REFERENCES grading_task(id),
        content TEXT,
        student_answer TEXT, correct_answer TEXT, error_type TEXT, error_analysis TEXT,
        knowledge_explanation TEXT, similar_questions TEXT, learning_suggestion TEXT,
        review_status TEXT DEFAULT 'pending', reviewed_at TEXT, next_review_at TEXT,
        review_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
      );`);
      sqlite.prepare(`
        INSERT INTO error_book (
          id, student_id, question_id, knowledge_point_id, assignment_id, grading_task_id,
          content, student_answer, correct_answer, error_type, error_analysis,
          knowledge_explanation, similar_questions, learning_suggestion,
          review_status, reviewed_at, next_review_at, review_count, created_at
        )
        SELECT id, student_id, question_id, knowledge_point_id, assignment_id, grading_task_id,
          NULL, student_answer, correct_answer, error_type, error_analysis,
          knowledge_explanation, similar_questions, learning_suggestion,
          review_status, reviewed_at, next_review_at, review_count, created_at
        FROM error_book_tmp
      `).run();
      sqlite.exec('DROP TABLE error_book_tmp;');
      sqlite.exec('CREATE INDEX IF NOT EXISTS eb_student_id_idx ON error_book(student_id);');
      sqlite.exec('CREATE INDEX IF NOT EXISTS eb_kp_id_idx ON error_book(knowledge_point_id);');
      sqlite.exec('CREATE INDEX IF NOT EXISTS eb_review_status_idx ON error_book(review_status);');
      sqlite.exec('COMMIT;');
    } catch (e) {
      sqlite.exec('ROLLBACK;');
      throw e;
    } finally {
      sqlite.exec('PRAGMA foreign_keys=ON;');
    }
  } catch { /* 迁移失败时静默，避免阻塞启动 */ }
}

/**
 * 运行时兜底：确保某表存在某列（针对已在运行中、单例 DB 未重跑迁移的进程）。
 * 幂等：列已存在则跳过；任何异常静默忽略，避免影响主流程。
 */
export function ensureColumn(table: string, column: string, ddl: string): void {
  try {
    const sqlite = g.__TL_BSQLITE;
    if (!sqlite) return;
    const info = sqlite.prepare(`PRAGMA table_info(${table})`).all();
    const exists = (info as Array<{ name: string }>).some((r) => r.name === column);
    if (!exists) sqlite.exec(ddl);
  } catch { /* 忽略 */ }
}

export function getSqlite(): Database.Database {
  if (!g.__TL_BSQLITE) throw new Error('Database not initialized');
  return g.__TL_BSQLITE;
}

export { schema };

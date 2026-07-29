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
};

function getDbPath(): string {
  return process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'tracinglight.db');
}

function saveToDisk() {
  if (g.__TL_SQLJS) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = g.__TL_SQLJS.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log(`  DB saved (${(data.length / 1024).toFixed(0)}KB) to ${dbPath}`);
  } else {
    console.log('  DB save skipped: no SQLJS instance');
  }
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
CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, real_name TEXT NOT NULL, role TEXT NOT NULL, class_id INTEGER REFERENCES class(id), student_level TEXT, avatar_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
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
CREATE TABLE IF NOT EXISTS question (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), question_type TEXT NOT NULL, difficulty TEXT NOT NULL, content TEXT NOT NULL, options TEXT, answer TEXT NOT NULL, analysis TEXT, default_score INTEGER DEFAULT 10, source TEXT DEFAULT 'ai', version INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS q_course_id_idx ON question(course_id);
CREATE INDEX IF NOT EXISTS q_kp_id_idx ON question(knowledge_point_id);
CREATE INDEX IF NOT EXISTS q_type_idx ON question(question_type);
CREATE INDEX IF NOT EXISTS q_difficulty_idx ON question(difficulty);
CREATE TABLE IF NOT EXISTS assignment (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES course(id), teacher_id INTEGER NOT NULL REFERENCES user(id), title TEXT NOT NULL, description TEXT, question_ids TEXT NOT NULL, total_score REAL DEFAULT 100, start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT DEFAULT 'published', allow_resubmit INTEGER DEFAULT 0, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS asgn_course_id_idx ON assignment(course_id);
CREATE INDEX IF NOT EXISTS asgn_status_idx ON assignment(status);
CREATE TABLE IF NOT EXISTS answer (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER NOT NULL REFERENCES question(id), student_answer TEXT, is_submitted INTEGER DEFAULT 0, submitted_at TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
CREATE INDEX IF NOT EXISTS ans_assignment_id_idx ON answer(assignment_id);
CREATE INDEX IF NOT EXISTS ans_student_id_idx ON answer(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS ans_unique_idx ON answer(assignment_id, student_id, question_id);
CREATE TABLE IF NOT EXISTS grading_task (id INTEGER PRIMARY KEY AUTOINCREMENT, answer_id INTEGER NOT NULL REFERENCES answer(id) ON DELETE CASCADE, assignment_id INTEGER NOT NULL REFERENCES assignment(id), student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER NOT NULL REFERENCES question(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), full_score REAL NOT NULL, question_type TEXT NOT NULL, reference_answer TEXT, student_answer TEXT, rubric_json TEXT, total_score REAL, dimension_scores TEXT, annotations TEXT, unmastered_knowledge_ids TEXT, error_type TEXT, overall_comment TEXT, status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3, error_message TEXT, teacher_override_score REAL, teacher_override_comment TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP), completed_at TEXT);
CREATE INDEX IF NOT EXISTS gt_status_idx ON grading_task(status);
CREATE INDEX IF NOT EXISTS gt_assignment_id_idx ON grading_task(assignment_id);
CREATE INDEX IF NOT EXISTS gt_student_id_idx ON grading_task(student_id);
CREATE TABLE IF NOT EXISTS error_book (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES user(id), question_id INTEGER NOT NULL REFERENCES question(id), knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_point(id), assignment_id INTEGER NOT NULL REFERENCES assignment(id), grading_task_id INTEGER NOT NULL REFERENCES grading_task(id), student_answer TEXT, correct_answer TEXT, error_type TEXT, error_analysis TEXT, knowledge_explanation TEXT, similar_questions TEXT, learning_suggestion TEXT, review_status TEXT DEFAULT 'pending', reviewed_at TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
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
`;
}

export async function initDb(): Promise<ReturnType<typeof drizzle>> {
  if (g.__TL_DB) return g.__TL_DB;
  if (g.__TL_INIT_PROMISE) return g.__TL_INIT_PROMISE;

  g.__TL_INIT_PROMISE = (async () => {
    const SQL = await initSqlJs();
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

    g.__TL_DB = drizzle(g.__TL_SQLJS, { schema: { ...schema, ...relations } });
    if (isNew) saveToDisk();

    // 进程退出时自动保存（Ctrl+C / 正常关闭）
    const doSave = () => { try { saveToDisk(); } catch {} };
    process.on('exit', doSave);
    process.on('SIGINT', () => { doSave(); process.exit(); });
    process.on('SIGTERM', () => { doSave(); process.exit(); });

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

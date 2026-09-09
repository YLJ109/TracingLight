/**
 * Drizzle sqlite 数据库句柄的类型别名（供各 seed 模块标注签名）。
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** getDb() 实际返回类型：泛型为 Record<string, unknown> */
export type Drizzle = BetterSQLite3Database<Record<string, unknown>>;
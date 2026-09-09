/**
 * Drizzle PostgreSQL 数据库句柄的类型别名（供各 seed 模块标注签名）。
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** getDb() 实际返回类型：宽泛泛型以兼容实际 schema 实例 */
export type Drizzle = PgDatabase<any, any, any>;
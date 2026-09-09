/**
 * Server-side auth: validate JWT from Authorization header and enforce role-based access.
 * 使用自建 JWT 进行身份认证和角色鉴权
 *
 * Usage in API routes:
 *   const user = await requireAuth(request, 'teacher');
 */
import jwt from 'jsonwebtoken';
import { getDb } from '@/storage/database/db';
import { user as userTable } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';

export interface ServerUser {
  userId: number;
  username: string;
  role: 'teacher' | 'student' | 'admin' | 'assistant';
  studentLevel: string | null;
  classId: number | null;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 环境变量未设置');
  }
  return secret;
}

interface JwtPayload {
  userId: number;
  username: string;
  role: 'teacher' | 'student' | 'admin' | 'assistant';
  studentLevel: string | null;
  classId: number | null;
  token_version?: number;
  iat?: number;
  exp?: number;
}

/**
 * Parse and validate JWT from request, return ServerUser or null.
 * Does NOT throw — callers decide how to handle null.
 */
export async function getServerUser(request: Request): Promise<ServerUser | null> {
  try {
    // 1) 优先从 httpOnly cookie 读取 JWT（登录时种入，JS 无法读写，防 XSS 窃取）
    let token: string | null = null;
    if ('cookies' in request && typeof (request as Request & { cookies?: { get?: (k: string) => { value?: string } | undefined } }).cookies === 'object') {
      token = ((request as Request & { cookies?: { get?: (k: string) => { value?: string } | undefined } }).cookies?.get?.('tracinglight_token')?.value) ?? null;
    }
    // 2) 兼容 Authorization: Bearer（用于扫码/新页面首次直连等场景）
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7);
    }
    if (!token) return null;

    const secret = getJwtSecret();

    const payload = jwt.verify(token, secret) as JwtPayload;

    // 验证用户仍在数据库中且处于激活状态
    const db = getDb();
    const rows = await db.select()
      .from(userTable)
      .where(eq(userTable.id, payload.userId))
      .limit(1)
      .execute();

    if (rows.length === 0) return null;

    const userData = rows[0];
    if (!userData.is_active) return null;

    // token_version 校验：改密/禁用/改角色后旧 token 失效
    //（schema 未声明该列，但物理表经 db.ts 迁移已存在，这里运行时读取）
    const dbTokenVersion = (userData as unknown as { token_version?: number }).token_version ?? 0;
    const payloadTokenVersion = payload.token_version ?? 0;
    if (dbTokenVersion !== payloadTokenVersion) return null;

    return {
      userId: userData.id,
      username: userData.username,
      role: userData.role as 'teacher' | 'student' | 'admin' | 'assistant',
      studentLevel: userData.student_level,
      classId: userData.class_id,
    };
  } catch {
    // JWT 过期、无效或被篡改
    return null;
  }
}

/**
 * Require authenticated user, optionally restrict by role.
 * Returns ServerUser, or null if not authenticated / forbidden.
 * Caller should return 401/403 when null.
 */
export async function requireAuth(
  request: Request,
  requiredRole?: 'teacher' | 'student' | 'admin' | 'assistant'
): Promise<ServerUser | null> {
  const user = await getServerUser(request);
  if (!user) return null;
  if (requiredRole && user.role !== requiredRole) return null;
  return user;
}

export interface RequireAuthStatusResult {
  user: ServerUser | null;
  /** 200=成功并有 user；401=未登录/无效 token；403=已登录但角色不符 */
  status: 200 | 401 | 403;
}

/**
 * 同 requireAuth，但能区分 401（未登录/无效 token）与 403（已登录但角色不符）。
 * 方便调用方返回正确的 HTTP 状态码。
 */
export async function requireAuthWithStatus(
  request: Request,
  requiredRole?: 'teacher' | 'student' | 'admin' | 'assistant'
): Promise<RequireAuthStatusResult> {
  const user = await getServerUser(request);
  if (!user) return { user: null, status: 401 };
  if (requiredRole && user.role !== requiredRole) return { user: null, status: 403 };
  return { user, status: 200 };
}

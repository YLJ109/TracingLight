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
  role: 'teacher' | 'student';
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
  role: 'teacher' | 'student';
  studentLevel: string | null;
  classId: number | null;
  iat?: number;
  exp?: number;
}

/**
 * Parse and validate JWT from request, return ServerUser or null.
 * Does NOT throw — callers decide how to handle null.
 */
export async function getServerUser(request: Request): Promise<ServerUser | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const secret = getJwtSecret();

    const payload = jwt.verify(token, secret) as JwtPayload;

    // 验证用户仍在数据库中且处于激活状态
    const db = getDb();
    const rows = db.select()
      .from(userTable)
      .where(eq(userTable.id, payload.userId))
      .limit(1)
      .all();

    if (rows.length === 0) return null;

    const userData = rows[0];
    if (!userData.is_active) return null;

    return {
      userId: userData.id,
      username: userData.username,
      role: userData.role as 'teacher' | 'student',
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
  requiredRole?: 'teacher' | 'student'
): Promise<ServerUser | null> {
  const user = await getServerUser(request);
  if (!user) return null;
  if (requiredRole && user.role !== requiredRole) return null;
  return user;
}

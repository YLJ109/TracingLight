import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';

const SALT = 'tracinglight-demo-salt-v1';
const BCRYPT_ROUNDS = 10;

/**
 * 密码哈希（T-5 慢哈希迁移）：
 * - 新哈希：bcrypt（10 轮，约 75ms/次，抗暴力穷举）
 * - 旧数据兼容：库中历史 sha256(固定盐) 哈希在 verifyPassword 中自动回退校验
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function isBcryptHash(hash: string): boolean {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}

function legacySha256(password: string): string {
  return createHash('sha256').update(SALT + password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!hash || !password) return false;
  if (isBcryptHash(hash)) {
    try {
      return bcrypt.compareSync(password, hash);
    } catch {
      return false;
    }
  }
  // 旧 sha256 固定盐哈希（历史数据兼容）
  return legacySha256(password) === hash;
}

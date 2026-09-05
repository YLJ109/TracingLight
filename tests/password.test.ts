/**
 * 密码工具单元测试
 * 运行：tsx tests/password.test.ts
 */
import assert from 'node:assert';
import { createHash } from 'crypto';
import { hashPassword, verifyPassword } from '../src/lib/password';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

const LEGACY_SALT = 'tracinglight-demo-salt-v1';
const legacySha256 = (pwd: string) =>
  createHash('sha256').update(LEGACY_SALT + pwd).digest('hex');

console.log('\n=== 密码哈希（bcrypt 慢哈希）===');
test('新哈希为 bcrypt 格式（$2 前缀）', () => {
  assert.match(hashPassword('x'), /^\$2[aby]\$/);
});
test('同密码两次哈希不同（bcrypt 随机盐）', () => {
  assert.notStrictEqual(hashPassword('123456'), hashPassword('123456'));
});
test('不同密码哈希不同', () => {
  assert.notStrictEqual(hashPassword('123456'), hashPassword('abcdef'));
});

console.log('\n=== 密码校验 ===');
test('正确密码通过（bcrypt）', () => {
  assert.strictEqual(verifyPassword('123456', hashPassword('123456')), true);
});
test('错误密码拒绝（bcrypt）', () => {
  assert.strictEqual(verifyPassword('wrong', hashPassword('123456')), false);
});
test('旧 sha256 固定盐哈希兼容校验（历史数据回退）', () => {
  assert.strictEqual(verifyPassword('stu_zhang', legacySha256('stu_zhang')), true);
});
test('旧 sha256 哈希错误密码拒绝', () => {
  assert.strictEqual(verifyPassword('wrong', legacySha256('stu_zhang')), false);
});
test('空哈希拒绝', () => {
  assert.strictEqual(verifyPassword('123456', ''), false);
});
test('空密码校验空哈希', () => {
  assert.strictEqual(verifyPassword('', ''), false);
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);

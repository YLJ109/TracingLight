/**
 * AI 配置单元测试：占位符 Key 识别（未配置判定）与真实 Key 判定
 * 运行：tsx tests/ai-config.test.ts
 */
import assert from 'node:assert';
import { isPlaceholderKey } from '../src/lib/ai/client';

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

console.log('\n=== AI Key 占位符识别（未配置判定）===');
test('识别标准示例 Key', () => {
  assert.strictEqual(isPlaceholderKey('your_zhipu_api_key_here'), true);
  assert.strictEqual(isPlaceholderKey('your_api_key'), true);
  assert.strictEqual(isPlaceholderKey('your-zhipu-api-key'), true);
});
test('占位符大小写不敏感', () => {
  assert.strictEqual(isPlaceholderKey('YOUR_ZHIPU_API_KEY_HERE'), true);
  assert.strictEqual(isPlaceholderKey('Placeholder'), true);
});
test('占位符忽略首尾空格', () => {
  assert.strictEqual(isPlaceholderKey('  changeme  '), true);
});

console.log('\n=== 真实 Key 判定 ===');
test('智谱真实 APIKey 格式不被判为占位符', () => {
  assert.strictEqual(isPlaceholderKey('b1f8a2c3d4e5f6a7b8c9d0e1f2a3b4c5.abcdefgh'), false);
});
test('空字符串不等同占位符（未配置另由空值判断）', () => {
  assert.strictEqual(isPlaceholderKey(''), false);
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
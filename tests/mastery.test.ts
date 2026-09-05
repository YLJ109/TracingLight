/**
 * 掌握度回写/能力画像口径单元测试
 * 运行：pnpm test 或 tsx tests/mastery.test.ts
 *
 * 覆盖：得分→掌握度映射、指数平滑口径、「教师改分后回写」的边界守卫。
 */
import assert from 'node:assert';
import { scoreToMastery, blendRate } from '../src/lib/mastery-sync';

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

console.log('\n=== 得分 → 掌握度映射 ===');
test('满分 → 100', () => {
  assert.strictEqual(scoreToMastery(10, 10), 100);
});
test('一半 → 50', () => {
  assert.strictEqual(scoreToMastery(5, 10), 50);
});
test('零分 → 0', () => {
  assert.strictEqual(scoreToMastery(0, 10), 0);
});
test('超过满分被钳制到 100', () => {
  assert.strictEqual(scoreToMastery(15, 10), 100);
});
test('满分非法(0) → 0（防除零）', () => {
  assert.strictEqual(scoreToMastery(5, 0), 0);
  assert.strictEqual(scoreToMastery(5, Number.NaN), 0);
});

console.log('\n=== 指数平滑口径（历史 0.7 / 本次 0.3） ===');
test('仅按公式：历史 60 本次 30 → 51', () => {
  assert.strictEqual(blendRate(60, 30), 51);
});
test('历史 100 + 本次 0 → 70（单次崩分掉 30）', () => {
  assert.strictEqual(blendRate(100, 0), 70);
});
test('历史 0 + 本次 100 → 30（单次满分拉回 30）', () => {
  assert.strictEqual(blendRate(0, 100), 30);
});
test('历史 70 + 本次 70 → 70（稳定态不漂移）', () => {
  assert.strictEqual(blendRate(70, 70), 70);
});
test('无历史时首次插入采用本次表现（即 scoreToMastery，非平滑）', () => {
  assert.strictEqual(scoreToMastery(6, 10), 60);
});
test('NaN 得分 → 0（防 NaN 污染掌握度）', () => {
  assert.strictEqual(scoreToMastery(Number.NaN, 10), 0);
});

console.log(`\n掌握度测试结果：${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
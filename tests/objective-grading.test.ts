/**
 * 客观题规则引擎单元测试
 * 运行：pnpm test 或 tsx tests/objective-grading.test.ts
 */
import assert from 'node:assert';
import { gradeObjectiveQuestion, isObjectiveType } from '../src/lib/objective-grading';

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

console.log('\n=== 题型识别 ===');
test('识别客观题类型', () => {
  assert.strictEqual(isObjectiveType('single_choice'), true);
  assert.strictEqual(isObjectiveType('fill_blank'), true);
  assert.strictEqual(isObjectiveType('short_answer'), false);
});

console.log('\n=== 单选题 / 判断题 ===');
test('单选正确满分', () => {
  const r = gradeObjectiveQuestion('single_choice', 'C', 'C', 10);
  assert.strictEqual(r?.total_score, 10);
  assert.strictEqual(r?.is_correct, true);
});
test('单选错误零分', () => {
  const r = gradeObjectiveQuestion('single_choice', 'C', 'A', 10);
  assert.strictEqual(r?.total_score, 0);
});
test('判断正确', () => {
  const r = gradeObjectiveQuestion('judgment', '正确', '正确', 5);
  assert.strictEqual(r?.total_score, 5);
});

console.log('\n=== 多选题（全对满分、漏选/错选一律零分）===');
test('多选全对满分', () => {
  const r = gradeObjectiveQuestion('multiple_choice', 'ABD', 'ABD', 10);
  assert.strictEqual(r?.total_score, 10);
  assert.strictEqual(r?.is_correct, true);
});
test('多选漏选 → 零分（不给部分分）', () => {
  const r = gradeObjectiveQuestion('multiple_choice', 'ABD', 'AB', 10);
  assert.strictEqual(r?.total_score, 0);
  assert.strictEqual(r?.is_correct, false);
});
test('多选错选 → 零分（不给部分分）', () => {
  const r = gradeObjectiveQuestion('multiple_choice', 'ABD', 'ABC', 10);
  assert.strictEqual(r?.total_score, 0);
  assert.strictEqual(r?.is_correct, false);
});
test('多选多选（多选一项）→ 零分', () => {
  const r = gradeObjectiveQuestion('multiple_choice', 'ABD', 'ABDE', 10);
  assert.strictEqual(r?.total_score, 0);
});
test('多选只错不选对 → 零分', () => {
  const r = gradeObjectiveQuestion('multiple_choice', 'ABD', 'CEF', 10);
  assert.strictEqual(r?.total_score, 0);
});

console.log('\n=== 填空题数值等价 ===');
test('4分之1 = 0.25', () => {
  const r = gradeObjectiveQuestion('fill_blank', '0.25', '4分之1', 5);
  assert.strictEqual(r?.total_score, 5);
});
test('1/4 = 0.25', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '1/4', 5)?.total_score, 5);
});
test('四分之一 = 0.25', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '四分之一', 5)?.total_score, 5);
});
test('25% = 0.25', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '25%', 5)?.total_score, 5);
});
test('百分之二十五 = 0.25', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '百分之二十五', 5)?.total_score, 5);
});
test('0.250 = 0.25', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '0.250', 5)?.total_score, 5);
});
test('精确匹配', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '0.25', 5)?.total_score, 5);
});

console.log('\n=== 填空题非等价 → 交 AI ===');
test('0.26 非等价返回 null', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '0.25', '0.26', 5), null);
});
test('文字答案非等价返回 null', () => {
  assert.strictEqual(gradeObjectiveQuestion('fill_blank', '面向对象', '面向过程', 5), null);
});

console.log('\n=== 未作答 ===');
test('空答案零分', () => {
  const r = gradeObjectiveQuestion('fill_blank', '0.25', '', 5);
  assert.strictEqual(r?.total_score, 0);
  assert.strictEqual(r?.is_correct, false);
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);

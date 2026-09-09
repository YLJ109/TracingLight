/**
 * 全量回归编排器（确定性检查）：
 *   单测 ×5 + API 冒烟（三角色读接口）
 * 用法：npx tsx tests/regression.mjs
 * 想同时跑"写链路数据一致性"（需已存在种子fixture：stu_0_1 已提交的作业/考试），追加参数 --write-chain。
 */
import { execSync } from 'node:child_process';

const unit = [
  ['单元测试·客观判分', 'tsx tests/objective-grading.test.ts'],
  ['单元测试·密码哈希', 'tsx tests/password.test.ts'],
  ['单元测试·权限隔离', 'tsx tests/permission.test.ts'],
  ['单元测试·掌握度', 'tsx tests/mastery.test.ts'],
  ['单元测试·AI配置', 'tsx tests/ai-config.test.ts'],
];
const smoke = [['API 冒烟·三角色', 'tsx tests/api-smoke.ts']];
const writeChain = [
  ['写链路·作业改分错题本幂等', 'node tests/e2e_verify2.mjs'],
  ['写链路·考试批改幂等', 'node tests/exam_regrade_test.mjs'],
];

const withWC = process.argv.includes('--write-chain');
const steps = [...unit, ...smoke, ...(withWC ? writeChain : [])];

let failed = 0;
console.log('\n========== 全量回归 ==========\n');
for (const [name, cmd] of steps) {
  process.stdout.write(`[运行] ${name} ... `);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true, cwd: process.cwd() });
    console.log(`\n[通过] ${name}\n`);
  } catch {
    failed += 1;
    console.log(`\n[失败] ${name}\n`);
  }
}
console.log('========== 回归结束 ==========');
console.log(`通过 ${steps.length - failed}/${steps.length}${withWC ? '' : '（用 --write-chain 追加写链路一致性）'}`);
if (failed > 0) process.exit(1);
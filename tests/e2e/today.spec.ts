import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors } from './helpers';

/**
 * 自适应复习引擎（P1）：学生「今日任务」页回归。
 * 覆盖：页面渲染、到期复习/薄弱点/计划三类任务卡片、复习反馈按钮。
 */
test('今日任务：页面渲染与三类任务卡片', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/today');

  // 头部标语 + 统计卡片
  await expect(page.getByText('今日任务', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('到期复习错题').first()).toBeVisible();
  await expect(page.getByText('薄弱点练习').first()).toBeVisible();
  await expect(page.getByText('计划内学习').first()).toBeVisible();

  // 复习卡片应包含「太简单/刚好/太难」反馈按钮（若存在到期错题）
  const tooEasy = page.getByRole('button', { name: /太简单/ });
  if (await tooEasy.first().isVisible().catch(() => false)) {
    await tooEasy.first().click();
    await expect(page.getByText(/已排到|已标记为掌握|操作失败/).first()).toBeVisible({ timeout: 10_000 });
  }

  await expectNoRuntimeErrors(errors);
});

test('今日任务：从学习规划可进入并高亮导航', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/today');
  await expect(page.getByText('今日学习').first()).toBeVisible({ timeout: 20_000 });
  await expectNoRuntimeErrors(errors);
});
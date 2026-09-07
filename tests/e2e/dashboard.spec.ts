import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors } from './helpers';

/**
 * 教师端 AI 共性问题（P2）+ 管理端数据大屏（P3）回归。
 */
test('管理端：数据大屏渲染指标卡与图表', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'admin');
  await page.goto('/admin/dashboard');

  await expect(page.getByText('溯光智慧教育', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  // 指标卡
  await expect(page.getByText('在校学生').first()).toBeVisible();
  await expect(page.getByText('平均掌握度').first()).toBeVisible();
  // 图表区标题
  await expect(page.getByText('知识点掌握度分布').first()).toBeVisible();
  await expect(page.getByText('近7天每日签到').first()).toBeVisible();

  await expectNoRuntimeErrors(errors);
});

test('教师端：学情分析可切到 AI 共性问题 Tab', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'teacher');
  await page.goto('/teacher/analytics');
  await expect(page.getByText('AI 共性问题').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'AI 共性问题' }).click();
  // 共性问题清单/空态至少渲染其一
  await expect(page.getByText('全班共性问题清单').first()).toBeVisible({ timeout: 20_000 });

  await expectNoRuntimeErrors(errors);
});
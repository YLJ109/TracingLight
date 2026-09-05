import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors } from './helpers';

/**
 * 教师端作业管理 & 批改规则入口导航回归：
 * “批改规则”按钮位于“新建作业”左侧，点击进入独立页，并可返回作业管理。
 */
test('作业管理：批改规则按钮在新建作业左侧，可进入并可返回', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'teacher');
  await page.goto('/teacher/assignments');

  // 页面上同时存在“批改规则”与“新建作业”按钮
  const gradingCfgBtn = page.locator('button:has-text("批改规则")');
  const newAsgnBtn = page.locator('button:has-text("新建作业")');
  await expect(gradingCfgBtn).toBeVisible({ timeout: 20_000 });
  await expect(newAsgnBtn).toBeVisible();

  // 批改规则位于新建作业左侧（x 坐标更小）
  const cfgBox = await gradingCfgBtn.boundingBox();
  const asgnBox = await newAsgnBtn.boundingBox();
  expect(cfgBox).not.toBeNull();
  expect(asgnBox).not.toBeNull();
  expect(cfgBox!.x).toBeLessThan(asgnBox!.x);

  // 点击批改规则 → 进入独立页
  await gradingCfgBtn.click();
  await expect(page).toHaveURL(/\/teacher\/grading-config$/);

  // 独立页提供“返回作业管理”
  const backBtn = page.locator('button:has-text("返回作业管理")');
  await expect(backBtn).toBeVisible({ timeout: 20_000 });
  await backBtn.click();
  await expect(page).toHaveURL(/\/teacher\/assignments/);

  await expectNoRuntimeErrors(errors);
});

test('作业管理激励：新建作业可进入表单页', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'teacher');
  await page.goto('/teacher/assignments');

  const newAsgnBtn = page.locator('button:has-text("新建作业")');
  await expect(newAsgnBtn).toBeVisible({ timeout: 20_000 });
  await newAsgnBtn.click();
  await page.waitForURL('**/assignments/new', { timeout: 20_000 });

  await expectNoRuntimeErrors(errors);
});
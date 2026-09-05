import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors } from './helpers';

/**
 * 知识图谱「知识 ↔ 能力」切换回归：
 * 重点覆盖历史上「切到能力后再切回知识 → 图谱变白/节点消失」的 bug。
 * 以 D3 绘制出的 .nodes 节点数 > 0 作为“已渲染”的判据。
 */
test('知识图谱：知识→能力→知识 来回切换节点始终存在', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/knowledge-graph');

  // 首次“知识”图谱渲染出节点（用 .nodes 内部节点元素判定，非仅 svg 存在）
  const nodes = page.locator('svg .nodes g');
  await expect(nodes.first()).toBeAttached({ timeout: 20_000 });

  // 切到“能力” tab，能力卡片应出现
  await page.click('button:has-text("能力")');
  await expect(page.locator('text=综合能力掌握度')).toBeVisible({ timeout: 20_000 });

  // 切回“知识” tab，图谱必须重新渲染出来（白图回归点）
  await page.click('button:has-text("知识")');
  await expect(nodes.first()).toBeAttached({ timeout: 20_000 });

  // 关键判据：节点计数在切换后必须 > 0，任何一份为 0 即白图
  const count = await nodes.count();
  expect(count, '切回知识后图谱节点数应为正，出现 0 = 白图 bug').toBeGreaterThan(0);

  await expectNoRuntimeErrors(errors);
});

test('知识图谱：知识点描边与归簇节点基础校验', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/knowledge-graph');

  const nodes = page.locator('svg .nodes g');
  await expect(nodes.first()).toBeAttached({ timeout: 20_000 });
  // 应有中心“课程”节点（node_level 0 渲染为实心圆）
  await expect(page.locator('svg .nodes g circle').first()).toBeAttached();

  await expectNoRuntimeErrors(errors);
});
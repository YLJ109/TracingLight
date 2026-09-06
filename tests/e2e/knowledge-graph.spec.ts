import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors } from './helpers';

/**
 * 知识图谱回归：
 * 覆盖历史上「切换视图后再回来 → 图谱变白/节点消失」的 bug。
 * 能力图谱已下线（并入错题本入口的纯知识图谱），此处校验知识图谱渲染稳定与错题本联动。
 * 以 D3 绘制出的 .nodes 节点数 > 0 作为“已渲染”的判据。
 */
test('知识图谱：视图切换后节点始终存在（白图回归）', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/knowledge-graph');

  // 首次渲染出节点（用 .nodes 内部节点元素判定，非仅 svg 存在）
  const nodes = page.locator('svg .nodes g');
  await expect(nodes.first()).toBeAttached({ timeout: 20_000 });

  // 切换到树图再切回环图，图谱必须重新渲染出来（白图回归点）
  await page.click('button:has-text("树")');
  await page.screenshot({ path: 'test-results/knowledge-graph-tree.png' });
  await page.click('button:has-text("环")');
  await expect(nodes.first()).toBeAttached({ timeout: 20_000 });

  // 关键判据：节点计数在切换后必须 > 0，任何一份为 0 即白图
  const count = await nodes.count();
  expect(count, '切回环图后图谱节点数应为正，出现 0 = 白图 bug').toBeGreaterThan(0);

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

test('知识图谱：从错题本进入并可返回', async ({ page }) => {
  const errors = watchPageErrors(page);
  await loginViaUI(page, 'student');
  await page.goto('/student/errors');

  // 错题本提供进入知识图谱的入口
  await page.click('a:has-text("知识图谱"), button:has-text("知识图谱")');
  await expect(page.locator('svg .nodes g').first()).toBeAttached({ timeout: 20_000 });

  // 知识图谱提供返回错题本按钮
  await page.click('a:has-text("返回错题本")');
  await expect(page).toHaveURL(/\/student\/errors/);

  await expectNoRuntimeErrors(errors);
});
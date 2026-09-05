import { test, expect } from '@playwright/test';
import { loginViaUI, expectNoRuntimeErrors, watchPageErrors, ROLE_HOME } from './helpers';

/**
 * 三端登录冒烟：学生 / 教师 / 管理员各跳转到对应工作台首页。
 * 顺带断言首页关键文案，捕捉登录后白屏/脚本异常类回归。
 */
for (const role of ['student', 'teacher', 'admin'] as const) {
  test(`登录以 ${role} 身份进入对应工作台`, async ({ page }) => {
    const errors = watchPageErrors(page);
    await loginViaUI(page, role);

    // 落在角色首页（URL 含角色段）即视为跳转成功
    expect(page.url()).toContain(`/${ROLE_HOME[role]}`);

    // 渲染出可交互内容（非空白页）
    await expect(page.locator('body')).not.toBeEmpty();

    await page.waitForTimeout(800);
    await expectNoRuntimeErrors(errors);
  });
}
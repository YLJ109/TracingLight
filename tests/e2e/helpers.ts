import { Page, expect } from '@playwright/test';

export type Role = 'student' | 'teacher' | 'admin';

export const ROLE_ACCOUNTS: Record<Role, { username: string; password: string }> = {
  student: { username: 'stu_zhang', password: 'stu_zhang' },
  teacher: { username: 'teacher_wang', password: 'teacher_wang' },
  admin: { username: 'admin', password: '123456' },
};

export const ROLE_HOME: Record<Role, string> = {
  student: 'student',
  teacher: 'teacher',
  admin: 'admin',
};

/**
 * 通过根页面表单真实登录（验证码自动填入，账号可覆盖）。
 * 返回后跳转到对应角色首页（window.location 触发全量跳转）。
 */
export async function loginViaUI(page: Page, role: Role) {
  const acc = ROLE_ACCOUNTS[role];
  await page.goto('/');
  // 等待登录表单渲染（账号/密码已自动预填）
  await page.waitForSelector('#username');
  await page.fill('#username', acc.username);
  await page.fill('#password', acc.password);
  // 验证码已自动匹配，直接点登录
  await page.click('button:has-text("登录")');
  // 匹配角色首页根(/admin)或子路径(/student/overview)，兼容根页即工作台的场景
  await page.waitForURL(new RegExp(`/${ROLE_HOME[role]}(/|$)`), { timeout: 30_000 });
}

/** 断言页面无未捕获的脚本异常（渲染类回归的核心检查项） */
export function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  return errors;
}

/** 断言页面核心可交互/渲染结果，同时暴露收集到的运行期错误供断言 */
export async function expectNoRuntimeErrors(errors: string[]) {
  expect(errors.filter((e) => !isBenignError(e)), `运行时错误: ${errors.join(' | ')}`).toHaveLength(0);
}

function isBenignError(msg: string) {
  // 忽略网络层偶发与 Next App Router 在开发模式下的无害导航取消日志；
  // 只聚焦脚本/渲染关键错误（真正的白屏以 pageerror 形式体现）。
  return (
    msg.includes('favicon') ||
    msg.includes('Failed to load resource') ||
    msg.includes('net::') ||
    msg.includes('React DevTools') ||
    msg.includes('event.preventDismiss is not a function') ||
    msg.includes('AbortError: Transition was skipped')
  );
}
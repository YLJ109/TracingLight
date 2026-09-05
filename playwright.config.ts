import { defineConfig, devices } from '@playwright/test';

/**
 * 前端 E2E 冒烟测试
 * - 真实浏览器自动启动本地 Next 应用（复用已运行实例，避免重复起服务）
 * - 覆盖关键链路：三类登录跳转 / 知识图谱 tab 切换（含白图回归）/ 教师作业管理·批改规则导航
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5000/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
/* UI 重构视觉验收：截图登录页/错题本/教师批改页 */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const token = fs.readFileSync('C:/Users/Administrator/AppData/Local/Temp/sz.token', 'utf8').trim();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  // 1. 登录页（分屏门面）
  await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ui-login.png' });

  // 2. 错题本（学生态）
  await page.evaluate((t) => {
    localStorage.setItem('tracinglight_user', JSON.stringify({ token: t, id: 3, username: 'stu_zhang', role: 'student', real_name: '张同学' }));
  }, token);
  await page.goto('http://localhost:5000/student/errors', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ui-errors.png' });

  console.log('page errors:', errors.length ? errors.join(' | ') : '无');
  await browser.close();
})();

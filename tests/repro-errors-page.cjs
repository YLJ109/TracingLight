/* 复现错题本黑屏：登录态注入 → 访问 /student/errors → 抓 console/pageerror/截图 */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const token = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 400)}`));

  // 先进首页注入登录态（localStorage tracinglight_user）
  await page.goto('http://localhost:5000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem('tracinglight_user', JSON.stringify({ token: t, id: 3, username: 'stu_zhang', role: 'student', real_name: '张同学' }));
  }, token);

  await page.goto('http://localhost:5000/student/errors', { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => logs.push('[goto] ' + e.message.slice(0, 200)));
  await page.waitForTimeout(4000);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.screenshot({ path: process.env.SHOT_FILE || 'errors-page.png', fullPage: false });

  console.log('=== 页面可见文本(前300) ===');
  console.log(bodyText || '(空白)');
  console.log('=== body 背景色 ===', bg);
  console.log('=== 错误日志 ===');
  console.log(logs.length ? logs.join('\n') : '(无 console/pageerror 错误)');
  await browser.close();
})();

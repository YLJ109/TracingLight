import { createServer } from 'http';
import { parse } from 'url';
import { existsSync, createReadStream, statSync } from 'fs';
import { relative, isAbsolute, resolve } from 'path';
import next from 'next';
import { initDb, isDbReady } from './storage/database/db';
import { user } from './storage/database/shared/schema';

// Next 生产模式在启动时会快照 public 目录，之后新增到 public 的文件不会被静态服务识别（404）。
// 因此对 /uploads/ 下的文件直接读磁盘静态返回，确保上传的头像等立即可访问，无需重启。
const PUBLIC_DIR = resolve(process.cwd(), 'public');
const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.txt': 'text/plain',
};

/** 命中 public 下的已有文件则直接流式返回（true），否则返回 false 交还 Next */
function servePublicFile(req: import('http').IncomingMessage, res: import('http').ServerResponse, pathname: string): boolean {
  if (!pathname.startsWith('/uploads/')) return false;
  const filePath = resolve(PUBLIC_DIR, '.' + pathname);
  // 防目录穿越：用 relative 判断，杜绝 URL 编码解码差异、同名前缀目录(public-xxx)、
  // 以及 Windows 盘符大小写等 startsWith 探测不到的绕过；未越界时 relative 结果不会以 .. 开头
  const rel = relative(PUBLIC_DIR, filePath);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return false;
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  // 必须监听 error：文件若在读取途中被删除/被锁定，stream 会抛未捕获 error 直接进程崩溃，流式返回前先容错
  const rs = createReadStream(filePath);
  rs.on('error', () => {
    if (!res.headersSent) { res.statusCode = 404; res.end('Not Found'); }
    else res.destroy();
  });
  rs.pipe(res);
  return true;
}

function ensureJwtSecret(): void {
  const DEFAULT_SECRETS = ['change_this_to_a_random_secret_string', 'your_secret_key', 'secret'];
  if (process.env.JWT_SECRET && !DEFAULT_SECRETS.includes(process.env.JWT_SECRET)) return;
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');
  const randomSecret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = randomSecret;
  let persisted = false;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^JWT_SECRET=.*$/m.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + randomSecret));
    } else {
      fs.appendFileSync(envPath, '\nJWT_SECRET=' + randomSecret + '\n');
    }
    persisted = true;
  } catch {
    persisted = false;
  }
  // 外部托管部署（Coze 等）文件系统常为只读/临时：写 .env 会失败，重启即换新密钥，全部登录态失效。
  if (!persisted) {
    console.warn(
      '\n' +
      '============================================================\n' +
      '⚠️  JWT_SECRET 为临时随机值，且无法写入 .env 持久化。\n' +
      '   部署平台（如 Coze）重启时密钥将重新生成，导致所有用户登录态失效。\n' +
      '   请在平台的「环境变量」中固定设置 JWT_SECRET（可用任意长随机字符串），\n' +
      '   例如: JWT_SECRET=' + randomSecret + '\n' +
      '============================================================\n',
    );
  } else {
    console.warn(
      '⚠️  JWT_SECRET 未设置或为示例默认值，已生成随机密钥并写入 .env 。\n' +
      '    生产/答辩部署建议提前在 .env 中设置固定且随机的 JWT_SECRET。',
    );
  }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // JWT 密钥检查：未设置或使用示例默认值时，自动生成随机密钥并持久化；无法持久化时给出醒目告警
  ensureJwtSecret();
  console.log('Initializing database...');
  try {
    const db = await initDb();
    const uc = (await db.select().from(user).execute()).length;
    console.log(`Database ready (${uc} users loaded).`);
  } catch (err) {
    console.warn(
      '⚠️  数据库暂不可达，服务器仍将启动；数据相关功能将在数据库恢复后按需重试。',
      (err as Error)?.message || err,
    );
  }

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '/';
      // 静态优先：解决运行期新增到 public/ 的上传文件（头像等）404 问题
      if (pathname.startsWith('/uploads/') && servePublicFile(req, res, pathname)) return;
      // 启动时若 DB 未就绪，这里按需重试初始化（幂等且具重试语义）；
      // 失败仅忽略并交给具体接口自行报错，不阻塞登录页 / 静态资源。
      if (!isDbReady()) {
        try { await initDb(); } catch { /* DB 仍未就绪，交由接口层处理 */ }
      }
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      console.error(`\n====================================================`);
      console.error(`端口 ${port} 已被占用，无法启动服务器（因此窗口会退出）。`);
      console.error(`原因与处理：`);
      console.error(`  1) 若本系统已在运行：直接访问 http://localhost:${port} 即可，无需重复启动；`);
      console.error(`  2) 否则请先关闭占用 ${port} 端口的程序，再重新运行 start.bat；`);
      console.error(`  3) 如仍冲突，可用  set PORT=5001  自定义端口后运行 start.bat。`);
      console.error(`====================================================\n`);
    } else {
      console.error('服务器启动失败：');
      console.error(err);
    }
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.NODE_ENV
      }`,
    );
  });
});

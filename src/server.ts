import { createServer } from 'http';
import { parse } from 'url';
import { existsSync, createReadStream, statSync } from 'fs';
import { resolve } from 'path';
import next from 'next';
import { initDb } from './storage/database/db';
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
  if (!filePath.startsWith(PUBLIC_DIR)) return false; // 防目录穿越
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return false;
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
  return true;
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // JWT 密钥检查：未设置或使用示例默认值时，自动生成随机密钥并写入 .env 持久化
  const DEFAULT_SECRETS = ['change_this_to_a_random_secret_string', 'your_secret_key', 'secret'];
  if (!process.env.JWT_SECRET || DEFAULT_SECRETS.includes(process.env.JWT_SECRET)) {
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    const randomSecret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = randomSecret;
    try {
      // 持久化到 .env，避免重启后 token 全部失效
      const envPath = path.resolve(process.cwd(), '.env');
      const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (/^JWT_SECRET=.*$/m.test(existing)) {
        fs.writeFileSync(envPath, existing.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + randomSecret));
      } else {
        fs.appendFileSync(envPath, '\nJWT_SECRET=' + randomSecret + '\n');
      }
    } catch { /* 无法写入 .env 时忽略，仅本次运行有效 */ }
    console.warn(
      '⚠️  JWT_SECRET 未设置或为示例默认值，已生成随机密钥并写入 .env 。\n' +
      '    生产/答辩部署建议提前在 .env 中设置固定且随机的 JWT_SECRET。',
    );
  }

  // Initialize database
  console.log('Initializing database...');
  const db = await initDb();
  const uc = db.select().from(user).all().length;
  console.log(`Database ready (${uc} users loaded).`);

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '/';
      // 静态优先：解决运行期新增到 public/ 的上传文件（头像等）404 问题
      if (pathname.startsWith('/uploads/') && servePublicFile(req, res, pathname)) return;
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

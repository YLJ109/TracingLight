import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initDb } from './storage/database/db';
import { user } from './storage/database/shared/schema';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // JWT 密钥检查：未设置或使用示例默认值时，自动生成随机密钥并告警
  const DEFAULT_SECRETS = ['change_this_to_a_random_secret_string', 'your_secret_key', 'secret'];
  if (!process.env.JWT_SECRET || DEFAULT_SECRETS.includes(process.env.JWT_SECRET)) {
    const randomSecret = require('crypto').randomBytes(32).toString('hex');
    process.env.JWT_SECRET = randomSecret;
    console.warn(
      '⚠️  JWT_SECRET 未设置或为示例默认值，已临时生成随机密钥（仅本次运行有效）。\n' +
      '    生产/答辩部署请在 .env 中设置固定且随机的 JWT_SECRET，避免 Token 可被伪造。',
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
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
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

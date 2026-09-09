// TracingLight - pm2 Process Manager config
// Production: NODE_ENV=production, port 5000, low memory guest.
// The custom server (src/server.ts) serves Next + /uploads/ stream from disk.
'use strict';
module.exports = {
  apps: [
    {
      name: 'tracinglight',
      cwd: __dirname, // 以项目根为工作目录（server.ts 一切路径基于 cwd）
      script: 'node_modules/.bin/tsx',
      args: 'src/server.ts',
      interpreter: 'node',
      cwd_as_script_path: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        PORT: (process.env.PORT || '5000').toString(),
        DATABASE_PATH: './data/tracinglight.db',
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
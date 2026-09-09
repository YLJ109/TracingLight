# TracingLight — Linux 服务器部署指南（物理机 + PM2）

面向 **Linux 物理机/云服务器** 的一键部署（`pm2` 守护进程）。与 Windows 的 `setup.bat / start.bat` 等价，但为生产环境 + 常驻运行优化。

> 需要一台能访问公网的 Linux 云主机（阿里云 / 腾讯云 / 华为云 / 各种 VPS 均可）。
> 本仓库本身**不含自动化 CI**，以下为服务器上的手动/半自动部署方式。

---

## 1. 前置准备（在服务器上）

```bash
# 以 root 或具备 sudo 的用户登录后：
sudo apt-get update
```

项目要求：

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 LTS | 推荐 nvm 安装（脚本自动处理） |
| pnpm | ≥ 9 | 脚本通过 corepack 启用 |
| git | 任意 | 拉取代码 |
| build-essential / python3 / make / g++ | 任意 | better-sqlite3 源码编译兜底 |

> 端口默认 **5000**（可用环境变量 `PORT` 覆盖；如需 80/443 对外，见文末「对外暴露」）。

---

## 2. 首次部署（一键）

```bash
# 1) 克隆代码
git clone https://github.com/YLJ109/TracingLight.git
cd TracingLight

# 2) 一键安装（装依赖 → 建 .env → 灌种子 → next build → pm2 启动）
sudo ./deploy/setup-linux.sh
```

脚本幂等，重复执行不会破坏已有数据库/`.env`。执行后服务以 pm2 进程 `tracinglight` 常驻，访问：

```
http://<服务器公网IP>:5000
```

**登录账号** 与本地一致（默认密码=用户名，管理员 `admin/123456`）。

脚本主要完成：

| 步骤 | 行为 |
|------|------|
| 系统依赖 | apt/yum 安装 git、编译工具 |
| Node + pnpm | 缺则通过 nvm + corepack 自动安装 |
| 依赖 | `pnpm install --frozen-lockfile` |
| `.env` | 缺则生成随机 `JWT_SECRET`，`ZHIPU_API_KEY` 留待配置 |
| 种子数据 | 仅当 `data/tracinglight.db` 为空时灌入 |
| 构建 | `next build` 生产构建 |
| pm2 | `pm2 start ecosystem.config.cjs` + `pm2 save` |

---

## 3. 配置 AI 服务

> 参考 README「环境变量」与「常见问题」。两种途径任选其一：

```bash
# 改 .env（推荐），改完 reload 生效：
nano .env        # 填 ZHIPU_API_KEY / 可选 ZHIPU_MODEL / ZHIPU_BASE_URL
pm2 reload tracinglight --update-env
```

或浏览器登录 **管理端 → 系统设置 → AI 服务配置**，保存会自动同步写入 `.env`。

---

## 4. 日常运维

```bash
pm2 status                 # 查看进程/内存
pm2 logs tracinglight      # 实时日志
pm2 restart tracinglight   # 重启服务

# 热更新（拉新代码 → 重装 → 重构建 → reload）
sudo ./deploy/setup-linux.sh deploy
```

`deploy` 子命令 = `git pull --ff-only` + `pnpm install --frozen-lockfile` + `next build` + `pm2 reload`，平滑不宕机。

### 开机自启（可选，推荐）

```bash
pm2 startup    # 会输出一条 sudo 命令，按提示执行即可
pm2 save       # 固化进程清单
```

---

## 5. 数据备份 / 重置

项目为单文件 SQLite：

```bash
# 备份
cp data/tracinglight.db data/tracinglight_backup.db

# 还原
cp data/tracinglight_backup.db data/tracinglight.db && pm2 restart tracinglight

# 重置为种子快照（仅删库，其余不动）
rm data/tracinglight.db && sudo ./deploy/setup-linux.sh
```

---

## 6. 对外暴露（可选，域名 + 80/443）

Nginx 反向代理到 `127.0.0.1:5000`：

```nginx
server {
    listen 80;
    server_name your.domain.com;
    client_max_body_size 50m;            # 图片/头像上传

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

之后将项目 `PORT` 改为内网口径即可，公网走 80 被 Nginx 接管。

---

## 7. 注意事项 / 常见问题

| 问题 | 解决 |
|------|------|
| `better-sqlite3` 编译失败 | 装齐 `build-essential python3 make g++` 后重跑 |
| 页面能开但 AI 报错 | 未配 `ZHIPU_API_KEY`，见第 3 节 |
| 头像上传 404 | `public/uploads` 目录需存在（脚本已 `mkdir`）；重启 `pm2 reload` |
| 端口被占 | `PORT=5001 sudo ./deploy/setup-linux.sh`，或改 `.env` 后 reload |
| 数据库被锁 / EBUSY | 先 `pm2 stop tracinglight`，再删 `data/*.db*`，最后 `pm2 start` |

> 安全建议：不要把 `.env`（含 JWT_SECRET）提交到任何仓库；服务器防火墙仅放行必要端口。
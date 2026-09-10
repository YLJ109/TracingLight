# 溯光 TracingLight — 高校智慧教育 AI 平台

<div align="center">

**基于 AI 大模型的智慧教育全栈解决方案**

[![技术栈](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![AI](https://img.shields.io/badge/AI-智谱%20GLM--4--Flash-green)](https://open.bigmodel.cn)
[![Database](https://img.shields.io/badge/DB-PostgreSQL-4169e1)](https://postgresql.org)

</div>

---

## 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [数据库设计](#数据库设计)
- [API 接口](#api-接口)
- [部署指南](#部署指南)

---

## 项目简介

**溯光 TracingLight** 是一套面向高校师生的智慧教育平台，利用 AI 大模型实现从智能出题、作业批改、错题分析到个性化学习推荐的完整教学闭环。覆盖学生端、教师端、管理端三端。

### 核心能力

| 能力 | 说明 |
|------|------|
| **AI 智能出题** | 根据知识点自动生成多种题型，支持难度控制与批量（1–20 题） |
| **AI 自动批改** | 四维度量化评分（准确性 / 逻辑 / 表达 / 拓展），支持流式批改 |
| **错题智能归档** | 自动归集错题，AI 分析错因，关联知识点解析与间隔复习 |
| **学情分析看板** | 六维能力雷达图、知识掌握热力图、成绩趋势与班级排名 |
| **知识图谱** | 课程→模块→知识点的层级可视化，掌握度一目了然 |
| **在线考试** | 发布 / 在线答题 / 防作弊监控 / 交卷 / 批改复核 / 成绩公布 / 申诉 |
| **个性化推荐** | 基于薄弱知识点的 AI 学习计划生成，结合课表智能排期 |
| **班级讨论区** | 学生「我的学情」内嵌、教师学情看板入口，发帖 / 回复 / 点赞 / 删除 |
| **个人中心** | 资料/姓名/头像（裁剪）编辑、安全改密、指导导师、学习概况 |

### 适用场景

- 高校计算机类课程的作业管理与批改
- 教师日常出题、批改、学情追踪
- 学生自主学习、错题复习、知识体系构建
- 管理员对学校 / 学院 / 专业 / 班级与平台的统一管理

---

## 核心功能

### 教师端

#### 教学总览 Dashboard

- 班级学生统计（总人数、分层分布）
- 近期作业发布记录与完成率、学情趋势概览、快捷功能入口

#### 学生管理

- 学生列表，支持按分层筛选、搜索
- 学生学情详情页：六维能力雷达图、成绩趋势折线图、错题类型分布、知识点掌握柱状图，一键导出 **AI 学情报告**（Word / PDF）

#### 作业管理

- 作业列表（按课程、状态筛选），新建作业支持 AI 智能出题 + 题库选题
- 作业详情：学生提交列表、AI 批量批改进度、单题批改详情
- 支持题型：单选题 / 多选题 / 判断题 / 填空题 / 简答题 / 编程题
- **批改确认机制**：AI 批改后教师逐题确认分数，学生端成绩以教师确认为准，并展示「AI 原评 → 老师确认」对比
- **批改规则配置**：评分标准 / 扣分规则 / 评语风格 / 成绩等级四项自定义，按课程、题型差异化，一键复制复用

#### 题库管理

- 题目列表（按题型、难度、课程筛选），增删改查 + AI 生成题目一键入库

#### 学情看板

- 绿色英雄大卡片（对齐学生端「我的学情」）：班级综合掌握率、分层人数、关键指标一目了然
- **公告发布内嵌于看板**：教师身份卡下方直接发布 / 删除公告，无需跳转独立页面
- 成绩概览 / 知识热力图 / 能力雷达 / 成绩趋势 / AI 共性问题 多 Tab
- 一键进入班级**讨论区**、针对薄弱点 **AI 布置作业**
- 作业完成率按筛选范围内的实际作业数动态计算，掌握度统一 0–100 量纲

#### 考试管理

- 创建 / 编辑 / 复制 / 作废考试，按知识点 AI 出题，难度与时长配置
- 在线监控、防作弊（切屏 / 离开检测），学生答题实时采集
- **成绩公布机制**：考试交卷后由教师批改复核（含人工关分），手动「公布成绩」学生端方可查看分数与标准答案
- AI 批改 + 教师复核确认、补交 / 退回重做、成绩申诉处理（申诉改分联动回写掌握度与错题本）

#### AI 智能出题

- 顶部出题配置（课程 / 知识点 / 题型 / 难度 / 数量 1–20），支持图片内容出题
- 下方通栏生成结果：质量自检、勾选入库、重新生成，带生成动画

### 学生端

#### 我的学情

- 「速览 + Tabs」分层看板：身份卡 + 课程筛选 + 掌握率四色分层横幅（精通/良好/薄弱/未学）
- 速览 **KPI 五卡**：平均掌握率、作业完成率、按时提交率、薄弱知识点数、待复习错题数
- 薄弱 / 优势知识点 Top 榜单 + 一键行动入口（去薄弱点复习 / 去待复习错题）
- 功能分区 Tab：**作业表现**（成绩趋势 + 错因分布 + 作业指标）、**能力画像**（六维能力雷达 + 知识掌握分层 + 课程对比）、**学习行为**（近 7 天学习时长）、**稳定性**（得分波动 + 粗心失分）、**成长时间线**（AI 批改反馈 + AI 答疑记录）、**基础与课程**
- **内嵌讨论区**：在当前页内完成发帖 / 详情 / 回复 / 点赞 / 删除，受当前课程筛选作用域约束
- 六维能力雷达基于 `ability_point` 与 `ability_knowledge` 加权计算真实维度，并推导「记忆理解 / 综合应用」

#### 今日学习（今日任务 + 学习材料合并为单一入口）

- 页面顶部进度条：今日作业 / 考试 / 错题复习 / 薄弱专项练习的完成度
- **今日待办**：到期作业、进行中考试、到期错题复习（艾宾浩斯遗忘曲线自动排期）
- **薄弱知识点专项练习**：基于掌握度实时推荐，完成即更新掌握度
- **学习材料推荐**：按薄弱知识点智能推荐；视频 / 文档 / 课件**当前页内弹窗阅读**，阅读时长计入平时表现分的「阅读投入」维度（每 60 分钟记 10 分，封顶 25，口径全局统一）

#### 我的作业

- 作业列表（待完成 / 已完成 / 已批改），在线作答与修改
- 简答题 / 编程题支持 **Word 式富文本作答**：加粗、代码块高亮、LaTeX 公式、表格、图片上传
- 查看批改结果、详细评语与教师确认分数；成绩未公布前仅自己可见

#### 考试中心

- 在线答题（单选 / 多选 / 判断 / 简答 / 编程等），自动保存草稿、交卷失败可重试
- 防作弊：切屏 / 离开检测记录异常事件；答题自动倒计时
- **成绩 / 标准答案仅在「已交卷且成绩公布」后可查看**，未公布不可见

#### 错题本

- 错题自动归档，**AI 深度解析**（溯源错因 + 关联知识点讲解）
- **举一反三**：AI 生成变式题即时练习，完成即更新掌握度
- **间隔复习（艾宾浩斯）**：1/3/7 天自动排期，三次自动掌握
- 从这里进入**知识图谱**，并可一键返回

#### 知识图谱

- 环状放射布局（同心圆 + 虚线圆环）+ 树形两种视图；课程 → 章节 → 知识点层级可视化
- 节点形状语义：根=实心圆 / 章=菱形 / 节=圆角矩形 / 知识点=胶囊；按章节六色着色
- **掌握度描边**：绿≥80 / 黄≥60 / 红≥30 / 灰未学；悬停辉光 + 父链 / 兄弟 / 子节点高亮
- **交互升级**：单击叶子弹详情、双击或小地图聚焦节点；左侧图例可折叠、右侧详情全屏抽屉（ESC 关闭）
- **掌握度筛选**（全部 / 只看薄弱 / 未学 / 已掌握）、标签 LOD（缩放显隐）、深色与全屏模式、PNG 导出（随主题）

#### 个性化推荐

- 总览（能力雷达、趋势、AI 洞察）/ 知识掌握 / 薄弱分析 / 学习规划 多 Tab
- AI 周学习计划（按天展示），自动避开课表时段，课表可添加 / 编辑 / 删除
- 学习计划完成度回写服务端，薄弱点阈值统一 <60

#### AI 答疑（多会话）

- 多会话对话，流式输出，结合课程知识点与错题薄弱点给出针对性回答
- 富渲染：LaTeX 公式、代码语法高亮、mermaid 流程图

#### 消息中心

- 顶部铃铛统一入口，通知与公告双标签，班级 / 全校公告自动推送

#### 个人中心

- 用户资料展示与编辑（姓名 / 头像裁剪上传 / 学生层级）
- 安全修改密码（改密后自动重新登录）
- 班级、指导导师与学习概况一览，支持头像即时同步至侧栏

#### 护眼模式

- 暖米绿低蓝光配色一键切换，暖度可调，CSS 变量换肤实现

### 管理端

- 实时数据大屏：核心指标卡、全方位图表、实时待批改 / 薄弱知识点 / 掌握度分布、底部概览，30 秒自动刷新，支持全屏
- 机构管理（学校 / 学院 / 专业 / 班级）、用户管理（增删改 / 启用禁用 / 重置密码 / 角色变更，全部留痕）
- 课程管理与知识点维护、AI 批改队列复核、公告发布、系统设置（**AI 服务在线配置**，保存同步 `.env`）、数据备份 / 委托管理
- **日志审计**：核心业务操作（登录、用户管理、考试创建/删除、作业成绩公布、退回重做、AI 批改、交卷、提交作业等）统一写入审计日志，支持操作类型 / 操作人 / 时间筛选与分页查询

---

## 技术架构

![溯光系统技术架构图](docs/imgs/architecture.jpg)

### 技术栈详情

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | Next.js | 16 | App Router, Server Components |
| **UI 层** | React | 19 | Server Components, Actions |
| **类型系统** | TypeScript | 5 | 严格类型检查 |
| **UI 组件** | shadcn/ui | latest | Radix UI + Tailwind CSS 4 |
| **数据可视化** | ECharts / d3.js | 6.x / 7.x | 雷达图、热力图、趋势图、知识图谱 |
| **数据库** | SQLite (better-sqlite3) | 13.x | 实时落盘、零系统依赖、并发安全 |
| **ORM** | Drizzle ORM | 0.45 | 类型安全的查询构建器 |
| **AI 模型** | 智谱 GLM-4-Flash | — | 免费额度, HTTP / SSE 流式 |
| **认证** | JWT (jsonwebtoken) | 9.x | 自建 Token，改密后失效 |
| **密码安全** | bcryptjs | 2.x | 慢哈希 + 旧 sha256 兼容迁移 |
| **表单** | react-hook-form + zod | 7.x / 4.x | 类型安全表单验证 |
| **包管理器** | pnpm | 9.x | 高效磁盘使用 |

---

## 快速开始

### 部署总览：三平台选择

先选部署目标，再按对应方式执行：

| 目标 | 是否推荐 | 一行入口 | 数据库 |
|------|---------|---------|--------|
| **PC / 本地 Windows** | ✅ 开发首选 | `setup.bat` → `start.bat` | 本地 Docker PG（端口 5433） |
| **Linux 服务器**（VPS/云主机常驻） | ✅ 生产常驻 | `sudo ./deploy/setup-linux.sh`（PM2 守护） | 服务器本地 PG 或外部云库 |
| **扣子 Coze / Serverless 沙箱** | 🟡 需真机实测 | 配环境变量 `DATABASE_URL` 外链 | **必须**外部托管 PG（Supabase/Neon） |
| **命令行手动** | 🟡 进阶/排障 | 见「方式二」 | 任意上述 PG |

> **数据库三选一**：本地 Docker（`localhost:5433`）、Linux 服务器本地 PG（`localhost:5432`）、外部托管云库（`postgresql://…@aws-0-<region>.pooler.supabase.com:5432/postgres`，改 `DATABASE_URL` 即可切换，无需改代码）。

### 前置条件

| 依赖 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | ≥ 20.x | [nodejs.org](https://nodejs.org) 下载 LTS 版 |
| pnpm | ≥ 9.x | `npm install -g pnpm` |
| PostgreSQL | ≥ 14 | 见下「启动 PostgreSQL」 |
| 智谱 API Key | — | [open.bigmodel.cn](https://open.bigmodel.cn) 免费注册获取（启动后在管理端配置即可） |

> **启动 PostgreSQL**（本地开发推荐用 Docker，避免与系统 5432 冲突用 5433）：
> ```bash
> docker run -d --name tracinglight-pg -p 5433:5432 \
>   -e POSTGRES_USER=tracinglight -e POSTGRES_PASSWORD=tracinglight_pw \
>   -e POSTGRES_DB=tracinglight postgres:16
> ```

---

### 方式一：Windows 一键部署（推荐）

```bash
# 1) 双击 setup.bat  —— 自动完成：环境检查 → pnpm 安装依赖 → 生成 .env
#    首次自动建表 + 导入种子数据
# 2) 双击 start.bat  —— 启动开发服务器 → http://localhost:5000
#    start.bat dev  —— 开发模式（改代码自动热更新）
# 3) 配置 AI：管理员登录 → 管理端 → 系统设置 → AI 服务配置
#    填入 API 地址与 Key，保存后立即生效，并自动同步写入 .env
```

| 脚本 | 干什么 | 什么时候用 |
|------|--------|-----------|
| `setup.bat` | 环境检查 → 安装依赖 → 生成 .env → 建库 | 首次部署 / 重新部署 |
| `start.bat` | 启动服务器（默认生产模式；`start.bat dev` 热更新） | 每次启动 |
| `start.bat update` | 更新模式：构建 + 启动 | 拉取新代码后更新 |
| `build.bat` | `next build` 生产构建（可传 `pull` 先拉取） | 代码改动后部署前验证 |
| `init-db.bat` | 只删数据库 → 重新建表 → 重新导入种子数据 | 重置数据 |
| `backfill-dimensions.bat` | 为历史已完成但缺失维度分的批改回填六维能力分（幂等，仅补 NULL） | 重置数据 / 换库后，教师端详情六维雷达无数据时 |

---

### 方式二：命令行手动部署

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化 .env（也可跳过，首次启动 server.ts 会自动生成）
cp .env.example .env   # 然后按需修改 ZHIPU_API_KEY / JWT_SECRET

# 3. 初始化数据库（建表 + 导入种子数据）
npx tsx src/storage/database/seed.ts

# 4. 启动（开发模式，端口 5000）
npx tsx src/server.ts
# 或生产：pnpm build && set NODE_ENV=production && set PORT=5000 && npx tsx src/server.ts
```

---

### 方式三：Linux 服务器部署（物理机 + PM2，常驻运行）

```bash
git clone https://github.com/YLJ109/TracingLight.git && cd TracingLight
sudo ./deploy/setup-linux.sh        # 一键：依赖→.env→种子→next build→pm2 启动
# 日常热更新
sudo ./deploy/setup-linux.sh deploy
```

详见 [docs/部署指南-Linux.md](deploy/部署指南-Linux.md)（含 AI 配置、备份/重置、Nginx 对外、pm2 开机自启）。

---

### 方式四：云环境 / Serverless 容器部署（对接外部托管 PostgreSQL）

适合部署到**临时/一次性沙箱**（如扣子 Coze、Serverless 容器、CI 预览环境）：这类环境无法稳定提供本地数据库服务，因此**不安装本地 PostgreSQL**，而是连接一个**外部托管 PostgreSQL**（推荐 Neon / Supabase 免费档）。

> 原理：应用通过 `DATABASE_URL` 直连远端 PG。构建阶段（`next build`）不会连接数据库（`instrumentation.ts` 在 `phase-production-build` 阶段跳过 `initDb()`），只在服务启动时连接 → 只要沙箱能 TCP 外链 PG 即可稳定上线，无需在沙箱内自建数据库。

1. **建外部 PostgreSQL**，拿到连接串（菜单 Settings → Database 里选 `Connection string`）：

   - **不要**手动追加 `?sslmode=require`：Supabase / Neon 的池化端点用**自签证书**，新版 node-postgres 会把 `sslmode=require` 当作 `verify-full` 处理而拒连。
   - 应用已自动对外链主机下发 `ssl:{rejectUnauthorized:false}`（见 `src/storage/database/db.ts` 的 `resolveSsl()`），**裸连接串直接可用**。
   - 若官方直连主机 `db.<ref>.supabase.co` 解析失败，改用同地区的池化端点 `aws-0-<region>.pooler.supabase.com`，且用户名为 `postgres.<ref>`：

   ```
   postgresql://postgres.<项目ref>:<密码>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

2. **本地推送表结构（仅一次）**：

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<密码>@aws-0-<region>.pooler.supabase.com:5432/postgres" pnpm db:push:pg
   ```

3. **可选：灌演示数据**（仅当界面需要假数据；**会清空所有表**，勿对真实库执行）：

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<密码>@aws-0-<region>.pooler.supabase.com:5432/postgres" npx tsx src/storage/database/seed.ts
   ```

4. **在部署平台配置环境变量**（最关键，未配置会回退到本地默认 `localhost:5433` 而启动失败）：

   ```
   DATABASE_URL=postgresql://postgres.<ref>:<密码>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

5. **重新部署**，访问首页出现登录页即成功；测试账号见下方表格。

> ⚠️ 说明：上传文件走 `public/uploads`，在临时沙箱中**不持久**（重启会丢失头像/材料）；如需正式生产，建议后续将上传迁移到对象存储，或部署到持久化磁盘环境。

---

### 验证部署 & 测试账号

浏览器访问 `http://localhost:5000`，看到登录页即部署成功。

**登录需密码**（大小写敏感）：默认密码 = 用户名；管理员固定 `123456`。

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `123456` |
| 教师 | `teacher_0_0`（萧涵棋） | `teacher_0_0` |
| 教师 | `teacher_0_1`（郑洁） | `teacher_0_1` |
| 学生 | `stu_0_1`（赵妍·学霸层） | `stu_0_1` |
| 学生 | `stu_0_0`（蒋哲·勤奋中等层） | `stu_0_0` |
| 学生 | `stu_1_5`（曹松·提升层） | `stu_1_5` |

> 不同角色登录后进入各自界面。重置数据后账号恢复为默认密码（密码 = 用户名，管理员固定 `123456`）。
> 登录页也可通过左下角「切换用户」一键填入其他演示账号。
> 种子数据为 2 班级 × 10 学生、2 教师（各负责 2 门课程）、1 管理员；学生账号形如 `stu_{班级}_{序号}`（`stu_0_0`~`stu_0_9`、`stu_1_0`~`stu_1_9`）。
> 种子内容包括 100 知识点 / 160 道真实题目（每知识点各 2 道，题干·选项·答案·解析齐备、全库不重复）/ 24 作业 / 24 考试，作业与考试均按「章节 → 知识点」组织，每卷满分统一归一为 100。

---

## 项目结构

```
suguang_projects/
├── data/                             # SQLite 数据库文件（自动生成）
│   └── tracinglight.db
├── public/                           # 静态资源 + 上传头像 uploads/avatars
├── src/
│   ├── server.ts                     # HTTP 服务入口（端口 5000，含 uploads 静态转发）
│   │
│   ├── app/                          # Next.js App Router（44 个页面路由）
│   │   ├── page.tsx                  # 登录页
│   │   ├── layout.tsx / globals.css  # 根布局 / 全局样式
│   │   ├── teacher/                  # 教师端
│   │   ├── student/                  # 学生端（overview我的学情/learn今日学习/assignments/exams/errors错题本/recommend/assistant答疑/notifications/knowledge-graph/profile …）
│   │   ├── admin/                    # 管理端（看板/机构/用户/审计日志/设置/备份…）
│   │   └── api/                      # API 路由（66 个端点）
│   │
│   ├── components/                   # 组件层
│   │   ├── ui/                       # shadcn/ui / Radix 基础组件
│   │   ├── app-shell.tsx             # 侧栏 + 顶栏 + 移动端底栏壳
│   │   ├── mobile-tab-bar.tsx        # 移动端底部导航
│   │   ├── notification-bell.tsx     # 顶部消息铃铛（通知/公告）
│   │   ├── discussion-zone.tsx       # 讨论区（发帖/回复/点赞/删除）
│   │   ├── teacher-announcement-card.tsx # 教师学情看板公告发布
│   │   └── profile-panel.tsx         # 个人中心面板
│   │
│   ├── lib/                          # 核心逻辑
│   │   ├── ai/                       # AI 服务层（client.ts + prompts）
│   │   ├── server-auth.ts            # JWT 服务端鉴权
│   │   ├── auth-helper.ts            # 客户端认证/头像同步
│   │   ├── api-fetch.ts              # HTTP 请求封装
│   │   ├── password.ts               # bcrypt 密码哈希（兼容 sha256）
│   │   ├── reading-score.ts          # 阅读投入计分统一口径（每60分钟10分封顶25）
│   │   ├── audit.ts                  # 审计日志统一写入口（writeAudit）
│   │   └── ...（label/validation/export 等工具）
│   │
│   ├── storage/database/             # 数据层
│   │   ├── db.ts                     # better-sqlite3 + Drizzle 客户端（实时落盘 + 迁移）
│   │   ├── seed.ts                   # 种子数据协调器（2教师+10学生+1管理员，100知识点+160题+24作业+24考试）
│   │   └── shared/schema.ts          # Drizzle 表结构 + 建表 DDL
│   │
│   ├── seed/                         # 种子模块化生成（org组织/知识/knowledge知识图谱/questions题库/assignments作业/exams考试/social互动）
│   │
│   └── services/                     # 业务服务（grading/participation/points 等）
│
├── .env                              # 环境变量（setup.bat 自动生成，不提交）
├── .env.example                      # 环境变量模板
├── setup.bat / start.bat / init-db.bat  # 一键部署 / 启动 / 重置
├── package.json / tsconfig.json / next.config.ts
└── docs/                             # 项目设计 / 审查 / 测试文档
```

---

## 数据库设计

SQLite + Drizzle ORM，共 55+ 张业务表，分四层：基础数据（学校/学院/专业/班级/用户/课程）→ 教学资源（知识点/知识图谱/题目）→ 业务流转（作业/作答/批改/错题本/掌握日志/考试/答题/监考/申诉）→ 互动管理（问答/公告/讨论）与学习规划（课表/计划/会话/行为日志/审计日志）。

> 学生分层：全优(≥90) / 学霸(≥80) / 中等(≥60) / 提升(<60)，由平均分实时计算。

---

## API 接口

### 认证与账号

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，校验 bcrypt 密码，返回 JWT |
| GET/PATCH | `/api/account` | 个人资料查询 / 修改（姓名、层级、头像） |
| POST | `/api/account/change-password` | 修改密码（校验原密码，改后 token 失效） |
| POST | `/api/account/upload-avatar` | 头像上传（multipart，限图片类型/大小） |

### AI 服务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-questions` | AI 智能出题（数量 1–20） |
| POST | `/api/ai/grade` | AI 单题批改（同步） |
| POST | `/api/ai/grade/batch` | AI 批量批改 |
| POST | `/api/ai/grade-stream` | AI 批改（SSE 流式输出） |
| POST | `/api/ai/analyze-error` | AI 错因分析 |
| GET | `/api/ai/profile` | AI 学情分析 |

### 教师端 / 学生端 / 管理端

覆盖作业、题库、学生学情、学情看板、错题本、知识图谱、推荐、学习计划、公告、批改确认、机构管理、系统配置等，共 66 个端点。详见 `src/app/api/` 目录，每个端点自带注释与鉴权（`requireAuth`）。

---

## 环境变量参考

| 变量 | 必填 | 说明 | 默认值 |
|------|:--:|------|------|
| `ZHIPU_API_KEY` | ✓ | 智谱开放平台 API Key（也可在管理端在线配置并同步 .env） | — |
| `ZHIPU_BASE_URL` | ✗ | 智谱 API 地址 | 官方默认 |
| `ZHIPU_MODEL` | ✗ | 模型名称（免费：`glm-4-flash`，付费：`glm-4-plus`） | `glm-4-flash` |
| `JWT_SECRET` | ✗ | JWT 签名密钥（`setup.bat` 自动生成） | 随机生成 |
| `DATABASE_PATH` | ✗ | SQLite 数据库文件路径（历史遗留，已改用 PostgreSQL） | `./data/tracinglight.db` |
| `DATABASE_URL` | ✓ | PostgreSQL 连接串（云环境 / 非本地部署必填；本地默认见 `src/server.ts`） | `postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight` |
| `PORT` | ✗ | HTTP 服务端口 | `5000` |
| `NODE_ENV` | ✗ | `development` / `production` | `development` |

> 管理端「系统设置」保存 AI 配置时，会自动同步 `{ai_api_key→ZHIPU_API_KEY, ai_base_url→ZHIPU_BASE_URL, ai_model→ZHIPU_MODEL}` 写入 `.env`，重启/重置数据库后依然生效。

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 登录提示"用户不存在/密码错误" | 账号密码未按默认值输入 | 参照测试账号表（默认密码=用户名，admin=123456） |
| AI 功能报错 | Key 未配置 / 是占位符 / 无效 | 管理端→系统设置配置真实 Key；或 `.env` 设 `ZHIPU_API_KEY` |
| 头像上传后 404 | 未重启 / 旧上传目录 | 重启项目（server.ts 现已按需转发 uploads） |
| 端口 5000 被占用 | 其他服务占用 | 关掉占用进程或改 `.env` 中 `PORT` |
| 数据库连接失败 | PostgreSQL 未启动 / 连接串错误 | 启动 PG（如 `docker run -p 5433:5432 ...`），检查 `.env` 的 `DATABASE_URL` |
| 页面空白 | 构建产物损坏 | 删除 `.next`，重新 `pnpm build` |

---

## 数据备份

SQLite 是单文件数据库，备份只需复制一个文件：

```bash
copy data\tracinglight.db data\tracinglight_backup.db    # 备份
copy data\tracinglight_backup.db data\tracinglight.db    # 恢复
```

> 重置数据：仅删除 `data\tracinglight.db` 后运行 `init-db.bat` 即可，其余文件无需删除。

---

<div align="center">

**溯光 TracingLight** — 用 AI 照亮学习之路

</div>
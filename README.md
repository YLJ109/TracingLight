# 溯光 TracingLight V3.0 — 高校智慧教育 AI 平台

<div align="center">

**基于 AI 大模型的智慧教育全栈解决方案**

[![技术栈](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![AI](https://img.shields.io/badge/AI-智谱%20GLM--4--Flash-green)](https://open.bigmodel.cn)
[![Database](https://img.shields.io/badge/DB-SQLite-lightgrey)](https://sqlite.org)

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

**溯光 TracingLight** 是一套面向高校师生的智慧教育平台，利用 AI 大模型实现从智能出题、作业批改、错题分析到个性化学习推荐的完整教学闭环。

### 核心能力

| 能力 | 说明 |
|------|------|
| **AI 智能出题** | 根据知识点自动生成多种题型的题目，支持难度控制 |
| **AI 自动批改** | 四维度量化评分（准确性 / 逻辑 / 表达 / 拓展），支持流式批改 |
| **错题智能归档** | 自动归集错题，AI 分析错因，推送相关知识点解析 |
| **学情分析看板** | 六维能力雷达图、知识掌握热力图、成绩趋势分析 |
| **知识图谱** | 课程→模块→知识点的层级可视化，掌握度一目了然 |
| **个性化推荐** | 基于薄弱知识点的 AI 学习计划生成，结合课表智能排期 |

### 适用场景

- 高校计算机类课程的作业管理
- 教师日常出题、批改、学情追踪
- 学生自主学习、错题复习、知识体系构建

---

## 核心功能

### 教师端

#### 教学总览 Dashboard

- 班级学生统计（总人数、分层分布）
- 近期作业发布记录与完成率
- 学情趋势概览
- 快捷功能入口

#### 学生管理

- 学生列表，支持按分层筛选（全优 / 学霸 / 中等 / 提升）
- 学生学情详情页：
  - **六维能力雷达图**：知识准确性 / 逻辑完整性 / 表达条理性 / 拓展能力 / 完成率 / 错题解决率
  - **成绩趋势折线图**：历次作业得分变化
  - **错题类型分布**：饼图展示错因占比
  - **知识点掌握柱状图**：各知识点得分率

#### 作业管理

- 作业列表（支持按课程、状态筛选）
- 新建作业：AI 智能出题 + 题库选题，设置难度、分值、截止时间
- 作业详情：学生提交列表、AI 批量批改进度、单题批改详情
- 支持题型：单选题 / 多选题 / 判断题 / 填空题 / 简答题 / 编程题

#### 题库管理

- 题目列表（按题型、难度、课程筛选）
- 题目详情：题干、选项、答案、解析、关联知识点
- 增删改查 + AI 生成题目一键入库

#### 学情看板

- **成绩概览 Tab**：班级成绩分布、平均分、最高/最低分
- **知识热力图 Tab**：各知识点掌握度可视化
- **能力雷达 Tab**：六维能力综合分析
- **成绩趋势 Tab**：历次作业成绩变化曲线

### 学生端

#### 我的学情

- 个人学习数据概览
- 各科成绩统计与排名
- 能力雷达图对比
- 学习趋势分析

#### 我的作业

- 作业列表（待完成 / 已完成 / 已批改）
- 在线作答，支持提交和修改
- 查看批改结果与详细评语

#### 错题本

- 错题列表（按课程、题型、错因类型筛选）
- 错题详情：原题、我的答案、正确答案、AI 解析
- 错因分析：概念混淆 / 计算错误 / 逻辑错误 / 知识缺失 / 粗心大意
- 关联知识点与学习建议

#### 知识图谱

- **环图布局**：课程 → 分类 → 知识点三层结构
- **三 Tab 切换**：知识谱图 / 能力谱图 / 课程思政谱图
- **节点交互**：点击节点查看详情弹窗
- **颜色区分**：绿色熟练 → 黄色一般 → 红色薄弱

#### 个性化推荐

- **总览 Tab**：六维能力雷达图、学习趋势、AI 智能洞察
- **知识掌握 Tab**：各课程知识点掌握度、薄弱点列表
- **薄弱分析 Tab**：薄弱知识点深度分析、前置知识点推荐、AI 学习建议
- **学习规划 Tab**：AI 周学习计划（按天展示）、课表管理

---

## 技术架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     前端层 (Frontend)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐   │
│  │  教师端    │  │  学生端    │  │  ECharts 可视化               │   │
│  │  Next.js  │  │  Next.js  │  │  (雷达图/热力图/趋势图/饼图)     │   │
│  └─────┬─────┘  └─────┬─────┘  └──────────────┬───────────────┘   │
└────────┼───────────────┼───────────────────────┼───────────────────┘
         │               │                       │
         ▼               ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   API 层 (Next.js API Routes)                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐   │
│  │ 登录 API│ │ 作业 API│ │ 题库 API│ │ 错题 API│ │ 学情统计 API  │   │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └──────┬───────┘   │
└──────┼──────────┼──────────┼──────────┼─────────────┼────────────┘
       │          │          │          │             │
       ▼          ▼          ▼          ▼             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      AI 服务层                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ AI 出题   │ │ AI 批改    │ │ 错因分析   │ │ 学习计划生成       │   │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘ └────────┬─────────┘   │
└────────┼────────────┼───────────┼───────────────┼───────────────┘
         │            │           │               │
         ▼            ▼           ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    智谱 GLM-4-Flash 大模型                         │
│  https://open.bigmodel.cn                                       │
│  文本生成 · JSON 结构化输出 · 流式响应                               │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    数据持久层 (Database)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQLite (sql.js) + Drizzle ORM                            │   │
│  │  - 23 张业务表                                              │   │
│  │  - 纯 JavaScript 实现，零系统依赖，跨平台兼容                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 技术栈详情

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | Next.js | 16 | App Router, Turbopack |
| **UI 库** | React | 19 | Server Components, Actions |
| **类型系统** | TypeScript | 5 | 严格类型检查 |
| **UI 组件** | shadcn/ui | latest | Radix UI + Tailwind |
| **样式方案** | Tailwind CSS | 4 | 原子化 CSS, 暗色模式 |
| **数据可视化** | ECharts | 5 / 6 | 雷达图, 热力图, 趋势图 |
| **辅助可视化** | Recharts, d3.js | 2.x / 7.x | 自定义图表 |
| **数据库** | SQLite (sql.js) | 1.x | 纯 JS, 零系统依赖 |
| **ORM** | Drizzle ORM | 0.45 | 类型安全的查询构建器 |
| **AI 模型** | 智谱 GLM-4-Flash | — | 免费额度, HTTP API |
| **认证** | JWT (jsonwebtoken) | 9.x | 自建 Token 认证 |
| **表单** | react-hook-form + zod | 7.x / 4.x | 类型安全表单验证 |
| **包管理器** | pnpm | 9.x | 高效磁盘使用 |

---

## 快速开始

### 前置条件

| 依赖 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | ≥ 20.x | [nodejs.org](https://nodejs.org) 下载安装 |
| pnpm | ≥ 9.x | `npm install -g pnpm` |
| 智谱 API Key | — | [open.bigmodel.cn](https://open.bigmodel.cn) 免费注册获取 |

---

### 方式一：Windows 一键部署（推荐）

```bash
# 第一步：双击 setup.bat
#   自动完成以下所有步骤：
#   ① 检测 Node.js 和 pnpm 环境
#   ② 引导你粘贴智谱 API Key（只问一次，配过自动跳过）
#   ③ pnpm install 安装依赖
#   ④ 自动建表 + 导入种子数据（30题、6作业、10学生）
#   ⑤ Next.js + tsup 构建
#   ⑥ 启动服务 → http://localhost:5000

# 日常启动：双击 start.bat
# 重置数据：双击 init-db.bat
```

| 脚本 | 干什么 | 什么时候用 |
|------|--------|-----------|
| `setup.bat` | 环境检查 → 配置API → 安装 → 建库 → 构建 → 启动 | 首次部署 |
| `start.bat` | 启动开发服务器（改代码自动热更新） | 每次开发 |
| `init-db.bat` | 清空数据库 → 重新建表 → 重新导入种子数据 | 数据乱了想重置 |

---

### 方式二：命令行手动部署

```bash
# 1. 克隆项目后进入目录
cd suguang_projects

# 2. 安装依赖
pnpm install

# 3. 配置 API Key
#    复制 .env.example 为 .env，编辑填入智谱 API Key
cp .env.example .env
notepad .env    # Windows
# 或 nano .env  # Linux/Mac

# .env 内容示例：
# ZHIPU_API_KEY=你的智谱API密钥
# ZHIPU_MODEL=glm-4-flash

# 4. 初始化数据库（建表 + 导入种子数据）
npx tsx src/storage/database/seed.ts

# 5. 启动（开发模式，端口 5000）
pnpm dev
```

---

### 方式三：生产部署

```bash
# 构建
pnpm build

# 启动生产服务
set NODE_ENV=production
set PORT=5000
node dist/server.js
```

---

### 重新部署（清空一切重来）

```bash
# 删除以下 5 个目录/文件：
node_modules\          # 依赖包
pnpm-lock.yaml         # 锁文件
data\tracinglight.db   # 数据库
.next\                 # Next.js 构建缓存
dist\                  # tsup 构建产物

# .env 不要删！里面是你的 API Key

# 然后重新双击 setup.bat
```

---

### 验证部署成功

浏览器访问 `http://localhost:5000`，看到登录页即部署成功。

### 测试账号

| 角色 | 用户名 | 姓名 | 层级 |
|------|--------|------|------|
| 教师 | `teacher_wang` | 王老师 | — |
| 教师 | `teacher_li` | 李老师 | — |
| 学生 | `stu_zhang` | 张同学 | 全优层 |
| 学生 | `stu_li` | 李同学 | 全优层 |
| 学生 | `stu_wang` | 王同学 | 学霸层 |
| 学生 | `stu_zhao` | 赵同学 | 学霸层 |
| 学生 | `stu_chen` | 陈同学 | 中等层 |
| 学生 | `stu_liu` | 刘同学 | 中等层 |
| 学生 | `stu_zhou` | 周同学 | 中等层 |
| 学生 | `stu_wu` | 吴同学 | 提升层 |
| 学生 | `stu_sun` | 孙同学 | 提升层 |
| 学生 | `stu_ma` | 马同学 | 提升层 |

> **无需密码**，输入用户名即可登录。教师和学生看到不同的界面。

---

## 项目结构

```
suguang_projects/
├── data/                             # SQLite 数据库文件（自动生成）
│   └── tracinglight.db
├── public/                           # 静态资源
│   ├── logo.png
│   └── favicon.ico
├── src/
│   ├── server.ts                     # HTTP 服务入口（端口 5000）
│   ├── proxy.ts                      # Next.js 中间件
│   │
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 登录页
│   │   ├── layout.tsx                # 根布局
│   │   ├── globals.css               # 全局样式
│   │   │
│   │   ├── teacher/                  # 教师端
│   │   │   ├── page.tsx              # 教学总览
│   │   │   ├── students/             # 学生管理 + 学情详情
│   │   │   ├── assignments/          # 作业管理 + 新建 + 批改
│   │   │   ├── questions/bank/       # 题库管理
│   │   │   ├── analytics/            # 学情看板
│   │   │   └── ai-generate/          # AI 出题
│   │   │
│   │   ├── student/                  # 学生端
│   │   │   ├── page.tsx              # 我的学情
│   │   │   ├── assignments/          # 我的作业 + 作答
│   │   │   ├── errors/               # 错题本
│   │   │   ├── knowledge-graph/      # 知识图谱
│   │   │   ├── recommend/            # 个性化推荐
│   │   │   └── study-plan/           # 学习计划
│   │   │
│   │   └── api/                      # API 路由（25 个端点）
│   │       ├── auth/login/           # 登录认证
│   │       ├── ai/                   # AI 服务（出题/批改/分析）
│   │       ├── teacher/              # 教师端 API
│   │       └── student/              # 学生端 API
│   │
│   ├── components/ui/                # shadcn/ui 组件（50+）
│   │
│   ├── lib/                          # 核心业务逻辑
│   │   ├── ai/                       # AI 服务层
│   │   │   ├── client.ts             # 智谱 GLM 客户端
│   │   │   └── prompts/              # Prompt 模板
│   │   │       ├── grading.ts        # 批改
│   │   │       ├── question-gen.ts   # 出题
│   │   │       ├── error-analysis.ts # 错因分析
│   │   │       └── profiler.ts       # 学情分析
│   │   ├── server-auth.ts            # JWT 服务端认证
│   │   ├── auth-helper.ts            # 客户端认证工具
│   │   ├── api-fetch.ts              # HTTP 请求封装
│   │   ├── logger.ts                 # 日志工具
│   │   ├── labels.ts                 # 中文标签映射
│   │   ├── validation.ts             # 参数校验
│   │   ├── export-utils.ts           # 导出工具（CSV/JSON/Print）
│   │   └── utils.ts                  # 通用工具
│   │
│   ├── storage/database/             # 数据库层
│   │   ├── db.ts                     # SQLite 客户端（sql.js + Drizzle）
│   │   ├── seed.ts                   # 种子数据（30题 + 6作业 + 10学生）
│   │   └── shared/
│   │       ├── schema.ts             # 23 张表 Drizzle Schema
│   │       └── relations.ts          # 表关系定义
│   │
│   └── types/                        # 类型声明
│       └── sql.js.d.ts               # sql.js TypeScript 类型
│
├── .env                              # 环境变量（不提交）
├── .env.example                      # 环境变量模板
├── package.json                      # 依赖配置
├── tsconfig.json                     # TypeScript 配置
├── next.config.ts                    # Next.js 配置
├── tailwind.config  (via postcss)    # Tailwind CSS 4
│
├── setup.bat                         # 一键部署脚本
├── start.bat                         # 启动脚本
├── dev.bat                           # 开发模式
└── init-db.bat                       # 数据库初始化
```

---

## 数据库设计

### 数据表（23 张）

#### 基础数据层

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `school` | 学校 | name, short_name |
| `college` | 学院 | name, school_id |
| `major` | 专业 | name, college_id |
| `class` | 班级 | name, grade, major_id |
| `user` | 用户（教师/学生）| username, real_name, role, student_level |
| `course` | 课程 | name, teacher_id, class_id, semester |

#### 教学资源层

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `knowledge_point` | 知识点 | name, course_id, difficulty, parent_id |
| `knowledge_graph_node` | 知识图谱节点 | node_name, node_level, knowledge_point_id |
| `knowledge_graph_edge` | 知识图谱边 | from_node_id, to_node_id, relation_type |
| `question` | 题目 | content, question_type, difficulty, answer, options |

#### 业务流转层

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `assignment` | 作业 | title, course_id, question_ids, start/end_time |
| `answer` | 学生作答 | assignment_id, student_id, question_id, student_answer |
| `grading_task` | 批改任务 | answer_id, total_score, dimension_scores, annotations |
| `error_book` | 错题本 | student_id, question_id, error_type, error_analysis |
| `knowledge_mastery_log` | 知识点掌握日志 | student_id, knowledge_point_id, mastery_rate |

#### 互动管理层

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `question_record` | 问答记录 | student_id, teacher_id, question_text, answer_text |
| `announcement` | 公告 | teacher_id, title, content, target_type |
| `announcement_read` | 公告已读 | announcement_id, student_id |

#### 学习规划层

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `student_schedule` | 学生日程 | student_id, category, day_of_week, start/end_time |
| `class_schedule` | 课表 | course_id, class_id, day_of_week |
| `exam_schedule` | 考试安排 | course_id, exam_date, knowledge_scope |
| `study_plan` | 学习计划 | student_id, plan_type, focus_knowledge_ids |
| `study_session` | 学习会话 | plan_id, knowledge_point_id, session_type |

### 学生分层逻辑

```
全优层   → 所有课程平均分 ≥ 90
学霸层   → 平均分 ≥ 80 且 < 90
中等层   → 平均分 ≥ 60 且 < 80
提升层   → 平均分 < 60
```

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录，返回 JWT Token |

### AI 服务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-questions` | AI 智能出题 |
| POST | `/api/ai/grade` | AI 单题批改（同步） |
| POST | `/api/ai/grade/batch` | AI 批量批改 |
| POST | `/api/ai/grade-stream` | AI 批改（SSE 流式输出） |
| POST | `/api/ai/analyze-error` | AI 错因分析 |
| GET | `/api/ai/profile` | AI 学情分析 |

### 教师端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/teacher/students` | 学生列表（支持分层筛选） |
| GET | `/api/teacher/students/[id]` | 学生学情详情 |
| GET | `/api/teacher/assignments` | 作业列表（支持课程/状态筛选） |
| POST | `/api/teacher/assignments` | 创建作业 |
| GET | `/api/teacher/assignments/[id]/questions` | 作业题目详情 |
| GET | `/api/teacher/assignments/[id]/students/[studentId]` | 学生作业详情 |
| GET/POST | `/api/teacher/questions/bank` | 题库管理 |
| PUT/DELETE | `/api/teacher/questions/bank` | 题目更新/删除 |
| GET | `/api/teacher/analytics` | 学情统计数据 |

### 学生端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/profile` | 个人学情数据 |
| GET | `/api/student/assignments` | 我的作业列表 |
| GET | `/api/student/assignments/[id]` | 作业详情 |
| POST | `/api/student/assignments/submit` | 提交作业 |
| GET | `/api/student/errors` | 错题本 |
| GET | `/api/student/knowledge-graph` | 知识图谱数据 |
| GET | `/api/student/recommend` | 个性化推荐数据 |
| GET/POST/DELETE | `/api/student/schedule` | 课表管理 |
| GET/POST | `/api/student/study-plan` | 学习计划 |
| POST | `/api/student/study-plan/generate` | AI 生成学习计划 |

---

## 环境变量参考

| 变量 | 必填 | 说明 | 默认值 |
|------|:--:|------|------|
| `ZHIPU_API_KEY` | ✓ | 智谱开放平台 API Key | — |
| `ZHIPU_MODEL` | ✗ | 模型名称（免费：`glm-4-flash`，付费：`glm-4-plus`） | `glm-4-flash` |
| `JWT_SECRET` | ✗ | JWT 签名密钥（`setup.bat` 自动生成） | 随机生成 |
| `DATABASE_PATH` | ✗ | SQLite 数据库文件路径 | `./data/tracinglight.db` |
| `PORT` | ✗ | HTTP 服务端口 | `5000` |
| `NODE_ENV` | ✗ | 运行环境（`development` / `production`） | `development` |

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 登录提示"用户不存在" | 数据库未播种 | 运行 `init-db.bat` 后重启 |
| AI 功能报错 | API Key 未配置或无效 | 检查 `.env` 中 `ZHIPU_API_KEY` |
| 端口 5000 被占用 | 其他服务占用了端口 | 关掉占用进程或改 `.env` 中 `PORT` |
| `sql.js` 相关报错 | 依赖未正确安装 | 删除 `node_modules` 重装 |
| 页面空白 | 构建产物损坏 | 删除 `.next` 和 `dist`，重新 `pnpm build` |

## 数据备份

SQLite 是单文件数据库，备份只需复制一个文件：

```bash
# 备份
copy data\tracinglight.db data\tracinglight_backup.db

# 恢复
copy data\tracinglight_backup.db data\tracinglight.db
```

---

<div align="center">

**溯光 TracingLight** — 用 AI 照亮学习之路

</div>

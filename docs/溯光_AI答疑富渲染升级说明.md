# AI 答疑富渲染升级说明

> 升级日期：2026-09-04　|　范围：AI 答疑输出渲染（`/student/assistant`）＋ AI 输出格式规范
> 结论：**已上线并端到端验证，五类内容全部支持，渲染 200，回归无影响。**

---

## 一、升级内容

### 1. 渲染管线（前端 `src/components/ai-markdown.tsx`）

| 内容类型 | 方案 | 验证 |
|---|---|---|
| 常规富文本（标题/列表/表格/加粗/引用） | react-markdown + remark-gfm | ✅ 表格/标题实测输出 |
| 数学公式 | remark-math + rehype-katex（KaTeX 0.18），支持 `$...$` 行内 / `$$...$$` 独立，覆盖分式 `\frac`、根号 `\sqrt`、上下标、积分 `\int`、求和 `\sum`、希腊字母 | ✅ 定积分定义式实测 |
| 代码块 | rehype-highlight（highlight.js 11），保留缩进与换行，语言标注高亮 | ✅ python 代码块实测 |
| 流程图/结构示意图 | ```mermaid 代码块 → 动态加载 mermaid 11 渲染 SVG | ✅ flowchart 实测 |
| 防注入 | react-markdown 默认**不执行原始 HTML**；链接协议白名单（http/https/mailto/相对路径）；mermaid `securityLevel: 'strict'` | ✅ 无 HTML 标签输出 |

### 2. 输出格式规范（后端 SYSTEM_PROMPT）

AI 助手系统提示词新增「输出格式规范」：强制 Markdown 结构化、LaTeX 公式语法、带语言标注的代码块、流程/结构类内容优先 mermaid、对比内容用表格、禁止原始 HTML——从源头保证输出可渲染、格式稳定。

### 3. 降级方案（确保稳定可靠）

| 场景 | 降级行为 |
|---|---|
| mermaid 语法错误/渲染失败 | 降级为普通代码块展示原始图定义（内容不丢失） |
| KaTeX 遇到非法公式 | `throwOnError: false`，红色标示错误片段，不中断整条消息 |
| 未知代码语言 | `ignoreMissing: true`，按纯文本高亮 |
| 渲染组件整体异常 | 内容仍为纯文本保留在消息 state，不丢消息 |

### 4. 移动端 / 桌面端一致

- 表格、mermaid 图、`$$` 独立公式容器 `overflow-x: auto`，小屏横向滚动不撑破气泡；
- 消息气泡 `min-w-0` 防止内容撑开布局；KaTeX 字号 `1.05em` 随正文字号自适应；
- 用户消息保持纯文本 `whitespace-pre-wrap`，AI 消息走富渲染。

---

## 二、流式输出（追加实现）

- **后端** `POST /api/ai/assistant/stream`：SSE 协议（`data: {session_id}` → `data: {delta}`×N → `data: {done}`），逐 token 推送；流结束后会话与回复**照常落库**（与非流式接口持久化一致，T-2 即时落盘同样生效）；异常中断时保存已生成部分并推送 `{error, partial}`。
- **前端**：`send()` 改为流式优先——占位气泡逐增量追加（打字机效果），富渲染实时生效；**自动降级**：接口不可用/响应非 SSE → 回退原非流式接口；流中断且已有部分内容 → 保留内容并标注「回复中断」。
- **实测**：21 帧 SSE / 19 个增量帧 / 首增量延迟 **2.5s**（非流式需等全部生成完）/ done 正常 / 会话落库完整（user+assistant 各一条）。
- 原非流式接口保留，作为降级路径与历史兼容。

---

## 三、验证结果（升级总览）

| 检查 | 结果 |
|---|---|
| 类型检查 tsc | 0 错误 |
| `/student/assistant` 页面编译 | 200 |
| 回归（首页/学情/错题/推荐/看板） | 全部 200 |
| AI 实测（一条消息同时含公式+表格+代码+流程图） | **5/5 项 PASS**（LaTeX/mermaid/表格/python 代码块/无 HTML） |

## 三、部署备注

- 新增依赖（纯 JS，无原生二进制）：react-markdown、remark-gfm、remark-math、rehype-katex、katex、rehype-highlight、highlight.js、mermaid。因环境限制以 npm 干净目录安装后部署至项目 `node_modules`（peer 依赖 react/react-dom 使用项目自有版本）；如重装依赖，`pnpm add` 上述包即可。
- mermaid 为按需动态加载（仅出现 mermaid 代码块时拉取），不拖累首屏。
- 消息历史兼容：历史纯文本消息按 Markdown 渲染，纯文本内容不受影响。

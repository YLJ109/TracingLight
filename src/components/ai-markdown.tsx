'use client';

/**
 * AI 输出富渲染组件（AI 答疑等场景共用）
 *
 * 能力：
 * - 标准 Markdown：标题/列表/表格/引用/加粗（GFM）
 * - 数学公式：$...$ / $$...$$（KaTeX，支持分式/根号/上下标/积分/求和/希腊字母）
 * - 代码块：语法高亮（highlight.js），保留缩进换行
 * - 流程图/结构图：```mermaid 代码块图形化渲染（strict 安全模式），失败降级为代码展示
 * - 安全：react-markdown 默认不执行原始 HTML（防注入）；链接仅允许 http/https/mailto；
 *   mermaid 使用 securityLevel:'strict'；所有降级路径只输出纯文本
 * - 移动端一致：表格/公式横向滚动，字号自适应
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

/** mermaid 图块：动态加载 mermaid（按需，避免拖累首屏），失败降级为代码块 */
function MermaidBlock({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const renderId = useMemo(() => `mmd-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict', // 禁止脚本/事件注入
          theme: 'default',
          fontFamily: 'inherit',
        });
        const { svg } = await mermaid.render(renderId, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg; // mermaid strict 模式输出的受控 SVG
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [chart, renderId]);

  // 降级方案：渲染失败时保留原始图定义（代码块可读）
  if (failed) {
    return (
      <pre className="ai-md-pre"><code>{chart}</code></pre>
    );
  }
  return (
    <div
      ref={containerRef}
      className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-center [&_svg]:max-w-full"
    />
  );
}

const AIMarkdown = memo(function AIMarkdown({ content }: { content: string }) {
  // 降级方案：空内容不渲染；渲染异常由外层 ErrorBoundary 兜底为纯文本
  if (!content || !content.trim()) return null;

  return (
    <div className="ai-md text-sm leading-relaxed text-slate-800 min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, errorColor: '#dc2626', strict: false }],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        urlTransform={(url) => {
          // 防注入：仅放行安全协议
          const allowed = /^(https?:|mailto:|\/|#)/i;
          return allowed.test(url) ? url : '';
        }}
        components={{
          // mermaid 流程图/结构示意图
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, '');
            if (/language-mermaid/.test(className || '')) {
              return <MermaidBlock chart={text} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            // 保留缩进与换行 + 移动端横向滚动
            return <pre className="ai-md-pre">{children}</pre>;
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      <style jsx global>{`
        .ai-md h1, .ai-md h2, .ai-md h3, .ai-md h4 {
          font-weight: 700; color: #1e293b; margin: 0.9em 0 0.4em; line-height: 1.35;
        }
        .ai-md h1 { font-size: 1.25em; } .ai-md h2 { font-size: 1.15em; } .ai-md h3 { font-size: 1.05em; }
        .ai-md p { margin: 0.5em 0; }
        .ai-md ul, .ai-md ol { margin: 0.5em 0; padding-left: 1.4em; }
        .ai-md ul { list-style: disc; } .ai-md ol { list-style: decimal; }
        .ai-md li { margin: 0.25em 0; }
        .ai-md blockquote {
          border-left: 3px solid #a78bfa; background: #f8f7ff; margin: 0.6em 0;
          padding: 0.5em 0.9em; border-radius: 0 8px 8px 0; color: #4c1d95;
        }
        .ai-md th, .ai-md td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
        .ai-md th { background: #f8fafc; font-weight: 600; }
        .ai-md code:not(.hljs) {
          background: #f1f5f9; color: #7c3aed; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em;
        }
        .ai-md-pre {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
          padding: 12px 14px; overflow-x: auto; margin: 0.6em 0; line-height: 1.55;
        }
        .ai-md-pre code { background: transparent; padding: 0; color: #334155; font-size: 0.86em; white-space: pre; }
        .ai-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 1em 0; }
        .ai-md strong { font-weight: 700; color: #0f172a; }
        /* KaTeX 移动端一致：公式块可横向滚动，避免撑破气泡 */
        .ai-md .katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
        .ai-md .katex { font-size: 1.05em; }
      `}</style>
    </div>
  );
});

export default AIMarkdown;

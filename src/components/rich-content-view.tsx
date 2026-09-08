'use client';

/**
 * 学生作答·统一渲染（富文本 / Markdown / 纯文本三态兼容，杜绝乱码）
 *
 * 判定策略：
 * - 含富文本 HTML（img/table/p/div/pre/ul/h.. /br 等块级标记）→ 走 sanitize + 代码高亮 + LaTeX 的 HTML 管线
 * - 其余（Markdown 或纯文本）→ 用 react-markdown(GFM+Math) 统一渲染，兼容换行/代码块/列表/公式
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { isRichHTML, renderRichContent } from '@/lib/rich-text';

export default function RichContentView({ content, className = '' }: { content?: string | null; className?: string }) {
  const src = content || '';
  if (!src.trim()) return <span className="text-slate-300">（留空）</span>;

  if (isRichHTML(src)) {
    return (
      <div className={`rich-view rich-view-html ${className}`} dangerouslySetInnerHTML={{ __html: renderRichContent(src) }} />
    );
  }

  // Markdown / 纯文本
  return (
    <div className={`rich-view rich-view-md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" className="text-indigo-600 underline underline-offset-2" />,
          pre: ({ children, ...rest }) => <pre className="overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3 text-sm" {...rest}>{children}</pre>,
          code: (props) => <code className="rounded bg-slate-100 px-1 py-0.5 text-xs" {...props} />,
          table: (props) => <table className="border-collapse border border-slate-300 text-sm" {...props} />,
          th: (props) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left" {...props} />,
          td: (props) => <td className="border border-slate-300 px-2 py-1" {...props} />,
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
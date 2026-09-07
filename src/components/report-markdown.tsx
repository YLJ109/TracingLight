'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 彩色高亮 Markdown 报告渲染
 * 让 AI 学情报告具备清晰层级：分级标题(带色条)、高亮关键词、彩色列表、引用提示。
 */
export default function ReportMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <h2 className="mt-4 first:mt-0 border-l-4 border-teal-500 bg-teal-50/60 rounded-r-lg py-1.5 pl-3 pr-3 text-[15px] font-bold text-teal-800">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 text-sm font-semibold text-indigo-700">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-slate-700">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded-md">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1.5 pl-5 marker:text-teal-500">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-indigo-600">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed text-slate-700">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-4 py-2 text-sm font-medium text-amber-800">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-fuchsia-700">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
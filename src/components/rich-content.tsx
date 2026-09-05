'use client';

/**
 * 富内容渲染组件：自动兼容
 * - 富文本 HTML（代码块/图片/表格，sanitize 白名单清洗）
 * - LaTeX 公式（$$..$$ 与 $..$，KaTeX 渲染）
 * - 纯文本（按原文展示，保留换行）
 * 用于错题本、批改对比、答案展示等场景。
 */
import { memo } from 'react';
import 'highlight.js/styles/github.css';
import { isRichHTML, renderRichContent } from '@/lib/rich-text';

interface RichContentProps {
  content: string | null | undefined;
  className?: string;
}

function RichContentInner({ content, className }: RichContentProps) {
  const text = content || '';
  if (!text) return <span className={className}>—</span>;

  if (isRichHTML(text)) {
    return (
      <div
        className={`rich-view ${className || ''}`}
        dangerouslySetInnerHTML={{ __html: renderRichContent(text) }}
      />
    );
  }
  // 纯文本：仍支持行内/块级公式（LaTeX 直接写在文本里的场景）
  if (text.includes('$')) {
    return (
      <div
        className={`rich-view ${className || ''}`}
        dangerouslySetInnerHTML={{ __html: renderRichContent(text) }}
      />
    );
  }
  return <span className={`whitespace-pre-wrap ${className || ''}`}>{text}</span>;
}

export const RichContent = memo(RichContentInner);
export default RichContent;

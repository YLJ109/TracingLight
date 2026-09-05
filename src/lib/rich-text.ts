/**
 * 简答题富文本工具：清洗 + 纯文本化
 * 白名单标签，防 XSS（script/事件属性/on* 全部剔除）
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'span',
  'code', 'pre', 'sub', 'sup', 'kbd',
  'img',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'div',
]);

/** 浏览器端白名单清洗（SSR 环境直通返回） */
export function sanitizeRichHTML(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html || '';
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__root');
    if (!root) return '';
    const walk = (el: Element) => {
      Array.from(el.children).forEach((child) => {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // 不允许的标签：用其文本内容替代（保留文字防丢失）
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }
        // 清除事件属性与危险属性，仅保留样式/尺寸
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on') || name === 'srcdoc' || (name === 'href' || name === 'src') && !/^(data:image\/|https?:|\/)/i.test(attr.value)) {
            child.removeAttribute(attr.name);
          }
        });
        if (tag === 'img') {
          const src = child.getAttribute('src') || '';
          if (!src.startsWith('data:image/')) child.removeAttribute('src');
          // 限制尺寸风格
          const style = child.getAttribute('style') || '';
          if (!/width/.test(style)) child.setAttribute('style', 'max-width:60%;height:auto;');
        }
        if (tag === 'pre') {
          // 代码块样式统一由 .rich-view pre 提供（剥离粘贴带来的深色背景/白字等内联样式，防止重色与视觉冲突）
          child.removeAttribute('style');
        }
        if (tag === 'span' || tag === 'td' || tag === 'th' || tag === 'div' || tag === 'p') {
          const style = child.getAttribute('style') || '';
          // 剥离颜色/背景（粘贴深色界面会带入白色文字导致不可读）与定位类属性，保留其余安全样式
          const safe = style
            .replace(/(color\s*:\s*rgba?\([^)]*\))/gi, '') // 文字颜色
            .replace(/(background[^;]*)/gi, '')               // 背景
            .replace(/(position|top|left|right|bottom|z-index|opacity|transform)\s*:[^;]*/gi, '');
          const trimmed = safe.replace(/\s{2,}/g, '; ').replace(/^[;\s]+|;?\s*$/g, '');
          if (trimmed && /[a-z-]+\s*:/i.test(trimmed)) child.setAttribute('style', trimmed);
          else child.removeAttribute('style');
        }
        walk(child);
      });
    };
    walk(root);
    return root.innerHTML;
  } catch {
    return html || '';
  }
}

/** 富文本 → 纯文本（用于 AI 批改提示词与无意义判定） */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined') {
    // SSR 简易剥离
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.innerText || div.textContent || '').replace(/\u00a0/g, ' ').trim();
}

/** 是否为富文本 HTML 作答（含块级/图片标记） */
export function isRichHTML(value: string): boolean {
  return !!value && /<(img|table|p|div|pre|ul|ol|h\d|br)[\s>]/i.test(value);
}


// ══════════ 富内容渲染（代码高亮 + LaTeX 公式 + 图片/表格） ══════════
// eslint-disable-next-line @typescript-eslint/no-var-requires
const katex = require('katex');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hljs = require('highlight.js/lib/common');

const decodeEntities = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** 代码块统一语法高亮（highlight.js 自动语言检测） */
function highlightPreBlocks(html: string): string {
  return html.replace(/<pre([^>]*)>([\s\S]*?)<\/pre>/g, (m, attrs: string, inner: string) => {
    const raw = decodeEntities(inner.replace(/<[^>]+>/g, ''));
    let highlighted: string;
    try {
      highlighted = hljs.highlightAuto(raw).value;
    } catch {
      highlighted = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return `<pre${attrs}><code class="hljs">${highlighted}</code></pre>`;
  });
}

/** 富文本 HTML 渲染：sanitize + 代码高亮 + LaTeX 公式（支持 $$..$$ 与 $..$） */
export function renderRichContent(html: string): string {
  const clean = highlightPreBlocks(sanitizeRichHTML(html || ''));
  if (!clean) return '';
  try {
    let out = clean.replace(/\$\$([\s\S]+?)\$\$/g, (m: string, tex: string) => {
      try {
        return '<div class="rich-katex-block">' + katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }) + '</div>';
      } catch { return m; }
    });
    out = out.replace(/\$([^$\n]{1,120}?)\$/g, (m: string, tex: string) => {
      if (!tex.trim()) return m;
      try {
        return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      } catch { return m; }
    });
    return out;
  } catch {
    return clean;
  }
}

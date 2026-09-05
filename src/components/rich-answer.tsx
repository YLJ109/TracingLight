'use client';

/**
 * 简答题富文本作答组件（Word 式轻量）
 * 支持：加粗/斜体/下划线 · 行内代码/代码块 · LaTeX 公式（行内 $..$ / 独立 $$..$$）·
 *       表格 · 图片上传（base64 内嵌，插入时可选宽度，编辑器内可拖拽角调整）
 * 输出受控 HTML（提交前由 sanitizeRichHTML 清洗）。
 */

import { useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, Code, Code2, Sigma, Table,
  ImageIcon, Undo2, Eraser,
} from 'lucide-react';

/** 剔除富文本中残留的白色内联样式（粘贴/历史草稿常见 color:rgba(255,255,255,.85)），保证落库/展示为黑色 */
function stripWhiteColor(html: string): string {
  return html
    // 删除内联 style 里的白色 color 声明
    .replace(/color:\s*(rgba?\(\s*255\s*,\s*255\s*,\s*255[^)]*\)|#ffffff|#fff|white)\s*[^;]*;?/gi, '')
    // 删除 <font color="白色" ...> 上的白色 color 属性
    .replace(/<font\b([^>]*)>/gi, (tag) =>
      tag.replace(/\s+color\s*=\s*["'](rgba?\(\s*255\s*,\s*255\s*,\s*255[^)]*\)|#ffffff|#fff|white)["']/gi, ''),
    );
}

interface RichAnswerProps {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

/** 工具栏按钮：纯展示组件，提取到模块级避免渲染期重复创建 */
function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="px-2 py-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
    >
      {children}
    </button>
  );
}

export default function RichAnswer({ value, onChange, readOnly, placeholder }: RichAnswerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const imgWidthRef = useRef<'30%' | '55%' | '90%'>('55%');

  // 外部值变化（草稿恢复/重做模式重置）时同步到编辑器
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const exec = (cmd: string, arg?: string) => {
    if (readOnly) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const insertHTML = (html: string) => {
    if (readOnly) return;
    ref.current?.focus();
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const emit = () => {
    if (ref.current) onChange(stripWhiteColor(ref.current.innerHTML));
  };

  const insertTable = () => {
    let html = '<table style="border-collapse:collapse;min-width:60%;margin:6px 0;">';
    html += '<tr><th style="border:1px solid #cbd5e1;padding:4px 8px;background:#f8fafc;">项目</th><th style="border:1px solid #cbd5e1;padding:4px 8px;background:#f8fafc;">内容</th></tr>';
    for (let r = 0; r < 2; r++) {
      html += `<tr><td style="border:1px solid #cbd5e1;padding:4px 8px;">&nbsp;</td><td style="border:1px solid #cbd5e1;padding:4px 8px;">&nbsp;</td></tr>`;
    }
    html += '</table><p><br/></p>';
    insertHTML(html);
  };

  const insertFormula = (block: boolean) => {
    insertHTML(block
      ? '$$\\int_{a}^{b} f(x)\\,dx$$<br/>'
      : '$f(x)$&nbsp;');
  };

  const insertCode = (block: boolean) => {
    insertHTML(block
      ? '<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-family:monospace;font-size:13px;">// 在此填写代码</pre><p><br/></p>'
      : '<code style="background:#f1f5f9;padding:1px 4px;border-radius:4px;">code</code>&nbsp;');
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert('图片不能超过 3MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const w = imgWidthRef.current;
      insertHTML(`<img src="${reader.result}" style="width:${w};max-width:100%;height:auto;border-radius:6px;margin:4px 0;" contenteditable="false" /><p><br/></p>`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={`rounded-xl border-2 overflow-hidden bg-white shadow-sm transition-all ${readOnly ? 'border-slate-200 bg-slate-50' : 'border-slate-300 hover:border-slate-400 focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-200 focus-within:shadow-md'}`}>
      {/* 工具栏 */}
      {!readOnly && (
        <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 bg-slate-200/70 border-b border-slate-300">
          <ToolBtn title="加粗" onClick={() => exec('bold')}><Bold className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="斜体" onClick={() => exec('italic')}><Italic className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="下划线" onClick={() => exec('underline')}><Underline className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolBtn title="行内代码" onClick={() => insertCode(false)}><Code className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="代码块" onClick={() => insertCode(true)}><Code2 className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolBtn title="行内公式（LaTeX，如 $f(x)$）" onClick={() => insertFormula(false)}><Sigma className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="独立公式（LaTeX）" onClick={() => insertFormula(true)}>
            <span className="text-xs font-bold px-0.5">∫x</span>
          </ToolBtn>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolBtn title="插入表格" onClick={insertTable}><Table className="w-4 h-4" /></ToolBtn>
          {/* 图片上传：宽度三档可选 */}
          <div className="flex items-center gap-1">
            <label
              className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
              title="上传图片"
            >
              <ImageIcon className="w-4 h-4" />
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </label>
            <select
              title="图片插入宽度"
              onChange={(e) => { imgWidthRef.current = e.target.value as '30%' | '55%' | '90%'; }}
              defaultValue="55%"
              className="text-xs border border-slate-200 rounded-md px-1 py-1 bg-white outline-none"
            >
              <option value="30%">图宽 30%</option>
              <option value="55%">图宽 55%</option>
              <option value="90%">图宽 90%</option>
            </select>
          </div>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolBtn title="撤销" onClick={() => exec('undo')}><Undo2 className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="清除格式" onClick={() => exec('removeFormat')}><Eraser className="w-4 h-4" /></ToolBtn>
        </div>
      )}

      {/* 编辑区 */}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className={`rich-answer min-h-[150px] max-h-[55vh] overflow-y-auto px-4 py-3.5 text-sm leading-relaxed outline-none text-black caret-violet-600 ${readOnly ? 'bg-slate-50/60' : 'bg-slate-100 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 focus:bg-white transition-colors empty:before:italic'}`}
        style={{ wordBreak: 'break-word', color: '#000' }}
      />
    </div>
  );
}

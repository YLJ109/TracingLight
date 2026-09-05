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

interface RichAnswerProps {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
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
    if (ref.current) onChange(ref.current.innerHTML);
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

  const ToolBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="px-2 py-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className={`rounded-xl border overflow-hidden ${readOnly ? 'border-slate-200 bg-slate-50' : 'border-slate-300 focus-within:ring-2 focus-within:ring-violet-200 bg-white'}`}>
      {/* 工具栏 */}
      {!readOnly && (
        <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 bg-slate-100 border-b border-slate-200">
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
        className={`rich-answer min-h-[120px] max-h-[50vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none ${readOnly ? '' : 'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400'}`}
        style={{ wordBreak: 'break-word' }}
      />
    </div>
  );
}

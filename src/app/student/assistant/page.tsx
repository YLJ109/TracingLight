'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import {
  Send, Sparkles, User, Bot, Plus, MessageCircle,
  Trash2, Pencil, Check, X, Eraser, Loader2,
} from 'lucide-react';
import AIMarkdown from '@/components/ai-markdown';
import { toast } from 'sonner';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}
interface SessionItem {
  id: number;
  title: string;
  updated_at?: string | null;
  message_count?: number;
}

export default function AssistantPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || null;

  // 切换会话：按需加载消息
  const switchSession = useCallback(async (id: number) => {
    setActiveId(id);
    setLoadingMsgs(true);
    try {
      const res = await apiFetch(`/api/ai/assistant/session?id=${id}`);
      const d = await res.json();
      setMessages(d.success ? d.data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
      inputRef.current?.focus();
    }
  }, []);

  // 会话列表
  const loadSessions = useCallback(async (selectId?: number) => {
    setLoadingSessions(true);
    try {
      const res = await apiFetch('/api/ai/assistant');
      const d = await res.json();
      const list: SessionItem[] = d.success ? d.data : [];
      setSessions(list);
      if (selectId != null) {
        await switchSession(selectId);
      } else if (list.length > 0) {
        await switchSession(list[0].id);
      } else {
        setMessages([]);
        setActiveId(null);
      }
    } finally {
      setLoadingSessions(false);
    }
  }, [switchSession]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // 新建对话
  const createSession = async () => {
    try {
      const res = await apiFetch('/api/ai/assistant/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (d.success) {
        const s = d.data;
        setSessions((prev) => [{ id: s.id, title: s.title, updated_at: s.updated_at, message_count: 0 }, ...prev]);
        setActiveId(s.id);
        setMessages([]);
        inputRef.current?.focus();
      }
    } catch { /* 静默 */ }
  };

  // 删除会话
  const deleteSession = async (id: number) => {
    try {
      await apiFetch(`/api/ai/assistant/session?id=${id}`, { method: 'DELETE' });
      const rest = sessions.filter((s) => s.id !== id);
      setSessions(rest);
      if (activeId === id) {
        if (rest.length > 0) await switchSession(rest[0].id);
        else { setActiveId(null); setMessages([]); }
      }
    } catch { /* 静默 */ }
  };

  // 清空当前对话（保留会话）
  const clearActive = async () => {
    if (!activeId) return;
    try {
      await apiFetch('/api/ai/assistant/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId, action: 'clear' }),
      });
      setMessages([]);
      setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, message_count: 0 } : s));
    } catch { /* 静默 */ }
  };

  // 重命名
  const saveRename = async () => {
    if (editingId == null) return;
    const title = editTitle.trim();
    if (!title) { setEditingId(null); return; }
    try {
      await apiFetch('/api/ai/assistant/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, action: 'rename', title }),
      });
      setSessions((prev) => prev.map((s) => s.id === editingId ? { ...s, title } : s));
    } catch { /* 静默 */ }
    setEditingId(null);
  };

  // 发送（流式 + 自动降级）
  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    // 若无激活会话，先新建一个
    let sid = activeId;
    if (sid == null) {
      try {
        const res = await apiFetch('/api/ai/assistant/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        const d = await res.json();
        if (d.success) {
          sid = d.data.id;
          setSessions((prev) => [{ id: sid!, title: d.data.title || '新的对话', updated_at: d.data.updated_at, message_count: 0 }, ...prev]);
          setActiveId(sid);
        }
      } catch { /* 降级由后端自动建 */ }
    }

    setMessages((prev) => [...prev, { role: 'user', content: text.trim() }]);
    setInput('');
    setLoading(true);

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    const updateLast = (delta: string) => {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + delta };
        return next;
      });
    };
    const setLast = (content: string) => {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content };
        return next;
      });
    };

    try {
      const res = await apiFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), session_id: sid }),
      });
      const ctype = res.headers.get('content-type') || '';
      if (!res.ok || !ctype.includes('text/event-stream')) {
        // 降级：回退非流式接口
        const fallback = await apiFetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), session_id: sid }),
        });
        const data = await fallback.json();
        if (data.success) {
          setLast(data.data.reply);
          if (data.data.session_id) {
            const fid = data.data.session_id;
            setSessions((prev) => prev.some((s) => s.id === fid) ? prev : [{ id: fid, title: text.trim().slice(0, 20), updated_at: null, message_count: 0 }, ...prev]);
            setActiveId(fid);
          }
        } else if (data.code === 'AI_NOT_CONFIGURED') {
          toast.error(data.error, { duration: 8000 });
          setLast(data.error);
        } else {
          setLast('抱歉，出了点问题：' + (data.error || '请稍后重试'));
        }
      } else {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('no stream');
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError: string | null = null;
        let gotDelta = false;
        let newSid: number | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.delta) { gotDelta = true; updateLast(evt.delta); }
              if (evt.session_id) newSid = evt.session_id;
              if (evt.error) streamError = evt.error;
            } catch { /* 坏帧跳过 */ }
          }
        }
        if (newSid != null) setActiveId(newSid);
        // 会话标题（自动摘要）与计数刷新
        if (gotDelta) {
          setSessions((prev) => prev.map((s) =>
            s.id === (newSid ?? sid)
              ? { ...s, title: s.title === '新的对话' ? text.trim().slice(0, 20) : s.title, message_count: (s.message_count || 0) + 2 }
              : s
          ));
        }
        if (streamError && !gotDelta) setLast('抱歉，出了点问题：' + streamError);
        else if (streamError) updateLast('\n\n> ⚠️ 回复中断，以上为已生成部分');
      }
    } catch {
      setLast('网络错误，请稍后重试');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // ===== 会话侧栏（桌面侧栏 / 移动端横向滚动条） =====
  const sessionList = (
    <>
      <button
        onClick={createSession}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
      >
        <Plus className="w-4 h-4" /> 新对话
      </button>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 lg:mt-3">
        {loadingSessions && <p className="text-xs text-slate-400 p-2">加载中...</p>}
        {!loadingSessions && sessions.length === 0 && (
          <p className="text-xs text-slate-400 p-2">暂无历史对话</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => { if (editingId !== s.id) switchSession(s.id); }}
            className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm transition-colors ${
              s.id === activeId
                ? 'bg-violet-100 text-violet-800 font-medium'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {editingId === s.id ? (
              <>
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 min-w-0 text-sm border-b border-violet-400 bg-transparent outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <button onClick={(e) => { e.stopPropagation(); saveRename(); }} className="text-green-600"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-slate-400"><X className="w-3.5 h-3.5" /></button>
              </>
            ) : (
              <>
                <MessageCircle className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{s.title || '新的对话'}</span>
                <span className="hidden lg:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditTitle(s.title || ''); }}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    title="重命名"
                  ><Pencil className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600"
                    title="删除"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="lg:hidden p-1 rounded text-slate-400"
                  title="删除"
                ><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="hidden lg:block text-[10px] text-slate-400 px-3 pt-2">带记忆：同一对话内上下文连续</p>
    </>
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-9rem)]">
      {/* 左侧会话栏（桌面） */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white border border-border rounded-2xl p-3">
        {sessionList}
      </aside>

      {/* 右侧聊天区 */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border border-border rounded-2xl">
        {/* 移动端会话横滚条 */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto px-3 py-2 border-b border-border bg-slate-50 rounded-t-2xl">
          <button onClick={createSession} className="shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => switchSession(s.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${s.id === activeId ? 'bg-violet-600 text-white' : 'bg-white border border-border text-slate-600'}`}
            >{s.title || '新的对话'}</button>
          ))}
        </div>

        {/* 当前会话标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
            <span className="text-sm font-medium truncate">{activeSession?.title || '新的对话'}</span>
          </div>
          <button
            onClick={clearActive}
            disabled={!activeId || messages.length === 0}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 disabled:opacity-40 transition-colors"
            title="清空当前对话"
          >
            <Eraser className="w-3.5 h-3.5" /> 清空对话
          </button>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingMsgs && (
            <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
          )}
          {!loadingMsgs && messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">AI 学习助手</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
                支持多轮记忆对话。可以问知识点、要代码示例、要公式推导——回答支持数学公式、代码高亮与流程图。
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-tr-sm whitespace-pre-wrap'
                    : 'bg-slate-50 border border-border text-foreground rounded-tl-sm min-w-0'
                }`}
              >
                {m.role === 'user' ? m.content : <AIMarkdown content={m.content} />}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-violet-600" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input); }}
              placeholder="输入你的问题，Enter 发送..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white"
              disabled={loading}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="px-4 rounded-xl bg-violet-600 text-white disabled:opacity-40 flex items-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

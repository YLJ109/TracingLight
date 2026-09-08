'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { formatClock } from '@/lib/date';
import { questionTypeLabel } from '@/lib/labels';
import { groupQuestionsBySection } from '@/lib/question-order';
import { toast } from 'sonner';
import { python } from '@codemirror/lang-python';
import {
  Clock, Flag, Send, FileText, Maximize2, ShieldAlert, Loader2,
  Lock, ShieldCheck, Check, X, Keyboard, Eye, CornerDownRight
} from 'lucide-react';
import RichAnswer from '@/components/rich-answer';
import { sanitizeRichHTML, htmlToPlainText } from '@/lib/rich-text';

// 编程题代码编辑器：SSR 关闭（依赖浏览器 DOM），等宽 + 行号 + Python 高亮
const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then((m) => m.default), { ssr: false, loading: () => <div className="h-[260px] rounded-lg border border-slate-200 grid place-items-center text-slate-400 text-sm">编辑器加载中…</div> });

interface QOpt { key: string; text: string; }
interface QuestionItem { id: number; question_type: string; difficulty: string; content: string; options: QOpt[] | null; knowledge_point_id: number; full_score: number; }
interface PaperItem { id: number; question_type: string; order: number; optionLayout?: string[]; }
interface ProctorConfig {
  max_switch?: number;
  heartbeat_seconds?: number;
  disable_devtools?: boolean;
  disable_copy?: boolean;
  disable_paste?: boolean;
  disable_zoom?: boolean;
}
interface TakeData {
  exam: { id: number; title: string; description?: string; course_name: string; deadline: string; has_subjective: boolean; grades_published: boolean; duration: number; total_score?: number };
  student: { id: number; real_name: string; username: string; avatar_url?: string };
  attempt: { id: number; deadline: string; face_verified: boolean; face_strategy: string };
  proctor_config: ProctorConfig;
  paper: PaperItem[];
  questions: QuestionItem[];
  answers: Array<{ question_id: number; student_answer: string | null; marked: boolean | null; revise_count: number | null }>;
}

type RestoredAnswer = { question_id: number; student_answer: string | null; marked: boolean | null };

const OBJECTIVE = new Set(['single_choice', 'multi_choice', 'multiple_choice', 'judgment', 'fill_blank']);
const isSubjective = (t: string) => !OBJECTIVE.has(t);
const isMultiQ = (t: string) => t === 'multi_choice' || t === 'multiple_choice';
const isProgramming = (t: string) => t === 'programming' || t === 'code';

type FsCover = 'greet' | 'locked' | null;

export default function ExamTakePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [data, setData] = useState<TakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [marked, setMarked] = useState<Record<number, boolean>>({});
  const [restored, setRestored] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [fsState, setFsState] = useState<'full' | 'mini'>('mini');
  // 全屏拦截图：默认强制全屏；仅开发环境可用 ?fs=skip 跳过（用于界面验收，生产不生效）
  const [fsCover, setFsCover] = useState<FsCover>(() => {
    if (process.env.NODE_ENV !== 'production') {
      try { if (typeof window !== 'undefined' && window.location.search.includes('fs=skip')) return null; } catch { /* ignore */ }
    }
    return 'greet';
  });
  const [switchCount, setSwitchCount] = useState(0);
  const [feCount, setFeCount] = useState(0);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warned, setWarned] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [activeQId, setActiveQId] = useState<number | null>(null);

  const answersRef = useRef(answers);
  const configRef = useRef<ProctorConfig>({});
  const switchRef = useRef(0);
  const feRef = useRef(0);
  const warnedRef = useRef(false);
  const submittedRef = useRef(false);
  const enteredFsRef = useRef(false);
  const markedRef = useRef(marked);
  const activeQRef = useRef<number | null>(null);
  useEffect(() => { markedRef.current = marked; }, [marked]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { configRef.current = data?.proctor_config ?? {}; }, [data]);
  useEffect(() => { switchRef.current = switchCount; }, [switchCount]);
  useEffect(() => { feRef.current = feCount; }, [feCount]);
  useEffect(() => { warnedRef.current = warned; }, [warned]);
  useEffect(() => { activeQRef.current = activeQId; }, [activeQId]);

  const cfg = useMemo<ProctorConfig>(() => data?.proctor_config ?? {}, [data]);

  const exitFullscreen = () => {
    try { (document as any).exitFullscreen?.().catch?.(() => {}); } catch { /* ignore */ }
  };

  // 自动保存
  const saveAnswers = useCallback(async () => {
    if (!data || submittedRef.current) return;
    const body = data.paper.map((p) => {
      const v = answersRef.current[p.id] ?? '';
      // 简答/论述富文本提交前白名单清洗，编程代码(含<号)不受影响
      const cleaned = (p.question_type === 'short_answer' || p.question_type === 'essay') ? sanitizeRichHTML(v) : v;
      return { question_id: p.id, student_answer: cleaned, marked: markedRef.current[p.id] ?? false };
    });
    try { const r = await apiFetch(`/api/student/exams/${id}/answer`, { method: 'POST', body: JSON.stringify({ answers: body }) }); if (r.ok) setLastSavedAt(new Date().toLocaleTimeString()); } catch {}
  }, [data, id]);

  // 自动交卷（到点 / 多次退全屏）
  const autoSubmit = useCallback(async (via: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setFsCover(null); // 确定为自动交卷，放行
    await saveAnswers();
    let submittedOk = false;
    try { const res = await apiFetch(`/api/student/exams/${id}/submit`, { method: 'POST' }); submittedOk = res.ok; } catch { submittedOk = false; }
    if (!submittedOk) {
      // 交卷失败：复位门控与遮罩，让学生可重试，绝不误报「已交卷」
      submittedRef.current = false;
      setSubmitting(false);
      toast.error('自动交卷失败，请重试');
      exitFullscreen();
      return;
    }
    setAutoSubmitted(true); setShowSubmit(true);
    setSubmitting(false);
    exitFullscreen();
  }, [id, saveAnswers]);

  // ── 定时：倒计时 → 到点自动交卷 ──
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const ms = new Date(data.exam.deadline).getTime() - Date.now();
      if (ms <= 0) { setRemaining(0); autoSubmit('exceed'); return; }
      setRemaining(Math.floor(ms / 1000));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const logEvent = useCallback((type: string, severity: string, detail: Record<string, unknown>) => {
    apiFetch(`/api/student/exams/${id}/proctor`, { method: 'POST', body: JSON.stringify({ events: [{ type, severity, detail }], switch_count: switchRef.current, fullscreen_exit_count: feRef.current }) }).catch(() => {});
  }, [id]);

  // ── 全屏控制：进入即自动全屏（首次手势触发），提交前禁止退出 ──
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement as any;
    try {
      const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
      if (p?.catch) p.catch(() => {});
    } catch { /* 浏览器策略拒绝则保留遮罩等待再次点击 */ }
  }, []);

  // 首次进入：任一用户手势触发全屏
  useEffect(() => {
    if (!data || submittedRef.current) return;
    const onGesture = (e: Event) => {
      // 仅当内容区被遮罩挡住时抢全屏（greet / locked）
      e.preventDefault();
      enterFullscreen();
    };
    document.addEventListener('pointerdown', onGesture, { once: true });
    document.addEventListener('keydown', onGesture, { once: true });
    return () => {
      document.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('keydown', onGesture);
    };
  }, [data, enterFullscreen]);

  const onFsChange = useCallback(() => {
    const isFull = document.fullscreenElement != null;
    setFsState(isFull ? 'full' : 'mini');
    if (isFull) { // 全屏成功 → 放行内容
      enteredFsRef.current = true;
      setFsCover(null);
      return;
    }
    // 退全屏（未交卷）
    if (data && !submittedRef.current && enteredFsRef.current) {
      feRef.current += 1;
      setFeCount(feRef.current);
      logEvent('fullscreen_exit', feRef.current >= (cfg?.max_switch ?? 3) ? 'red' : 'warn', { count: feRef.current });
      setFsCover('locked');
      setWarned(true);
      if (feRef.current >= (cfg?.max_switch ?? 3)) {
        toast.error('已多次退出全屏，触发自动交卷');
        autoSubmit('cheat');
      }
    }
  }, [data, cfg, logEvent, autoSubmit]);

  const onVisChange = useCallback(() => {
    if (document.hidden && data && !submittedRef.current) {
      switchRef.current += 1;
      setSwitchCount(switchRef.current);
      logEvent('switch_away', switchRef.current >= (cfg?.max_switch ?? 3) ? 'red' : 'warn', {});
    }
  }, [data, cfg, logEvent]);

  // 快捷键拦截 + 客观题键盘作答
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (cfg?.disable_devtools) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key.toLowerCase() === 'u')) {
        e.preventDefault(); e.stopPropagation();
        switchRef.current += 1; setSwitchCount(switchRef.current);
        logEvent('devtools', 'red', { key: e.key }); return;
      }
    }
    if (cfg?.disable_copy && ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c')) { e.preventDefault(); logEvent('copy', 'warn', {}); }
    if (cfg?.disable_paste && ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v')) { e.preventDefault(); logEvent('paste', 'warn', {}); }
    if (cfg?.disable_zoom && ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key))) e.preventDefault();

    // 客观题键盘作答（避免与输入冲突）
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!data) return;
    const qid = activeQRef.current;
    if (!qid) return;
    const q = data.questions.find((x) => x.id === qid);
    if (!q) return;
    if (isSubjective(q.question_type) || q.question_type === 'judgment' || q.question_type === 'fill_blank') return;
    const target = (q.options || []).find((o) => o.key === e.key.toUpperCase());
    if (!target) return;
    e.preventDefault();
    setAnswers((p) => {
      const cur = (p[q.id] ?? '').split(',').filter(Boolean);
      if (isMultiQ(q.question_type)) {
        const next = cur.includes(target.key) ? cur.filter((k) => k !== target.key) : [...cur, target.key];
        return { ...p, [q.id]: next.join(',') };
      }
      return { ...p, [q.id]: target.key };
    });
  }, [cfg, data, logEvent]);

  useEffect(() => {
    const onCtx = (e: Event) => { if (cfg?.disable_devtools) e.preventDefault(); };
    const onResize = () => { if (cfg?.disable_zoom) logEvent('resize', 'warn', {}); };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onCtx);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('contextmenu', onCtx); window.removeEventListener('resize', onResize); };
  }, [onKeyDown, cfg, logEvent]);

  // ── 自动保存定时 + 心跳 ──
  const saveTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const systolicRef = useRef(0);
  useEffect(() => {
    if (!data) return;
    saveTimer.current = setInterval(saveAnswers, 15000);
    const hb = (cfg?.heartbeat_seconds ?? 15) * 1000;
    heartbeatTimer.current = setInterval(async () => {
      systolicRef.current += 1;
      try {
        const r = await apiFetch(`/api/student/exams/${id}/proctor`, { method: 'POST', body: JSON.stringify({ events: [{ type: 'heartbeat' }], switch_count: switchRef.current, fullscreen_exit_count: feRef.current }) });
        const j = await r.json();
        if (j?.auto_submitted) { setAutoSubmitted(true); setShowSubmit(true); }
      } catch {}
    }, hb);
    return () => { clearInterval(saveTimer.current); clearInterval(heartbeatTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const beforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (submittedRef.current) return;
    saveAnswers();
    e.preventDefault(); e.returnValue = '';
  }, [saveAnswers]);

  // 全屏变化 + 可见性监听
  useEffect(() => {
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { document.removeEventListener('fullscreenchange', onFsChange); document.removeEventListener('visibilitychange', onVisChange); window.removeEventListener('beforeunload', beforeUnload); };
  }, [onFsChange, onVisChange, beforeUnload]);

  // ── 加载数据 + 续考恢复 ──
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'student') { window.location.href = '/'; return; }
    const load = async () => {
      try {
        const res = await apiFetch(`/api/student/exams/${id}/take`);
        const j = await res.json();
        if (j.already_submitted) { window.location.href = `/student/exams/${id}/result`; return; }
        if (!res.ok) { toast.error(j.error || '加载失败'); router.push('/student/exams'); return; }
        setData(j);
        const a: Record<number, string> = {}; const m: Record<number, boolean> = {};
        (j.answers || []).forEach((x: RestoredAnswer) => { a[x.question_id] = x.student_answer || ''; if (x.marked) m[x.question_id] = true; });
        setAnswers(a); setMarked(m);
        setRestored(true);
      } catch { toast.error('网络异常'); }
      setLoading(false);
    };
    load();
  }, [id, user, authLoading]);

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setFsCover(null);
    await saveAnswers();
    try {
      const res = await apiFetch(`/api/student/exams/${id}/submit`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '交卷失败'); submittedRef.current = false; setSubmitting(false); setFsCover(enteredFsRef.current ? 'locked' : 'greet'); return; }
      setAutoSubmitted(true);
      setShowSubmit(true);
    } catch { toast.error('网络异常'); submittedRef.current = false; }
    setSubmitting(false);
  };

  const answeredCount = useMemo(() => data ? data.paper.filter((p) => (answers[p.id] ?? '').trim()).length : 0, [data, answers]);
  const markedCount = useMemo(() => data ? data.paper.filter((p) => marked[p.id]).length : 0, [data, marked]);

  // 题目分区：客观题区在上、主观题区在下；区内按题型连续排列（统一顺序，来自 question-order）
  const sections = useMemo(() => {
    if (!data) return [];
    return groupQuestionsBySection(data.paper.map((p) => ({ ...p })));
  }, [data]);
  // 连续题号（客观题1..N，主观题N+1..M）
  const displayNum = useMemo(() => {
    const map: Record<number, number> = {};
    let n = 1;
    for (const s of sections) for (const it of s.items) map[it.id] = n++;
    return map;
  }, [sections]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-violet-600" /></div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-slate-400">考试不存在或已结束</div>;

  const qById = new Map(data.questions.map((q) => [q.id, q]));
  const deadlineStr = formatClock(remaining ?? 0);
  const danger = (remaining ?? 0) <= 60;
  const watermarkKey = `s${data.student.username}-${data.attempt.id}`;

  // 客观题选项渲染
  const renderOptions = (q: QuestionItem) => {
    const opts = q.options || [];
    const paper = data.paper.find((p) => p.id === q.id);
    const order = paper?.optionLayout && paper.optionLayout.length ? paper.optionLayout : opts.map((o) => o.key);
    const display = order.map((k) => opts.find((o) => o.key === k)).filter(Boolean) as QOpt[];
    const isMulti = isMultiQ(q.question_type);

    if (q.question_type === 'judgment' && opts.length === 0) {
      return ['正确', '错误'].map((val) => {
        const sel = (answers[q.id] ?? '') === val;
        const Ok = val === '正确';
        return (
          <button key={val} type="button" onClick={() => setAnswers((p) => ({ ...p, [q.id]: val }))}
            className={`px-5 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${sel ? (Ok ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm') : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm'}`}>
            {Ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}{val}
          </button>
        );
      });
    }
    const cur = (answers[q.id] ?? '').split(',').filter(Boolean);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {display.map((o, i) => {
          const sel = isMulti ? cur.includes(o.key) : (answers[q.id] ?? '') === o.key;
          const letter = o.key;
          return (
            <button key={o.key} type="button"
              onClick={() => setAnswers((p) => {
                if (isMulti) {
                  const c = cur;
                  const next = c.includes(o.key) ? c.filter((k) => k !== o.key) : [...c, o.key];
                  return { ...p, [q.id]: next.join(',') };
                }
                return { ...p, [q.id]: o.key };
              })}
              className={`group flex items-center gap-3 p-3.5 rounded-xl border text-left text-sm transition-all ${sel ? 'border-violet-500 bg-violet-50 text-violet-800 shadow-sm' : 'border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/40'}`}>
              <span className={`w-7 h-7 rounded-lg grid place-items-center text-xs font-bold shrink-0 transition-colors ${sel ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-violet-100 group-hover:text-violet-600'}`}>{letter}</span>
              <span className="flex-1 min-w-0 whitespace-pre-wrap">{o.text}</span>
              {sel && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    );
  };

  // 主观题作答组件
  const renderSubjective = (q: QuestionItem) => {
    if (isProgramming(q.question_type)) {
      return (
        <div className="rounded-xl overflow-hidden border border-slate-200">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-100 text-xs">
            <CornerDownRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>{q.question_type === 'programming' ? 'Python' : '代码'} · 代码编辑器</span>
            <span className="ml-auto text-slate-400">支持行号 / Tab 缩进 / 语法高亮</span>
          </div>
          <CodeMirror
            value={answers[q.id] ?? ''}
            height="280px"
            extensions={[python()]}
            onChange={(val) => setAnswers((p) => ({ ...p, [q.id]: val }))}
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, indentOnInput: true, autocompletion: false }}
          />
        </div>
      );
    }
    // 简答 / 论述：富文本作答（对齐作业组件，支持加粗/代码块/公式/表格/图片上传）
    const isEssay = q.question_type === 'essay';
    const wc = htmlToPlainText(answers[q.id] ?? '').replace(/\s/g, '').length;
    return (
      <div>
        <RichAnswer
          value={answers[q.id] ?? ''}
          onChange={(html) => setAnswers((p) => ({ ...p, [q.id]: html }))}
          placeholder={isEssay ? '请围绕要点展开论述，支持加粗、代码块、公式（$..$）与图片上传…' : '请输入答案，支持加粗、代码块、公式（$..$）与图片上传…'}
        />
        <div className="flex items-center justify-end mt-1.5">
          <span className={`text-xs ${wc === 0 ? 'text-slate-300' : wc >= (isEssay ? 300 : 200) ? 'text-emerald-600' : 'text-slate-400'}`}>
            已输入 {wc} 字
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100" style={{ pointerEvents: submitting ? 'none' : undefined }}>
      {/* 考生信息水印（防截图分享） */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden opacity-40" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="absolute whitespace-nowrap select-none text-slate-500/15 font-mono text-xs -rotate-[28deg]"
            style={{ left: `${(i * 23) % 100}%`, top: `${(i * 37) % 90}%` }}>
            {data.student.real_name} · {data.student.username} · {watermarkKey}
          </div>
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={'b' + i} className="absolute whitespace-nowrap select-none text-slate-500/10 font-mono text-[10px] -rotate-[28deg]"
            style={{ left: `${(i * 41 + 9) % 100}%`, top: `${(i * 53 + 4) % 90}%` }}>
            {data.exam.title}
          </div>
        ))}
      </div>

      {/* 顶部工具条 */}
      <header className={`sticky top-0 z-40 ${fsState === 'full' ? 'bg-slate-900/95 text-white' : 'bg-white/90 backdrop-blur'} border-b flex items-center justify-between px-4 md:px-6 py-2.5`}>
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-violet-600 shrink-0" />
          <span className="font-semibold truncate">{data.exam.title}</span>
          <Badge className={`hidden sm:inline-flex ${fsState === 'full' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}>{data.exam.course_name}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {fsState === 'full' ? (
            <span className="hidden md:flex items-center gap-1 text-xs text-emerald-400"><Lock className="w-3.5 h-3.5" />防作弊锁定 · 禁止退出全屏</span>
          ) : (
            <span className="hidden md:flex items-center gap-1 text-xs text-red-500"><ShieldAlert className="w-3.5 h-3.5" />未全屏答题</span>
          )}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${danger ? 'bg-red-50 text-red-600' : fsState === 'full' ? 'bg-white/10 text-white' : 'bg-teal-50 text-teal-700'}`}>
            <Clock className="w-4 h-4" />
            <span className="font-mono text-base font-bold tabular-nums">{deadlineStr}</span>
          </div>
          <Badge className={`italic ${fsState === 'full' ? 'bg-white/10 text-white' : 'bg-violet-100 text-violet-700'}`}>
            <Eye className="w-3 h-3 mr-1" />{data.student.real_name}
          </Badge>
        </div>
      </header>

      {remaining === 0 && (
        <div className="px-4 py-2 bg-red-600 text-white text-sm text-center z-40 relative">考试时间已到，正在自动交卷…</div>
      )}

      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-5 px-4 md:px-6 py-5 relative z-10">
        {/* 题目区 */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />已启用防作弊：切屏/退全屏 {switchCount + feCount} 次（超 {cfg?.max_switch ?? 3} 次自动交卷）
            {warned && <span className="text-red-500 font-medium">· 已退出全屏 {feCount} 次！</span>}
            <span className="hidden md:inline-flex items-center gap-1"><Keyboard className="w-3 h-3" />客观题按 A~D 直接作答</span>
            {lastSavedAt && <span className="ml-auto whitespace-nowrap">自动保存于 {lastSavedAt}</span>}
          </div>
          {sections.map((sec) => {
            const secScore = sec.items.reduce((s, it) => s + (qById.get(it.id)?.full_score ?? 0), 0);
            return (
              <div key={sec.key} className="space-y-4">
                <div className="flex items-center gap-2 pt-1">
                  <div className={`w-1.5 h-5 rounded-full ${sec.key === 'objective' ? 'bg-violet-500' : 'bg-teal-500'}`} />
                  <span className="font-semibold text-slate-800">{sec.title}</span>
                  <span className="text-xs text-slate-400">{sec.items.length}题 · 共{secScore}分</span>
                  <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full ${sec.key === 'objective' ? 'bg-violet-50 text-violet-600' : 'bg-teal-50 text-teal-600'}`}>
                    {sec.key === 'objective' ? '系统自动评分' : '教师批改'}
                  </span>
                </div>
                {sec.items.map((p) => {
                  const q = qById.get(p.id);
                  if (!q) return null;
                  const isActive = activeQId === p.id;
                  return (
                    <Card key={p.id} id={`exam-q-${p.id}`}
                      onClick={() => setActiveQId(p.id)}
                      className={`border-slate-200/60 shadow-sm scroll-mt-16 transition-all ${isActive ? 'ring-2 ring-violet-300 border-violet-400' : 'hover:shadow-md'}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                            <div className={`w-8 h-8 rounded-lg text-white text-sm font-bold flex items-center justify-center ${sec.key === 'objective' ? 'bg-gradient-to-br from-violet-500 to-indigo-500' : 'bg-gradient-to-br from-teal-500 to-emerald-500'}`}>{displayNum[p.id]}</div>
                            {isActive && <span className="text-[9px] text-violet-500 font-medium">当前</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge>
                              <span className="text-xs text-slate-400">{(q.full_score ?? 0) % 1 === 0 ? q.full_score : q.full_score.toFixed(1)}分</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setMarked((p2) => ({ ...p2, [q.id]: !p2[q.id] })); }}
                                className={`ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${marked[q.id] ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-amber-600'}`}>
                                <Flag className="w-3.5 h-3.5" />{marked[q.id] ? '已标记' : '标记'}
                              </button>
                            </div>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap mb-4 leading-relaxed">{q.content}</p>
                            {q.question_type === 'fill_blank' ? (
                              <input
                                className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                                placeholder="请输入答案…" value={answers[q.id] ?? ''}
                                onChange={(e) => setAnswers((p2) => ({ ...p2, [q.id]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : isSubjective(q.question_type) ? (
                              renderSubjective(q)
                            ) : (
                              renderOptions(q)
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 右侧答题卡（吸顶） */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Card className="border-slate-200/60 shadow-sm sticky top-20 bg-white/95">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-semibold text-slate-700">答题卡</span>
                </div>
                <span className="text-xs text-slate-400">{answeredCount}/{data.paper.length}</span>
              </div>
              {sections.map((sec) => (
                <div key={sec.key} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between px-0.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-3.5 rounded-full ${sec.key === 'objective' ? 'bg-violet-400' : 'bg-teal-400'}`} />
                      <span className="text-[11px] font-medium text-slate-500">{sec.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{sec.items.length}题</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {sec.items.map((p) => {
                      const filled = (answers[p.id] ?? '').trim().length > 0;
                      const marks = marked[p.id];
                      let cls = sec.key === 'objective'
                        ? (filled ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-400 border-slate-200')
                        : (filled ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-400 border-slate-200');
                      if (marks) cls = 'bg-amber-100 text-amber-700 border-amber-200';
                      return (
                        <button key={p.id} type="button" onClick={() => document.getElementById(`exam-q-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className={`aspect-square w-full rounded-md border text-xs font-bold flex items-center justify-center relative transition-transform hover:scale-105 ${cls}`} title={`第${displayNum[p.id]}题`}>
                          {displayNum[p.id]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {markedCount > 0 && <p className="text-[11px] text-amber-600 mb-1">· 标记 {markedCount} 题</p>}
              <div className="mt-3 space-y-2">
                <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-500 to-teal-500" style={{ width: `${data.paper.length ? (answeredCount / data.paper.length) * 100 : 0}%` }} /></div>
                <p className="text-xs text-slate-400">进度 {Math.round(data.paper.length ? (answeredCount / data.paper.length) * 100 : 0)}%</p>
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200" onClick={() => setShowSubmit(true)}><Send className="w-4 h-4 mr-1.5" />交卷</Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* 移动端底部提交 */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t p-3 flex items-center justify-between z-40">
        <span className="text-xs text-slate-400">已作答 {answeredCount}/{data.paper.length}</span>
        <Button className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={() => setShowSubmit(true)}><Send className="w-4 h-4 mr-1.5" />交卷</Button>
      </div>

      {/* 防作弊警示横幅 */}
      {warned && feCount > 0 && (
        <div className="fixed inset-x-0 top-14 z-50 flex justify-center px-4">
          <div className="bg-red-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">检测到退出全屏（第{feCount}次），已拉回全屏，超 {cfg?.max_switch ?? 3} 次自动交卷</div>
        </div>
      )}

      {/* 全屏拦截图：未全屏时挡住内容，强制进入全屏 */}
      {fsCover === 'greet' && (
        <div onClick={enterFullscreen} className="fixed inset-0 z-[60] bg-gradient-to-br from-slate-900 via-slate-800 to-violet-900 flex flex-col items-center justify-center text-center px-6 cursor-pointer">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur grid place-items-center mb-6">
            <Maximize2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">进入全屏考试环境</h1>
          <p className="text-slate-300 text-sm max-w-md mb-2">为保障考试安全，进入后系统将锁定为全屏模式，<span className="text-red-400 font-medium">禁止退出全屏</span>，仅交卷后解锁。</p>
          <p className="text-slate-400 text-xs mb-8">考试期间退出全屏将被记录，达到上限自动交卷。</p>
          <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 px-10"><Maximize2 className="w-5 h-5 mr-2" />点击开始全屏考试</Button>
        </div>
      )}
      {fsCover === 'locked' && (
        <div onClick={enterFullscreen} className="fixed inset-0 z-[60] bg-gradient-to-br from-red-950 via-red-900 to-red-950 flex flex-col items-center justify-center text-center px-6 cursor-pointer">
          <div className="w-20 h-20 rounded-2xl bg-red-500/20 backdrop-blur grid place-items-center mb-6">
            <ShieldAlert className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">已退出全屏！</h1>
          <p className="text-red-300 text-sm max-w-md mb-2">系统已记录本次退出（第 {feCount} 次）。请立即返回全屏继续考试。</p>
          <p className="text-slate-400 text-xs mb-8">退出超过 {cfg?.max_switch ?? 3} 次将自动交卷，本次成绩可能判为异常。</p>
          <Button size="lg" className="bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 px-10"><Maximize2 className="w-5 h-5 mr-2" />返回全屏继续答题</Button>
        </div>
      )}

      {/* 交卷确认 / 结果弹窗 */}
      <AlertDialog open={showSubmit} onOpenChange={(o) => !submitting && setShowSubmit(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{autoSubmitted ? '考试已提交' : '确认交卷？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {autoSubmitted
                ? '你的作答已成功提交，现在可以安全离开考卷。'
                : `你还有 ${data.paper.length - answeredCount} 题未作答${markedCount ? `，其中 ${markedCount} 题已标记` : ''}。确定现在交卷吗？交卷后作答将被锁定并退出全屏。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!autoSubmitted && <AlertDialogCancel disabled={submitting}>继续作答</AlertDialogCancel>}
            {!autoSubmitted && (
            <AlertDialogAction asChild>
              <Button className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}{submitting ? '提交中…' : '确认交卷'}
              </Button>
            </AlertDialogAction>
            )}
            {autoSubmitted && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.href = '/student/exams'}>返回考试列表</Button>
                <Button className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={() => window.location.href = `/student/exams/${id}/result`}>查看成绩</Button>
              </div>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
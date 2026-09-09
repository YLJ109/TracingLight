'use client';
import RichContent from '@/components/rich-content';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookMarked, CheckCircle2, RotateCcw, Sparkles, Loader2, Brain, ChevronDown, ChevronUp, Download, Filter, X, Dumbbell, FileText, Eye } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-helper';
import { exportCsv } from '@/lib/export-utils';

// 间隔复习：是否已到期（next_review_at <= 现在）
const isDue = (next: string | null) => !!next && new Date(next.replace(' ', 'T')).getTime() <= Date.now();

const errorTypeLabels: Record<string, string> = {
  knowledge: '知识缺失',
  logic: '逻辑错误',
  logic_error: '逻辑错误',
  expression: '表达问题',
  careless: '粗心大意',
  concept_confusion: '概念混淆',
  method_error: '方法错误',
  calculation: '计算错误',
  calculation_error: '计算错误',
  incomplete: '未答完整',
  wrong: '答案错误',
  step_missing: '步骤缺失',
  method_unknown: '方法不会',
  knowledge_missing: '知识缺失',
  knowledge_gap: '知识盲区',
  empty: '未作答',
  other: '其他',
  practice: '练习错题',
};
const questionTypeLabels: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  multi_choice: '多选题',
  fill_blank: '填空题',
  judgment: '判断题',
  code: '编程题',
  short_answer: '简答题',
  attachment: '实验题',
};
const ALL_QUESTION_TYPES = ['single_choice', 'multiple_choice', 'fill_blank', 'judgment', 'code', 'attachment'];

/** 选项展示归一化：兼容「字符串」与「{label,key,text,isCorrect}」两种存法，避免把对象当 React 子元素渲染 */
function optText(opt: unknown, index: number): string {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'object') {
    const o = opt as { label?: string; key?: string; text?: string };
    const label = o.label || o.key || String.fromCharCode(65 + index);
    const text = o.text ?? '';
    return text ? `${label}. ${text}` : (o.label || '');
  }
  return String(opt);
}

interface AIAnalysisResult {
  error_analysis: string;
  knowledge_explanation: string;
  similar_questions: Array<{
    content: string;
    options: string[] | null;
    answer: string;
    analysis: string;
  }>;
  learning_suggestion: string;
}

interface ErrorItem {
  id: number;
  question_id: number;
  knowledge_point_id: number;
  assignment_id: number;
  student_answer: string;
  correct_answer: string;
  error_type: string;
  error_analysis: string;
  review_status: string;
  next_review_at: string | null;
  review_count: number;
  question_content: string;
  question_type: string;
  question_options: string[] | null;
  knowledge_point_name: string;
  course_name: string;
  course_id: number | null;
  assignment_title: string;   // 来源作业名
  question_no: number | null; // 在该作业中的题号（第几题）
  aiAnalysis: AIAnalysisResult | null;
}

export default function StudentErrors() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const kpIdFromQuery = searchParams.get('knowledge_point_id') || searchParams.get('kp_id');
  const courseIdFromQuery = searchParams.get('course_id');
  const [mounted, setMounted] = useState(false);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [kpFilterName, setKpFilterName] = useState('');
  const [toast, setToast] = useState<{ message: string; kpName: string } | null>(null);

  // ===== P1-2：举一反三即时练习 =====
  const [practice, setPractice] = useState<{
    loading: boolean;
    errorId: number | null;
    kpId: number | null;
    kpName: string;
    practiceId: string;
    step: number;
    questions: Array<{ index: number; content: string; question_type: string; difficulty: string; options: Record<string, string> | null; default_score: number }>;
    answers: Record<number, string>;
    result: {
      results: Array<{ index: number; total_score: number; full_score: number; is_correct: boolean; comment: string; correct_answer: string; analysis: string }>;
      correct_count: number;
      total: number;
      score_percent: number;
    } | null;
    error: string;
  } | null>(null);

  // 举一反三缓存：同一道错题生成过一次后，后续打开直接复用，不重复调用 AI 出题
  const practiceCacheRef = useRef<Map<number, {
    kpId: number | null; kpName: string; practiceId: string;
    questions: typeof practice extends null ? never : NonNullable<typeof practice>['questions'];
    answers: Record<number, string>; result: NonNullable<typeof practice>['result']; error: string;
  }>>(new Map());
  const [cachedPracticeIds, setCachedPracticeIds] = useState<Set<number>>(new Set());

  const startPractice = async (err: ErrorItem) => {
    const cached = practiceCacheRef.current.get(err.id);
    if (cached) {
      setPractice({ loading: false, errorId: err.id, kpId: cached.kpId, kpName: cached.kpName, practiceId: cached.practiceId, step: 0, questions: cached.questions, answers: cached.answers, result: cached.result, error: cached.error });
      return;
    }
    setPractice({ loading: true, errorId: err.id, kpId: err.knowledge_point_id, kpName: err.knowledge_point_name, practiceId: '', step: 0, questions: [], answers: {}, result: null, error: '' });
    try {
      const res = await apiFetch('/api/student/practice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_book_id: err.id }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || '生成失败');
      const entry = { kpId: err.knowledge_point_id, kpName: err.knowledge_point_name, practiceId: d.data.practice_id, questions: d.data.questions, answers: {}, result: null, error: '' };
      practiceCacheRef.current.set(err.id, entry);
      setCachedPracticeIds((prev) => new Set(prev).add(err.id));
      setPractice((p) => p ? { ...p, loading: false, practiceId: d.data.practice_id, questions: d.data.questions, step: 0 } : p);
    } catch (e) {
      const errMsg = (e as Error).message || 'AI 出题失败，请稍后重试';
      practiceCacheRef.current.set(err.id, { kpId: err.knowledge_point_id, kpName: err.knowledge_point_name, practiceId: '', questions: [], answers: {}, result: null, error: errMsg });
      setPractice((p) => p ? { ...p, loading: false, error: errMsg } : p);
    }
  };

  const submitPractice = async (kpId: number | null) => {
    if (!practice) return;
    try {
      const res = await apiFetch('/api/student/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practice_id: practice.practiceId,
          knowledge_point_id: kpId,
          answers: practice.questions.map((q) => ({ index: q.index, student_answer: practice.answers[q.index] || '' })),
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || '提交失败');
      setPractice((p) => p ? { ...p, result: d.data } : p);
      // 结果写回缓存，下次打开该错题的举一反三直接显示结果，不再重新出题
      if (practice.errorId != null) {
        const cur = practiceCacheRef.current.get(practice.errorId);
        if (cur) practiceCacheRef.current.set(practice.errorId, { ...cur, result: d.data });
      }
    } catch (e) {
      setPractice((p) => p ? { ...p, error: (e as Error).message || '提交失败' } : p);
    }
  };

  // ─── Data loading via apiFetch ───
  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        const studentId = String(user?.id || 3);
        let url = `/api/student/errors?student_id=${studentId}`;
        if (kpIdFromQuery) url += `&kp_id=${kpIdFromQuery}`;
        if (courseIdFromQuery) url += `&course_id=${courseIdFromQuery}`;
        apiFetch(url)
          .then(r => r.json())
          .then(data => {
            if (cancelled) return;
            if (data.success) {
              const mapped = data.data.map((e: Record<string, unknown>) => {
                // Safe parse: question_options comes as JSON string from API
                let qOpts = (e as any).question_options;
                if (typeof qOpts === 'string') { try { qOpts = JSON.parse(qOpts); } catch { qOpts = null; } }
                return { ...e, aiAnalysis: null, question_options: Array.isArray(qOpts) ? qOpts : null };
              }) as ErrorItem[];
              setErrors(mapped);
              if (mapped.length > 0 && kpIdFromQuery) {
                setKpFilterName(mapped[0].knowledge_point_name);
              }
            }
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoading(false); });
      })
      .catch(() => {
        // 登录态获取失败也要终止加载态，避免页面卡在 spinner（黑屏样式的常见成因）
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [kpIdFromQuery]);

  // 自测模式：默认隐藏答案/解析，点击后再显示，形成「先回忆后核对」的复习体验
  const [practiceMode, setPracticeMode] = useState(false);
  const [revealedId, setRevealedId] = useState<number | null>(null);

  // Toast auto-dismiss — must be before any early return
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  const handleCompleteReview = async (errorId: number) => {
    try {
      const res = await apiFetch('/api/student/errors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_id: errorId, review_status: 'reviewing' }),
      });
      const d = await res.json();
      if (d.success) {
        if (d.data?.status === 'mastered') {
          setErrors(prev => prev.map(e => e.id === errorId ? { ...e, review_status: 'mastered', next_review_at: null } : e));
          const err = errors.find((e) => e.id === errorId);
          if (err) setToast({ message: '第三次复习完成，已自动标记为掌握！', kpName: err.knowledge_point_name });
        } else {
          setErrors(prev => prev.map(e => e.id === errorId ? { ...e, review_count: (e.review_count || 0) + 1, next_review_at: new Date(Date.now() + ((e.review_count || 0) === 0 ? 3 : 7) * 86400000).toISOString().slice(0, 19).replace('T', ' ') } : e));
          const err = errors.find((e) => e.id === errorId);
          if (err) setToast({ message: '本次复习完成，下次复习已按间隔排期', kpName: err.knowledge_point_name });
        }
      } else {
        setToast({ message: d.error || '操作失败', kpName: '' });
      }
    } catch {
      setToast({ message: '网络错误，请稍后重试', kpName: '' });
    }
  };

  const handleMarkMastered = async (errorId: number) => {
    try {
      await apiFetch('/api/student/errors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_id: errorId, review_status: 'mastered' }),
      });
      setErrors(prev => prev.map(e => e.id === errorId ? { ...e, review_status: 'mastered' } : e));
      // Show toast
      const err = errors.find(e => e.id === errorId);
      if (err) setToast({ message: '已掌握！该错题已归档至掌握列表', kpName: err.knowledge_point_name });
    } catch {}
  };

  const handleAIAnalysis = useCallback(async (errorId: number) => {
    setAnalyzingId(errorId);
    setExpandedId(errorId);
    try {
      const err = errors.find((e) => e.id === errorId);
      if (!err) return;
      const res = await apiFetch('/api/ai/analyze-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_book_id: errorId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setErrors((prev) =>
            prev.map((e) =>
              e.id === errorId ? { ...e, aiAnalysis: data.data as AIAnalysisResult, error_analysis: data.data.error_analysis } : e
            )
          );
          return;
        }
      } else {
        // 503：AI 服务未配置 → 弹窗引导到管理端配置
        const errData = await res.json().catch(() => null);
        if (errData && errData.code === 'AI_NOT_CONFIGURED') {
          setToast({ message: errData.error, kpName: 'AI 服务配置' });
          setAnalyzingId(null);
          return;
        }
      }
      // Fallback
      const e = errors.find((e2) => e2.id === errorId);
      if (e) {
        setErrors((prev) =>
          prev.map((e2) =>
            e2.id === errorId
              ? { ...e2, error_analysis: `你在「${e2.knowledge_point_name}」知识点上存在${errorTypeLabels[e2.error_type] || e2.error_type}。正确答案是"${e2.correct_answer}"，建议重新复习核心概念。` }
              : e2
          )
        );
      }
    } catch {
      const e = errors.find((e2) => e2.id === errorId);
      if (e) {
        setErrors((prev) =>
          prev.map((e2) =>
            e2.id === errorId
              ? { ...e2, error_analysis: `你在「${e2.knowledge_point_name}」知识点上存在${errorTypeLabels[e2.error_type] || e2.error_type}。正确答案是"${e2.correct_answer}"，建议重新复习核心概念。` }
              : e2
          )
        );
      }
    } finally {
      setAnalyzingId(null);
    }
  }, [errors]);

  // 错因分布（用于概览统计卡）——必须在任何 early return 之前声明（hook 顺序稳定性）
  const errorTypeDist = useMemo(() => {
    const m = new Map<string, number>();
    errors.forEach((e) => { const k = errorTypeLabels[e.error_type] || '其他'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, count]) => ({ name, count, pct: errors.length ? count / errors.length * 100 : 0 })).sort((a, b) => b.count - a.count);
  }, [errors]);

  if (!mounted) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const pending = errors.filter((e) => e.review_status !== 'mastered');
  const mastered = errors.filter((e) => e.review_status === 'mastered');
  const dueCount = pending.filter((e: ErrorItem) => Boolean((e as any).due ?? isDue(e.next_review_at))).length;
  const courses = Array.from(new Set(errors.map(e => (e as any).course_name || '未知').filter(Boolean)));
  // Course-filtered subsets for each tab
  const filterByCourse = (list: ErrorItem[]) => {
    let filtered = filterCourse === 'all' ? list : list.filter(e => (e as any).course_name === filterCourse);
    if (filterType !== 'all') filtered = filtered.filter(e => e.question_type === filterType);
    return filtered;
  };
  const filteredPending = filterByCourse(pending);
  const filteredMastered = filterByCourse(mastered);
  const filteredAll = filterByCourse(errors);

  const renderErrorCard = (err: ErrorItem) => (
    <Card key={err.id} className={`border-l-4 shadow-sm transition-all duration-200 hover:shadow-md py-0 ${
      err.aiAnalysis ? 'border-l-teal-400' : 'border-l-amber-400'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs bg-indigo-50 text-indigo-600">{err.course_name}</Badge>
            {err.assignment_title && (
              <Badge variant="outline" className="text-xs text-slate-600 border-slate-300 bg-white">
                <FileText className="w-3 h-3 mr-1 text-slate-400" />
                {err.assignment_title}
                {err.question_no != null && <span className="ml-1 text-slate-400">· 第 {err.question_no} 题</span>}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{err.knowledge_point_name}</Badge>
            <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">{errorTypeLabels[err.error_type] || '其他错误'}</Badge>
            <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">{questionTypeLabels[err.question_type] || '其他题型'}</Badge>
          </div>
          <div className="flex gap-2">
            {err.aiAnalysis ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                {expandedId === err.id ? <><ChevronUp className="w-3 h-3 mr-1" />收起解析</> : <><Sparkles className="w-3 h-3 mr-1" />查看 AI 解析</>}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                disabled={analyzingId !== null}
                onClick={() => handleAIAnalysis(err.id)}
              >
                {analyzingId === err.id ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 解析中...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" /> AI 深度解析</>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-xs border-slate-200 text-slate-600" title="在知识图谱中定位该知识点"
              onClick={() => router.push(`/student/knowledge-graph?focus_kp=${err.knowledge_point_id}&course_id=${err.course_id ?? ''}`)}>
              <Brain className="w-3 h-3 mr-1" /> 图谱定位
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}>
              {expandedId === err.id ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              {expandedId === err.id ? '收起' : '展开'}
            </Button>
            <Button size="sm" className="text-xs bg-teal-600 hover:bg-teal-700" onClick={() => startPractice(err)} title={cachedPracticeIds.has(err.id) ? '已生成，可直接查看，不会重复出题' : 'AI 生成 3 道变式题'}>
              <Dumbbell className="w-3 h-3 mr-1" /> {cachedPracticeIds.has(err.id) ? '查看练习' : '举一反三'}
            </Button>
            {err.review_status !== 'mastered' && isDue(err.next_review_at) && (
              <Button size="sm" className="text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleCompleteReview(err.id)}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> {err.review_count > 0 ? '完成复习（第' + ((err.review_count || 0) + 1) + '次）' : '完成复习'}
              </Button>
            )}
            {err.review_status !== 'mastered' && !isDue(err.next_review_at) && err.next_review_at && (
              <span className="text-xs text-slate-400 px-1">下次复习：{err.next_review_at.slice(5, 10)}</span>
            )}
            {err.review_status !== 'mastered' && (
              <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700" onClick={() => handleMarkMastered(err.id)}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> 标记掌握
              </Button>
            )}
          </div>
        </div>

        {/* Question */}
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-slate-500 mb-1">题目：</p>
          <RichContent content={err.question_content} className="text-sm text-slate-800" />
          {err.question_options && err.question_options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(err.question_options as unknown[]).map((opt, oi) => (
                <span key={oi} className="text-xs px-2 py-0.5 bg-white border rounded">{optText(opt, oi)}</span>
              ))}
            </div>
          )}
        </div>

        {/* 自测模式：先回忆后核对，隐藏答案/解析 */}
        {practiceMode && revealedId !== err.id ? (
          <div className="flex flex-col items-center gap-2 py-4 border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
            <p className="text-xs text-slate-400">自测模式：先在脑中回忆答案，再核对</p>
            <Button variant="outline" size="sm" className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setRevealedId(err.id)}>
              <Eye className="w-3 h-3 mr-1" /> 显示答案与解析
            </Button>
          </div>
        ) : (
          <>
        {/* Answer comparison */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-2 rounded bg-red-50 border border-red-100">
            <p className="text-xs text-red-500 mb-1">我的答案：</p>
            <RichContent content={err.student_answer || '未作答'} className="text-sm text-red-700 font-medium" />
          </div>
          <div className="p-2 rounded bg-green-50 border border-green-100">
            <p className="text-xs text-green-500 mb-1">正确答案：</p>
            <RichContent content={err.correct_answer} className="text-sm text-green-700 font-medium" />
          </div>
        </div>

        {/* Analysis */}
        {err.error_analysis && (
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-xs text-indigo-500 font-medium mb-1">解析：</p>
            <p className="text-sm text-indigo-800">{err.error_analysis}</p>
          </div>
        )}
          </>
        )}

        {/* AI Expanded */}
        {expandedId === err.id && err.aiAnalysis && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {err.aiAnalysis.knowledge_explanation && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-500 font-medium mb-1">知识点回顾：</p>
                <p className="text-sm text-purple-800">{err.aiAnalysis.knowledge_explanation}</p>
              </div>
            )}
            {err.aiAnalysis.learning_suggestion && (
              <div className="p-3 bg-teal-50 rounded-lg">
                <p className="text-xs text-teal-500 font-medium mb-1">学习建议：</p>
                <p className="text-sm text-teal-800">{err.aiAnalysis.learning_suggestion}</p>
              </div>
            )}
            {err.aiAnalysis.similar_questions && err.aiAnalysis.similar_questions.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-xs text-amber-500 font-medium mb-2">举一反三：</p>
                {err.aiAnalysis.similar_questions.map((sq, si) => (
                  <div key={si} className="mb-2 last:mb-0 p-2 bg-white rounded border border-amber-100">
                    <p className="text-sm text-slate-700">{sq.content}</p>
                    <p className="text-xs text-green-600 mt-1">答案：{sq.answer}</p>
                    {sq.analysis && <p className="text-xs text-slate-500 mt-0.5">{sq.analysis}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-up">
          <div className="flex items-center gap-3 bg-white border border-green-200 rounded-xl px-4 py-3 shadow-lg max-w-md">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-none" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 font-medium">{toast.message}</p>
              <p className="text-xs text-slate-400 mt-0.5">知识点：{toast.kpName}</p>
            </div>
            <button onClick={() => setToast(null)} className="p-1 rounded hover:bg-slate-100 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {kpIdFromQuery && kpFilterName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Filter className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs text-amber-700 font-medium">知识点: {kpFilterName}</span>
              <button
                onClick={() => router.push('/student/errors')}
                className="ml-1 text-amber-500 hover:text-amber-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => {
              const rows = errors.map(e => ({
                课程: (e as any).course_name || '', 知识点: e.knowledge_point_name || '',
                错因: errorTypeLabels[e.error_type] || '其他错误',
                状态: e.review_status === 'mastered' ? '已掌握' : '待复习',
                记录时间: new Date((e as any).created_at).toLocaleDateString('zh-CN'),
              }));
              exportCsv('我的错题本', [
                { header: '课程', key: '课程' }, { header: '知识点', key: '知识点' },
                { header: '错因', key: '错因' }, { header: '状态', key: '状态' },
                { header: '记录时间', key: '记录时间' },
              ], rows);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />导出
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg">
            <Brain className="w-4 h-4 text-teal-600" />
            <span className="text-xs text-teal-700 font-medium">AI 错题解析已接入</span>
          </div>
        </div>

        {/* 统计 + 复习进度 + 自测开关 */}
        <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-4 py-2 flex-wrap">
          <span>共 <strong className="text-slate-700">{errors.length}</strong> 道</span>
          <span className="text-rose-600"><strong>{dueCount}</strong> 今日到期</span>
          <span className="text-amber-600"><strong>{pending.length}</strong> 待复习</span>
          <span className="text-teal-600"><strong>{mastered.length}</strong> 已掌握</span>
          <div className="flex-1 h-1.5 min-w-[90px] rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500"
              style={{ width: `${errors.length ? Math.round(mastered.length / errors.length * 100) : 0}%` }}
            />
          </div>
          {filterCourse !== 'all' && <span className="hidden sm:inline">筛选: <strong>{filterCourse}</strong></span>}
          <button
            onClick={() => setPracticeMode(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${practiceMode ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <Eye className="w-3 h-3" /> {practiceMode ? '自测模式 · 答案已隐藏' : '自测模式（隐藏答案）'}
          </button>
        </div>
      </div>

      {/* 筛选：课程 + 题型 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {courses.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterCourse('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterCourse === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >全部课程</button>
            {courses.map((c: string) => (
              <button
                key={c}
                onClick={() => setFilterCourse(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterCourse === c ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >{c}</button>
            ))}
          </div>
        )}
        <div className="hidden sm:block h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterType === 'all' ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >全部题型</button>
          {ALL_QUESTION_TYPES.map((qt) => (
            <button
              key={qt}
              onClick={() => setFilterType(qt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterType === qt ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >{questionTypeLabels[qt]}</button>
          ))}
        </div>
      </div>

      {/* 错因分布概览 */}
      {errorTypeDist.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">错因分布</span>
            <span className="text-xs text-slate-400">· 帮你定位最该优先纠正的错误类型</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {errorTypeDist.slice(0, 8).map((t) => (
              <div key={t.name} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-700 font-medium">{t.name}</span>
                  <span className="text-slate-500 text-xs">{t.count} 道 · {Math.round(t.pct)}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-teal-400" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.length === 0 ? (
        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-12 text-center">
            <BookMarked className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">还没有错题记录</p>
            <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">完成作业后系统会自动收录错题，快去完成一份作业吧</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              待复习 <Badge className="bg-amber-500 text-white text-xs px-1.5">{pending.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="mastered" className="gap-2">
              已掌握 <Badge variant="secondary" className="text-xs">{mastered.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <div className="grid gap-4">
              {filteredPending.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{filterCourse !== 'all' ? `「${filterCourse}」课程暂无待复习错题` : '所有错题已掌握！'}</p>
              ) : (
                filteredPending.map(renderErrorCard)
              )}
            </div>
          </TabsContent>

          <TabsContent value="mastered" className="mt-4">
            <div className="grid gap-4">
              {filteredMastered.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{filterCourse !== 'all' ? `「${filterCourse}」课程暂无已掌握错题` : '暂无已掌握错题'}</p>
              ) : (
                filteredMastered.map(renderErrorCard)
              )}
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <div className="grid gap-4">
              {filteredAll.map(renderErrorCard)}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* ===== P1-2：举一反三即时练习弹层 ===== */}
      {practice && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPractice(null)}>
          {/* 标题固定 + 内容区独立滚动：任何状态下弹层都不超出屏幕 */}
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-teal-600" /> 举一反三 · 即时练习
              </h3>
              <button onClick={() => setPractice(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-500 px-5 pb-3 shrink-0">知识点：{practice.kpName} · AI 根据你的错题生成 3 道变式题，完成即自动更新掌握度</p>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-4">

            {practice.loading && (
              <div className="py-12 text-center text-sm text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" /> AI 正在生成变式练习...
              </div>
            )}

            {practice.error && (
              <div className="rounded-lg bg-red-50 text-red-600 text-sm p-3">{practice.error}</div>
            )}

            {!practice.loading && practice.questions.length > 0 && !practice.result && (
              <div className="space-y-4">
                {/* 分步作答：一次一题，弹层高度稳定不超屏 */}
                {(() => {
                  const q = practice.questions[practice.step];
                  if (!q) return null;
                  const isLast = practice.step === practice.questions.length - 1;
                  const answered = practice.answers[q.index] && practice.answers[q.index].trim();
                  return (
                    <>
                      {/* 进度条 */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${((practice.step + 1) / practice.questions.length) * 100}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{practice.step + 1} / {practice.questions.length}</span>
                      </div>
                      <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                        <p className="text-sm font-medium text-slate-800">{q.index + 1}. {q.content}</p>
                        {q.options ? (
                          <div className="grid gap-1.5">
                            {Object.entries(q.options).map(([k, v]) => (
                              <label key={k} className={`flex items-center gap-2 text-sm rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${practice.answers[q.index] === k ? 'border-teal-400 bg-teal-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                                <input
                                  type="radio"
                                  name={`q_${q.index}`}
                                  checked={practice.answers[q.index] === k}
                                  onChange={() => setPractice((p) => p ? { ...p, answers: { ...p.answers, [q.index]: k } } : p)}
                                />
                                <span><b>{k}.</b> {v}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <Input
                            placeholder="请输入答案"
                            value={practice.answers[q.index] || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPractice((p) => p ? { ...p, answers: { ...p.answers, [q.index]: e.target.value } } : p)}
                          />
                        )}
                      </div>
                      <div className="flex gap-2">
                        {practice.step > 0 && (
                          <Button variant="outline" className="flex-1" onClick={() => setPractice((p) => p ? { ...p, step: p.step - 1 } : p)}>上一题</Button>
                        )}
                        {isLast ? (
                          <Button
                            className="flex-1 bg-teal-600 hover:bg-teal-700"
                            disabled={!answered}
                            onClick={() => submitPractice(practice.kpId)}
                          >提交练习</Button>
                        ) : (
                          <Button
                            className="flex-1 bg-teal-600 hover:bg-teal-700"
                            disabled={!answered}
                            onClick={() => setPractice((p) => p ? { ...p, step: p.step + 1 } : p)}
                          >下一题</Button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {practice.result && (
              <div className="space-y-3">
                <div className="rounded-xl bg-teal-50 p-4 text-center">
                  <p className="text-2xl font-bold text-teal-700">{practice.result.correct_count}/{practice.result.total} 正确</p>
                  <p className="text-xs text-teal-600 mt-1">本次正确率 {practice.result.score_percent}% · 知识掌握度已同步更新</p>
                </div>
                {practice.result.results.map((r) => (
                  <div key={r.index} className={`rounded-xl border p-3 text-sm ${r.is_correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                    <p className="font-medium">
                      {r.is_correct ? '✓' : '✗'} 第 {r.index + 1} 题 · {r.total_score}/{r.full_score} 分
                    </p>
                    <p className="text-xs mt-1 text-slate-600">正确答案：{r.correct_answer}</p>
                    <p className="text-xs mt-1 text-slate-500">解析：{r.analysis}</p>
                  </div>
                ))}
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setPractice(null);
                    setToast({ message: `练习完成！知识掌握度已更新（正确率 ${practice.result?.score_percent ?? 0}%）`, kpName: practice.kpName });
                  }}
                >
                  完成
                </Button>
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

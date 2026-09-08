'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import RichContent from '@/components/rich-content';
import { readingMinutesFromSeconds, readingScoreFromMinutes } from '@/lib/reading-score';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles, CalendarCheck, BookOpen, Timer, Brain, ChevronRight,
  Target, Search, Clock, FileText, PlayCircle, Flame, Loader2,
  CheckCircle2, Eye, X, Dumbbell, TrendingUp, FolderOpen,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDate } from '@/lib/date';
import { resolveVideoEmbed } from '@/lib/video-embed';

const MATERIAL_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  video: { label: '视频', icon: PlayCircle, color: 'text-fuchsia-600 bg-fuchsia-50' },
  document: { label: '文档', icon: FileText, color: 'text-violet-600 bg-violet-50' },
  slide: { label: '课件', icon: FolderOpen, color: 'text-teal-600 bg-teal-50' },
};

function materialKpIds(m: MaterialReadable): number[] {
  const raw = m.knowledge_point_ids;
  let arr: number[] = Array.isArray(raw) ? (raw as number[]) : [];
  if (!Array.isArray(raw) && typeof raw === 'string') {
    try { const p = JSON.parse(raw); arr = Array.isArray(p) ? p : []; } catch { arr = []; }
  }
  return arr;
}

interface TodayData {
  date?: string;
  totals?: { todo?: number; reviews?: number; practice?: number };
  reading?: { minutesTotal?: number; score?: number; todayMinutes?: number };
  dueReviews?: Array<{
    id: number; questionContent: string; student_answer?: string | null; correct_answer?: string | null;
    knowledgePointId: number; knowledgePointName: string; errorType?: string;
    errorAnalysis?: string | null; suggestion?: string | null; reviewStatus?: string;
  }>;
  weakPractice?: Array<{ knowledgePointId: number; knowledgePointName: string; masteryRate: number; errorCount?: number }>;
  sessions?: Array<{ id: number; knowledgePointName: string; sessionType: string; isCompleted?: boolean }>;
}
interface AsgnItem { id: number; title: string; course_name: string; end_time?: string | null; status: string; is_submitted: boolean }
interface ExamItem { id: number; title: string; course_name: string; state: string; start_at: string; attempt_deadline?: string | null; duration: number }
interface MaterialReadable {
  id: number; course_name: string; title: string; type: string;
  duration_minutes?: number | null; knowledge_point_ids?: unknown;
  url?: string | null; content?: string | null; is_required?: boolean;
  behavior?: { progress?: number; is_completed?: boolean; watch_duration?: number; review_count?: number } | null;
}
type MaterialItem = MaterialReadable;

const TYPE_LABEL: Record<string, string> = { video: '视频', document: '文档', slide: '课件', pdf: 'PDF', link: '链接', quiz: '练习' };

const OUTCOME_LABEL: Record<string, string> = { too_easy: '太简单→掌握', just_right: '刚好', too_hard: '太难→巩固' };

export default function StudentLearnPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<TodayData>({});
  const [assignments, setAssignments] = useState<AsgnItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [mQ, setMQ] = useState('');
  const [mType, setMType] = useState('all');

  // ── A. 内嵌错题复习（遗忘曲线反馈闭环）──
  const [reviewStep, setReviewStep] = useState(0);
  const [revealReview, setRevealReview] = useState(false);
  const [reviewOutcomes, setReviewOutcomes] = useState<Record<number, string>>({});
  const [reviewBusy, setReviewBusy] = useState(false);

  // ── A. 内嵌薄弱专项练习（举一反三，复用 practice 生成/提交接口）──
  type WeakPoint = { knowledgePointId: number; knowledgePointName: string; masteryRate: number; errorCount?: number };
  const [practicedKps, setPracticedKps] = useState<Set<number>>(new Set());
  const [practice, setPractice] = useState<null | {
    loading: boolean; kpId: number; kpName: string; practiceId: string; step: number;
    questions: Array<{ index: number; content: string; options: Record<string, string> | null }>;
    answers: Record<number, string>;
    result: null | { results: Array<{ index: number; total_score: number; full_score: number; is_correct: boolean; correct_answer: string; analysis: string }>; correct_count: number; total: number; score_percent: number };
    error: string;
  }>(null);

  // ── 学习材料 · 当前页内阅读（不再跳转旧 /student/materials）──
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reading, setReading] = useState<MaterialItem | null>(null);
  const startTimeRef = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [videoDone, setVideoDone] = useState(false);
  const [readSeconds, setReadSeconds] = useState(0);
  const readingEmb = reading && reading.type === 'video' && reading.url ? resolveVideoEmbed(reading.url) : null;

  // 本次阅读停留秒数累计（常驻反馈条用）
  useEffect(() => {
    if (!reading) return;
    setReadSeconds(0);
    const t = setInterval(() => setReadSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [reading?.id]);

  // 视频停留秒数累计
  useEffect(() => {
    if (!readingEmb) return;
    const t = setInterval(() => setVideoSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅依赖是否打开可播放视频
  }, [reading?.id]);

  const openMaterial = (m: MaterialItem) => {
    startTimeRef.current = Date.now();
    setScrollProgress(0); setReachedEnd(false); setVideoSeconds(0); setVideoDone(false);
    setReading(m);
  };

  const handleContentScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.round((Math.max(0, el.scrollTop) / max) * 100);
    setScrollProgress(Math.max(0, Math.min(100, pct)));
    if (max <= 0 || el.scrollTop >= max - 10) setReachedEnd(true);
  };

  const closeMaterial = () => {
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    if (reading) {
      let isDone = false;
      let reportedProgress = 0;
      if (readingEmb) {
        const durSec = (reading.duration_minutes || 0) * 60;
        isDone = videoDone || (durSec > 0 && elapsed >= durSec);
        reportedProgress = isDone ? 100 : durSec > 0 ? Math.min(95, Math.round((elapsed / durSec) * 100)) : Math.min(95, Math.round((elapsed / 120) * 100));
      } else {
        const noScroll = (contentRef.current && contentRef.current.scrollHeight <= contentRef.current.clientHeight + 2);
        isDone = reachedEnd && elapsed >= (noScroll ? 5 : 1);
        reportedProgress = isDone ? 100 : Math.max(0, Math.min(95, scrollProgress));
      }
      apiFetch('/api/student/behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: reading.id, watch_duration: elapsed, progress: reportedProgress, is_completed: isDone }),
      }).then(() => { refreshToday(); fetchMaterials(); }).catch(() => {});
    }
    setReading(null);
  };

  // 学习计划/知识点直达：?knowledge_point_id= 命中时自动打开对应材料
  const kpIdFromQuery = searchParams.get('knowledge_point_id');
  useEffect(() => {
    if (!kpIdFromQuery || materials.length === 0 || reading) return;
    const kpId = Number(kpIdFromQuery);
    const target = materials.find((mm) => materialKpIds(mm).includes(kpId) && !mm.behavior?.is_completed)
      || materials.find((mm) => materialKpIds(mm).includes(kpId));
    if (target) openMaterial(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次命中时自动打开一次
  }, [kpIdFromQuery, materials.length]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'student') { window.location.href = '/'; return; }

    const t = apiFetch('/api/student/today').then((r) => r.json()).catch(() => ({ data: {} }));
    const a = apiFetch('/api/student/assignments').then((r) => r.json()).catch(() => ({ data: [] }));
    const e = apiFetch('/api/student/exams').then((r) => r.json()).catch(() => ({ exams: [] }));
    const m = apiFetch('/api/student/materials').then((r) => r.json()).catch(() => ({ data: [] }));

    Promise.all([t, a, e, m]).then(([tj, asg, ex, mt]) => {
      setToday(tj.data || {});
      setAssignments(asg.data || []);
      setExams(ex.exams || []);
      setMaterials(mt.data || []);
      setLoading(false);
    });
  }, [user, authLoading]);

  // C. 实时轮询今日数据：阅读时长/今日达成随学习行为即时刷新
  const refreshToday = useCallback(() => {
    apiFetch('/api/student/today').then((r) => r.json()).then((j) => { if (j.data) setToday(j.data); }).catch(() => {});
  }, []);
  const fetchMaterials = useCallback(() => {
    apiFetch('/api/student/materials').then((r) => r.json()).then((j) => { if (j.data) setMaterials(j.data as MaterialItem[]); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user || user.role !== 'student') return;
    const iv = setInterval(refreshToday, 30000);
    const onFocus = () => refreshToday();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [user, refreshToday]);

  // 今日待办：未提交且未截止/已截止的作业（按截止时间）
  const dueAssignments = useMemo(() => {
    const now = Date.now();
    return assignments
      .filter((a) => !a.is_submitted && (a.status === 'pending' || a.status === 'expired'))
      .filter((a) => {
        if (!a.end_time) return false;
        const t = new Date(a.end_time).getTime();
        // 已截止 或 未来48h内到期
        return t <= now || (t - now) <= 48 * 3600 * 1000;
      })
      .slice(0, 4);
  }, [assignments]);

  const activeExams = useMemo(() => exams.filter((e) => e.state === 'open' || e.state === 'in_progress').slice(0, 4), [exams]);

  // 薄弱知识点 id 集合（用于材料推荐）
  const weakKpIds = useMemo(() => new Set((today.weakPractice || []).map((w) => w.knowledgePointId)), [today.weakPractice]);

  const materialsRecommended = useMemo(() => {
    if (!weakKpIds.size) return [];
    const hit = (m: MaterialItem) => {
      const raw = m.knowledge_point_ids;
      let arr: number[] = [];
      if (Array.isArray(raw)) arr = raw as number[];
      else if (typeof raw === 'string') { try { const p = JSON.parse(raw); arr = Array.isArray(p) ? p : []; } catch { arr = []; } }
      return arr.some((id) => weakKpIds.has(id));
    };
    return materials.filter(hit).slice(0, 6);
  }, [materials, weakKpIds]);

  const materialsFiltered = useMemo(() => {
    const kw = mQ.trim().toLowerCase();
    return materials.filter((m) => {
      if (mType !== 'all' && (m.type || 'doc') !== mType) return false;
      if (kw && !m.title.toLowerCase().includes(kw) && !m.course_name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [materials, mQ, mType]);

  const typeOptions = useMemo(() => {
    const s = new Set(materials.map((m) => m.type || 'doc'));
    return [...s];
  }, [materials]);

  // ── B. 今日达成（综合作业/错题复习/专项练习/阅读）──
  const dueReviews = today.dueReviews || [];
  const weakList = today.weakPractice || [];
  const reviewsDone = Object.keys(reviewOutcomes).length;
  const weakDoneCount = weakList.filter((w) => practicedKps.has(w.knowledgePointId)).length;
  const readingDone = (today.reading?.todayMinutes || 0) > 0 ? 1 : 0;
  const assignDone = dueAssignments.length === 0 && activeExams.length === 0 ? 1 : 0;

  const progressItems = [
    { label: '错题复习', cap: 1, done: dueReviews.length > 0 ? Math.min(reviewsDone / dueReviews.length, 1) : 1 },
    { label: '专项练习', cap: 1, done: weakList.length > 0 ? Math.min(weakDoneCount / weakList.length, 1) : 1 },
    { label: '阅读材料', cap: 1, done: readingDone },
    { label: '作业考试', cap: 1, done: assignDone },
  ];
  const progressPct = Math.round((progressItems.reduce((s, i) => s + i.done, 0) / progressItems.reduce((s, i) => s + i.cap, 0)) * 100);
  const progressDone = Math.round(progressItems.filter((i) => i.done >= 1).length);

  // P0-3 实时阅读投入：本次已读分钟 → 预计可增阅读投入分（口径统一见 lib/reading-score）
  const readMinutes = Math.max(0, readingMinutesFromSeconds(readSeconds));
  const curReadingScore = today.reading?.score ?? 0;
  const sessionProjected = readingScoreFromMinutes(readMinutes);
  const projectedY = Math.max(0, Math.min(25 - curReadingScore, sessionProjected));

  const curReview = dueReviews[reviewStep];
  const reviewsTotal = dueReviews.length;

  const submitReview = async (outcome: string) => {
    if (!curReview || reviewBusy) return;
    setReviewBusy(true);
    try {
      const res = await apiFetch('/api/student/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_book_id: curReview.id, outcome }),
      });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || '提交失败，请重试'); return; }
      setReviewOutcomes((prev) => ({ ...prev, [curReview.id]: outcome }));
      refreshToday();
    } catch {
      toast.error('提交失败，请稍后重试');
      return;
    } finally {
      setReviewBusy(false);
    }
    // 仅在提交成功后推进到下一题
    setRevealReview(false);
    if (reviewStep < dueReviews.length - 1) setReviewStep((s) => s + 1);
  };

  const startPractice = async (kp: WeakPoint) => {
    setPractice({ loading: true, kpId: kp.knowledgePointId, kpName: kp.knowledgePointName, practiceId: '', step: 0, questions: [], answers: {}, result: null, error: '' });
    try {
      const res = await apiFetch('/api/student/practice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge_point_id: kp.knowledgePointId }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || '生成失败');
      setPractice((p) => p ? { ...p, loading: false, practiceId: d.data.practice_id, questions: d.data.questions, step: 0 } : p);
    } catch (e) {
      setPractice((p) => p ? { ...p, loading: false, error: (e as Error).message || 'AI 出题失败，请稍后重试' } : p);
    }
  };

  const submitPractice = async () => {
    if (!practice) return;
    setPractice((p) => p ? { ...p, loading: true } : p);
    const answers = practice.questions.map((q) => ({ index: q.index, student_answer: practice.answers[q.index] || '' }));
    try {
      const res = await apiFetch('/api/student/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_id: practice.practiceId, knowledge_point_id: practice.kpId, answers }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || '提交失败');
      setPracticedKps((prev) => new Set(prev).add(practice.kpId));
      setPractice((p) => p ? { ...p, loading: false, result: d.data } : p);
    } catch (e) {
      setPractice((p) => p ? { ...p, loading: false, error: (e as Error).message || '提交失败' } : p);
    }
  };

  const todoTotal = dueAssignments.length + activeExams.length + reviewsTotal + weakList.length;
  const todayGreet = `今日 ${formatDate(Date.now())} · ${todoTotal} 件待办`;

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
      <SetActiveNav href="/student/learn" />

      {/* 头部：今日达成进度 + 实时阅读投入 */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-teal-600 p-5 text-white shadow-lg shadow-violet-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Sparkles className="w-5 h-5" />今日学习</h1>
            <p className="text-sm text-white/80 mt-1">{todayGreet}</p>
            {/* B. 今日达成进度条 */}
            <div className="mt-3 w-full sm:w-80">
              <div className="flex items-center justify-between text-xs text-white/80 mb-1">
                <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />今日达成</span>
                <span className="font-bold">{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-white/70">
                {progressItems.map((it) => (
                  <span key={it.label} className="px-2 py-0.5 rounded-full bg-white/10">{it.label} {Math.round(it.done * 100)}%</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 backdrop-blur">
              <div className="text-[11px] text-white/70">待复习错题</div>
              <div className="font-bold">{reviewsTotal - reviewsDone}</div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 backdrop-blur">
              <div className="text-[11px] text-white/70">薄弱专项</div>
              <div className="font-bold">{weakList.length - weakDoneCount}</div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 backdrop-blur">
              <div className="text-[11px] text-white/70">近48h作业</div>
              <div className="font-bold">{dueAssignments.length}</div>
            </div>
            {/* C. 今日阅读时长 + 阅读投入得分 */}
            <div className="bg-white/15 rounded-lg px-3 py-1.5 backdrop-blur min-w-[92px]">
              <div className="text-[11px] text-white/70">今日阅读 · 投入分</div>
              <div className="font-bold">{today.reading?.todayMinutes || 0}分<span className="text-xs font-normal text-white/70"> / {today.reading?.score ?? 0}分</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* P0-1 今日学习达成卡片 */}
      <Card className="border-slate-200/60 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Target className="w-4 h-4 text-violet-600" />今日学习达成</h2>
            <span className="text-xs text-slate-500">{progressDone} / {progressItems.length} 项达标 · <b className="text-violet-600">{progressPct}%</b></span>
          </div>
          <p className="text-xs text-slate-400 mb-3">把今天的作业、错题复习、薄弱专项和阅读都完成，达成率会写进你的学习记录</p>
          <Progress value={progressPct} className="h-2 mb-3" />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {progressItems.map((it) => {
              const checked = it.done >= 1;
              return (
                <div key={it.label} className="flex items-center gap-2 text-sm">
                  {checked
                    ? <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    : <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                  <span className={checked ? 'text-slate-500 line-through' : 'text-slate-700'}>{it.label}</span>
                  <span className="ml-auto text-xs text-slate-400">{Math.round(it.done * 100)}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 今日待办区 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-700"><CalendarCheck className="w-4 h-4 text-violet-600" />今日待办</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {/* 客观/作业到期待办 */}
          <Card className="border-slate-200/60 shadow-sm">
            <CardContent className="p-4 space-y-2.5">
              <div className="text-xs font-medium text-slate-400">作业 · 即将到期</div>
              {dueAssignments.length === 0 && <p className="text-xs text-slate-400">今日没有临期的作业 · 保持节奏</p>}
              {dueAssignments.map((a) => (
                <Link key={a.id} href={`/student/assignments/${a.id}`} className="flex items-center gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate group-hover:text-violet-700">{a.title}</div>
                    <div className="text-xs text-slate-400">{a.course_name}</div>
                  </div>
                  <Badge className={a.status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}>
                    {a.status === 'expired' ? '已过期' : '截止 ' + (a.end_time ? formatDate(a.end_time) : '')}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500" />
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* 今日考试 */}
          <Card className="border-slate-200/60 shadow-sm">
            <CardContent className="p-4 space-y-2.5">
              <div className="text-xs font-medium text-slate-400">考试 · 进行中/可进入</div>
              {activeExams.length === 0 && <p className="text-xs text-slate-400">今日没有进行中的考试</p>}
              {activeExams.map((e) => (
                <Link key={e.id} href={e.state === 'in_progress' ? `/student/exams/${e.id}/take` : `/student/exams/${e.id}`} className="flex items-center gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate group-hover:text-violet-700">{e.title}</div>
                    <div className="text-xs text-slate-400">{e.course_name} · {e.duration}分钟</div>
                  </div>
                  <Badge className={e.state === 'in_progress' ? 'bg-teal-50 text-teal-600' : 'bg-sky-50 text-sky-600'}>
                    {e.state === 'in_progress' ? '作答中' : '可进入'}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500" />
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* A. 内嵌错题复习（遗忘曲线反馈闭环） */}
          <Card className="border-slate-200/60 shadow-sm md:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-slate-400">到期错题复习</span>
                {reviewsTotal > 0 && (
                  <>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-500">已完成 {reviewsDone}/{reviewsTotal}</span>
                    {reviewsDone < reviewsTotal && (
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-teal-500 rounded-full transition-all" style={{ width: `${(reviewsDone / reviewsTotal) * 100}%` }} />
                      </div>
                    )}
                  </>
                )}
                <div className="ml-auto">
                  <Link href="/student/errors" className="inline-flex items-center text-xs font-medium text-violet-600">去错题本<ChevronRight className="w-3 h-3" /></Link>
                </div>
              </div>

              {reviewsTotal === 0 ? (
                <p className="text-xs text-slate-400 py-2">今日没有到期的错题 · 先去练习或在错题本加练</p>
              ) : reviewsDone >= reviewsTotal ? (
                <div className="flex items-center gap-2 py-2 text-teal-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />今日错题复习全部完成！间隔复习已自动排期
                </div>
              ) : curReview ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>第 {reviewStep + 1} / {reviewsTotal} 题 · {curReview.knowledgePointName}</span>
                    <span>复习反馈将按遗忘曲线推进下次复习</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <RichContent content={curReview.questionContent} className="text-sm text-slate-800" />
                  </div>

                  {revealReview ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="p-2.5 rounded bg-red-50 border border-red-100">
                        <p className="text-[11px] text-red-500 mb-1">我的答案</p>
                        <RichContent content={curReview.student_answer || '未作答'} className="text-sm text-red-700" />
                      </div>
                      <div className="p-2.5 rounded bg-green-50 border border-green-100">
                        <p className="text-[11px] text-green-500 mb-1">正确答案</p>
                        <RichContent content={curReview.correct_answer || ''} className="text-sm text-green-700" />
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => setRevealReview(true)}>
                      <Eye className="w-3.5 h-3.5 mr-1" />先回忆，再显示答案
                    </Button>
                  )}

                  {revealReview && curReview.errorAnalysis && (
                    <div className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
                      <p className="text-[11px] text-indigo-500 font-medium mb-1">解析</p>
                      <p className="text-sm text-indigo-800">{curReview.errorAnalysis}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['too_easy', 'just_right', 'too_hard'] as const).map((o) => (
                      <Button key={o} size="sm" disabled={reviewBusy}
                        className={o === 'too_easy'
                          ? 'text-xs bg-green-600 hover:bg-green-700'
                          : o === 'just_right'
                            ? 'text-xs bg-amber-500 hover:bg-amber-600'
                            : 'text-xs bg-rose-500 hover:bg-rose-600'}
                        onClick={() => submitReview(o)}>
                        {reviewBusy && o === 'just_right' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                        {OUTCOME_LABEL[o]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* A. 薄弱知识点：一键内嵌专项练习 */}
          <Card className="border-slate-200/60 shadow-sm md:col-span-2">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-medium text-slate-400">薄弱知识点专项 · AI 举一反三练习</span>
                <div className="ml-auto">
                  <Link href="/student/recommend" className="inline-flex items-center text-xs font-medium text-violet-600">更多推荐<ChevronRight className="w-3 h-3" /></Link>
                </div>
              </div>
              {weakList.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">暂无明确薄弱点 · 保持练习</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {weakList.slice(0, 6).map((w) => {
                    const done = practicedKps.has(w.knowledgePointId);
                    return (
                      <div key={w.knowledgePointId} className="p-3 rounded-lg border border-slate-100 hover:border-rose-200 hover:bg-rose-50/40 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-700 truncate">{w.knowledgePointName}</span>
                          <span className="text-xs text-rose-500 shrink-0">掌握 {w.masteryRate}%</span>
                        </div>
                        <Progress value={w.masteryRate} className="h-1.5 mt-1.5" />
                        <Button size="sm" disabled={practice?.loading} className="w-full mt-2 h-7 text-xs"
                          variant={done ? 'secondary' : 'default'}
                          onClick={() => startPractice(w)}>
                          {done ? <><CheckCircle2 className="w-3 h-3 mr-1" />已练习·再来一组</> : <><Dumbbell className="w-3 h-3 mr-1" />开始练习</>}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 学习材料 */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-700"><BookOpen className="w-4 h-4 text-teal-600" />学习材料<span className="text-xs font-normal text-slate-400">· 阅读计入平时表现「阅读投入」(25分)</span></h2>

        {/* 推荐（针对薄弱点） */}
        {materialsRecommended.length > 0 && (
          <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50/50 to-white">
            <CardContent className="p-4 space-y-2.5">
              <div className="text-xs font-medium text-violet-600 flex items-center gap-1"><Flame className="w-3.5 h-3.5" />为你推荐（针对薄弱知识点）</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {materialsRecommended.map((m) => (
                  <button key={m.id} onClick={() => openMaterial(m)} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/70 border border-violet-100 hover:bg-white transition-colors text-left cursor-pointer">
                    <PlayCircle className="w-8 h-8 text-violet-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-700 truncate">{m.title}</div>
                      <div className="text-xs text-slate-400">{m.course_name} · {TYPE_LABEL[m.type] || '材料'}{m.duration_minutes ? ` · ${Math.round(m.duration_minutes / 60)}分` : ''}</div>
                      {m.behavior?.progress ? (
                        <div className="mt-1 h-1 bg-violet-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${m.behavior.progress}%` }} /></div>
                      ) : (
                        <div className="text-xs text-violet-500 mt-1">开始学习</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 全部材料 + 搜索/筛选 */}
        <Card className="border-slate-200/60 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={mQ} onChange={(e) => setMQ(e.target.value)} placeholder="搜索材料标题/课程…" className="pl-9 h-8" />
              </div>
              <Select value={mType} onValueChange={setMType}>
                <SelectTrigger className="w-32 h-8"><SelectValue placeholder="全部类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {typeOptions.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-slate-400 ml-auto">共 {materialsFiltered.length} 份</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {materialsFiltered.slice(0, 12).map((m) => (
                <button key={m.id} onClick={() => openMaterial(m)} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 hover:border-violet-200 hover:bg-violet-50/40 transition-colors text-left cursor-pointer">
                  <FileText className="w-6 h-6 text-teal-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-700 truncate">{m.title}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{m.course_name}</div>
                  </div>
                  {m.behavior?.progress ? (
                    <Badge className="bg-teal-50 text-teal-600 shrink-0">{m.behavior.is_completed ? '已看完' : `${m.behavior.progress}%`}</Badge>
                  ) : (
                    <Badge className="bg-slate-50 text-slate-500 shrink-0">未学</Badge>
                  )}
                </button>
              ))}
              {materialsFiltered.length === 0 && <p className="text-sm text-slate-400 col-span-full py-6 text-center">没有符合筛选的学习材料</p>}
            </div>
            {materials.length === 0 && <p className="text-sm text-slate-400 text-center py-6">暂未上传学习材料，请联系老师补充</p>}
          </CardContent>
        </Card>
      </section>

      {/* 学习材料阅读弹窗（当前页内阅读，不再跳转） */}
      {reading && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeMaterial}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground truncate">{reading.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{reading.course_name} · {MATERIAL_TYPE_CONFIG[reading.type]?.label || '文档'}{reading.is_required ? ' · 必学' : ''}</p>
              </div>
              <button onClick={closeMaterial} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4" ref={contentRef} onScroll={handleContentScroll}>
              {readingEmb && (
                <div className="mb-4">
                  {readingEmb.kind === 'native' ? (
                    <video src={readingEmb.src} controls playsInline className="w-full aspect-video rounded-xl bg-black" />
                  ) : (
                    <iframe
                      src={readingEmb.src}
                      title={reading.title}
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      scrolling="no"
                      frameBorder={0}
                      className="w-full aspect-video rounded-xl bg-black"
                    />
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-fuchsia-600">
                      <Timer className="w-3.5 h-3.5" /> 已观看 {videoSeconds} 秒
                    </span>
                    <a href={readingEmb.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline shrink-0">新窗口打开原视频</a>
                  </div>
                </div>
              )}
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{reading.content || '暂无内容'}</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-100">
              {/* P0-3 实时阅读时长与得分反馈 */}
              <div className="flex items-center justify-between gap-2 mb-3 rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-teal-700">
                  <Timer className="w-4 h-4" /> 本次已读 <b>{readMinutes}</b> 分钟
                </span>
                <span className="text-teal-700">预计阅读投入 <b>+{projectedY}</b> 分<span className="text-xs text-teal-500">（封顶 25）</span></span>
              </div>
              {readingEmb && (
                <button
                  onClick={() => setVideoDone(true)}
                  className={`w-full mb-3 py-2 rounded-lg text-sm font-medium transition-colors ${videoDone ? 'bg-teal-500 text-white' : 'bg-violet-600 text-white hover:opacity-90'}`}
                >
                  {videoDone ? '已标记看完 ✓' : '看完啦，标记完成'}
                </button>
              )}
              <p className="text-xs font-medium text-slate-500 mb-2">学完了？接下来：</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => router.push('/student/errors')} className="text-xs py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">复习错题</button>
                <button onClick={() => router.push('/student/knowledge-graph')} className="text-xs py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">看知识图谱</button>
                <button onClick={() => router.push('/student/assistant?q=' + encodeURIComponent(`我正在学《${reading.title}》（${reading.course_name}），请帮我提炼核心知识点、梳理重点，并用例子帮我理解`))} className="text-xs py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">问 AI 老师</button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">关闭后将记录本次学习时长，纳入学习投入与阅读得分</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 薄弱专项练习弹窗（举一反三） */}
      {practice && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPractice(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-teal-600" /> 薄弱专项 · 即时练习
              </h3>
              <button onClick={() => setPractice(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-500 px-5 pb-3 shrink-0">知识点：{practice.kpName} · AI 生成 3 道变式题，完成即自动更新掌握度</p>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-4">
              {practice.loading && (
                <div className="py-12 text-center text-sm text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" /> AI 正在生成变式练习...
                </div>
              )}
              {practice.error && <div className="rounded-lg bg-red-50 text-red-600 text-sm p-3">{practice.error}</div>}
              {!practice.loading && practice.questions.length > 0 && !practice.result && (
                <div className="space-y-4">
                  {(() => {
                    const q = practice.questions[practice.step];
                    if (!q) return null;
                    const isLast = practice.step === practice.questions.length - 1;
                    const answered = practice.answers[q.index] && practice.answers[q.index].trim();
                    return (
                      <>
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
                            <Button className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={!answered} onClick={submitPractice}>提交练习</Button>
                          ) : (
                            <Button className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={!answered} onClick={() => setPractice((p) => p ? { ...p, step: p.step + 1 } : p)}>下一题</Button>
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
                      <p className="font-medium">{r.is_correct ? '✓' : '✗'} 第 {r.index + 1} 题 · {r.total_score}/{r.full_score} 分</p>
                      <p className="text-xs mt-1 text-slate-600">正确答案：{r.correct_answer}</p>
                      <p className="text-xs mt-1 text-slate-500">解析：{r.analysis}</p>
                    </div>
                  ))}
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => { setPractice(null); refreshToday(); }}>
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
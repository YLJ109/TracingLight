'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import * as echarts from 'echarts';
import {
  BookOpen, Target, TrendingUp, FileText, ChevronRight, AlertCircle, Clock, Zap, Trophy, Loader2,
  Activity, BarChart3, Sparkles, CalendarDays, RefreshCcw, Layers, GraduationCap, Brain, CheckCircle2,
} from 'lucide-react';

interface Archive {
  student: { real_name?: string; avatar_url?: string | null; student_level?: string; classRank?: number | null; className?: string; majorName?: string; courseCount?: number };
  courses: Array<{ id: number; name: string }>;
  avgMastery: number;
  indicators: Array<{ key: string; label: string; value: number; unit?: string; color?: string; icon?: string; trend?: string }>;
  masteryTiers: { total: number; mastered: number; good: number; weak: number; none: number };
  weakTop10: Array<{ name: string; masteryRate: number; priority?: string }>;
  strongTop3: Array<{ name: string; masteryRate: number }>;
  pendingErrors: number;
  stubbornErrors: number;
  errorData: { errorTypeDistribution: Array<{ errorType: string; errorTypeLabel: string; count: number; percentage: number }>; totalErrors: number };
  radarData: Array<{ key: string; label: string; icon: string; score: number }>;
  trendData: Array<{ week: string; avgScore: number }>;
  courseComparison: Array<{ courseId: number; name: string; shortName: string; avgMastery: number; kpCount: number; errorCount: number }>;
  learningBehavior: { weekMinutes: number; weekHours: number; materialProgress: number; days: Array<{ date: string; seconds: number }>; materialsStudied: number };
  stability: { scoreStd: number; level: string; carelessRatio: number; judgedAssignments: number };
  growthTimeline: Array<{ type: string; title: string; desc: string; ts: string }>;
  courseData: { courseName: string; avgScore: number; completedCount: number; avgMastery: number; weakKps: Array<{ name: string; masteryRate: number }>; trend: Array<{ week: string; avgScore: number }> } | null;
}

const TABS = [
  { key: 'homework', label: '作业表现', icon: BarChart3 },
  { key: 'ability', label: '能力画像', icon: Target },
  { key: 'behavior', label: '学习行为', icon: Clock },
  { key: 'stability', label: '稳定性', icon: TrendingUp },
  { key: 'growth', label: '成长时间线', icon: CalendarDays },
  { key: 'profile', label: '基础与课程', icon: BookOpen },
];

export default function StudentDashboard() {
  const [profile, setProfile] = useState<Archive | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [courseId, setCourseId] = useState<string>('all');
  const [tab, setTab] = useState<string>('homework');
  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const behaviorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tracinglight_user');
    if (!stored) return;
    const user = JSON.parse(stored);
    if (courseId === 'all') setLoading(true);
    setRefreshing(true);
    const qs = courseId !== 'all' ? `&course_id=${courseId}` : '';
    apiFetch(`/api/student/profile?student_id=${user.id}${qs}`)
      .then(r => r.json())
      .then(data => { setProfile(data.data); setLoading(false); })
      .catch(() => { setLoading(false); })
      .finally(() => setRefreshing(false));
  }, [courseId]);

  // 能力雷达（六维）
  useEffect(() => {
    if (tab !== 'ability' || !profile?.radarData || !radarRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(radarRef.current!);
      const rd = profile.radarData;
      chart.setOption({
        tooltip: { backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
        radar: { center: ['50%', '50%'], radius: '62%', indicator: rd.map((r) => ({ name: r.label, max: 100 })), axisName: { color: '#475569', fontSize: 11 }, splitArea: { areaStyle: { color: ['#f8fafc', '#f1f5f9'] } }, splitLine: { lineStyle: { color: '#e2e8f0' } } },
        series: [{
          type: 'radar', data: [{ value: rd.map((r) => r.score), name: '能力', areaStyle: { color: 'rgba(13,148,136,0.18)' }, lineStyle: { color: '#0d9488', width: 2 }, itemStyle: { color: '#0d9488' }, symbol: 'circle', symbolSize: 5 }],
        }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 60);
    return () => clearTimeout(t);
  }, [profile, tab]);

  // 成绩趋势 line
  useEffect(() => {
    if (tab !== 'homework' || !profile?.trendData || !trendRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(trendRef.current!);
      const td = profile.trendData;
      chart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
        xAxis: { type: 'category', data: td.map((t) => t.week), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
        yAxis: { type: 'value', min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        series: [{ name: '成绩', type: 'line', data: td.map((t) => t.avgScore), smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#0d9488' }, itemStyle: { color: '#0d9488' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(13,148,136,0.15)' }, { offset: 1, color: 'rgba(13,148,136,0)' }]) } }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 60);
    return () => clearTimeout(t);
  }, [profile, tab]);

  // 错因环形 pie
  useEffect(() => {
    if (tab !== 'homework' || !profile?.errorData?.errorTypeDistribution || !pieRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(pieRef.current!);
      const dist = profile.errorData.errorTypeDistribution;
      chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} 题 ({d}%)', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' } },
        legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11, color: '#64748b' } },
        series: [{
          type: 'pie', radius: ['45%', '70%'], center: ['40%', '50%'], avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false }, emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', formatter: '{b}: {c} 题' } },
          data: dist.map((e) => ({ name: e.errorTypeLabel, value: e.count })),
        }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 60);
    return () => clearTimeout(t);
  }, [profile, tab]);

  // 近7天学习时长 bar
  useEffect(() => {
    if (tab !== 'behavior' || !profile?.learningBehavior || !behaviorRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(behaviorRef.current!);
      const lb = profile.learningBehavior;
      const days = lb.days.map((d) => d.date.slice(5));
      const mins = lb.days.map((d) => Math.round(d.seconds / 60));
      chart.setOption({
        tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>${p[0].value} 分钟`, backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' } },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
        xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisTick: { show: false }, axisLabel: { color: '#64748b', fontSize: 11 } },
        yAxis: { type: 'value', name: '分钟', nameTextStyle: { fontSize: 11, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { fontSize: 11, color: '#94a3b8' } },
        series: [{ type: 'bar', data: mins, barWidth: 22, itemStyle: { borderRadius: [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#a78bfa' }]) }, label: { show: true, position: 'top', color: '#7c3aed', fontSize: 10 } }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 60);
    return () => clearTimeout(t);
  }, [profile, tab]);

  // 课程对比 bar
  useEffect(() => {
    if (tab !== 'ability' || !profile?.courseComparison || !compareRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(compareRef.current!);
      const cd = profile.courseComparison;
      chart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);', formatter: (params: any) => { const p = params[0]; return `<strong>${p.name}</strong><br/>掌握度：${p.value}%<br/>知识点：${cd[p.dataIndex].kpCount} 个<br/>错题：${cd[p.dataIndex].errorCount} 题`; } },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
        xAxis: { type: 'category', data: cd.map((c) => c.shortName), axisLabel: { fontSize: 12, color: '#64748b', fontWeight: 500 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
        yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { fontSize: 11, color: '#94a3b8' } },
        series: [{ name: '掌握度', type: 'bar', data: cd.map((c) => c.avgMastery), itemStyle: { borderRadius: [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#0d9488' }, { offset: 1, color: '#14b8a6' }]) }, barWidth: 28, label: { show: true, position: 'top', color: '#475569', fontSize: 11, fontWeight: 600, formatter: '{c}%' } }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 60);
    return () => clearTimeout(t);
  }, [profile, tab]);

  if (loading) return <DashboardSkeleton />;
  if (!profile) return <div className="flex items-center justify-center h-64 text-muted-foreground">数据加载失败</div>;

  const { student, indicators } = profile;
  const findInd = (key: string) => indicators.find((i) => i.key === key);

  // 速览 KPI
  const kpi = [
    { label: '平均掌握率', value: profile.avgMastery, unit: '%', color: 'teal', Icon: Activity },
    { label: '作业完成率', value: findInd('completionRate')?.value ?? 0, unit: '%', color: 'blue', Icon: Target },
    { label: '按时提交率', value: findInd('onTimeRate')?.value ?? 0, unit: '%', color: 'indigo', Icon: Clock },
    { label: '薄弱知识点', value: profile.masteryTiers.weak + profile.masteryTiers.none, unit: '个', color: 'red', Icon: AlertCircle },
    { label: '待复习错题', value: profile.pendingErrors, unit: '题', color: 'amber', Icon: RefreshCcw },
  ];
  const kpiColor: Record<string, { bg: string; val: string; grad: string }> = {
    teal: { bg: 'bg-teal-100/80 text-teal-600', val: 'text-teal-700', grad: 'from-teal-50 to-white' },
    blue: { bg: 'bg-blue-100/80 text-blue-600', val: 'text-blue-700', grad: 'from-blue-50 to-white' },
    indigo: { bg: 'bg-indigo-100/80 text-indigo-600', val: 'text-indigo-700', grad: 'from-indigo-50 to-white' },
    red: { bg: 'bg-red-100/80 text-red-600', val: 'text-red-600', grad: 'from-red-50 to-white' },
    amber: { bg: 'bg-amber-100/80 text-amber-600', val: 'text-amber-700', grad: 'from-amber-50 to-white' },
  };
  const tierMeta = [
    { key: 'mastered', label: '精通', color: 'text-teal-600', bar: 'bg-teal-500', ring: 'bg-teal-50 border-teal-200' },
    { key: 'good', label: '良好', color: 'text-blue-600', bar: 'bg-blue-500', ring: 'bg-blue-50 border-blue-200' },
    { key: 'weak', label: '薄弱', color: 'text-amber-600', bar: 'bg-amber-500', ring: 'bg-amber-50 border-amber-200' },
    { key: 'none', label: '未学', color: 'text-red-500', bar: 'bg-red-400', ring: 'bg-red-50 border-red-200' },
  ] as const;
  const mt = profile.masteryTiers;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 身份卡 */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Avatar className="w-16 h-16 ring-2 ring-teal-100">
            {student.avatar_url ? (
              <AvatarImage src={student.avatar_url} alt={student.real_name} className="object-cover" />
            ) : (
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-2xl font-bold">
                {student.real_name?.slice(0, 1)}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{student.real_name}</h1>
              <Badge variant="outline" className={levelBadgeMap[student.student_level || ''] || 'border-slate-200 text-slate-600'}>
                {levelLabelMap[student.student_level || ''] || student.student_level || '学生'}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{student.majorName || '专业'} · {student.className || '班级'}</span>
              <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />班级排名 <strong className="text-slate-800">{student.classRank ? `第 ${student.classRank} 名` : '暂无'}</strong></span>
              <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" />本学期 {student.courseCount ?? profile.courses.length} 门课</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/student/assignments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-teal-600 transition-colors"><FileText className="w-4 h-4" />我的作业<ChevronRight className="w-3 h-3" /></Link>
          <Link href="/student/errors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-teal-600 transition-colors"><AlertCircle className="w-4 h-4" />错题本<ChevronRight className="w-3 h-3" /></Link>
        </div>
      </header>

      {/* 课程筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCourseId('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${courseId === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全部</button>
        {profile.courses?.map((c) => (
          <button key={c.id} onClick={() => setCourseId(String(c.id))} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${courseId === String(c.id) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.name}</button>
        ))}
        {refreshing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-violet-600 animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" />加载中…</span>
        )}
      </div>

      {/* ===== 速览：掌握率横幅 + 薄弱/优势 ===== */}
      <Card className="border-0 bg-gradient-to-br from-violet-600 via-indigo-600 to-teal-600 text-white rounded-2xl shadow-lg overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-center gap-5 flex-shrink-0">
              <div className="text-center">
                <div className="text-5xl font-black leading-none">{profile.avgMastery}<span className="text-2xl font-bold">%</span></div>
                <p className="text-xs text-white/80 mt-1.5">综合掌握率</p>
              </div>
              <div className="w-px h-12 bg-white/20" />
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="text-white/90 font-medium flex items-center gap-1"><Target className="w-3.5 h-3.5" />总体 {masteryRateLabel(profile.avgMastery)}</p>
                <p className="text-white/75 text-xs">{mt.total} 个知识点 · {mt.mastered} 精通 / {mt.good} 良好 / {mt.weak} 薄弱 / {mt.none} 未学</p>
              </div>
            </div>
            {/* 四色分层比例条 */}
            <div className="flex-1 min-w-0">
              <div className="flex h-3 rounded-full overflow-hidden bg-white/15">
                <div style={{ width: `${pct(mt.mastered, mt.total)}%` }} className="bg-emerald-300" />
                <div style={{ width: `${pct(mt.good, mt.total)}%` }} className="bg-sky-300" />
                <div style={{ width: `${pct(mt.weak, mt.total)}%` }} className="bg-amber-300" />
                <div style={{ width: `${pct(mt.none, mt.total)}%` }} className="bg-red-300" />
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                {tierMeta.map((t) => (
                  <div key={t.key} className="rounded-lg bg-white/10 px-2 py-1.5">
                    <div className="text-base font-bold">{mt[t.key]}</div>
                    <div className="text-[10px] text-white/75">{t.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 薄弱/优势 Top3 */}
            <div className="flex flex-col gap-2 flex-shrink-0 lg:w-72">
              <div className="flex items-center gap-1.5 text-xs text-white/80"><AlertCircle className="w-3.5 h-3.5" />薄弱知识点</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.weakTop10.slice(0, 3).map((w, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/15 text-[11px]">
                    {w.name} <b className="text-red-200">{w.masteryRate}%</b>
                  </span>
                ))}
                {profile.weakTop10.length === 0 && <span className="text-[11px] text-white/60">暂无薄弱知识点</span>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/80 mt-1"><TrendingUp className="w-3.5 h-3.5" />优势知识点</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.strongTop3.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/15 text-[11px]">
                    {s.name} <b className="text-teal-200">{s.masteryRate}%</b>
                  </span>
                ))}
                {profile.strongTop3.length === 0 && <span className="text-[11px] text-white/60">暂无优势知识点</span>}
              </div>
            </div>
          </div>
          {/* 行动入口 */}
          <div className="flex flex-wrap gap-2.5 mt-5 pt-4 border-t border-white/15">
            <Link href="/student/today" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-violet-700 text-sm font-medium shadow hover:bg-violet-50 transition-colors"><Target className="w-4 h-4" />今日任务</Link>
            <Link href="/student/errors" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors"><AlertCircle className="w-4 h-4" />看错题</Link>
            <Link href="/student/materials" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors"><BookOpen className="w-4 h-4" />学习材料</Link>
            <Link href="/student/assistant" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors"><Sparkles className="w-4 h-4" />问 AI 老师</Link>
          </div>
        </CardContent>
      </Card>

      {/* ===== KPI 五卡 ===== */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpi.map((k, i) => {
          const c = kpiColor[k.color] || kpiColor.teal;
          return (
            <Card key={i} className={`relative overflow-hidden border-0 bg-gradient-to-br ${c.grad} rounded-2xl`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}><k.Icon className="w-4 h-4" /></div>
                </div>
                <div className={`text-2xl font-bold ${c.val}`}>{k.value}{k.unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{k.unit}</span>}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Tabs 分区 ===== */}
      <div className="flex gap-1.5 flex-wrap border-b border-slate-200 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {/* —— 作业表现 —— */}
      {tab === 'homework' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-teal-500" />成绩趋势</CardTitle></CardHeader>
              <CardContent className="pt-0">{profile.trendData.length ? <div ref={trendRef} className="w-full h-64" /> : <Empty text="暂无已完成作业的成绩记录" />}</CardContent>
            </Card>
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-500" />错因分布</CardTitle></CardHeader>
              <CardContent className="pt-0">{profile.errorData.totalErrors ? <div ref={pieRef} className="w-full h-64" /> : <Empty text="暂无错题数据" />}</CardContent>
            </Card>
          </div>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" />作业指标</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {indicators.slice(0, 6).map((ind, i) => {
                  const Icon = INDICATOR_ICON_MAP[ind.icon || 'Target'] || Target;
                  const col = INDICATOR_COLOR_MAP[ind.icon || ''] || 'slate';
                  return (
                    <div key={i} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center gap-2 mb-1"><Icon className={`w-4 h-4 ${INDICATOR_BG[col].split(' ')[1]}`} /><span className="text-xs text-muted-foreground">{ind.label}</span></div>
                      <div className={`text-xl font-bold ${INDICATOR_VAL[col]}`}>{ind.value}<span className="text-xs font-normal text-muted-foreground ml-0.5">{ind.unit}</span></div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><RefreshCcw className="w-4 h-4 text-red-500" />错题复习</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <StatRow label="待复习错题" value={`${profile.pendingErrors} 题`} color="text-amber-600" />
                <StatRow label="顽固错题（重复出错≥2）" value={`${profile.stubbornErrors} 题`} color="text-red-600" />
                <StatRow label="错题订正完成" value={indicators.find((i) => i.key === 'correctionRate') ? `${indicators.find((i) => i.key === 'correctionRate')!.value}%` : '0%'} color="text-emerald-600" />
                <Link href="/student/errors" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mt-2">进入错题本复习 <ChevronRight className="w-3.5 h-3.5" /></Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* —— 能力画像 —— */}
      {tab === 'ability' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
            <Card className="border-slate-200/60 shadow-soft rounded-2xl lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Brain className="w-4 h-4 text-teal-500" />能力六维雷达</CardTitle></CardHeader>
              <CardContent className="pt-0"><div ref={radarRef} className="w-full h-72" /></CardContent>
            </Card>
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-violet-500" />知识掌握分层</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  <div style={{ width: `${pct(mt.mastered, mt.total)}%` }} className="bg-teal-500" />
                  <div style={{ width: `${pct(mt.good, mt.total)}%` }} className="bg-blue-500" />
                  <div style={{ width: `${pct(mt.weak, mt.total)}%` }} className="bg-amber-500" />
                  <div style={{ width: `${pct(mt.none, mt.total)}%` }} className="bg-red-400" />
                </div>
                {tierMeta.map((t) => (
                  <div key={t.key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{t.label}</span>
                    <span className={`font-semibold ${t.color}`}>{mt[t.key]} 个</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">覆盖 {mt.total} 个知识点</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />优势知识点 / 薄弱知识点</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <KpList title="优势" items={profile.strongTop3} color="text-teal-600" bar="bg-teal-400" />
                <KpList title="薄弱" items={profile.weakTop10.slice(0, 5)} color="text-red-500" bar="bg-red-400" />
              </CardContent>
            </Card>
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-500" />课程掌握度对比</CardTitle></CardHeader>
              <CardContent className="pt-0">{profile.courseComparison.length ? <div ref={compareRef} className="w-full h-64" /> : <Empty text="暂无课程数据" />}</CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* —— 学习行为 —— */}
      {tab === 'behavior' && (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
          <Card className="border-slate-200/60 shadow-soft rounded-2xl lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-violet-500" />近 7 天学习时长</CardTitle></CardHeader>
            <CardContent className="pt-0">{profile.learningBehavior.weekMinutes > 0 ? <div ref={behaviorRef} className="w-full h-64" /> : <Empty text="本周暂无学习时长记录，打开一节学习材料后再看这里" />}</CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="border-slate-200/60 shadow-soft rounded-2xl">
              <CardContent className="p-5 space-y-3">
                <StatRow label="本周累计学习" value={`${profile.learningBehavior.weekHours} 小时`} color="text-violet-700" />
                <StatRow label="已学材料进度均值" value={`${profile.learningBehavior.materialProgress}%`} color="text-teal-600" />
                <StatRow label="已浏览学习材料" value={`${profile.learningBehavior.materialsStudied} 份`} color="text-slate-700" />
              </CardContent>
            </Card>
            <Card className="border-slate-200/60 shadow-soft rounded-2xl bg-gradient-to-br from-violet-50/50 to-white">
              <CardContent className="p-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  保持每日稳定学习节奏，集中攻克<b className="text-red-500">{mt.weak + mt.none} 个</b>薄弱/未学知识点，提升综合掌握率。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* —— 稳定性 —— */}
      {tab === 'stability' && (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
          <Card className="border-slate-200/60 shadow-soft rounded-2xl">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1">学习稳定性</p>
              <p className="text-2xl font-bold text-slate-800">{profile.stability.level}</p>
              <p className="text-xs text-muted-foreground mt-1.5">得分波动 {profile.stability.scoreStd}%（标准差）</p>
              <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${Math.max(8, Math.min(100, 100 - profile.stability.scoreStd))}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 shadow-soft rounded-2xl">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1">粗心失分占比</p>
              <p className="text-2xl font-bold text-amber-600">{profile.stability.carelessRatio}%</p>
              <p className="text-xs text-muted-foreground mt-1.5">来自计算错误 / 粗心 / 未作答类错题</p>
              {profile.stability.carelessRatio > 15 && <p className="text-xs text-red-500 mt-2">建议：做题后复查，重点演练易错计算步骤</p>}
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 shadow-soft rounded-2xl">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1">已评测作业次数</p>
              <p className="text-2xl font-bold text-blue-600">{profile.stability.judgedAssignments} 次</p>
              <p className="text-xs text-muted-foreground mt-1.5">用于评估分数波动范围</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* —— 成长时间线 —— */}
      {tab === 'growth' && (
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardContent className="p-6">
            {profile.growthTimeline.length ? (
              <div className="relative border-l-2 border-slate-100 pl-5 space-y-5">
                {profile.growthTimeline.map((item, i) => (
                  <div key={i} className="relative">
                    <span className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-white ${item.type === 'qa' ? 'bg-violet-500' : 'bg-teal-500'}`} />
                    <div className="flex items-center gap-2">
                      {item.type === 'qa' ? <Sparkles className="w-4 h-4 text-violet-500" /> : <FileText className="w-4 h-4 text-teal-500" />}
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <span className="text-[11px] text-slate-400">{formatDate(item.ts)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="暂无成长记录：完成一份作业或向 AI 老师提问后，这里会出现进度反馈" />
            )}
          </CardContent>
        </Card>
      )}

      {/* —— 基础与课程 —— */}
      {tab === 'profile' && (
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <StatRow label="姓名" value={student.real_name || '-'} />
              <StatRow label="专业" value={student.majorName || '-'} />
              <StatRow label="班级" value={student.className || '-'} />
              <StatRow label="班级排名" value={student.classRank ? `第 ${student.classRank} 名` : '暂无'} color="text-slate-800" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5"><Layers className="w-4 h-4 text-teal-500" />本学期课程</p>
            {profile.courses.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.courses.map((c) => (
                  <button key={c.id} onClick={() => setCourseId(String(c.id))} className={`px-3 py-1.5 rounded-lg text-sm ${courseId === String(c.id) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{c.name}</button>
                ))}
              </div>
            ) : <Empty text="暂无课程" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatRow({ label, value, color = 'text-slate-700' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function KpList({ title, items, color, bar }: { title: string; items: Array<{ name: string; masteryRate: number }>; color: string; bar: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{title}</p>
      {items.length ? items.map((k, i) => (
        <div key={i} className="flex items-center gap-2 py-1">
          <span className="text-sm text-slate-700 flex-1 truncate">{k.name}</span>
          <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${bar}`} style={{ width: `${k.masteryRate}%` }} /></div>
          <span className={`text-xs font-semibold w-9 text-right ${color}`}>{k.masteryRate}%</span>
        </div>
      )) : <p className="text-xs text-slate-400">暂无</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">{text}</div>;
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (n / total) * 100));
}

function masteryRateLabel(v: number) {
  if (v >= 80) return '良好水平';
  if (v >= 60) return '基础达标';
  return '待提升';
}

function formatDate(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const levelLabelMap: Record<string, string> = { '全优层': '全优层', '学霸层': '学霸层', '勤奋中等层': '勤奋中等', '提升层': '提升层' };
const levelBadgeMap: Record<string, string> = {
  '全优层': 'border-amber-200 text-amber-700 bg-amber-50',
  '学霸层': 'border-blue-200 text-blue-700 bg-blue-50',
  '勤奋中等层': 'border-yellow-200 text-yellow-700 bg-yellow-50',
  '提升层': 'border-red-200 text-red-700 bg-red-50',
};
const INDICATOR_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'completionRate': Target, 'onTimeRate': Clock, 'avgScore': TrendingUp, 'correctionRate': CheckCircle2,
  'totalQuestions': BookOpen, 'weakPoints': AlertCircle,
};
const INDICATOR_COLOR_MAP: Record<string, string> = {
  'completionRate': 'teal', 'onTimeRate': 'blue', 'avgScore': 'amber', 'correctionRate': 'green',
  'totalQuestions': 'purple', 'weakPoints': 'red',
};
const INDICATOR_BG: Record<string, string> = {
  'teal': 'bg-teal-100 text-teal-600', 'blue': 'bg-blue-100 text-blue-600', 'amber': 'bg-amber-100 text-amber-600',
  'green': 'bg-emerald-100 text-emerald-600', 'red': 'bg-red-100 text-red-600', 'purple': 'bg-purple-100 text-purple-600',
  'slate': 'bg-slate-100 text-slate-600',
};
const INDICATOR_VAL: Record<string, string> = {
  'teal': 'text-teal-700', 'blue': 'text-blue-700', 'amber': 'text-amber-700',
  'green': 'text-emerald-700', 'red': 'text-red-700', 'purple': 'text-purple-700', 'slate': 'text-slate-700',
};
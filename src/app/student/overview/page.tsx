'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import * as echarts from 'echarts';
import { BookOpen, Target, TrendingUp, FileText, ChevronRight, AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';

interface Indicator {
  label: string; value: number | string; unit?: string; color: string; icon?: string; trend?: string;
}
interface RadarItem { key: string; label: string; icon: string; score: number; }
interface TrendPoint { weeks: string[]; scores: number[]; classAvg: number[]; }
interface WeakItem { name: string; priority: string; masteryRate: number; detail?: string; lossWeight: number; }
interface CourseCompare { courseId: number; name: string; shortName: string; avgMastery: number; kpCount: number; errorCount: number; }

interface StudentProfile {
  student: { real_name: string; student_level: string; classRank?: number; student_no?: string };
  indicators: Indicator[];
  radarData: RadarItem[];
  trendData: TrendPoint[];
  weakTop10: WeakItem[];
  courseComparison: CourseCompare[];
  knowledgeStats: { mastered: number; total: number; weak: number; basic: number };
  courses: Array<{ id: number; name: string }>;
  selectedCourseId: number | null;
  courseData: {
    courseName: string;
    avgScore: number;
    completedCount: number;
    avgMastery: number;
    weakKps: Array<{ name: string; masteryRate: number }>;
    trend: Array<{ week: string; avgScore: number }>;
  } | null;
}

export default function StudentDashboard() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState<string>('all');
  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tracinglight_user');
    if (!stored) return;
    const user = JSON.parse(stored);
    setLoading(true);
    const qs = courseId !== 'all' ? `&course_id=${courseId}` : '';
    apiFetch(`/api/student/profile?student_id=${user.id}${qs}`)
      .then(r => r.json())
      .then(data => { if (data.success) setProfile(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  // Radar chart
  useEffect(() => {
    if (!profile?.radarData || !radarRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(radarRef.current!);
      const rd = profile.radarData || [];
      const indicator = rd.map((r: any) => ({ name: r.label, max: 100 }));
      chart.setOption({
        tooltip: { backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
        radar: { center: ['50%', '50%'], radius: '65%', indicator, axisName: { color: '#64748b', fontSize: 11 }, splitArea: { areaStyle: { color: ['#f8fafc', '#f1f5f9'] } } },
        series: [{
          type: 'radar', data: [{ value: rd.map((r: any) => r.score), name: '我的能力', areaStyle: { color: 'rgba(13,148,136,0.15)' }, lineStyle: { color: '#0d9488', width: 2 }, itemStyle: { color: '#0d9488' }, symbol: 'circle', symbolSize: 6 }],
        }],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 100);
    return () => clearTimeout(t);
  }, [profile]);

  // Trend chart
  useEffect(() => {
    if (!profile?.trendData || !trendRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(trendRef.current!);
      const td = profile.trendData || [];
      const weeks = td.map((t: any) => t.week);
      const scores = td.map((t: any) => t.avgScore);
      chart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
        legend: { data: ['我的成绩'], bottom: 0, textStyle: { fontSize: 12, color: '#64748b' }, itemWidth: 10, itemHeight: 10 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
        xAxis: { type: 'category', data: weeks, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
        yAxis: { type: 'value', min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        series: [
          { name: '我的成绩', type: 'line', data: scores, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#0d9488' }, itemStyle: { color: '#0d9488', borderColor: '#fff', borderWidth: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(13,148,136,0.15)' }, { offset: 1, color: 'rgba(13,148,136,0)' }]) } },
          // 班级均分数据暂不可用（学生端暂无班级对比）,
        ],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 100);
    return () => clearTimeout(t);
  }, [profile]);

  // Course comparison bar chart
  useEffect(() => {
    if (!profile?.courseComparison || !compareRef.current) return;
    const t = setTimeout(() => {
      const chart = echarts.init(compareRef.current!);
      const cd = profile.courseComparison;
      chart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);', formatter: (params: any) => { const p = params[0]; return `<strong>${p.name}</strong><br/>掌握度：${p.value}%<br/>知识点：${cd[p.dataIndex].kpCount} 个<br/>错题：${cd[p.dataIndex].errorCount} 题`; } },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
        xAxis: { type: 'category', data: cd.map(c => c.shortName), axisLabel: { fontSize: 12, color: '#64748b', fontWeight: 500 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
        yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { fontSize: 11, color: '#94a3b8' } },
        series: [
          { name: '掌握度', type: 'bar', data: cd.map(c => c.avgMastery), itemStyle: { borderRadius: [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#0d9488' }, { offset: 1, color: '#14b8a6' }]) }, barWidth: 28, label: { show: true, position: 'top', color: '#475569', fontSize: 11, fontWeight: 600, formatter: '{c}%' } },
        ],
      });
      const h = () => chart.resize();
      window.addEventListener('resize', h);
      return () => { window.removeEventListener('resize', h); chart.dispose(); };
    }, 100);
    return () => clearTimeout(t);
  }, [profile]);

  if (loading) return <DashboardSkeleton />;
  if (!profile) return <div className="flex items-center justify-center h-64 text-muted-foreground">数据加载失败</div>;

  const { student, indicators, weakTop10 } = profile;
  const ks = profile.knowledgeStats;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="w-12 h-12 ring-2 ring-teal-100"><AvatarFallback className="bg-teal-600 text-white text-lg font-semibold">{student.real_name?.slice(0, 1)}</AvatarFallback></Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">我的学情</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={levelBadgeMap[student.student_level] || 'border-slate-200'}>{levelLabelMap[student.student_level] || student.student_level}</Badge>
              <span className="text-sm text-muted-foreground">{student.real_name} · 班级排名 <span className="font-semibold text-slate-700">{student.classRank}</span></span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/student/assignments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-teal-600 transition-colors"><FileText className="w-4 h-4" />我的作业 <ChevronRight className="w-3 h-3" /></Link>
          <Link href="/student/errors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-teal-600 transition-colors"><AlertCircle className="w-4 h-4" />错题本 <ChevronRight className="w-3 h-3" /></Link>
        </div>
      </header>

      {/* 课程筛选：全部 / 按课程 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCourseId('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${courseId === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >全部</button>
        {profile.courses?.map((c) => (
          <button
            key={c.id}
            onClick={() => setCourseId(String(c.id))}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${courseId === String(c.id) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >{c.name}</button>
        ))}
      </div>

      {/* 课程学情概览（选课程时展示真实数据） */}
      {profile.courseData && (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40 py-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-violet-600" />
              <p className="text-sm font-semibold text-foreground">{profile.courseData.courseName} · 学情概览</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs text-muted-foreground">平均分</p>
                <p className="text-xl font-bold text-amber-600">{profile.courseData.avgScore}</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs text-muted-foreground">完成作业</p>
                <p className="text-xl font-bold text-blue-600">{profile.courseData.completedCount} 次</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs text-muted-foreground">知识掌握度</p>
                <p className="text-xl font-bold text-teal-600">{profile.courseData.avgMastery}%</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs text-muted-foreground">薄弱知识点</p>
                <p className="text-xl font-bold text-red-500">{profile.courseData.weakKps.length} 个</p>
              </div>
            </div>
            {profile.courseData.weakKps.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {profile.courseData.weakKps.map((w, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200">
                    {w.name} · {w.masteryRate}%
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metric Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 animate-stagger">
        {indicators.map((ind, i) => {
          const IconComp = INDICATOR_ICON_MAP[ind.icon || 'Target'] || Target;
          return (
            <Card key={i} className={`relative overflow-hidden border-0 group card-hover bg-gradient-to-br py-0 ${INDICATOR_GRADIENT[ind.color] || 'from-slate-50 to-white'} rounded-2xl`}>
              <CardContent className="p-5 relative">
                <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-white/40 group-hover:scale-110 transition-transform duration-300" />
                <div className="relative flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{ind.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${INDICATOR_BG[ind.color] || 'bg-slate-100'} flex items-center justify-center`}><IconComp className="w-4 h-4" /></div>
                </div>
                <div className={`relative text-3xl font-bold tracking-tight ${INDICATOR_VAL[ind.color] || 'text-slate-700'}`}>
                  {ind.value}
                  {ind.unit && <span className="text-sm font-normal text-muted-foreground ml-0.5">{ind.unit}</span>}
                </div>
                {ind.trend && <p className="relative text-xs text-muted-foreground mt-1.5">{ind.trend}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row 1: Radar + Trend */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-teal-500" />能力雷达</CardTitle></CardHeader>
          <CardContent className="pt-0"><div ref={radarRef} className="w-full h-72" /></CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" />成绩趋势</CardTitle></CardHeader>
          <CardContent className="pt-0"><div ref={trendRef} className="w-full h-72" /></CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Weak Points + Course Comparison */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" />薄弱知识点 Top {weakTop10.length}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {weakTop10.map((w, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50/80 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-slate-300 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.priority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <div className={`w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden`}>
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${w.masteryRate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-red-500 w-9">{w.masteryRate}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-soft rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-purple-500" />课程对比</CardTitle></CardHeader>
          <CardContent className="pt-0"><div ref={compareRef} className="w-full h-72" /></CardContent>
        </Card>
      </div>
    </div>
  );
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
  'totalQuestions': BookOpen, 'weakPoints': AlertCircle, 'studyDays': Zap,
};
const INDICATOR_COLOR_MAP: Record<string, string> = {
  'completionRate': 'teal', 'onTimeRate': 'blue', 'avgScore': 'amber', 'correctionRate': 'green',
  'totalQuestions': 'purple', 'weakPoints': 'red', 'studyDays': 'slate',
};
const INDICATOR_BG: Record<string, string> = {
  'teal': 'bg-teal-100 text-teal-600', 'blue': 'bg-blue-100 text-blue-600', 'amber': 'bg-amber-100 text-amber-600',
  'green': 'bg-emerald-100 text-emerald-600', 'red': 'bg-red-100 text-red-600', 'purple': 'bg-purple-100 text-purple-600',
  'slate': 'bg-slate-100 text-slate-600',
};
const INDICATOR_GRADIENT: Record<string, string> = {
  'teal': 'from-teal-50 to-white', 'blue': 'from-blue-50 to-white', 'amber': 'from-amber-50 to-white',
  'green': 'from-emerald-50 to-white', 'red': 'from-red-50 to-white', 'purple': 'from-purple-50 to-white',
  'slate': 'from-slate-50 to-white',
};
const INDICATOR_VAL: Record<string, string> = {
  'teal': 'text-teal-700', 'blue': 'text-blue-700', 'amber': 'text-amber-700',
  'green': 'text-emerald-700', 'red': 'text-red-700', 'purple': 'text-purple-700', 'slate': 'text-slate-700',
};

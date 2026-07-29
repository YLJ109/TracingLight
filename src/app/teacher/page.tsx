'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import * as echarts from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/dashboard-skeleton';
import { getCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { Users, TrendingUp, FileText, Award, ChevronRight, BarChart3, BookOpen, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { exportCsv } from '@/lib/export-utils';

// ─── Types (aligned with API response) ───
interface TrendData { weeks: string[]; classAvg: number[]; topLayer: number[]; mediumLayer: number[]; weakLayer: number[]; }
interface StudentSummary { id: number; name: string; level: string; avgScore: number; totalErrors: number; totalGradings: number; }
interface LevelDist { top: number; medium: number; weak: number; }
interface ErrorSummaryData { totalErrors: number; masteredCount: number; pendingCount: number; byLevel: { top: number; medium: number; weak: number }; }
interface AssignmentItem { id: number; title: string; endTime: string; submittedCount: number; totalStudents: number; avgScore: number; }
interface TeacherAnalytics {
  classAvg: number; totalStudents: number;
  levelDistribution: LevelDist; trendData: TrendData;
  errorSummary: ErrorSummaryData; students: StudentSummary[];
  assignmentCompletion: AssignmentItem[];
}

const levelLabelMap: Record<string, string> = { top: '全优层', medium: '勤奋中等层', weak: '提升层' };
const levelBadgeMap: Record<string, string> = { top: 'border-amber-300 text-amber-700 bg-amber-50', medium: 'border-yellow-300 text-yellow-700 bg-yellow-50', weak: 'border-red-300 text-red-700 bg-red-50' };

export default function TeacherDashboard() {
  const [data, setData] = useState<TeacherAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const trendRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      apiFetch(`/api/teacher/analytics?teacher_id=${user?.id || 1}`)
        .then(r => r.json())
        .then(json => { if (json.success) setData(json.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, []);

  // ─── Computed values ───
  const assignmentSummary = useMemo(() => {
    const ac = data?.assignmentCompletion || [];
    return {
      submitted: ac.reduce((s, a) => s + a.submittedCount, 0),
      total: ac.reduce((s, a) => s + a.totalStudents, 0),
      graded: ac.reduce((s, a) => s + a.submittedCount, 0), // submitted = graded (only completed tasks counted)
    };
  }, [data]);

  // ─── Trend Chart ───
  useEffect(() => {
    if (!data?.trendData || !trendRef.current) return;
    const chart = echarts.init(trendRef.current);
    const td = data.trendData;
    chart.setOption({
      tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);' },
      legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 10, itemHeight: 10, itemGap: 16 },
      grid: { left: '3%', right: '4%', top: '8%', bottom: '14%', containLabel: true },
      xAxis: { type: 'category', data: td.weeks, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      series: [
        { name: '班级均分', type: 'line', data: td.classAvg, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { color: '#0d9488', width: 2.5 }, itemStyle: { color: '#0d9488' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(13,148,136,0.12)' }, { offset: 1, color: 'rgba(13,148,136,0)' }]) } },
        { name: '全优层', type: 'line', data: td.topLayer, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#eab308', width: 2, type: 'dashed' }, itemStyle: { color: '#eab308' } },
        { name: '中等层', type: 'line', data: td.mediumLayer, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' }, itemStyle: { color: '#f59e0b' } },
        { name: '提升层', type: 'line', data: td.weakLayer, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#ef4444', width: 2, type: 'dashed' }, itemStyle: { color: '#ef4444' } },
      ],
    });
    const h = () => chart.resize();
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); chart.dispose(); };
  }, [data]);

  // ─── Level Distribution Pie Chart ───
  useEffect(() => {
    if (!data?.levelDistribution || !levelRef.current) return;
    const chart = echarts.init(levelRef.current);
    const ld = data.levelDistribution;
    chart.setOption({
      tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);', formatter: '{b}: {c} 人 ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 10, itemHeight: 10, itemGap: 16 },
      series: [{
        type: 'pie', radius: ['55%', '78%'], center: ['50%', '45%'], avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        data: [
          { value: ld.top, name: '全优层', itemStyle: { color: '#eab308' } },
          { value: ld.medium, name: '勤奋中等层', itemStyle: { color: '#f59e0b' } },
          { value: ld.weak, name: '提升层', itemStyle: { color: '#ef4444' } },
        ],
      }],
    });
    const h = () => chart.resize();
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); chart.dispose(); };
  }, [data]);

  // ─── Error Distribution Bar Chart ───
  useEffect(() => {
    if (!data?.errorSummary?.byLevel || !errorRef.current) return;
    const chart = echarts.init(errorRef.current);
    const bl = data.errorSummary.byLevel;
    chart.setOption({
      tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155' }, extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);' },
      grid: { left: '3%', right: '8%', top: '10%', bottom: '10%', containLabel: true },
      xAxis: { type: 'category', data: ['全优层', '勤奋中等层', '提升层'], axisLine: { lineStyle: { color: '#e2e8f0' } }, axisTick: { show: false }, axisLabel: { color: '#64748b', fontSize: 11 } },
      yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      series: [{
        type: 'bar', barWidth: '40%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: [
          { value: bl.top, itemStyle: { color: '#eab308' } },
          { value: bl.medium, itemStyle: { color: '#f59e0b' } },
          { value: bl.weak, itemStyle: { color: '#ef4444' } },
        ],
      }],
    });
    const h = () => chart.resize();
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); chart.dispose(); };
  }, [data]);

  if (loading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="animate-fade-in-up space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 ring-2 ring-teal-100">
            <BarChart3 className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">教学总览</h2>
            <p className="text-xs text-slate-500">共 {data.totalStudents} 名学生</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/teacher/assignments/new" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-700 transition-colors">
            <FileText className="h-3.5 w-3.5" />发布作业
          </Link>
          <button
            onClick={() => {
              const rows = data.students.map(s => ({
                姓名: s.name, 层级: levelLabelMap[s.level] || s.level,
                均分: s.avgScore, 错题数: s.totalErrors,
              }));
              exportCsv('教学总览_学生数据', [
                { header: '姓名', key: '姓名' }, { header: '层级', key: '层级' },
                { header: '均分', key: '均分' }, { header: '错题数', key: '错题数' },
              ], rows);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />导出
          </button>
          <Link href="/teacher/questions/bank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <BookOpen className="h-3.5 w-3.5" />题库管理
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '班级均分', value: `${data.classAvg}`, unit: '分', icon: TrendingUp, color: 'teal', trend: null },
          { label: '学生总数', value: `${data.totalStudents}`, unit: '人', icon: Users, color: 'blue', trend: null },
          { label: '错题总数', value: `${data.errorSummary.totalErrors}`, unit: '题', icon: AlertCircle, color: 'amber', trend: `已掌握 ${data.errorSummary.masteredCount} 题 · 待复习 ${data.errorSummary.pendingCount} 题` },
          { label: '作业提交', value: `${assignmentSummary.submitted}`, unit: `/${assignmentSummary.total}`, icon: FileText, color: 'violet', trend: `已批改 ${assignmentSummary.graded} 份` },
        ].map((stat, i) => {
          const colors: Record<string, string> = { teal: 'bg-teal-50 text-teal-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600' };
          return (
            <Card key={i} className="border-slate-200/60 shadow-sm card-hover">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}<span className="text-sm font-normal text-slate-400 ml-0.5">{stat.unit}</span></p>
                    {stat.trend && <p className="mt-1 text-xs text-slate-400">{stat.trend}</p>}
                  </div>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[stat.color]}`}>
                    <stat.icon className="h-4.5 w-4.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row: Trend + Level Distribution */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="border-slate-200/60 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-700">成绩趋势</CardTitle></CardHeader>
          <CardContent><div ref={trendRef} className="h-64 w-full" /></CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-700">学生分层</CardTitle></CardHeader>
          <CardContent><div ref={levelRef} className="h-64 w-full" /></CardContent>
        </Card>
      </div>

      {/* Error Summary + At-Risk Students */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-700">错题分布（按分层）</CardTitle>
            <Badge variant="secondary" className="text-xs">{data.errorSummary.pendingCount} 题待复习</Badge>
          </CardHeader>
          <CardContent><div ref={errorRef} className="h-56 w-full" /></CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-700">需要关注的学生</CardTitle>
            <Link href="/teacher/students" className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-0.5">全部<ChevronRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.students
              .filter(s => s.totalErrors >= 5)
              .sort((a, b) => b.totalErrors - a.totalErrors)
              .slice(0, 6)
              .map((s, i) => (
                <Link key={s.id} href={`/teacher/students/${s.id}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-slate-50 group transition-colors border-l-4 border-red-300">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-medium text-slate-400 w-4">{i + 1}</span>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-600 ring-1 ring-red-100">{s.name[0]}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">{levelLabelMap[s.level] || s.level} · 均分 {s.avgScore.toFixed(0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-500 font-medium">{s.totalErrors} 个错题</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </Link>
              ))}
            {data.students.filter(s => s.totalErrors >= 5).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">所有学生学习状态良好</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Students */}
      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-700">优秀学生</CardTitle>
          <Link href="/teacher/students" className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-0.5">全部<ChevronRight className="h-3 w-3" /></Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.students
              .sort((a, b) => b.avgScore - a.avgScore)
              .slice(0, 6)
              .map((s) => (
                <Link key={s.id} href={`/teacher/students/${s.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5 hover:border-teal-200 hover:bg-teal-50/30 transition-all group">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-50 text-sm font-bold text-teal-700 ring-2 ring-teal-100">{s.name[0]}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`text-xs px-1.5 py-0 ${levelBadgeMap[s.level] || 'border-slate-200 text-slate-500 bg-slate-50'}`}>{levelLabelMap[s.level] || s.level}</Badge>
                      <span className="text-xs text-slate-400">均分 {s.avgScore.toFixed(0)}</span>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { apiFetch } from '@/lib/api-fetch';
import { getCurrentUser } from '@/lib/auth-helper';
import { SetActiveNav } from '@/components/app-shell';
import { Maximize2, RefreshCw, Users, BookOpen, ClipboardCheck, Activity, Gauge, AlertTriangle, Inbox } from 'lucide-react';

interface DashData {
  updatedAt: string;
  cards: { totalStudents: number; totalTeachers: number; totalCourses: number; totalAssignments: number; todayActive: number; completedTasks: number; pendingTasks: number; avgMastery: number; masteryPoints: number };
  submissionRate: number;
  masteryDist: { strong: number; medium: number; weak: number; strongCount: number; mediumCount: number; weakCount: number };
  courseComparison: Array<{ name: string; avgMastery: number; kpCount: number }>;
  signHeatmap: Array<{ date: string; count: number }>;
  weakTopics: Array<{ name: string; course: string; avgMastery: number; count: number }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [tick, setTick] = useState(0);
  const dashRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLDivElement>(null);
  const courseRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const distChart = useRef<echarts.ECharts | null>(null);
  const courseChart = useRef<echarts.ECharts | null>(null);
  const heatChart = useRef<echarts.ECharts | null>(null);

  useEffect(() => { getCurrentUser().then((u) => u && u.role !== 'admin' && (window.location.href = '/')); }, []);

  const fetchData = useCallback(async () => {
    try {
      const r = await apiFetch('/api/admin/dashboard');
      const j = await r.json();
      if (j.success) setData(j.data);
    } catch { /* */ }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // 自动刷新（30s）
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (tick > 0) fetchData(); }, [tick, fetchData]);

  // ===== 掌握度分布饼图 =====
  useEffect(() => {
    if (!data || !distRef.current) return;
    distChart.current?.dispose();
    distChart.current = echarts.init(distRef.current);
    distChart.current.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
      color: ['#10b981', '#f59e0b', '#ef4444'],
      series: [{
        type: 'pie', radius: ['45%', '68%'], center: ['50%', '45%'],
        label: { color: '#cbd5e1', fontSize: 11 },
        data: [
          { name: '已掌握', value: data.masteryDist.strongCount },
          { name: '需加强', value: data.masteryDist.mediumCount },
          { name: '薄弱', value: data.masteryDist.weakCount },
        ],
      }],
    });
    return () => distChart.current?.dispose();
  }, [data]);

  // ===== 课程掌握度对比 =====
  useEffect(() => {
    if (!data || !courseRef.current) return;
    courseChart.current?.dispose();
    courseChart.current = echarts.init(courseRef.current);
    courseChart.current.setOption({
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>掌握度: ${p[0].value}%` },
      grid: { top: 10, right: 30, bottom: 20, left: 50 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'category', data: data.courseComparison.map((c) => c.name), axisLabel: { color: '#cbd5e1', fontSize: 11 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#334155' } } },
      series: [{
        type: 'bar', barWidth: 14,
        data: data.courseComparison.map((c) => ({
          value: c.avgMastery,
          itemStyle: { color: c.avgMastery >= 80 ? '#10b981' : c.avgMastery >= 60 ? '#f59e0b' : '#ef4444', borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: 'right', formatter: '{c}%', color: '#94a3b8', fontSize: 11 },
      }],
    });
    return () => courseChart.current?.dispose();
  }, [data]);

  // ===== 近7天签到热力 =====
  useEffect(() => {
    if (!data || !heatRef.current) return;
    heatChart.current?.dispose();
    heatChart.current = echarts.init(heatRef.current);
    heatChart.current.setOption({
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>签到: ${p[0].value} 人` },
      grid: { top: 10, right: 20, bottom: 24, left: 40 },
      xAxis: { type: 'category', data: data.signHeatmap.map((d) => d.date), axisLabel: { color: '#94a3b8', fontSize: 11 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        type: 'bar', data: data.signHeatmap.map((d) => d.count),
        itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#2dd4bf' }, { offset: 1, color: '#0d9488' }] }, borderRadius: [4, 4, 0, 0] },
        barWidth: '55%',
      }],
    });
    return () => heatChart.current?.dispose();
  }, [data]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
    else await document.exitFullscreen().catch(() => {});
  };

  // 窗口尺寸变化时自适应图表，避免容器拉伸后图表错位
  useEffect(() => {
    const onResize = () => {
      [distChart, courseChart, heatChart].forEach((c) => c.current?.resize());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cards = [
    { label: '在校学生', value: data?.cards.totalStudents ?? 0, icon: <Users className="w-5 h-5" />, tint: 'text-teal-400' },
    { label: '授课教师', value: data?.cards.totalTeachers ?? 0, icon: <Users className="w-5 h-5" />, tint: 'text-blue-400' },
    { label: '今日活跃', value: data?.cards.todayActive ?? 0, icon: <Activity className="w-5 h-5" />, tint: 'text-amber-400' },
    { label: '平均掌握度', value: `${data?.cards.avgMastery ?? 0}%`, icon: <Gauge className="w-5 h-5" />, tint: 'text-emerald-400' },
    { label: '作业完成率', value: `${data?.submissionRate ?? 0}%`, icon: <ClipboardCheck className="w-5 h-5" />, tint: 'text-violet-400' },
    { label: '已批改任务', value: data?.cards.completedTasks ?? 0, icon: <Activity className="w-5 h-5" />, tint: 'text-pink-400' },
  ];

  return (
    <div ref={dashRef} className="min-h-screen bg-slate-950 p-6 text-slate-100 space-y-6 rounded-xl">
      <SetActiveNav href="/admin/dashboard" />

      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wider flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse inline-block" />
            溯光智慧教育 · 数据大屏
          </h1>
          <p className="text-xs text-slate-500 mt-1">实时聚合学情 · 更新于 {data ? new Date(data.updatedAt).toLocaleTimeString('zh-CN') : '…'}（每30秒刷新）</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"><RefreshCw className="w-3.5 h-3.5" />刷新</button>
          <button onClick={toggleFullscreen} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white transition-colors"><Maximize2 className="w-3.5 h-3.5" />全屏</button>
        </div>
      </div>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className={`flex items-center gap-2 mb-3 ${c.tint}`}>{c.icon}<span className="text-xs text-slate-400">{c.label}</span></div>
            <p className="text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">知识点掌握度分布</h3>
          <div ref={distRef} className="h-56" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">各课程平均掌握度</h3>
          <div ref={courseRef} className="h-56" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">近7天每日签到</h3>
          <div ref={heatRef} className="h-56" />
        </div>
      </div>

      {/* 实时监控行 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 待批改任务 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4"><Inbox className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-slate-300">实时待批改</h3></div>
          <p className="text-4xl font-extrabold text-amber-400 leading-none">{data?.cards.pendingTasks ?? 0}</p>
          <p className="text-xs text-slate-500 mt-2">作业与考试主观题累计待批任务（教师采纳后清零）</p>
          <p className="text-xs text-slate-500 mt-1">已批改 {data?.cards.completedTasks ?? 0} 条</p>
        </div>

        {/* 薄弱知识点 TOP5 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-red-400" /><h3 className="text-sm font-semibold text-slate-300">薄弱知识点 TOP5</h3></div>
          {!data?.weakTopics || data.weakTopics.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">暂无薄弱点，掌握情况良好</p>
          ) : (
            <ul className="space-y-2.5">
              {data.weakTopics.map((w) => (
                <li key={w.name} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{w.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{w.course} · 样本 {w.count}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-red-400">{w.avgMastery}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 掌握度分布横条 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4"><Gauge className="w-4 h-4 text-emerald-400" /><h3 className="text-sm font-semibold text-slate-300">掌握度分布</h3></div>
          <div className="flex h-4 rounded-full overflow-hidden my-auto">
            <div className="bg-emerald-500" style={{ width: `${data?.masteryDist.strong ?? 0}%` }} />
            <div className="bg-amber-500" style={{ width: `${data?.masteryDist.medium ?? 0}%` }} />
            <div className="bg-red-500" style={{ width: `${data?.masteryDist.weak ?? 0}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 mt-3">
            <span>已掌握 {data?.masteryDist.strong ?? 0}%</span>
            <span>需加强 {data?.masteryDist.medium ?? 0}%</span>
            <span>薄弱 {data?.masteryDist.weak ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* 底部概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '课程数量', value: data?.cards.totalCourses ?? 0, icon: <BookOpen className="w-4 h-4" /> },
          { label: '作业总数', value: data?.cards.totalAssignments ?? 0, icon: <ClipboardCheck className="w-4 h-4" /> },
          { label: '掌握度样本', value: data?.cards.masteryPoints ?? 0, icon: <Gauge className="w-4 h-4" /> },
          { label: '已掌握知识点', value: data?.masteryDist.strongCount ?? 0, icon: <Activity className="w-4 h-4" /> },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-teal-400">{c.icon}</div>
            <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-slate-500">{c.label}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
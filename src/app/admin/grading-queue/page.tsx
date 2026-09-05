'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as echarts from 'echarts';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Activity, Clock, CheckCircle2, AlertTriangle, Loader2, RotateCcw, Zap, RefreshCw } from 'lucide-react';

interface QueueStats { pending: number; processing: number; completed: number; failed: number; stuck: number; }
interface TrendPoint { date: string; pending: number; completed: number; }
interface QueueItem {
  id: number; studentName: string; assignmentTitle: string; questionId: number;
  questionContent: string; courseName: string; questionType: string;
  totalScore: number | null; fullScore: number;
  status: string; retryCount: number; errorMessage: string | null;
  createdAt: string | null; completedAt: string | null;
}
interface PageData {
  stats: QueueStats;
  overTimeTrend: TrendPoint[];
  list: QueueItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '排队中', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  processing: { label: '处理中', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: '失败', cls: 'bg-red-50 text-red-700 border-red-200' },
};
const ALL_STAT_FILTERS = ['', 'pending', 'processing', 'failed'] as const;

export default function AdminGradingQueue() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const trendRef = useRef<HTMLDivElement>(null);
  const trendChart = useRef<echarts.ECharts | null>(null);

  // 强制完成任务表单
  const [repairTarget, setRepairTarget] = useState<QueueItem | null>(null);
  const [repairType, setRepairType] = useState<'retry' | 'force_complete'>('retry');
  const [forceScore, setForceScore] = useState('');
  const [saving, setSaving] = useState(false);

  const openRepair = (it: QueueItem, type: 'retry' | 'force_complete') => {
    setForceScore('');
    setRepairType(type);
    setRepairTarget(it);
  };

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (s) q.set('status', s);
      const r = await apiFetch(`/api/admin/grading-queue?${q}`);
      const d = await r.json();
      if (d.success) { setData(d); setPage(p); }
      else toast.error(d.error || '加载失败');
    } catch (e) {
      console.error(e);
      toast.error('加载批改队列失败');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => { load(1, status); }, [status, load]);

  // 趋势图
  useEffect(() => {
    if (!data || !trendRef.current) return;
    const chart = echarts.init(trendRef.current);
    trendChart.current = chart;
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: ['排队中', '已完成'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: 32, right: 24, top: 20, bottom: 36, containLabel: true },
      xAxis: { type: 'category', data: data.overTimeTrend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '排队中', type: 'line', smooth: true, data: data.overTimeTrend.map((t) => t.pending), itemStyle: { color: '#f59e0b' }, areaStyle: { opacity: 0.12 } },
        { name: '已完成', type: 'line', smooth: true, data: data.overTimeTrend.map((t) => t.completed), itemStyle: { color: '#10b981' }, areaStyle: { opacity: 0.12 } },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(trendRef.current);
    const c = chart;
    return () => { ro.disconnect(); c.dispose(); trendChart.current = null; };
  }, [data]);

  const onRepair = async (action: 'retry' | 'force_complete') => {
    if (!repairTarget) return;
    if (action === 'force_complete' && forceScore !== '' && Number(forceScore) <= 0) {
      toast.error('强制分数必须大于 0');
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch('/api/admin/grading-queue/repair', {
        method: 'POST',
        body: JSON.stringify({
          task_id: repairTarget.id,
          action,
          force_score: action === 'force_complete' && forceScore !== '' ? Number(forceScore) : undefined,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(action === 'retry' ? '已重试该任务' : '已强制完成该任务');
        setRepairTarget(null);
        setForceScore('');
        load(page, status);
      } else {
        toast.error(d.error || '操作失败');
      }
    } catch (e) {
      console.error(e);
      toast.error('操作失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const stats = data?.stats;
  const statCards = [
    { label: '排队中', value: stats?.pending ?? 0, icon: Clock, tone: 'from-amber-400 to-orange-500' },
    { label: '处理中', value: stats?.processing ?? 0, icon: Activity, tone: 'from-blue-400 to-indigo-500' },
    { label: '已完成', value: stats?.completed ?? 0, icon: CheckCircle2, tone: 'from-emerald-400 to-teal-500' },
    { label: '失败', value: stats?.failed ?? 0, icon: AlertTriangle, tone: 'from-red-400 to-rose-500' },
    { label: '疑似卡住', value: stats?.stuck ?? 0, icon: RefreshCw, tone: 'from-slate-400 to-slate-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">批改队列</h1>
            <p className="text-sm text-muted-foreground">AI 批改任务排队与运行状态，异常的排队任务可在此重试或强制完成</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(page, status)} disabled={fetching}>
          {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          刷新
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="border-0 shadow-sm py-0">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">任务总计</p>
                  <p className="text-2xl font-bold">{(data?.pagination.total ?? 0)}</p>
                </div>
                <Activity className="w-8 h-8 text-teal-500 opacity-70" />
              </CardContent>
            </Card>
            {statCards.slice(0, 4).map((c) => (
              <Card key={c.label} className="border-0 shadow-sm py-0">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tone} flex items-center justify-center text-white`}>
                    <c.icon className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{c.label}</p>
                  <p className="text-2xl font-bold">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-0 shadow-sm py-0">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">近 7 天排队 / 完成趋势</p>
              <div ref={trendRef} className="w-full" style={{ height: 220 }} />
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            {ALL_STAT_FILTERS.map((f) => {
              const label = f === '' ? '全部' : STATUS_META[f].label;
              return (
                <button key={f || 'all'} onClick={() => setStatus(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${status === f ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {label}
                </button>
              );
            })}
          </div>

          <Card className="border-0 shadow-sm py-0">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50/60">
                    <th className="px-4 py-2.5 font-medium">任务</th>
                    <th className="px-4 py-2.5 font-medium">学生</th>
                    <th className="px-4 py-2.5 font-medium">作业</th>
                    <th className="px-4 py-2.5 font-medium">课程 / 题型</th>
                    <th className="px-4 py-2.5 font-medium">题目</th>
                    <th className="px-4 py-2.5 font-medium">状态</th>
                    <th className="px-4 py-2.5 font-medium">得分</th>
                    <th className="px-4 py-2.5 font-medium">错误</th>
                    <th className="px-4 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.list ?? []).map((it) => {
                    const meta = STATUS_META[it.status] || { label: it.status, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
                    const canRepair = it.status !== 'completed';
                    return (
                      <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">#{it.id}</td>
                        <td className="px-4 py-2.5">{it.studentName || `用户${it.questionId}`}</td>
                        <td className="px-4 py-2.5 max-w-[160px] truncate">{it.assignmentTitle || '-'}</td>
                        <td className="px-4 py-2.5 max-w-[140px]">
                          <div className="truncate text-xs">{it.courseName || '-'}</div>
                          <div className="text-[11px] text-muted-foreground">{it.questionType || '-'}</div>
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px] truncate text-xs text-muted-foreground">{it.questionContent || '-'}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={meta.cls} variant="outline">{meta.label}{it.retryCount ? ` ·${it.retryCount}次` : ''}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono">{it.totalScore ?? '-'}<span className="text-muted-foreground text-xs">/{it.fullScore}</span></td>
                        <td className="px-4 py-2.5 max-w-[140px] truncate text-xs text-red-500">{it.errorMessage || '-'}</td>
                        <td className="px-4 py-2.5">
                          {canRepair ? (
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => openRepair(it, 'retry')} className="h-7 text-xs">
                                <RotateCcw className="w-3 h-3 mr-1" />重试
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openRepair(it, 'force_complete')} className="h-7 text-xs text-emerald-600">
                                <Zap className="w-3 h-3 mr-1" />强制完成
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.list.length === 0) && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">暂无批改任务</td></tr>
                  )}
                </tbody>
              </table>
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <span className="text-xs text-muted-foreground">共 {data.pagination.total} 条</span>
                  <div className="flex gap-2 items-center">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1, status)}>上一页</Button>
                    <span className="text-xs">{page} / {data.pagination.totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => load(page + 1, status)}>下一页</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 修复对话框 */}
      <Dialog open={repairTarget !== null} onOpenChange={(o) => { if (!o) { setRepairTarget(null); setForceScore(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{repairType === 'retry' ? '重试批改任务' : '强制完成批改任务'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              任务 #{repairTarget?.id}（{repairTarget?.studentName} · {repairTarget?.assignmentTitle}）：当前状态 {repairTarget ? (STATUS_META[repairTarget.status]?.label ?? repairTarget.status) : ''}
            </p>
            {repairType === 'force_complete' && (
              <div>
                <label className="text-xs text-muted-foreground">强制完成分数（0~{repairTarget?.fullScore}）</label>
                <Input type="number" min={0} max={repairTarget?.fullScore ?? 100} value={forceScore}
                  onChange={(e) => setForceScore(e.target.value)} placeholder={`留空则沿用 ${repairTarget?.totalScore ?? 0} 分`} className="mt-1" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRepairTarget(null); setForceScore(''); }}>取消</Button>
            <Button onClick={() => onRepair(repairType)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              确认{repairType === 'retry' ? '重试' : '强制完成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
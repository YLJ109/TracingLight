'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDateTime, formatRelative } from '@/lib/date';
import { BackButton } from '@/components/ui/back-button';
import { Users, RefreshCw, GraduationCap, TriangleAlert, Timer, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonitorStudent {
  student: { id: number; real_name: string; username: string; class_name: string };
  enroll_status: string;
  allow: boolean;
  state: 'pending' | 'active' | 'expired' | 'paused' | 'submitted' | 'absent';
  attempt: {
    id: number; started_at: string; deadline: string; submitted_at: string | null;
    status: string; risk_score: number; risk_flags: unknown; switch_count: number;
    fullscreen_exit_count: number; face_verified: boolean; face_strategy: string | null;
    submitted_via: string | null; device_fp: string | null;
  } | null;
  events: Array<{ id: number; type: string; severity: string; detail: unknown; created_at: string }>;
  recent_event: { type: string; severity: string; created_at: string } | null;
}
interface MonitorPayload {
  exam: { id: number; title: string; status: string; start_at: string; end_at: string | null; config: unknown };
  rows: MonitorStudent[];
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  active: { label: '进行中', cls: 'bg-teal-100 text-teal-700' },
  expired: { label: '超时', cls: 'bg-red-100 text-red-600' },
  submitted: { label: '已交卷', cls: 'bg-indigo-100 text-indigo-700' },
  pending: { label: '未开始', cls: 'bg-slate-100 text-slate-500' },
  paused: { label: '暂停', cls: 'bg-amber-100 text-amber-700' },
  absent: { label: '缺考', cls: 'bg-amber-50 text-amber-600' },
};

const EVENT_LABELS: Record<string, string> = {
  switch_away: '切屏', fullscreen_exit: '退全屏', fullscreen_revoke: '取消全屏', devtools: '开发者工具',
  copy: '复制', paste: '粘贴', blur: '失焦', face_absent: '人脸离席', multi_face: '多人脸',
  device_change: '换设备', zoom: '缩放', resize: '窗口缩放',
};

function riskOf(row: MonitorStudent): number {
  return row.attempt?.risk_score ?? 0;
}
function isAbnormal(row: MonitorStudent): boolean {
  if (riskOf(row) >= 60) return true;
  return row.recent_event?.severity === 'red' || row.recent_event?.severity === 'critical';
}

export default function ExamMonitorPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [exam, setExam] = useState<MonitorPayload['exam'] | null>(null);
  const rowsRef = useRef<MonitorStudent[]>([]);
  const [rows, setRows] = useState<MonitorStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [extendVal, setExtendVal] = useState('5');

  const applyRows = useCallback((next: MonitorStudent[]) => {
    rowsRef.current = next;
    setRows(next);
    // 清理已不存在的选中项
    setSelected((prev) => {
      const ids = new Set(next.map((r) => r.student.id));
      return new Set([...prev].filter((x) => ids.has(x)));
    });
  }, []);

  const load = useCallback(async (silent: boolean) => {
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/monitor`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (!silent) toast.error(j.error || '加载失败');
        return;
      }
      const j: MonitorPayload = await res.json();
      setExam(j.exam);
      applyRows(j.rows);
    } catch {
      if (!silent) toast.error('网络异常');
    } finally {
      setLoading(false);
    }
  }, [id, applyRows]);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.state === 'active').length;
    const submitted = rows.filter((r) => r.state === 'submitted').length;
    const abnormal = rows.filter(isAbnormal).length;
    return { total, active, submitted, abnormal };
  }, [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(rows.map((r) => r.student.id)));
    else setSelected(new Set());
  };
  const toggleOne = (sid: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sid); else next.delete(sid);
      return next;
    });
  };

  const doAction = async (action: 'terminate' | 'extend' | 'remind', extraMinutes?: number) => {
    if (selected.size === 0) { toast.error('请先选择考生'); return; }
    setActing(true);
    try {
      const body: Record<string, unknown> = { action, student_ids: [...selected] };
      if (action === 'extend') body.extra_minutes = Number(extraMinutes) || 5;
      const res = await apiFetch(`/api/teacher/exams/${id}/monitor`, { method: 'POST', body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '操作失败'); return; }
      if (action === 'terminate') toast.success(`已结束 ${selected.size} 名考生的考试`);
      else if (action === 'extend') toast.success(`已为 ${selected.size} 名考生延长 ${j.extended || selected.size} 分钟`);
      else toast.success(`已向 ${selected.size} 名考生发送提醒`);
      setSelected(new Set());
      load(true);
    } catch { toast.error('网络异常'); }
    setActing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton to="/teacher/exams" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">实时监考台</h1>
        <Badge className="bg-gradient-to-r from-violet-600 to-teal-600 text-white">{exam?.title || '…'}</Badge>
        {exam?.status === 'active' && <Badge className="bg-teal-100 text-teal-700 animate-pulse">考试进行中</Badge>}
        <div className="flex-1" />
        <Button variant="outline" onClick={() => load(false)} className="cursor-pointer"><RefreshCw className="w-4 h-4" />刷新</Button>
        <Button variant="outline" onClick={() => router.push(`/teacher/exams/${id}`)} className="cursor-pointer">考试详情</Button>
      </div>

      {/* 统计数据卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '总报考', value: stats.total, icon: Users, cls: 'from-violet-500 to-indigo-500' },
          { label: '进行中', value: stats.active, icon: Timer, cls: 'from-teal-500 to-emerald-500' },
          { label: '已交卷', value: stats.submitted, icon: GraduationCap, cls: 'from-indigo-500 to-blue-500' },
          { label: '异常', value: stats.abnormal, icon: TriangleAlert, cls: 'from-rose-500 to-red-500' },
        ].map((s) => (
          <Card key={s.label} className="border-slate-200/60 shadow-sm overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shadow-md', s.cls)}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className={cn('text-2xl font-bold', s.label === '异常' ? 'text-rose-500' : 'text-slate-800')}>{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 工具条 */}
      <Card className="border-slate-200/60 shadow-sm">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={(v: boolean) => toggleAll(!!v)} />
            全选
          </label>
          <span className="text-sm text-slate-400">已选 <b className="text-violet-600">{selected.size}</b> 人</span>
          <div className="flex-1" />
          <Button variant="destructive" size="sm" disabled={selected.size === 0 || acting} onClick={() => doAction('terminate')} className="cursor-pointer">
            <Timer className="w-4 h-4" />结束考试交卷
          </Button>
          <div className="flex items-center gap-1">
            <Input type="number" min={1} value={extendVal} onChange={(e) => setExtendVal(e.target.value)} className="w-20 h-8 text-center" />
            <Button variant="outline" size="sm" disabled={selected.size === 0 || acting} onClick={() => doAction('extend', Number(extendVal))} className="cursor-pointer">延长分钟</Button>
          </div>
          <Button variant="secondary" size="sm" disabled={selected.size === 0 || acting} onClick={() => doAction('remind')} className="cursor-pointer">
            <BellRing className="w-4 h-4" />提醒该生
          </Button>
        </div>
      </Card>

      {/* 学生卡片网格 */}
      {loading && rows.length === 0 ? (
        <div className="animate-pulse h-64 bg-slate-100 rounded-2xl" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => {
            const risk = riskOf(row);
            const abnormal = isAbnormal(row);
            const st = STATE_META[row.state] || STATE_META.pending;
            const seen = row.events.some((e) => e.severity === 'critical') || row.recent_event?.severity === 'critical';
            return (
              <div key={row.student.id} className="relative">
                {hovered === row.student.id && row.events.length > 0 && (
                  <div className="absolute -top-1 left-1 right-1 z-20 p-3 bg-white border border-slate-200 rounded-xl shadow-xl">
                    <p className="text-xs font-semibold text-slate-600 mb-2">最近事件时间线</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {row.events.slice().reverse().map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ev.severity === 'critical' ? 'bg-red-500' : ev.severity === 'red' ? 'bg-orange-400' : 'bg-slate-300')} />
                          <span className={cn('shrink-0', ev.severity === 'critical' && 'text-red-600 font-semibold')}>{EVENT_LABELS[ev.type] || ev.type}</span>
                          <span className="text-slate-400 ml-auto">{formatRelative(ev.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Card
                  onMouseEnter={() => setHovered(row.student.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    'border-slate-200/60 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-default',
                    abnormal && 'ring-2 ring-rose-400 border-rose-300'
                  )}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected.has(row.student.id)}
                        onCheckedChange={(v: boolean) => toggleOne(row.student.id, !!v)}
                        className="mt-1 cursor-pointer"
                      />
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 text-white text-base font-bold flex items-center justify-center shrink-0">
                        {row.student.real_name[0] || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{row.student.real_name}</p>
                        <p className="text-xs text-slate-400 truncate">{row.student.class_name || row.student.username}</p>
                      </div>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={risk >= 60 ? 'text-rose-600 font-semibold' : 'text-slate-400'}>风险分</span>
                        <span className={risk >= 60 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>{Math.round(risk)}</span>
                      </div>
                      <Progress value={risk} className={cn('h-1.5', risk >= 60 ? '[&>div]:bg-rose-500' : risk >= 40 ? '[&>div]:bg-amber-400' : '[&>div]:bg-teal-500')} />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {row.attempt && (
                        <>
                          <Badge className="bg-slate-100 text-slate-600">切屏 {row.attempt.switch_count ?? 0}</Badge>
                          <Badge className="bg-slate-100 text-slate-600">退全屏 {row.attempt.fullscreen_exit_count ?? 0}</Badge>
                          {row.attempt.face_verified && <Badge className="bg-emerald-50 text-emerald-600">已人脸核验</Badge>}
                        </>
                      )}
                      {row.recent_event && (
                        <Badge className={cn('border', seen ? 'bg-red-50 text-red-600 border-red-200' : row.recent_event.severity === 'red' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-amber-50 text-amber-600 border-amber-200')}>
                          {EVENT_LABELS[row.recent_event.type] || row.recent_event.type}
                        </Badge>
                      )}
                    </div>

                    {row.attempt?.deadline && (
                      <p className="text-xs text-slate-400">截止 {formatDateTime(row.attempt.deadline)}</p>
                    )}
                    {row.attempt?.submitted_at && (
                      <p className="text-xs text-slate-400">交卷 {formatDateTime(row.attempt.submitted_at)}</p>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="col-span-full text-center text-slate-400 py-16">暂无报考学生</div>
          )}
        </div>
      )}
    </div>
  );
}
'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldCheck, ShieldAlert, Copy, ClipboardPaste, Minimize2, Clock, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';

interface PasteRecord { questionId: number | null; preview: string; at: string }

interface MonitorRow {
  studentId: number;
  studentName: string;
  studentLevel: string;
  submitted: boolean;
  monitor: {
    copy_count: number;
    paste_count: number;
    blur_count: number;
    blur_seconds: number;
    time_spent_seconds: number;
    paste_records: PasteRecord[];
    suspicious_flag: boolean;
    suspicious_reason: string | null;
    snapshot: Record<string, unknown> | null;
  } | null;
}

interface MonitorData {
  assignment_id: number;
  monitor_config: Record<string, unknown>;
  rows: MonitorRow[];
  suspicious_count: number;
}

const levelLabels: Record<string, string> = { top: '全优层', medium: '勤奋中等层', weak: '提升层' };

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export default function TeacherAssignmentMonitorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/monitor`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setConfig(json.data.monitor_config || {});
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载监控数据...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <p>无法加载监控数据</p>
        <Button variant="outline" onClick={() => router.back()} className="gap-1.5 text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300"><ArrowLeft className="w-4 h-4" />返回</Button>
      </div>
    );
  }

  const rows = data.rows;
  const submittedRows = rows.filter(r => r.submitted);
  const monitoredRows = rows.filter(r => r.monitor);
  const suspiciousRows = rows.filter(r => r.monitor?.suspicious_flag);
  const avgBlur = monitoredRows.length ? Math.round(monitoredRows.reduce((s, r) => s + (r.monitor?.blur_count || 0), 0) / monitoredRows.length) : 0;

  const statCards = [
    { label: '学生总数', value: rows.length, color: 'text-slate-700', icon: null },
    { label: '已提交', value: submittedRows.length, color: 'text-teal-600', icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: '有作答行为数据', value: monitoredRows.length, color: 'text-blue-600', icon: <Clock className="w-4 h-4" /> },
    { label: '系统判疑', value: suspiciousRows.length, color: 'text-red-600', icon: <ShieldAlert className="w-4 h-4" /> },
  ];

  const cfgEnabled = (k: string) => !!config[k];
  const minTime = Number(config.min_time_seconds) || 0;
  const maxBlur = Number(config.max_blur_count) || null;
  const simThreshold = Number(config.similarity_threshold) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-slate-800">作业行为监控</h1>
          <p className="text-sm text-muted-foreground">作答过程监督采集 · 系统判疑仅供复核参考，不作绝对定论</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {s.icon}<span>{s.label}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monitor config summary */}
      <Card className="border-slate-200/60 py-0">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" /> 本作业监督配置
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={cfgEnabled('disable_copy') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}>
              禁用复制：{cfgEnabled('disable_copy') ? '开启' : '未开启'}
            </Badge>
            <Badge variant="outline" className={cfgEnabled('disable_paste') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}>
              禁用粘贴：{cfgEnabled('disable_paste') ? '开启' : '未开启'}
            </Badge>
            <Badge variant="outline" className={cfgEnabled('enable_fullscreen') ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}>
              强制全屏：{cfgEnabled('enable_fullscreen') ? '开启' : '未开启'}
            </Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
              最短用时：{minTime > 0 ? fmtDuration(minTime) : '未设置'}
            </Badge>
            {maxBlur != null && (
              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                切屏阈值：{maxBlur} 次
              </Badge>
            )}
            {simThreshold != null && (
              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                查重阈值：{(simThreshold * 100).toFixed(0)}%
              </Badge>
            )}
            <span className="text-slate-400 self-center">平均切屏次数：{avgBlur}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200/60 py-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">学生</th>
                  <th className="text-center px-3 py-2.5 font-medium">提交</th>
                  <th className="text-center px-3 py-2.5 font-medium">用时</th>
                  <th className="text-center px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" />复制</span></th>
                  <th className="text-center px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-1"><ClipboardPaste className="w-3.5 h-3.5" />粘贴</span></th>
                  <th className="text-center px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-1"><Minimize2 className="w-3.5 h-3.5" />切屏</span></th>
                  <th className="text-center px-3 py-2.5 font-medium">判疑</th>
                  <th className="text-center px-3 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">暂无学生数据</td></tr>
                ) : rows.map((r) => {
                  const m = r.monitor;
                  const isSuspicious = !!m?.suspicious_flag;
                  const sLimit = minTime > 0 ? !!(m && m.time_spent_seconds < minTime) : false;
                  const blurHigh = maxBlur != null ? !!(m && m.blur_count > maxBlur) : false;
                  const isExpandable = !!(m && m.paste_records && m.paste_records.length > 0);
                  return (
                    <FragmentRow
                      key={r.studentId}
                      row={r}
                      isExpanded={expanded === r.studentId}
                      onToggle={() => setExpanded(expanded === r.studentId ? null : r.studentId)}
                      isSuspicious={isSuspicious}
                      sLimit={sLimit}
                      blurHigh={blurHigh}
                      isExpandable={isExpandable}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="p-3 border-t bg-slate-50/60 text-xs text-slate-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <span>提示：前端采集（复制/粘贴/切屏/用时）为辅助监督信号，学生可通过修改浏览器等方式规避，不代表学术不端定论。请结合作答内容与批改台「AI疑似率」综合判断。点击某行「明细」可追溯该生粘贴内容片段。</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  function FragmentRow({ row, isExpanded, onToggle, isSuspicious, sLimit, blurHigh, isExpandable }: {
    row: MonitorRow; isExpanded: boolean; onToggle: () => void;
    isSuspicious: boolean; sLimit: boolean; blurHigh: boolean; isExpandable: boolean;
  }) {
    const m = row.monitor;
    return (
      <>
        <tr className={`border-b hover:bg-slate-50/60 transition ${isSuspicious ? 'bg-red-50/40' : ''}`}>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{row.studentName}</span>
              <Badge className="text-[10px] bg-slate-100 text-slate-500">{levelLabels[row.studentLevel] || row.studentLevel}</Badge>
            </div>
          </td>
          <td className="text-center px-3 py-2.5">
            {row.submitted
              ? <span className="inline-flex items-center gap-1 text-teal-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />已交</span>
              : <span className="text-slate-300 text-xs">未交</span>}
          </td>
          <td className="text-center px-3 py-2.5 text-slate-600 font-mono text-xs">{m ? fmtDuration(m.time_spent_seconds) : '—'}</td>
          <td className={`text-center px-3 py-2.5 font-mono text-xs ${sLimit ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>{m ? m.copy_count : '—'}</td>
          <td className={`text-center px-3 py-2.5 font-mono text-xs ${(m && m.paste_count > 0) ? 'text-amber-600' : 'text-slate-500'}`}>{m ? m.paste_count : '—'}</td>
          <td className={`text-center px-3 py-2.5 font-mono text-xs ${blurHigh ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
            {m ? `${m.blur_count}次${m.blur_seconds > 0 ? `/${fmtDuration(m.blur_seconds)}` : ''}` : '—'}
          </td>
          <td className="text-center px-3 py-2.5">
            {isSuspicious ? (
              <Badge className="bg-red-50 text-red-700 border-red-200" title={m?.suspicious_reason || ''}>
                <ShieldAlert className="w-3 h-3 mr-1" />可疑
              </Badge>
            ) : (
              <span className="text-slate-300 text-xs">正常</span>
            )}
          </td>
          <td className="text-center px-3 py-2.5">
            {isExpandable ? (
              <Button variant="ghost" size="sm" onClick={onToggle}>{isExpanded ? '收起' : '明细'}</Button>
            ) : (
              <span className="text-slate-300 text-xs">—</span>
            )}
          </td>
        </tr>
        {isExpanded && isExpandable && (
          <tr className="border-b bg-slate-50/60">
            <td colSpan={8} className="px-6 py-3">
              <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1"><ClipboardPaste className="w-3.5 h-3.5" />粘贴内容追溯（最近 {m?.paste_records.length} 次）</p>
              <div className="space-y-1.5">
                {m!.paste_records.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-white rounded-md border border-slate-200 p-2">
                    <Badge className="text-[10px] shrink-0 bg-slate-100 text-slate-500">{i + 1}</Badge>
                    <span className="text-slate-600 break-all flex-1">{p.preview || '（空白粘贴）'}</span>
                    <span className="text-slate-300 shrink-0 font-mono text-[10px]">{p.at ? new Date(p.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
}
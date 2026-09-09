'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { questionTypeLabel } from '@/lib/labels';
import { formatDateTime } from '@/lib/date';
import { BackButton } from '@/components/ui/back-button';
import { RefreshCw, Megaphone, Trophy, AlertTriangle, CheckCircle2, Search, ShieldAlert, Target, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportStudent {
  student: { id: number; real_name: string; username: string; class_name: string };
  state: string; score: number | null; full: number; graded: boolean; subjective_pending: number;
  percent: number | null; submitted_via: string | null; submitted_at: string | null;
}
interface ReportPayload {
  exam: { id: number; title: string; course_name: string; status: string; grades_published: boolean; has_subjective: boolean; total_score: number };
  students: ReportStudent[];
  summary: { total: number; submitted: number; graded: number; avg_percent: number | null };
  question_stats?: Array<{ question_id: number; question_type: string; content: string; answered: number; graded: number; wrong: number; avg_rate: number | null }>;
  weak_knowledge_points?: Array<{ id: number; name: string; wrong_count: number }>;
}

interface Appeal {
  id: number; student_id: number; student_name: string; question_id: number; question_content: string;
  reason: string; status: string; teacher_comment: string | null; handled_at: string | null; grading_id: number | null;
}

const STATE_LABEL: Record<string, string> = {
  submitted: '已交卷', active: '进行中', pending: '未开始', absent: '缺考',
};
const SUBMIT_VIA_LABEL: Record<string, string> = {
  manual: '手动交卷', auto: '到时自动交卷', terminate: '教师结束', exceed: '超时交卷',
};

export default function ExamReportPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [q, setQ] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  // 申诉操作状态
  const [scoreInput, setScoreInput] = useState<Record<number, string>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [actingId, setActingId] = useState<number | null>(null);

  const loadReport = useCallback(async (silent = false) => {
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/report`);
      const j = await res.json();
      if (!res.ok) { if (!silent) toast.error(j.error || '加载失败'); return; }
      setPayload(j);
    } catch { if (!silent) toast.error('网络异常'); }
    setLoading(false);
  }, [id]);

  const loadAppeals = useCallback(async (silent = false) => {
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/appeals`);
      const j = await res.json();
      if (!res.ok) { if (!silent) toast.error(j.error || '加载失败'); return; }
      setAppeals(j.appeals || []);
    } catch { if (!silent) toast.error('网络异常'); }
  }, [id]);

  useEffect(() => {
    loadReport();
    loadAppeals();
  }, [loadReport, loadAppeals]);

  const refresh = () => { loadReport(true); loadAppeals(true); };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/publish-grades`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '公布失败'); return; }
      toast.success('成绩已公布');
      loadReport(true);
    } catch { toast.error('网络异常'); }
    setPublishing(false);
  };

  // 报表统计
  const stats = useMemo(() => {
    if (!payload) return null;
    const graded = payload.students.filter((s) => s.graded);
    const percents = graded.map((s) => s.percent!).sort((a, b) => a - b);
    const avg = percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : 0;
    const pass = percents.filter((p) => p >= 60).length;
    const passRate = percents.length ? Math.round((pass / percents.length) * 1000) / 10 : 0;
    // 分布桶：<60 60-69 70-79 80-89 90-100
    const bins = [0, 0, 0, 0, 0];
    percents.forEach((p) => {
      const idx = p >= 90 ? 4 : p >= 80 ? 3 : p >= 70 ? 2 : p >= 60 ? 1 : 0;
      bins[idx] += 1;
    });
    const maxBin = Math.max(1, ...bins);
    return {
      count: percents.length,
      avg: avg.toFixed(1),
      high: percents.length ? percents[percents.length - 1] : 0,
      low: percents.length ? percents[0] : 0,
      passRate,
      bins,
      maxBin,
    };
  }, [payload]);

  // 分数明细：搜索 + 排序
  const detailRows = useMemo(() => {
    if (!payload) return [];
    const kw = q.trim().toLowerCase();
    const list = payload.students
      .filter((s) => !kw || s.student.real_name.toLowerCase().includes(kw) || s.student.username.toLowerCase().includes(kw) || s.student.class_name.toLowerCase().includes(kw))
      .filter((s) => s.percent != null)
      .slice()
      .sort((a, b) => sortAsc ? (a.percent! - b.percent!) : (b.percent! - a.percent!));
    return list;
  }, [payload, q, sortAsc]);

  // 申诉：pending 置顶
  const sortedAppeals = useMemo(() => {
    return appeals.slice().sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return 0;
    });
  }, [appeals]);

  const handleAppeal = async (a: Appeal, status: 'resolved' | 'rejected') => {
    setActingId(a.id);
    try {
      const body: Record<string, unknown> = { appeal_id: a.id, status };
      if (status === 'rejected') body.teacher_comment = commentInput[a.id]?.trim();
      if (status === 'resolved') {
        const val = Number(scoreInput[a.id]);
        if (Number.isNaN(val)) { toast.error('请输入新分数'); setActingId(null); return; }
        body.override_score = val;
        body.teacher_comment = commentInput[a.id]?.trim();
      }
      const res = await apiFetch(`/api/teacher/exams/${id}/appeals`, { method: 'POST', body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '操作失败'); return; }
      toast.success(status === 'resolved' ? '已改分通过' : '已驳回');
      loadAppeals(true);
      loadReport(true);
    } catch { toast.error('网络异常'); }
    setActingId(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton to="/teacher/exams" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">成绩报表</h1>
        <Badge className="bg-gradient-to-r from-violet-600 to-teal-600 text-white">{payload?.exam.title || '…'}</Badge>
        {payload?.exam.status === 'closed' && <Badge className="bg-rose-100 text-rose-600">考试已结束</Badge>}
        <div className="flex-1" />
        <Button variant="outline" onClick={refresh} className="cursor-pointer"><RefreshCw className="w-4 h-4" />刷新</Button>
      </div>

      {loading || !payload ? (
        <div className="animate-pulse h-64 bg-slate-100 rounded-2xl" />
      ) : (
        <Tabs defaultValue="overview">
          <div className="flex items-center gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger value="overview" className="cursor-pointer">成绩总览</TabsTrigger>
              <TabsTrigger value="detail" className="cursor-pointer">分数明细</TabsTrigger>
              <TabsTrigger value="diagnosis" className="cursor-pointer">题目诊断</TabsTrigger>
              <TabsTrigger value="appeals" className="cursor-pointer">申诉处理 <Badge className="ml-1 bg-rose-100 text-rose-600">{appeals.filter((a) => a.status === 'pending').length}</Badge></TabsTrigger>
            </TabsList>
            <div className="flex-1" />
            {!payload.exam.grades_published ? (
              <Button onClick={publish} disabled={publishing || (payload.exam.has_subjective && payload.summary.submitted - payload.summary.graded > 0)} className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200 cursor-pointer">
                <Megaphone className="w-4 h-4 mr-1.5" />{publishing ? '公布中…' : '公布成绩'}
              </Button>
            ) : (
              <Button disabled className="cursor-not-allowed"><CheckCircle2 className="w-4 h-4 mr-1.5" />已公布</Button>
            )}
          </div>
          {payload.exam.has_subjective && !payload.exam.grades_published && payload.summary.submitted - payload.summary.graded > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <AlertTriangle className="w-4 h-4" />还有 <b>{payload.summary.submitted - payload.summary.graded}</b> 名已交卷学生的主观题未批完，暂不能公布成绩
            </div>
          )}

          {/* 成绩总览 */}
          <TabsContent value="overview">
            {stats && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: '平均分', value: `${stats.avg} 分`, icon: Trophy, cls: 'from-violet-500 to-indigo-500' },
                    { label: '最高 / 最低', value: `${stats.high} / ${stats.low}`, icon: Trophy, cls: 'from-teal-500 to-emerald-500' },
                    { label: '及格率', value: `${stats.passRate}%`, icon: Trophy, cls: 'from-amber-500 to-orange-500' },
                    { label: '已批人数', value: `${stats.count}/${payload.summary.submitted}`, icon: Trophy, cls: 'from-indigo-500 to-blue-500' },
                  ].map((s) => (
                    <Card key={s.label} className="border-slate-200/60 shadow-sm">
                      <div className="p-4 flex items-center gap-3">
                        <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shadow-md', s.cls)}>
                          <s.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">{s.label}</p>
                          <p className="text-xl font-bold text-slate-800">{s.value}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="border-slate-200/60 shadow-sm">
                  <div className="p-5">
                    <p className="font-semibold text-slate-700 mb-4">分数分布</p>
                    <div className="space-y-3">
                      {[
                        { label: '<60', cls: 'from-rose-500 to-red-500' },
                        { label: '60-69', cls: 'from-amber-500 to-orange-500' },
                        { label: '70-79', cls: 'from-yellow-400 to-amber-400' },
                        { label: '80-89', cls: 'from-teal-400 to-emerald-500' },
                        { label: '90-100', cls: 'from-violet-500 to-teal-500' },
                      ].map((b, i) => (
                        <div key={b.label} className="flex items-center gap-3">
                          <span className="w-14 text-xs text-slate-500 shrink-0">{b.label}</span>
                          <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full bg-gradient-to-r rounded-full transition-all', b.cls)} style={{ width: `${(stats.bins[i] / stats.maxBin) * 100}%` }} />
                          </div>
                          <span className="w-8 text-xs font-semibold text-slate-600 text-right">{stats.bins[i]}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3">满分 {payload.exam.total_score} 分 · 共 {payload.summary.submitted} 人交卷，成绩公布后学生可见</p>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* 分数明细 */}
          <TabsContent value="detail">
            <Card className="border-slate-200/60 shadow-sm">
              <div className="p-4 flex items-center gap-3 border-b border-slate-100">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索姓名 / 学号 / 班级…" className="pl-9" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSortAsc((v) => !v)} className="cursor-pointer">
                  得分率 {sortAsc ? '↑升序' : '↓降序'}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>班级</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>得分</TableHead>
                    <TableHead>满分</TableHead>
                    <TableHead>得分率</TableHead>
                    <TableHead>交卷方式</TableHead>
                    <TableHead>交卷时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((s) => (
                    <TableRow key={s.student.id}>
                      <TableCell className="font-medium">{s.student.real_name}<span className="text-xs text-slate-400 ml-1">{s.student.username}</span></TableCell>
                      <TableCell className="text-slate-500">{s.student.class_name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={s.state === 'submitted' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}>{STATE_LABEL[s.state] || s.state}</Badge>
                      </TableCell>
                      <TableCell className={cn('font-semibold', s.percent != null && s.percent < 60 ? 'text-rose-500' : 'text-slate-700')}>{s.score ?? '-'}</TableCell>
                      <TableCell className="text-slate-500">{s.full}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', s.percent != null && s.percent < 60 ? 'bg-rose-400' : 'bg-teal-400')} style={{ width: `${Math.min(100, s.percent ?? 0)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{s.percent != null ? `${s.percent}%` : '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{SUBMIT_VIA_LABEL[s.submitted_via || ''] || s.submitted_via || '-'}</TableCell>
                      <TableCell className="text-slate-500">{s.submitted_at ? formatDateTime(s.submitted_at) : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer gap-1"
                          onClick={() => router.push(`/teacher/exams/${id}/students/${s.student.id}`)}
                        >
                          <Eye className="w-3.5 h-3.5" />查看卷子
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {detailRows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">暂无可展示的分数明细</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* 题目诊断 */}
          <TabsContent value="diagnosis">
            <div className="space-y-4">
              {(payload.weak_knowledge_points || []).length > 0 && (
                <Card className="border-slate-200/60 shadow-sm">
                  <div className="p-5">
                    <p className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-rose-500" />班级薄弱知识点 Top{payload.weak_knowledge_points!.length}</p>
                    <div className="flex flex-wrap gap-2">
                      {payload.weak_knowledge_points!.map((k) => (
                        <div key={k.id} className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">
                          <ShieldAlert className="w-4 h-4 text-rose-500" />
                          <span className="text-sm font-medium text-slate-700">{k.name}</span>
                          <Badge className="bg-rose-100 text-rose-600">{k.wrong_count} 人次错</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}
              <Card className="border-slate-200/60 shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>题型</TableHead>
                      <TableHead>题干</TableHead>
                      <TableHead>作答</TableHead>
                      <TableHead>已批</TableHead>
                      <TableHead>答错</TableHead>
                      <TableHead>平均得分率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payload.question_stats || []).map((q, i) => (
                      <TableRow key={q.question_id}>
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell><Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge></TableCell>
                        <TableCell className="max-w-xs truncate text-slate-600">{q.content}</TableCell>
                        <TableCell className="text-slate-500">{q.answered}</TableCell>
                        <TableCell className="text-slate-500">{q.graded}</TableCell>
                        <TableCell className="text-slate-500">{q.wrong}</TableCell>
                        <TableCell>
                          {q.avg_rate != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full', q.avg_rate < 60 ? 'bg-rose-400' : q.avg_rate < 80 ? 'bg-amber-400' : 'bg-teal-400')} style={{ width: `${Math.min(100, q.avg_rate)}%` }} />
                              </div>
                              <span className={cn('text-xs font-medium', q.avg_rate < 60 ? 'text-rose-500' : 'text-slate-600')}>{q.avg_rate}%</span>
                            </div>
                          ) : <span className="text-slate-300">-</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(payload.question_stats || []).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">暂无可诊断数据</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>

          {/* 申诉处理 */}
          <TabsContent value="appeals">
            <div className="space-y-3">
              {sortedAppeals.map((a) => {
                const pending = a.status === 'pending';
                return (
                  <Card key={a.id} className="border-slate-200/60 shadow-sm">
                    <div className="p-5 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-teal-500 text-white text-xs font-bold flex items-center justify-center">{a.student_name[0] || '?'}</div>
                        <span className="text-sm font-medium text-slate-700">{a.student_name}</span>
                        <Badge className={pending ? 'bg-rose-100 text-rose-600' : a.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                          {pending ? '待处理' : a.status === 'resolved' ? '已通过' : '已驳回'}
                        </Badge>
                        {a.status !== 'pending' && a.handled_at && <span className="text-xs text-slate-400">处理于 {formatDateTime(a.handled_at)}</span>}
                      </div>
                      <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2.5 line-clamp-2">{a.question_content}</div>
                      <div className="bg-white border border-slate-100 rounded-lg p-3 text-sm text-slate-600">
                        <span className="text-xs text-slate-400 block mb-1">申诉理由</span>{a.reason}
                      </div>
                      {!pending && a.teacher_comment && (
                        <div className="text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">教师回复：{a.teacher_comment}</div>
                      )}
                      {pending && (
                        <div className="grid sm:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">改分通过：输入新分数</label>
                            <Input type="number" value={scoreInput[a.id] ?? ''} placeholder="新分数" onChange={(e) => setScoreInput((p) => ({ ...p, [a.id]: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">评语（可选）</label>
                            <Input value={commentInput[a.id] ?? ''} placeholder="教师评语…" onChange={(e) => setCommentInput((p) => ({ ...p, [a.id]: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" disabled={actingId === a.id} onClick={() => handleAppeal(a, 'resolved')} className="bg-gradient-to-r from-violet-600 to-teal-600 flex-1 cursor-pointer">
                              {actingId === a.id ? '处理中…' : '改分通过'}
                            </Button>
                            <Button size="sm" variant="destructive" disabled={actingId === a.id} onClick={() => handleAppeal(a, 'rejected')} className="cursor-pointer">驳回</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
              {appeals.length === 0 && (
                <Card className="border-slate-200/60 shadow-sm">
                  <div className="p-10 text-center text-slate-400 space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto" />
                    <p>暂无申诉</p>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
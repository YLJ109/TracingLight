'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Calendar, Clock, Hourglass, FileCheck, Timer, Inbox, ChevronRight } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDateTime } from '@/lib/date';

interface ExamRow {
  id: number;
  title: string;
  course_name: string;
  exam_type: string;
  time_mode: string;
  start_at: string;
  end_at: string | null;
  duration: number;
  status: string;
  grades_published: boolean;
  total_score: number;
  has_subjective: boolean;
  attempt_status: string | null;
  attempt_deadline: string | null;
  state: string; // upcoming / open / in_progress / submitted / result
}

const TYPE_LABEL: Record<string, string> = { quiz: '随堂测验', unit: '单元测验', midterm: '期中考试', final: '期末考试', makeup: '补考' };

// 状态统一归类
const FILTER_TABS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'pending', label: '待考', match: (s) => s === 'upcoming' || s === 'open' },
  { key: 'in_progress', label: '作答中', match: (s) => s === 'in_progress' },
  { key: 'submitted', label: '已交卷', match: (s) => s === 'submitted' },
  { key: 'result', label: '已公布', match: (s) => s === 'result' },
];

export default function StudentExamsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('all');
  const [tab, setTab] = useState('all');

  const load = async () => {
    try {
      const res = await apiFetch('/api/student/exams');
      const j = await res.json();
      setExams(j.exams || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'student') { window.location.href = '/'; return; }
    load();
  }, [user, authLoading]);

  const courseOptions = useMemo(() => {
    const m = new Map<string, string>();
    exams.forEach((e) => { if (e.course_name) m.set(e.course_name, e.course_name); });
    return [...m.values()];
  }, [exams]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return exams.filter((e) => {
      if (course !== 'all' && e.course_name !== course) return false;
      const tabMeta = FILTER_TABS.find((t) => t.key === tab);
      if (tabMeta && !tabMeta.match(e.state)) return false;
      if (kw && !e.title.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [exams, q, course, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: exams.length };
    FILTER_TABS.forEach((t) => { if (t.key !== 'all') c[t.key] = exams.filter((e) => t.match(e.state)).length; });
    return c;
  }, [exams]);

  // 按课程分组（选中具体课程时仅一组）
  const groups = useMemo(() => {
    const map = new Map<string, ExamRow[]>();
    filtered.forEach((e) => {
      const k = e.course_name || '未知课程';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return [...map.entries()];
  }, [filtered]);

  const stateMeta = (s: string, deadline: string | null) => {
    switch (s) {
      case 'upcoming': return { badge: { label: '未开考', cls: 'bg-amber-100 text-amber-700' }, hint: `${formatDateTime(deadline)} 开考` };
      case 'open': return { badge: { label: '可进入', cls: 'bg-sky-100 text-sky-600' }, hint: '已开考，请尽快进入' };
      case 'in_progress': return { badge: { label: '作答中', cls: 'bg-teal-100 text-teal-700' }, hint: `截止 ${formatDateTime(deadline)}` };
      case 'submitted': return { badge: { label: '已交卷', cls: 'bg-indigo-100 text-indigo-700' }, hint: '已交卷，等待成绩公布' };
      case 'result': return { badge: { label: '成绩已公布', cls: 'bg-emerald-100 text-emerald-700' }, hint: '已批改，可查看成绩' };
      default: return { badge: { label: '待开始', cls: 'bg-slate-100 text-slate-600' }, hint: formatDateTime(deadline) };
    }
  };

  const actionFor = (e: ExamRow) => {
    if (e.state === 'result') return (
      <Link href={`/student/exams/${e.id}/result`}><Button className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200"><FileCheck className="w-3.5 h-3.5 mr-1" />查看成绩</Button></Link>
    );
    if (e.state === 'in_progress') return (
      <Link href={`/student/exams/${e.id}/take`}><Button className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200"><Timer className="w-3.5 h-3.5 mr-1" />继续作答</Button></Link>
    );
    if (e.state === 'open') return (
      <Link href={`/student/exams/${e.id}`}><Button className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200"><Timer className="w-3.5 h-3.5 mr-1" />进入考试</Button></Link>
    );
    return null; // upcoming / submitted 无主按钮
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
      <SetActiveNav href="/student/exams" />

      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">我的考试</h1>
        {/* 搜索 + 课程筛选 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索考试名称…" className="pl-9 h-9" />
          </div>
          <Select value={course} onValueChange={setCourse}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="全部课程" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部课程</SelectItem>
              {courseOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm transition-all cursor-pointer ${tab === t.key
              ? 'bg-gradient-to-r from-violet-600 to-teal-600 text-white shadow'
              : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {t.label}<span className="ml-1 opacity-70">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}</div>
      ) : exams.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center"><Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p className="text-slate-400">当前没有考试</p></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-14 text-center"><Search className="w-11 h-11 mx-auto mb-3 text-slate-300" /><p className="text-slate-400">没有符合筛选条件的考试</p></CardContent></Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([courseName, list]) => (
            <div key={courseName}>
              {/* 课程分组头 */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-500 to-teal-500" />
                <span className="text-sm font-semibold text-slate-700">{courseName}</span>
                <span className="text-xs text-slate-400">共 {list.length} 场</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="space-y-3">
              {list.map((e) => {
            const sm = stateMeta(e.state, e.attempt_deadline || e.start_at);
            return (
              <Card key={e.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center gap-4 p-5">
                    {/* 左：标题 + 课程 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800 truncate">{e.title}</h3>
                        <Badge className={sm.badge.cls}>{sm.badge.label}</Badge>
                        {e.state === 'result' && <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200">{e.total_score ?? 100} 分</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{e.course_name} · {TYPE_LABEL[e.exam_type] || '考试'}</p>
                    </div>

                    {/* 中：时间信息 */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-slate-500 md:w-auto">
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-violet-400" />{formatDateTime(e.start_at)} 开考</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-teal-400" />{e.duration} 分钟{e.time_mode === 'window' ? '·窗口' : ''}</span>
                      {e.attempt_deadline ? (
                        <span className="flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5 text-amber-400" />截止 {formatDateTime(e.attempt_deadline)}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 opacity-0"><Hourglass className="w-3.5 h-3.5" />-</span>
                      )}
                    </div>

                    {/* 右：状态提示/操作 */}
                    <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                      {(!e.state || e.state === 'upcoming' || e.state === 'submitted') && (
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{sm.hint}</p>
                      )}
                      {actionFor(e) ?? <span className="flex items-center gap-1 text-xs text-slate-400"><ChevronRight className="w-3 h-3" />{sm.hint}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
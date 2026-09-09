'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Calendar, Clock, Users, FileCheck, GraduationCap, Rocket, RefreshCw, ClipboardList, ShieldCheck } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDateTime } from '@/lib/date';
import { toast } from 'sonner';

interface ExamRow {
  id: number;
  title: string;
  course_id: number;
  course_name: string;
  exam_type: string;
  time_mode: string;
  start_at: string;
  end_at: string | null;
  duration: number;
  status: string;
  grades_published: boolean;
  has_subjective: boolean;
  total_score: number;
  enrolled_count: number;
  submitted_count: number;
  graded_count: number;
  created_at: string;
}

interface CourseMeta { id: number; name: string; class_id: number | null }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: '已发布·未开考', cls: 'bg-amber-100 text-amber-700' },
  active: { label: '进行中', cls: 'bg-teal-100 text-teal-700' },
  closed: { label: '已结束', cls: 'bg-red-100 text-red-600' },
};
const STATUS_RANK: string[] = ['all', 'draft', 'scheduled', 'active', 'closed'];

const TYPE_LABEL: Record<string, string> = { quiz: '随堂测验', unit: '单元测验', midterm: '期中考试', final: '期末考试', makeup: '补考' };

export default function TeacherExamsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [meta, setMeta] = useState<{ courses: CourseMeta[]; classes: { id: number; name: string }[] }>({ courses: [], classes: [] });
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('all');
  const [classId, setClassId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [acting, setActing] = useState<number | null>(null);

  const loadExams = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await apiFetch(`/api/teacher/exams${params}`);
      const json = await res.json();
      setExams(json.exams || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'teacher') { window.location.href = '/'; return; }
    loadExams();
    apiFetch('/api/teacher/classes').then((r) => r.json()).then((j) => {
      setMeta({ courses: j.courses || [], classes: j.classes || [] });
    }).catch(() => {});
  }, [user, authLoading, statusFilter]);

  // course_id → class_id 映射（用于班级过滤）
  const courseClassMap = useMemo(() => {
    const m = new Map<number, number | null>();
    meta.courses.forEach((c) => m.set(c.id, c.class_id));
    return m;
  }, [meta.courses]);

  const courseNames = useMemo(() => {
    const seen = new Map<string, { name: string }>();
    meta.courses.forEach((c) => { if (c.name) seen.set(c.name, { name: c.name }); });
    return [...seen.values()].map((c) => c.name);
  }, [meta.courses]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return exams.filter((e) => {
      if (kw && !e.title.toLowerCase().includes(kw)) return false;
      if (course !== 'all' && e.course_name !== course) return false;
      if (classId !== 'all') {
        const cid = courseClassMap.get(e.course_id);
        if (cid == null || String(cid) !== classId) return false;
      }
      return true;
    });
  }, [exams, q, course, classId, courseClassMap]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: exams.length };
    STATUS_RANK.forEach((s) => { if (s !== 'all') c[s] = exams.filter((e) => e.status === s).length; });
    return c;
  }, [exams]);

  const publish = async (id: number) => {
    setActing(id);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/status`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || '发布失败'); return; }
      toast.success('考试已发布，已通知报考学生');
      loadExams(true);
    } catch { toast.error('网络异常'); }
    setActing(null);
  };

  const close = async (id: number) => {
    if (!confirm('确定提前结束该考试？进行中的作答将立即提交。')) return;
    setActing(id);
    try {
      await apiFetch(`/api/teacher/exams/${id}/status`, { method: 'POST', body: JSON.stringify({ action: 'close' }) });
      toast.success('考试已结束');
      loadExams(true);
    } catch { toast.error('操作失败'); }
    setActing(null);
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除该考试草稿？删除后不可恢复。')) return;
    setActing(id);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}`, { method: 'DELETE' });
      if (res.ok) toast.success('已删除');
      loadExams(true);
    } catch { toast.error('删除失败'); }
    setActing(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />

      {/* 标题 + 布置 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">考试管理</h1>
        <Link href="/teacher/exams/new">
          <Button className="bg-gradient-to-r from-violet-600 to-teal-600 hover:from-violet-700 hover:to-teal-700 shadow-lg shadow-violet-200">
            <Plus className="w-4 h-4 mr-1.5" />布置考试
          </Button>
        </Link>
      </div>

      {/* 过滤工具条 */}
      <Card className="border-slate-200/60 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索考试名称…" className="pl-9 h-9" />
          </div>
          <Select value={course} onValueChange={setCourse}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="全部课程" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部课程</SelectItem>
              {courseNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="全部班级" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部班级</SelectItem>
              {meta.classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              {STATUS_RANK.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'all' ? `全部状态 (${statusCounts.all})` : `${STATUS_META[s].label} (${statusCounts[s] ?? 0})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => loadExams()} variant="outline" size="icon" title="刷新" className="h-9 w-9 shrink-0"><RefreshCw className="w-4 h-4" /></Button>
        </CardContent>
      </Card>

      {/* 列表 */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 bg-slate-100 rounded-2xl" />)}</div>
      ) : exams.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center"><ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p className="text-slate-400">暂无考试，点击右上角「布置考试」创建</p></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-14 text-center"><Search className="w-11 h-11 mx-auto mb-3 text-slate-300" /><p className="text-slate-400">没有符合筛选条件的考试</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const st = STATUS_META[e.status] || STATUS_META.draft;
            const subRate = e.enrolled_count > 0 ? Math.round((e.submitted_count / e.enrolled_count) * 100) : 0;
            return (
              <Card key={e.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-5">
                    {/* 左：标题 + 状态 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800 truncate">{e.title}</h3>
                        <Badge className={st.cls}>{st.label}</Badge>
                        {e.status === 'closed' && !e.grades_published && (
                          <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-0.5" />待批改</Badge>
                        )}
                        {e.grades_published && <Badge className="bg-emerald-100 text-emerald-700"><ShieldCheck className="w-3 h-3 mr-0.5" />成绩已公布</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{e.course_name} · {TYPE_LABEL[e.exam_type] || '考试'} · {e.total_score ?? 100} 分</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-violet-400" />{formatDateTime(e.start_at)}</span>
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-teal-400" />{e.duration} 分钟{e.time_mode === 'window' ? '·窗口' : '·定时'}</span>
                      </div>
                    </div>

                    {/* 中：报考/交卷 可视化 */}
                    <div className="shrink-0 w-full lg:w-56">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-400" />报考 {e.enrolled_count}</span>
                        <span className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-emerald-400" />已交 {e.submitted_count}{e.enrolled_count > 0 && ` · ${subRate}%`}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, subRate)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{e.has_subjective ? `主观题已批 ${e.graded_count} 人` : '纯客观题 · 规则即时判分'}</div>
                    </div>

                    {/* 右：操作 */}
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      {e.status === 'draft' && (
                        <>
                          <Link href={`/teacher/exams/${e.id}`}><Button variant="outline" size="sm">编辑</Button></Link>
                          <Button size="sm" className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={() => publish(e.id)} disabled={acting === e.id}><Rocket className="w-3.5 h-3.5 mr-1" />发布</Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => remove(e.id)} disabled={acting === e.id}>删除</Button>
                        </>
                      )}
                      {(e.status === 'scheduled' || e.status === 'active') && (
                        <>
                          <Link href={`/teacher/exams/${e.id}/monitor`}><Button size="sm" className="bg-gradient-to-r from-violet-600 to-teal-600"><GraduationCap className="w-3.5 h-3.5 mr-1" />实时监考</Button></Link>
                          {e.status === 'active' && <Button variant="outline" size="sm" className="text-red-500" onClick={() => close(e.id)} disabled={acting === e.id}>提前结束</Button>}
                        </>
                      )}
                      {e.status === 'closed' && (
                        <>
                          <Link href={`/teacher/exams/${e.id}/report`}><Button size="sm" className="bg-gradient-to-r from-violet-600 to-teal-600"><FileCheck className="w-3.5 h-3.5 mr-1" />成绩报表</Button></Link>
                          {e.has_subjective && <Link href={`/teacher/exams/${e.id}/grading`}><Button variant="outline" size="sm">批改主观题</Button></Link>}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
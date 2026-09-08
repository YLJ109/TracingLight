'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDateTime } from '@/lib/date';
import { questionTypeLabel, difficultyLabel } from '@/lib/labels';
import { BackButton } from '@/components/ui/back-button';
import { Clock, Calendar, Users, FileCheck, GraduationCap, Rocket, ListChecks } from 'lucide-react';

interface ExamDetail { id: number; title: string; description?: string; course_id: number; course_name: string; exam_type: string; time_mode: string; start_at: string; end_at?: string | null; duration: number; status: string; grades_published: boolean; has_subjective: boolean; total_score?: number; question_ids?: number[]; question_scores?: Record<string, number>; }
interface StudentRow { id: number; real_name: string; username: string; class_name: string; }
interface QRow { id: number; question_type: string; difficulty: string; content: string; options?: Array<{ key: string; text: string }>; knowledge_point_id: number; }

const OBJ_PREVIEW = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment'];
const optionPreview = (q: QRow, max = 4) =>
  OBJ_PREVIEW.includes(q.question_type) && q.options?.length
    ? q.options.slice(0, max).map((o) => `${o.key}. ${o.text}`).join('　')
    : '';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: '已发布·未开考', cls: 'bg-amber-100 text-amber-700' },
  active: { label: '进行中', cls: 'bg-teal-100 text-teal-700' },
  closed: { label: '已结束', cls: 'bg-red-100 text-red-600' },
};

export default function ExamDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'teacher') { window.location.href = '/'; return; }
    const load = async () => {
      try {
        const res = await apiFetch(`/api/teacher/exams/${id}`);
        const j = await res.json();
        if (!res.ok) { toast.error(j.error || '加载失败'); return; }
        setExam(j.exam); setStudents(j.students || []); setQuestions(j.questions || []);
      } catch { toast.error('网络异常'); }
      setLoading(false);
    };
    load();
  }, [id, user, authLoading]);

  const publish = async () => {
    setActing(true);
    const res = await apiFetch(`/api/teacher/exams/${id}/status`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) });
    const j = await res.json();
    if (!res.ok) toast.error(j.error || '发布失败'); else { toast.success('已发布，并通知报考学生'); router.refresh(); }
    setActing(false);
  };

  if (loading || !exam) return <div className="animate-pulse h-40 bg-slate-100 rounded-2xl" />;
  const st = STATUS_META[exam.status] || STATUS_META.draft;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3">
        <BackButton to="/teacher/exams" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">{exam.title}</h1>
        <Badge className={st.cls}>{st.label}</Badge>
        {exam.grades_published && <Badge className="bg-emerald-100 text-emerald-700">成绩已公布</Badge>}
      </div>

      <Card className="border-slate-200/60 shadow-sm">
        <CardContent className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-slate-600">
          <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-400" />{formatDateTime(exam.start_at)}{exam.end_at && ` ~ ${formatDateTime(exam.end_at)}`}</div>
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-teal-400" />{exam.duration} 分钟 {exam.time_mode === 'window' ? '(限时窗口)' : '(定时开考)'}</div>
          <div className="flex items-center gap-2"><Users className="w-4 h-4 text-amber-400" />报考 {students.length} 人</div>
          <div className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-rose-400" />题目 {questions.length} 题 · 满分 {exam.total_score ?? 100}</div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        {exam.status === 'draft' && (
          <Button className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200" onClick={publish} disabled={acting}><Rocket className="w-4 h-4 mr-1.5" />{acting ? '发布中…' : '发布考试'}</Button>
        )}
        {(exam.status === 'scheduled' || exam.status === 'active') && (
          <Button onClick={() => router.push(`/teacher/exams/${id}/monitor`)} className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200"><GraduationCap className="w-4 h-4 mr-1.5" />实时监考</Button>
        )}
        {exam.status === 'closed' && (
          <>
            <Button onClick={() => router.push(`/teacher/exams/${id}/report`)} className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200"><FileCheck className="w-4 h-4 mr-1.5" />成绩报表</Button>
            {exam.has_subjective && <Button variant="outline" onClick={() => router.push(`/teacher/exams/${id}/grading`)}>批改主观题</Button>}
          </>
        )}
      </div>

      <Tabs defaultValue="students">
        <TabsList><TabsTrigger value="students">报考名单（{students.length}）</TabsTrigger><TabsTrigger value="questions">试卷预览（{questions.length}）</TabsTrigger></TabsList>
        <TabsContent value="students">
          <Card className="border-slate-200/60 shadow-sm"><CardHeader><CardTitle className="text-base">报考学生</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-teal-500 text-white text-xs font-bold flex items-center justify-center">{s.real_name[0] || '?'}</div>
                  <div className="min-w-0"><p className="text-sm font-medium truncate">{s.real_name}</p><p className="text-xs text-slate-400 truncate">{s.username} · {s.class_name}</p></div>
                </div>
              ))}
              {students.length === 0 && <div className="col-span-full text-center text-slate-400 py-8">暂无报考学生</div>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="questions">
          <Card className="border-slate-200/60 shadow-sm"><CardHeader><CardTitle className="text-base">试卷题目与分值</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <span className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-1">{q.content}</p>
                    {optionPreview(q) && <p className="text-xs text-slate-400 truncate mt-0.5" title={optionPreview(q)}>选项：{optionPreview(q)}</p>}
                    <div className="flex gap-2 mt-0.5"><Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge><Badge className="text-xs bg-amber-50 text-amber-600">{difficultyLabel(q.difficulty)}</Badge></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
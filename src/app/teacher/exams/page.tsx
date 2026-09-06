'use client';
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Calendar, Clock } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';

interface Exam {
  id: number;
  exam_name: string;
  course_id: number;
  class_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  knowledge_scope: string[] | null;
  created_at: string;
}

const COURSES: Record<number, string> = {
  1: 'Python程序设计', 2: '数据结构与算法', 3: '数据库原理', 4: '深度学习',
};

const CLASSES: Record<number, string> = {
  1: '计科2401', 2: '计科2402',
};

export default function TeacherExamsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    exam_name: '', course_id: 1, class_id: 1,
    exam_date: '', start_time: '', end_time: '',
    knowledge_scope: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  // 注意：authLoading/user/role 校验的 useEffect 移到了 loadExams 声明之后（避免 TDZ 静态报错）

  const loadExams = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher/exams');
      const json = await res.json();
      setExams(json.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'teacher') { window.location.href = '/'; return; }
    loadExams();
  }, [user, authLoading]);

  const handleCreate = async () => {
    if (!form.exam_name.trim() || !form.exam_date) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/teacher/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ exam_name: '', course_id: 1, class_id: 1, exam_date: '', start_time: '', end_time: '', knowledge_scope: [] });
        loadExams();
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse space-y-4 w-full max-w-2xl">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-32 bg-slate-100 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/assignments" />
      <div className="flex items-center justify-between">
        <Button onClick={() => setShowCreate(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          创建考试
        </Button>
      </div>

      {showCreate && (
        <Card className="border-slate-200/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">创建新考试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="考试名称" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: Number(e.target.value) })}>
                {Object.entries(COURSES).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
              </select>
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: Number(e.target.value) })}>
                {Object.entries(CLASSES).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
              </select>
            </div>
            <Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} disabled={submitting}>{submitting ? '创建中...' : '保存'}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {exams.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>暂无考试安排</p>
          </div>
        ) : exams.map((exam) => (
          <Card key={exam.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-800">{exam.exam_name}</h3>
                  <Badge className="bg-teal-100 text-teal-700 text-xs">
                    {COURSES[exam.course_id] || ''}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 text-xs">
                    {CLASSES[exam.class_id] || ''}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {exam.exam_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {exam.start_time} - {exam.end_time}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

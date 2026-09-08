'use client';

/**
 * 教师端「公告发布」卡片（内嵌于学情看板）。
 * 含发布表单与近期公告列表，数据来自 /api/teacher/announcements。
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Trash2, Send, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

interface Announcement {
  id: number;
  title: string;
  content: string;
  course_id: number | null;
  teacher_id: number;
  is_pinned: boolean;
  created_at: string;
}

interface Course { id: number; name: string }

export default function TeacherAnnouncementCard({ courses }: { courses: Course[] }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher/announcements');
      const json = await res.json();
      setAnnouncements(json.data || []);
    } catch {
      toast.error('加载公告失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!title.trim() || !content.trim()) { toast.error('请填写标题和内容'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/teacher/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, course_id: courseId ? Number(courseId) : null }),
      });
      if (res.ok) {
        toast.success('发布成功');
        setTitle(''); setContent(''); setCourseId('');
        load();
      } else {
        const j = await res.json();
        toast.error(j.error || '发布失败');
      }
    } catch {
      toast.error('发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('确定删除此公告？')) return;
    try {
      await apiFetch(`/api/teacher/announcements?id=${id}`, { method: 'DELETE' });
      load();
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <Card className="border-violet-200/70 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 pt-4 border-b border-violet-100/70">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="inline-flex w-6 h-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm"><Megaphone className="w-3.5 h-3.5" /></span>
          发布公告
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <Input placeholder="公告标题（120 字内）" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="w-full min-h-[92px] p-3 border border-slate-200 rounded-lg text-sm resize-y focus:ring-2 focus:ring-violet-300 focus:border-transparent outline-none"
          placeholder="公告内容（支持换行）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
          >
            <option value="">全部课程</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button
            onClick={publish}
            disabled={submitting}
            className="ml-auto gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? '发布中...' : '发布公告'}
          </Button>
        </div>

        {/* 近期公告 */}
        <div className="border-t border-slate-100 pt-2 max-h-[220px] overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">加载中…</p>
          ) : announcements.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center"><Megaphone className="w-5 h-5 mx-auto mb-1 opacity-40" />暂无公告</p>
          ) : announcements.map((a) => (
            <div key={a.id} className="group rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 truncate">{a.title}</span>
                    {a.course_id && (
                      <Badge variant="outline" className="text-[10px] shrink-0">{courses.find((c) => c.id === a.course_id)?.name || `课程${a.course_id}`}</Badge>
                    )}
                    {a.is_pinned && <Badge className="text-[10px] shrink-0 bg-amber-100 text-amber-700">置顶</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1">{a.content}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleString('zh-CN')}</p>
                </div>
                <button
                  onClick={() => del(a.id)}
                  className="text-slate-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
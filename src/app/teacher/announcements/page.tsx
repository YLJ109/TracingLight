'use client';
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Megaphone, Trash2, Edit3, Send } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';

interface Announcement {
  id: number;
  title: string;
  content: string;
  course_id: number | null;
  teacher_id: number;
  is_pinned: boolean;
  created_at: string;
}

const COURSES: Record<number, string> = {
  1: 'Python程序设计',
  2: '数据结构与算法',
  3: '数据库原理',
  4: '深度学习',
};

export default function TeacherAnnouncementsPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courseId, setCourseId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher/announcements');
      const json = await res.json();
      setAnnouncements(json.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'teacher') { window.location.href = '/'; return; }
    loadAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handlePublish = async () => {
    if (!title.trim() || !content.trim() || !user) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/teacher/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, content,
          course_id: courseId || null,
          teacher_id: user.id,
        }),
      });
      if (res.ok) {
        setTitle('');
        setContent('');
        setCourseId('');
        loadAnnouncements();
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此公告？')) return;
    await apiFetch(`/api/teacher/announcements?id=${id}`, { method: 'DELETE' });
    loadAnnouncements();
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse space-y-4 w-full max-w-2xl">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-32 bg-slate-100 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
        <div className="h-24 bg-slate-100 rounded" />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <Megaphone className="w-7 h-7 text-teal-600" />
        <h1 className="page-title">公告管理</h1>
      </div>

      {/* 发布新公告 */}
      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">发布新公告</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="公告标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full min-h-[120px] p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            placeholder="公告内容（支持换行）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <select
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">全部课程</option>
              {Object.entries(COURSES).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <Button onClick={handlePublish} disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
              <Send className="w-4 h-4 mr-2" />
              {submitting ? '发布中...' : '发布公告'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 公告列表 */}
      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>暂无公告</p>
          </div>
        ) : announcements.map((a) => (
          <Card key={a.id} className="border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800">{a.title}</h3>
                    {a.course_id && (
                      <Badge variant="outline" className="text-xs">
                        {COURSES[a.course_id] || `课程${a.course_id}`}
                      </Badge>
                    )}
                    {a.is_pinned && (
                      <Badge className="text-xs bg-amber-100 text-amber-700">置顶</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(a.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(a.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

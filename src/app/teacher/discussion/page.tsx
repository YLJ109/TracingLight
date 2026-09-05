'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  MessagesSquare, Pin, ThumbsUp, MessageSquare, Loader2, Plus, Send, X, Lock,
} from 'lucide-react';

interface Post {
  id: number;
  course_id: number;
  course_name: string;
  title: string;
  content: string;
  is_pinned: boolean;
  like_count: number;
  reply_count: number;
  created_at: string;
  author: { name: string; role: string };
  can_delete: boolean;
}

function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return t;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleDateString();
}

export default function TeacherDiscussionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('course_id');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinPost, setPinPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingPin, setTogglingPin] = useState<number | null>(null);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const q = courseIdParam ? `?course_id=${courseIdParam}` : '';
    apiFetch(`/api/discussion${q}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setPosts(json.data || []);
        else toast.error(json.error || '获取讨论失败');
      })
      .catch(() => toast.error('获取讨论失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [courseIdParam]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handlePost = async () => {
    if (!title.trim()) { toast.error('请输入标题'); return; }
    if (!content.trim()) { toast.error('请输入内容'); return; }
    setPosting(true);
    try {
      const res = await apiPost('/api/discussion', {
        course_id: courseIdParam ? Number(courseIdParam) : undefined,
        title: title.trim(),
        content: content.trim(),
        is_pinned: pinPost,
      });
      const json = await res.json();
      if (json.success) {
        toast.success('发布成功');
        setTitle(''); setContent(''); setPinPost(false); setComposerOpen(false);
        fetchPosts();
      } else {
        toast.error(json.error || '发布失败');
      }
    } catch {
      toast.error('发布失败，请稍后重试');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/discussion/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('已删除');
        setDeleteTarget(null);
        fetchPosts();
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/teacher/analytics')}>
            <X className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="page-title">课程讨论区</h1>
            <p className="text-sm text-muted-foreground mt-1">发布讨论、置顶公告，引导学生互动</p>
          </div>
        </div>
        <Button onClick={() => setComposerOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200">
          <Plus className="w-4 h-4" /> 发布讨论
        </Button>
      </div>

      {courseIdParam && (
        <p className="text-sm text-slate-500">当前仅显示该课程下的讨论（{posts.length} 条）</p>
      )}

      {/* 发布框 */}
      {composerOpen && (
        <Card className="border-indigo-200 shadow-md py-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold">发布讨论</span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="标题（120 字内）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="说点什么…（纯文本）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 select-none">
              <input type="checkbox" checked={pinPost} onChange={(e) => setPinPost(e.target.checked)} className="accent-indigo-600" />
              标记为置顶
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>取消</Button>
              <Button onClick={handlePost} disabled={posting} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 发布
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MessagesSquare className="w-14 h-14 mx-auto opacity-30" />
          <p className="text-base mt-4 font-medium">还没有讨论</p>
          <p className="text-sm mt-1">发布第一个话题，引导学生交流吧</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card
              key={p.id}
              className="border-slate-200/60 shadow-sm card-hover cursor-pointer py-0"
              onClick={() => router.push(`/teacher/discussion/${p.id}${courseIdParam ? `?course_id=${courseIdParam}` : ''}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.is_pinned && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 shrink-0">
                        <Pin className="w-3 h-3" /> 置顶
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-normal shrink-0">{p.course_name}</Badge>
                    <span className="text-sm font-medium text-slate-500 shrink-0">{p.author.name}</span>
                    {p.author.role === 'teacher' && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">教师</Badge>}
                    <span className="text-xs text-muted-foreground shrink-0">{fmtTime(p.created_at)}</span>
                  </div>
                  {p.can_delete && (
                    <Button
                      variant="ghost" size="sm"
                      className="text-slate-400 hover:text-red-600 shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                    >删除</Button>
                  )}
                </div>
                <h3 className="text-sm font-semibold mt-2 line-clamp-1">{p.title}</h3>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2 whitespace-pre-wrap">{p.content}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                  <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> {p.like_count}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {p.reply_count}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground">确认删除该帖子？</h3>
            <p className="text-sm text-muted-foreground mt-2">删除后帖子与其下所有回复将一并移除，且不可恢复。</p>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
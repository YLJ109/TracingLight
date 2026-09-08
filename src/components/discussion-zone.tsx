'use client';

/**
 * 学生端讨论区（内嵌于「我的学情」页面）。
 * 列表 / 发帖 / 详情 / 回复 / 点赞 / 删除全部在当前区域内完成，不跳转其它路由。
 * 数据来自 /api/discussion（服务端已按学生可访问课程范围过滤），学生发帖自动为非置顶。
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  MessagesSquare, Pin, ThumbsUp, MessageSquare, Loader2, Plus, Send, X, ArrowLeft, Trash2,
} from 'lucide-react';

interface Course { id: number; name: string }

interface Post {
  id: number; course_id: number; course_name: string; title: string; content: string;
  is_pinned: boolean; like_count: number; reply_count: number; created_at: string;
  author: { name: string; role: string }; can_delete: boolean; liked: boolean;
}

interface Reply {
  id: number; content: string; like_count: number; created_at: string;
  author: { name: string; role: string }; liked: boolean; can_delete: boolean;
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

export default function DiscussionZone({
  courses,
  activeCourseId,
}: {
  courses: Course[];
  activeCourseId: string; // 'all' 或具体课程 id
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postCourseId, setPostCourseId] = useState<string>('');
  const [posting, setPosting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 内嵌详情状态
  const [selected, setSelected] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const q = activeCourseId !== 'all' ? `?course_id=${activeCourseId}` : '';
    apiFetch(`/api/discussion${q}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setPosts(json.data || []);
        else toast.error(json.error || '获取讨论失败');
      })
      .catch(() => toast.error('获取讨论失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [activeCourseId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => {
    // 发帖默认课程：跟随当前筛选；筛选为全部时取第一门课
    setPostCourseId(activeCourseId !== 'all' ? activeCourseId : String(courses[0]?.id ?? ''));
  }, [activeCourseId, courses]);

  const openPost = async (p: Post) => {
    setSelected(p);
    setReplyText('');
    setDetailLoading(true);
    try {
      const r = await apiFetch(`/api/discussion/${p.id}`);
      const json = await r.json();
      if (json.success) {
        setReplies(json.data.replies || []);
        setSelected({ ...json.data.post });
      } else {
        toast.error(json.error || '加载失败');
      }
    } catch {
      toast.error('加载失败');
    } finally { setDetailLoading(false); }
  };

  const closePost = () => {
    setSelected(null);
    setReplies([]);
    fetchPosts(); // 回列表刷新回复数/点赞
  };

  const handlePost = async () => {
    const cid = Number(postCourseId);
    if (!cid) { toast.error('请选择所属课程'); return; }
    if (!title.trim()) { toast.error('请输入标题'); return; }
    if (!content.trim()) { toast.error('请输入内容'); return; }
    setPosting(true);
    try {
      const res = await apiPost('/api/discussion', { course_id: cid, title: title.trim(), content: content.trim() });
      const json = await res.json();
      if (json.success) {
        toast.success('发布成功');
        setTitle(''); setContent(''); setComposerOpen(false);
        fetchPosts();
      } else {
        toast.error(json.error || '发布失败');
      }
    } catch {
      toast.error('发布失败，请稍后重试');
    } finally { setPosting(false); }
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
        if (selected?.id === deleteTarget.id) setSelected(null);
        fetchPosts();
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请稍后重试');
    } finally { setDeleting(false); }
  };

  const handleReply = async () => {
    if (!selected) return;
    if (!replyText.trim()) { toast.error('请输入回复内容'); return; }
    setReplying(true);
    try {
      const res = await apiPost(`/api/discussion/${selected.id}`, { content: replyText.trim() });
      const json = await res.json();
      if (json.success) {
        toast.success('回复成功');
        setReplyText('');
        openPost(selected);
      } else {
        toast.error(json.error || '回复失败');
      }
    } catch {
      toast.error('回复失败，请稍后重试');
    } finally { setReplying(false); }
  };

  const handleLike = async (targetId: number) => {
    if (!selected || likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await apiPost('/api/discussion/like', { target_type: 'post', target_id: targetId });
      const json = await res.json();
      if (json.success) {
        setSelected((p) => p ? { ...p, liked: json.liked, like_count: Math.max(0, p.like_count + (json.liked ? 1 : -1)) } : p);
      }
    } catch { /* 忽略 */ } finally { setLikeBusy(false); }
  };

  const handleReplyLike = async (id: number) => {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await apiPost('/api/discussion/like', { target_type: 'reply', target_id: id });
      const json = await res.json();
      if (json.success) {
        setReplies((prev) => prev.map((r) => r.id === id ? { ...r, liked: json.liked, like_count: Math.max(0, r.like_count + (json.liked ? 1 : -1)) } : r));
      }
    } catch { /* 忽略 */ } finally { setLikeBusy(false); }
  };

  /* ================= 内嵌详情视图 ================= */
  if (selected) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={closePost} className="gap-1.5 text-slate-500 hover:text-violet-600 w-fit">
          <ArrowLeft className="w-4 h-4" /> 返回讨论列表
        </Button>

        <Card className="border-slate-200/60 shadow-sm py-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {selected.is_pinned && <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><Pin className="w-3 h-3" /> 置顶</Badge>}
                <Badge variant="outline" className="text-xs font-normal">{selected.course_name}</Badge>
                <span className="text-sm font-medium text-slate-500">{selected.author.name}</span>
                {selected.author.role === 'teacher' && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">教师</Badge>}
                {selected.author.role === 'student' && <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">学生</Badge>}
                <span className="text-xs text-muted-foreground">{fmtTime(selected.created_at)}</span>
              </div>
              {selected.can_delete && (
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600 shrink-0" disabled={deleting} onClick={() => setDeleteTarget(selected)}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} 删除
                </Button>
              )}
            </div>
            <h2 className="text-xl font-bold mt-3">{selected.title}</h2>
            <p className="text-sm leading-relaxed text-slate-700 mt-3 whitespace-pre-wrap">{selected.content}</p>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => handleLike(selected.id)}
                className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${selected.liked ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
              >
                <ThumbsUp className={`w-4 h-4 ${selected.liked ? 'fill-violet-500 text-violet-500' : ''}`} /> {selected.like_count} 赞
              </button>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4" /> {selected.reply_count} 回复
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-200 shadow-sm py-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">参与讨论</span>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="写下你的看法…（纯文本）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <div className="flex justify-end">
              <Button onClick={handleReply} disabled={replying} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                {replying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 回复
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
          ) : replies.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">还没有回复，来抢首评吧</p>
          ) : (
            replies.map((r) => (
              <Card key={r.id} className="border-slate-200/60 shadow-sm py-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">{r.author.name}</span>
                    {r.author.role === 'teacher' && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">教师</Badge>}
                    <span className="text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{r.content}</p>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-50">
                    <button
                      onClick={() => handleReplyLike(r.id)}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors ${r.liked ? 'bg-violet-50 text-violet-600' : 'text-muted-foreground hover:bg-slate-100'}`}
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${r.liked ? 'fill-violet-500 text-violet-500' : ''}`} /> {r.like_count}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

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

  /* ================= 列表视图 ================= */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">
          当前范围：
          {activeCourseId !== 'all'
            ? `「${courses.find((c) => String(c.id) === activeCourseId)?.name || '该课程'}」下的讨论（${posts.length} 条）`
            : `全部课程下的讨论（${posts.length} 条）`}
        </p>
        <Button onClick={() => setComposerOpen(true)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200">
          <Plus className="w-4 h-4" /> 发起讨论
        </Button>
      </div>

      {composerOpen && (
        <Card className="border-violet-200 shadow-md py-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold">发起讨论</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setComposerOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <select
              value={postCourseId}
              onChange={(e) => setPostCourseId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="标题（120 字内）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="说点什么…（纯文本）"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>取消</Button>
              <Button onClick={handlePost} disabled={posting} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 发布
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessagesSquare className="w-14 h-14 mx-auto opacity-30" />
          <p className="text-base mt-4 font-medium">还没有讨论</p>
          <p className="text-sm mt-1">发起第一个话题，与同学交流吧</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="border-slate-200/60 shadow-sm card-hover cursor-pointer py-0" onClick={() => openPost(p)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.is_pinned && <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 shrink-0"><Pin className="w-3 h-3" /> 置顶</Badge>}
                    <Badge variant="outline" className="text-xs font-normal shrink-0">{p.course_name}</Badge>
                    <span className="text-sm font-medium text-slate-500 shrink-0">{p.author.name}</span>
                    {p.author.role === 'teacher' && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">教师</Badge>}
                    <span className="text-xs text-muted-foreground shrink-0">{fmtTime(p.created_at)}</span>
                  </div>
                  {p.can_delete && (
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600 shrink-0" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}>删除</Button>
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
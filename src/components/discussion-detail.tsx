'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, ThumbsUp, MessageSquare, Loader2, Send, Pin, Trash2,
} from 'lucide-react';

interface Reply {
  id: number;
  content: string;
  like_count: number;
  created_at: string;
  author: { name: string; role: string };
  liked: boolean;
  can_delete: boolean;
}

interface PostDetail {
  id: number;
  title: string;
  content: string;
  is_pinned: boolean;
  like_count: number;
  reply_count: number;
  created_at: string;
  course_name: string;
  author: { name: string; role: string };
  liked: boolean;
  can_delete: boolean;
}

function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * 共享讨论详情：学生 / 教师详情页复用同一实现，仅返回回退路由不同。
 */
export default function DiscussionDetail({
  postId,
  backHref,
}: {
  postId: string;
  backHref: string;
}) {
  const router = useRouter();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/discussion/${postId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setPost(json.data.post);
          setReplies(json.data.replies || []);
        } else {
          toast.error(json.error || '加载失败');
          router.back();
        }
      })
      .catch(() => toast.error('加载失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [postId, router]);

  useEffect(() => { if (postId) fetchDetail(); }, [postId, fetchDetail]);

  const handleLike = async (type: 'post' | 'reply', id: number) => {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await apiPost('/api/discussion/like', { target_type: type, target_id: id });
      const json = await res.json();
      if (json.success) {
        if (type === 'post' && post) {
          setPost({ ...post, liked: json.liked, like_count: Math.max(0, post.like_count + (json.liked ? 1 : -1)) });
        } else {
          setReplies((prev) => prev.map((r) => r.id === id ? { ...r, liked: json.liked, like_count: Math.max(0, r.like_count + (json.liked ? 1 : -1)) } : r));
        }
      }
    } catch {
      toast.error('操作失败，请稍后重试');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) { toast.error('请输入回复内容'); return; }
    setReplying(true);
    try {
      const res = await apiPost(`/api/discussion/${postId}`, { content: replyText.trim() });
      const json = await res.json();
      if (json.success) {
        toast.success('回复成功');
        setReplyText('');
        fetchDetail();
      } else {
        toast.error(json.error || '回复失败');
      }
    } catch {
      toast.error('回复失败，请稍后重试');
    } finally {
      setReplying(false);
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/discussion/${post.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('已删除');
        router.push(backHref);
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('删除失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !post) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="page-title">讨论详情</h1>
      </div>

      <Card className="border-slate-200/60 shadow-sm py-0">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {post.is_pinned && <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><Pin className="w-3 h-3" /> 置顶</Badge>}
              <Badge variant="outline" className="text-xs font-normal">{post.course_name}</Badge>
              <span className="text-sm font-medium text-slate-500">{post.author.name}</span>
              {post.author.role === 'teacher' && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px]">教师</Badge>}
              {post.author.role === 'student' && <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">学生</Badge>}
              <span className="text-xs text-muted-foreground">{fmtTime(post.created_at)}</span>
            </div>
            {post.can_delete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600 shrink-0" disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} 删除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除该帖子？</AlertDialogTitle>
                    <AlertDialogDescription>
                      删除后该帖子及其下所有回复将一并删除且不可恢复。请确认是否继续。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeletePost} disabled={deleting}>确认删除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <h2 className="text-xl font-bold mt-3">{post.title}</h2>
          <p className="text-sm leading-relaxed text-slate-700 mt-3 whitespace-pre-wrap">{post.content}</p>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => handleLike('post', post.id)}
              className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${post.liked ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
            >
              <ThumbsUp className={`w-4 h-4 ${post.liked ? 'fill-violet-500 text-violet-500' : ''}`} /> {post.like_count} 赞
            </button>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="w-4 h-4" /> {post.reply_count} 回复
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
        {replies.length === 0 ? (
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
                    onClick={() => handleLike('reply', r.id)}
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
    </div>
  );
}
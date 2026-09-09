'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import RichContentView from '@/components/rich-content-view';
import { formatDateTime } from '@/lib/date';
import { questionTypeLabel } from '@/lib/labels';
import { Trophy, ThumbsUp, CheckCircle2, XCircle, Loader2, MessageSquare, Clock3 } from 'lucide-react';

interface Grading {
  total_score: number | null; full_score: number; overall_comment?: string | null; status: string;
  teacher_override_score?: number | null;
  dimension_scores?: Record<string, number> | null;
  annotations?: Array<{ content?: string; type?: string; point_deduction?: number }> | null;
  unmastered_knowledge_names?: string[] | null;
  error_type?: string | null; ai_generated_probability?: number | null;
}
interface Appeal { id: number; reason: string; status: string; teacher_comment?: string | null; }
interface Item {
  question: { id: number; question_type: string; content: string; options?: any; answer?: string; analysis?: string; full_score: number } | null;
  knowledge_point_name?: string;
  student_answer: string; is_answered: boolean; grading: Grading | null; appeal: Appeal | null;
}
interface ResultData {
  can_view: boolean; reason?: string;
  exam: { id: number; title: string; course_name: string; grades_published: boolean; total_score?: number; submitted_via?: string; submitted_at?: string };
  summary: { got_score: number; full_score: number; pending_count: number };
  items: Item[];
}

const QOPT = new Set(['single_choice', 'multi_choice', 'multiple_choice', 'judgment']);

export default function ExamResultPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'pending'>('all');
  const [appealQ, setAppealQ] = useState<Item | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'student') { window.location.href = '/'; return; }
    const load = async () => {
      try {
        const j = await (await apiFetch(`/api/student/exams/${id}/result`)).json();
        if (j.can_view === false) { setData(null); setDenied(j.reason || 'not_finished'); }
        else { setData(j); setDenied(null); }
      } catch { setData(null); setDenied('error'); }
      setLoading(false);
    };
    load();
  }, [id, user, authLoading]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-violet-600" /></div>;
  if (denied === 'not_finished') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Clock3 className="w-10 h-10 text-amber-400" />
      <p className="text-slate-600">本场考试尚未交卷或仍在进行中</p>
      <Button className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={() => router.push(`/student/exams/${id}/take`)}>返回继续作答</Button>
    </div>
  );
  if (denied) return <div className="min-h-screen flex items-center justify-center text-slate-400">无法查看成绩</div>;
  if (!data || !data.summary || !data.exam) return <div className="min-h-screen flex items-center justify-center text-slate-400">暂无结果</div>;

  const optionsToText = (q: Item['question']) => {
    const list = q && Array.isArray(q.options) ? (q.options as Array<{ key: string; text: string }>) : [];
    const forKeys = (keys: string) => (keys || '').split(',').filter(Boolean).map((k) => { const o = list.find((x) => x.key === k); return o ? `${o.key}. ${o.text}` : k; }).join('；');
    return forKeys;
  };

  const submitAppeal = async () => {
    if (!appealQ?.question || !appealReason.trim()) return toast.error('请填写申诉原因');
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/student/exams/${id}/appeal`, { method: 'POST', body: JSON.stringify({ question_id: appealQ.question.id, reason: appealReason }) });
      const j = await res.json();
      if (res.ok) { toast.success('申诉已提交，等待老师复核'); setAppealQ(null); setAppealReason(''); window.location.reload(); }
      else toast.error(j.error || '提交失败');
    } catch { toast.error('网络异常'); }
    setSubmitting(false);
  };

  const percent = data.summary.full_score ? Math.round((data.summary.got_score / data.summary.full_score) * 100) : 0;

  const DIM_LABEL: Record<string, string> = {
    knowledge_accuracy: '知识准确', logic_completeness: '逻辑完整', expression_clarity: '表达清晰', expansion: '拓展深度',
  };
  // 每题状态分类，用于筛选栏
  const itemState = (g: Grading | null, correct: boolean, graded: boolean) => (graded ? (correct ? 'correct' : 'wrong') : 'pending');
  const filteredItems = data.items.filter((it) => {
    if (filter === 'all') return true;
    const g = it.grading;
    const gFull = g?.full_score ?? it.question?.full_score ?? 0;
    const gScore = g && g.status === 'completed' ? g.total_score : null;
    const graded = gScore != null;
    const correct = graded && gScore != null && gScore >= gFull;
    return itemState(g, correct, graded) === filter;
  });

  const FILTER_TABS: Array<{ key: 'all' | 'correct' | 'wrong' | 'pending'; label: string; cls: string }> = [
    { key: 'all', label: '全部', cls: 'text-slate-600' },
    { key: 'correct', label: '答对', cls: 'text-emerald-600' },
    { key: 'wrong', label: '答错', cls: 'text-red-500' },
    { key: 'pending', label: '待批', cls: 'text-amber-600' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up py-6">
      <SetActiveNav href="/student/exams" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">成绩详情</h1>
        {data.exam.submitted_at && <span className="text-xs text-slate-400">交卷 {formatDateTime(data.exam.submitted_at)}{data.exam.submitted_via === 'exceed' ? ' · 超时自动提交' : data.exam.submitted_via === 'terminate' ? ' · 监考终止' : ''}</span>}
      </div>

      <Card className="border-slate-200/60 shadow-sm bg-gradient-to-br from-violet-50 via-white to-teal-50">
        <CardContent className="p-6 flex items-center gap-6 flex-wrap">
          <div className="text-center shrink-0">
            <div className={`text-5xl font-bold ${percent >= 60 ? 'text-emerald-600' : 'text-red-500'}`}>{data.summary.got_score}<span className="text-2xl text-slate-400">/{data.summary.full_score}</span></div>
            <Badge className={percent >= 60 ? 'bg-emerald-100 text-emerald-700 mt-2' : 'bg-red-100 text-red-600 mt-2'}>{percent}% 得分率</Badge>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-800">{data.exam.title}</h2>
            <p className="text-sm text-slate-500">{data.exam.course_name}</p>
            {data.summary.pending_count > 0 && (
              <div className="mt-2 flex items-center gap-2 text-amber-600 text-sm"><Clock3 className="w-4 h-4" />还有 {data.summary.pending_count} 道主观题待老师批改，部分成绩尚未计入</div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="outline" onClick={() => router.push('/student/exams')}>返回考试列表</Button>
          </div>
        </CardContent>
      </Card>

      {data.summary.pending_count === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          <Trophy className="w-4 h-4 shrink-0" />
          {percent >= 90 ? '非常优秀，继续保持！' : percent >= 60 ? '作答总体不错，仍有提升空间' : '不必气馁，及时复盘错题更重要'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200/60 shadow-sm rounded-2xl px-3 py-2">
        {FILTER_TABS.map((t) => {
          const count = t.key === 'all'
            ? data.items.length
            : data.items.filter((it) => {
                const g = it.grading; const gf = g?.full_score ?? it.question?.full_score ?? 0;
                const gs = g && g.status === 'completed' ? g.total_score : null; const gd = gs != null; const c = gd && gs != null && gs >= gf;
                return itemState(g, c, gd) === t.key;
              }).length;
          return (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer ${filter === t.key ? 'bg-violet-600 text-white shadow' : `${t.cls} hover:bg-slate-100`}`}>
              {t.label}<span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 && <p className="text-slate-400 text-center py-8">暂无该状态的题目</p>}
        {filteredItems.map((it, i) => {
          const q = it.question;
          if (!q) return null;
          const g = it.grading;
          const gFull = g?.full_score ?? q.full_score;
          const gScore = g && g.status === 'completed' ? g.total_score : null;
          const graded = gScore != null;
          const correct = gScore != null && gScore >= gFull;
          return (
            <Card key={q.id} className={`border-slate-200/60 shadow-sm ${graded ? (correct ? 'ring-1 ring-emerald-200' : 'ring-1 ring-red-200') : 'ring-1 ring-amber-200'}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${graded ? (correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600') : 'bg-amber-100 text-amber-700'}`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge>
                      {it.knowledge_point_name && <Badge className="text-xs bg-slate-100 text-slate-500">{it.knowledge_point_name}</Badge>}
                      <span className="text-xs text-slate-400">{q.full_score}分</span>
                      {graded ? (correct ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />) : <Badge className="bg-amber-100 text-amber-700 text-xs">待批</Badge>}
                      <span className="ml-auto text-sm font-semibold">{graded ? `${gScore}/${gFull}` : '—'}</span>
                    </div>
                    <p className="text-sm text-slate-700 mb-3">{q.content}</p>

                    {/* 选项类题目：逐项高亮「你的选择 vs 正确选项」 */}
                    {QOPT.has(q.question_type) && (
                      <div className="space-y-2">
                        {Array.isArray(q.options) && (q.options as Array<{ key: string; text: string }>).map((o) => {
                          const mySel = String(it.student_answer || '').split(',').includes(o.key);
                          const correctKey = String(q.answer || '').split(',').includes(o.key);
                          const cls = correctKey ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : (mySel ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-100 bg-slate-50 text-slate-400');
                          return (
                            <div key={o.key} className={`border rounded-lg px-3 py-1.5 text-sm flex items-center gap-2 ${cls}`}>
                              <span className="font-medium">{o.key}.</span><span className="flex-1">{o.text}</span>
                              {correctKey && <span className="text-xs text-emerald-600">正确答案</span>}
                              {mySel && !correctKey && <span className="text-xs text-red-500">你的选择</span>}
                            </div>
                          );
                        })}
                        {it.is_answered && <p className="text-xs text-slate-400">你的作答：{it.student_answer}　参考：{q.answer}</p>}
                      </div>
                    )}

                    {/* 主观题作答 */}
                    {!QOPT.has(q.question_type) && (
                      <div className="space-y-1.5 text-sm">
                        <p className="text-slate-500">你的作答：</p>
                        <div className="p-3 rounded-lg bg-slate-50 text-slate-700"><RichContentView content={it.student_answer} /></div>
                      </div>
                    )}

                    {/* 主观题 AI 解析 + 维度分 + 薄弱知识点 */}
                    {!QOPT.has(q.question_type) && g?.overall_comment && (
                      <div className="mt-2 p-3 rounded-lg bg-indigo-50 text-sm space-y-2">
                        <p className="text-indigo-700"><span className="font-medium">AI 解析与评语：</span>{g.overall_comment}</p>
                        {g.dimension_scores && Object.keys(g.dimension_scores).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(g.dimension_scores).map(([k, v]) => (
                              <span key={k} className="bg-white/80 rounded-md px-2 py-0.5 text-xs text-slate-600">{DIM_LABEL[k] || k} {v}分</span>
                            ))}
                          </div>
                        )}
                        {g.unmastered_knowledge_names && g.unmastered_knowledge_names.length > 0 && (
                          <p className="text-xs text-slate-500">薄弱知识点：<span className="text-amber-600">{g.unmastered_knowledge_names.join('、')}</span></p>
                        )}
                      </div>
                    )}

                    {/* 题目解析（客观题 analysis / 主观题参考答案） */}
                    {q.analysis && (
                      <div className="mt-2 p-3 rounded-lg bg-sky-50 text-sm text-slate-600"><span className="font-medium text-sky-700">解析：</span>{q.analysis}</div>
                    )}
                    {!QOPT.has(q.question_type) && q.answer && graded && !correct && (
                      <div className="mt-2 p-3 rounded-lg bg-emerald-50 text-sm text-emerald-700"><span className="font-medium">参考答案：</span>{q.answer}</div>
                    )}

                    {/* 申诉入口 */}
                    {it.appeal ? (
                      <Badge className={`mt-3 ${it.appeal.status === 'pending' ? 'bg-amber-100 text-amber-700' : it.appeal.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {it.appeal.status === 'pending' ? '申诉审核中' : it.appeal.status === 'resolved' ? '申诉已通过' : '申诉已驳回'}
                        {it.appeal.teacher_comment && `：${it.appeal.teacher_comment}`}
                      </Badge>
                    ) : (
                      (!graded || !correct) && data.summary.pending_count === 0 && (
                        <Button variant="outline" size="sm" className="mt-3 gap-1 text-slate-500" onClick={() => { setAppealQ(it); setAppealReason(''); }}>
                          <MessageSquare className="w-3.5 h-3.5" />对本题申诉
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!appealQ} onOpenChange={(o) => !o && setAppealQ(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>成绩申诉</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 mb-2">请说明你认为判分有误的原因，老师将进行复核。</p>
          <Textarea rows={4} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} placeholder="例如：本题我的答案与参考答案含义一致，应为满分…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealQ(null)}>取消</Button>
            <Button className="bg-gradient-to-r from-violet-600 to-teal-600" onClick={submitAppeal} disabled={submitting}>{submitting ? '提交中…' : '提交申诉'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
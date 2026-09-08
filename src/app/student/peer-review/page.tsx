'use client';
import { apiFetch } from '@/lib/api-fetch';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { SetActiveNav } from '@/components/app-shell';
import {
  Users, MessageSquare, Send, Loader2, BookOpen, ShieldCheck, CheckCircle2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

interface PeerTarget {
  assignment_id: number;
  question_id: number;
  question_type: string;
  content: string;
  reference_answer: string | null;
  full_score: number;
  reviewee_id: number;
  peer_label: string;
  reviewee_name: string | null;
  student_answer: string | null;
}

interface PeerGroup {
  assignment: { id: number; title: string; course_name: string; total_score: number };
  config: { enabled: boolean; count: number; reveal_name: boolean };
  submitted: boolean;
  targets: PeerTarget[];
}

const DIMENSIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'knowledge_accuracy', label: '知识点准确性', hint: '是否扣准要点、概念正确' },
  { key: 'logic_completeness', label: '逻辑完整性', hint: '推理/步骤是否完整' },
  { key: 'expression_clarity', label: '表达条理性', hint: '表述是否清晰规范' },
  { key: 'expansion', label: '拓展加分', hint: '有无超出参考答案的深入理解' },
];

const typeLabels: Record<string, string> = {
  single_choice: '单选', multiple_choice: '多选', multi_choice: '多选', judgment: '判断',
  fill_blank: '填空', short_answer: '简答', essay: '论述', code: '编程', programming: '编程', attachment: '实验',
};

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

export default function StudentPeerReviewPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<PeerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // 每份待评的分值/维度/评语（key = `${assignment_id}:${question_id}:${reviewee_id}`）
  const [scores, setScores] = useState<Record<string, string>>({});
  const [dims, setDims] = useState<Record<string, Record<string, number>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/student/peer-review');
      const json = await res.json();
      if (json.success) setGroups(json.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitReview = async (t: PeerTarget) => {
    const key = `${t.assignment_id}:${t.question_id}:${t.reviewee_id}`;
    const scoreVal = Number(scores[key]);
    if (!Number.isFinite(scoreVal) || scoreVal < 0 || scoreVal > t.full_score) {
      toast.error(`请为 ${t.peer_label} 提供一个 0~${fmt(t.full_score)} 的互评分`);
      return;
    }
    setSubmittingKey(key);
    try {
      const d = dims[key] || {};
      const res = await apiFetch('/api/student/peer-review', {
        method: 'POST',
        body: JSON.stringify({
          assignment_id: t.assignment_id,
          question_id: t.question_id,
          reviewee_id: t.reviewee_id,
          total_score: scoreVal,
          dimension_scores: (Object.keys(d).length ? {
            knowledge_accuracy: d.knowledge_accuracy ?? 0,
            logic_completeness: d.logic_completeness ?? 0,
            expression_clarity: d.expression_clarity ?? 0,
            expansion: d.expansion ?? 0,
          } : undefined),
          comment: comments[key] || '',
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`已提交对 ${t.peer_label} 的互评`);
        await fetchData(); // 重新拉取（已评的待办消失）
      } else {
        toast.error(json.error || '提交失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmittingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载中...
      </div>
    );
  }

  const pendingGroups = groups.filter((g) => g.targets.length > 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 归属「我的作业」高亮 */}
      <SetActiveNav href="/student/assignments" />
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" /> 生生互评
          </h1>
          <p className="text-sm text-slate-500">
            匿名互评同学的作答，结果作为「互评参考」展示，不影响你的官方成绩（老师批改成绩为准）。
          </p>
        </div>
      </div>

      {/* 盲评提示 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-700">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span>默认匿名（同学A/同学B），请客观公正地给出评价与评分，并在评语中点明可改进之处。</span>
      </div>

      {pendingGroups.length === 0 ? (
        <Card className="py-0">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">当前没有待互评的作业</p>
            <p className="text-sm text-slate-400 mt-1">当老师开启互评且你提交作业后，这里会出现同学的作答供你评价</p>
          </CardContent>
        </Card>
      ) : (
        pendingGroups.map((grp) => (
          <div key={grp.assignment.id} className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <h2 className="font-semibold text-slate-800">{grp.assignment.title}</h2>
              <Badge variant="secondary" className="text-xs gap-1">
                <BookOpen className="w-3 h-3" /> {grp.assignment.course_name}
              </Badge>
              <Badge className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                <Users className="w-3 h-3 mr-1" /> {grp.targets.length} 个待评
              </Badge>
            </div>

            {grp.targets.map((t) => {
              const key = `${t.assignment_id}:${t.question_id}:${t.reviewee_id}`;
              return (
                <Card key={`${t.question_id}:${t.reviewee_id}`} className="border-slate-200/80 shadow-sm py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                            {grp.targets.indexOf(t) + 1}
                          </span>
                          <span className="font-semibold text-teal-700">{t.peer_label}</span>
                          <Badge variant="outline" className="text-xs">{typeLabels[t.question_type] || '其他'}</Badge>
                          <span className="text-xs text-slate-400">满分 {fmt(t.full_score)}</span>
                          {t.reviewee_name && <Badge className="text-xs bg-indigo-50 text-indigo-700">{t.reviewee_name}</Badge>}
                        </div>
                        <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{t.content}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div className="rounded-lg border border-green-200 bg-green-50 p-2">
                        <p className="text-xs text-green-700 font-medium mb-1">参考要点</p>
                        <p className="text-sm text-green-800 whitespace-pre-wrap">{t.reference_answer || '—'}</p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2">
                        <p className="text-xs text-indigo-700 font-medium mb-1">{t.peer_label} 的作答</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.student_answer || '（未作答）'}</p>
                      </div>
                    </div>

                    {/* 评分输入 */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="text-sm text-slate-500">互评分</span>
                      <Input
                        type="number"
                        className="w-20 h-9 text-center"
                        min={0}
                        max={t.full_score}
                        step="any"
                        placeholder="0"
                        value={scores[key] || ''}
                        onChange={(e) => setScores((p) => ({ ...p, [key]: e.target.value }))}
                      />
                      <span className="text-xs text-slate-400">/ {fmt(t.full_score)}</span>
                    </div>

                    {/* 维度滑块（可选） */}
                    {(() => {
                      const d = dims[key] || {};
                      return (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
                          <p className="text-xs text-slate-400 md:col-span-2">四维度量化（0~100，可选，用于汇总互评画像）</p>
                          {DIMENSIONS.map((dm) => (
                            <label key={dm.key} className="flex items-center gap-2 text-sm" title={dm.hint}>
                              <span className="w-24 text-slate-600 shrink-0">{dm.label}</span>
                              <input
                                type="range" min={0} max={100} value={d[dm.key] ?? 0}
                                onChange={(e) => setDims((p) => ({ ...p, [key]: { ...(p[key] || {}), [dm.key]: Number(e.target.value) } }))}
                                className="flex-1 accent-teal-600"
                              />
                              <span className="w-8 text-right text-xs text-slate-500 font-mono">{d[dm.key] ?? 0}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()}

                    <div className="mt-2">
                      <Textarea
                        rows={2}
                        placeholder="写下你的评价与建议（可选）：哪点做得好、哪些可改进..."
                        value={comments[key] || ''}
                        onChange={(e) => setComments((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700 gap-1"
                        disabled={submittingKey === key}
                        onClick={() => submitReview(t)}
                      >
                        {submittingKey === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        提交互评
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
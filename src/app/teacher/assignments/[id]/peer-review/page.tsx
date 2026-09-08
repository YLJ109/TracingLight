'use client';
import { apiFetch } from '@/lib/api-fetch';
import { formatDateTime } from '@/lib/date';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Users, Loader2, MessageSquare, Eye, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { BackButton } from '@/components/ui/back-button';

interface PeerReviewRow {
  id: number;
  question_id: number;
  question: { content: string; question_type: string } | null;
  reviewer_id: number;
  reviewer_name: string;
  reviewee_id: number;
  reviewee_name: string;
  total_score: number | null;
  dimension_scores: Record<string, number> | null;
  comment: string | null;
  status: string;
  created_at: string | null;
}

interface PeerScore { reviewee_id: number; reviewee_name: string; question_id: number; review_count: number; avg_score: number }

interface PeerData {
  config: { enabled: boolean; count: number; reveal_name: boolean };
  submissions: { submitted: number; total: number };
  reviews: PeerReviewRow[];
  peerScores: PeerScore[];
}

const typeLabels: Record<string, string> = {
  single_choice: '单选', multiple_choice: '多选', multi_choice: '多选', judgment: '判断',
  fill_blank: '填空', short_answer: '简答', essay: '论述', code: '编程', programming: '编程', attachment: '实验',
};

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

export default function TeacherPeerReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<PeerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<{ enabled: boolean; count: number; reveal_name: boolean }>({ enabled: false, count: 2, reveal_name: false });
  const [expandedReviewee, setExpandedReviewee] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/peer-review`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setConfig(json.data.config);
      } else {
        toast.error(json.error || '加载失败');
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = async (next: typeof config) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/peer-review`, {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data.config);
        toast.success('互评配置已保存');
      } else {
        toast.error(json.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载互评数据...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <p>无法加载互评数据</p>
        <Button variant="outline" onClick={() => router.back()} className="gap-1.5 text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300"><ArrowLeft className="w-4 h-4" />返回</Button>
      </div>
    );
  }

  // 按被评人分组互评记录
  const groupedByReviewee = new Map<number, PeerReviewRow[]>();
  data.reviews.forEach((r) => {
    if (!groupedByReviewee.has(r.reviewee_id)) groupedByReviewee.set(r.reviewee_id, []);
    groupedByReviewee.get(r.reviewee_id)!.push(r);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" /> 生生互评
          </h1>
          <p className="text-sm text-slate-500">学生匿名互评主观题作答，仅作「互评参考」，不影响官方成绩</p>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
      </div>

      {/* 配置 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600" /> 互评配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => saveConfig({ ...config, enabled: e.target.checked })}
                className="accent-teal-600 w-4 h-4"
              />
              开启互评
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">每份评</span>
              <Input
                type="number" min={1} max={10} disabled={!config.enabled}
                value={config.count}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  setConfig({ ...config, count: v });
                }}
                onBlur={() => saveConfig({ ...config })}
                className="w-16 h-8 text-center"
              />
              <span className="text-slate-500">位同学</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.reveal_name}
                onChange={(e) => saveConfig({ ...config, reveal_name: e.target.checked })}
                className="accent-teal-600 w-4 h-4"
              />
              <Eye className="w-3.5 h-3.5 mr-0.5" /> 显示姓名（取消勾选即盲评匿名）
            </label>
            <span className="text-xs text-slate-400">
              已交 {data.submissions.submitted}/{data.submissions.total} · 互评记录 {data.reviews.length} 条
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 互评分数总览（按被评人） */}
      {data.peerScores.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">互评分值总览（按被评人 × 题目）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b">
                    <th className="py-1.5 pr-4">被评同学</th>
                    <th className="py-1.5 pr-4">总评</th>
                    <th className="py-1.5">平均互评分</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const byReviewee = new Map<number, PeerScore[]>();
                    data.peerScores.forEach((s) => {
                      if (!byReviewee.has(s.reviewee_id)) byReviewee.set(s.reviewee_id, []);
                      byReviewee.get(s.reviewee_id)!.push(s);
                    });
                    const rows = Array.from(byReviewee.entries()).sort((a, b) => b[1].length - a[1].length);
                    if (rows.length === 0) return <tr><td className="py-3 text-slate-400">暂无互评数据</td></tr>;
                    return rows.map(([revieweeId, scores]) => {
                      const reviews = groupedByReviewee.get(revieweeId) || [];
                      const total = reviews.filter((r) => r.total_score != null);
                      const overall = total.length > 0
                        ? total.reduce((s, r) => s + (r.total_score || 0), 0) / total.length
                        : 0;
                      return (
                        <tr key={revieweeId} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-medium text-slate-700">{scores[0].reviewee_name}</td>
                          <td className="py-2 pr-4 text-slate-500">{scores.length} 题被评 / {total.length} 条评分</td>
                          <td className="py-2 font-mono font-bold text-teal-700">{fmt(Math.round(overall * 10) / 10)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 互评明细（按被评人分组） */}
      {data.reviews.length === 0 ? (
        <Card className="py-0">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">暂无互评记录</p>
            <p className="text-sm text-slate-400 mt-1">开启互评且学生提交主观题后，这里会展示同学的匿名互评</p>
          </CardContent>
        </Card>
      ) : (
        Array.from(groupedByReviewee.entries()).map(([revieweeId, rows]) => (
          <Card key={revieweeId}>
            <CardHeader
              className="pb-2 cursor-pointer select-none"
              onClick={() => setExpandedReviewee(expandedReviewee === revieweeId ? null : revieweeId)}
            >
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                <span className="text-slate-800">{rows[0].reviewee_name}</span>
                <Badge className="text-xs bg-teal-50 text-teal-700 border-teal-200">{rows.length} 条互评</Badge>
                <span className="ml-auto text-xs text-slate-400">{expandedReviewee === revieweeId ? '收起 ▲' : '展开 ▼'}</span>
              </CardTitle>
            </CardHeader>
            {expandedReviewee === revieweeId && (
              <CardContent className="space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-indigo-700">{r.reviewer_name}</span>
                      <Badge variant="outline" className="text-xs">{typeLabels[r.question?.question_type || ''] || '其他'}</Badge>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-teal-600" />
                        <span className="font-mono font-bold text-teal-700">{r.total_score != null ? fmt(r.total_score) : '—'}</span>
                      </span>
                      {r.created_at && <span className="text-xs text-slate-400 ml-auto">{formatDateTime(r.created_at)}</span>}
                    </div>
                    {r.question && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.question.content}</p>
                    )}
                    {r.dimension_scores && (
                      <div className="flex gap-2 mt-1 text-xs text-slate-500">
                        <span>知识:{r.dimension_scores.knowledge_accuracy ?? 0}</span>
                        <span>逻辑:{r.dimension_scores.logic_completeness ?? 0}</span>
                        <span>表达:{r.dimension_scores.expression_clarity ?? 0}</span>
                        <span>拓展:{r.dimension_scores.expansion ?? 0}</span>
                      </div>
                    )}
                    {r.comment && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">💬 {r.comment}</p>}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { questionTypeLabel } from '@/lib/labels';
import { BackButton } from '@/components/ui/back-button';
import RichContentView from '@/components/rich-content-view';
import { RefreshCw, Send, CheckCircle2, ClipboardList, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function parseOptions(raw: unknown): Array<{ key: string; text: string }> {
  if (Array.isArray(raw)) {
    return raw.map((o: any) => ({ key: String(o?.key ?? ''), text: String(o?.text ?? o ?? '') }));
  }
  if (typeof raw === 'string' && raw) {
    const flat = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    return flat.length ? flat.map((t, i) => ({ key: String.fromCharCode(65 + i), text: t })) : [];
  }
  return [];
}

interface GradingRow {
  grading_id: number; student_id: number; student_name: string; student_answer: string;
  full_score: number; status: string;
  ai_total_score: number | null; ai_overall_comment: string | null;
  ai_dimension_scores: Record<string, number> | null; ai_annotations: Array<{ content?: string; type?: string; point_deduction?: number }> | null;
  ai_unmastered_ids: number[] | null; ai_generated_probability: number | null;
}
interface GradingGroup {
  question_id: number; question_type: string; content: string; answer: string;
  analysis?: string; options?: unknown;
  rows: GradingRow[];
}
interface GradingPayload {
  exam: { id: number; title: string };
  pending_count: number;
  grouped: GradingGroup[];
}

export default function ExamGradingPage() {
  const { id } = useParams() as { id: string };
  const [exam, setExam] = useState<{ id: number; title: string } | null>(null);
  const [groups, setGroups] = useState<GradingGroup[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);

  const aiBatch = async () => {
    if (!pendingCount) { toast.info('当前已无待批题目'); return; }
    setAiBatchLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/grading`, { method: 'POST', body: JSON.stringify({ action: 'ai_batch' }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'AI 批量批改失败'); return; }
      toast.success(`AI 批量批改完成：成功 ${j.done ?? 0} 条，失败 ${j.fail ?? 0} 条`);
      load(true);
    } catch { toast.error('网络异常'); }
    setAiBatchLoading(false);
  };

  const load = useCallback(async (silent = false) => {
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/grading`);
      const j = await res.json();
      if (!res.ok) { if (!silent) toast.error(j.error || '加载失败'); return; }
      const payload: GradingPayload = j;
      setExam(payload.exam);
      setGroups(payload.grouped);
      setPendingCount(payload.pending_count);
      setActiveIdx((prev) => Math.min(prev, Math.max(0, payload.grouped.length - 1)));
      // 预填 AI 初评：分数与评语（若教师尚未手动填），便于直接采纳或微调
      setScores((prev) => {
        const next = { ...prev };
        for (const gr of payload.grouped) for (const g of gr.rows) {
          if (next[g.grading_id] === undefined && g.ai_total_score != null) next[g.grading_id] = String(g.ai_total_score);
        }
        return next;
      });
      setComments((prev) => {
        const next = { ...prev };
        for (const gr of payload.grouped) for (const g of gr.rows) {
          if (next[g.grading_id] === undefined && g.ai_overall_comment) next[g.grading_id] = g.ai_overall_comment;
        }
        return next;
      });
    } catch { if (!silent) toast.error('网络异常'); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const active = groups[activeIdx] || null;

  const saveRow = async (g: GradingRow) => {
    const val = Number(scores[g.grading_id]);
    if (val === null || Number.isNaN(val)) { toast.error('请输入分数'); return; }
    if (val < 0 || val > g.full_score) { toast.error(`分数需在 0 ~ ${g.full_score} 之间`); return; }
    setSavingId(g.grading_id);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/grading`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ grading_id: g.grading_id, score: val, comment: comments[g.grading_id]?.trim() }] }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '保存失败'); return; }
      toast.success('已批改该条');
      load(true);
    } catch { toast.error('网络异常'); }
    setSavingId(null);
  };

  const adoptAI = (g: GradingRow) => {
    if (g.ai_total_score == null) { toast.info('该条暂无 AI 建议分'); return; }
    setScores((p) => ({ ...p, [g.grading_id]: String(g.ai_total_score) }));
    if (g.ai_overall_comment) {
      const c: string = g.ai_overall_comment;
      setComments((p) => ({ ...p, [g.grading_id]: c }));
    }
    toast.success(`已采用 AI 建议分 ${g.ai_total_score}`);
  };

  const saveAll = async () => {
    if (!active) return;
    const items: Array<{ grading_id: number; score: number; comment?: string }> = [];
    for (const g of active.rows) {
      const val = Number(scores[g.grading_id]);
      if (Number.isNaN(val)) { toast.error(`「${g.student_name}」未填分数`); return; }
      if (val < 0 || val > g.full_score) { toast.error(`「${g.student_name}」分数需在 0 ~ ${g.full_score} 之间`); return; }
      items.push({ grading_id: g.grading_id, score: val, comment: comments[g.grading_id]?.trim() });
    }
    setSavingAll(true);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/grading`, { method: 'POST', body: JSON.stringify({ items }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '保存失败'); return; }
      toast.success(`已保存 ${items.length} 条`);
      load(true);
    } catch { toast.error('网络异常'); }
    setSavingAll(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton to="/teacher/exams" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">主观题批改</h1>
        <Badge className="bg-gradient-to-r from-violet-600 to-teal-600 text-white">{exam?.title || '…'}</Badge>
        <Badge className={pendingCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'}>
          {pendingCount > 0 ? `待批 ${pendingCount} 题` : '已全部批完'}
        </Badge>
        <div className="flex-1" />
        <Button variant="outline" onClick={aiBatch} disabled={aiBatchLoading || pendingCount === 0} className="cursor-pointer">
          <Sparkles className={cn('w-4 h-4', aiBatchLoading && 'animate-pulse')} />{aiBatchLoading ? 'AI 批量批改中…' : 'AI 批量批改'}
        </Button>
        <Button variant="outline" onClick={() => { setRefreshing(true); load(true); setTimeout(() => setRefreshing(false), 400); }} className="cursor-pointer">
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />刷新
        </Button>
      </div>

      {loading ? (
        <div className="animate-pulse h-64 bg-slate-100 rounded-2xl" />
      ) : pendingCount === 0 ? (
        <Card className="border-slate-200/60 shadow-sm">
          <div className="p-10 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="font-semibold text-slate-700">所有主观题已批改完成</p>
            <p className="text-sm text-slate-400">可前往成绩报表页公布成绩</p>
          </div>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          {/* 左栏：题目列表 */}
          <Card className="border-slate-200/60 shadow-sm h-fit lg:sticky lg:top-4">
            <div className="p-4 flex items-center gap-2 border-b border-slate-100">
              <ClipboardList className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-sm text-slate-700">待批题目</span>
            </div>
            <div className="p-3 space-y-1.5 max-h-[70vh] overflow-y-auto">
              {groups.map((g, i) => (
                <button
                  key={g.question_id}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer',
                    i === activeIdx ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-slate-50 hover:bg-violet-50/50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-700 truncate">第 {i + 1} 题</span>
                    <Badge className="bg-white text-violet-600 border border-violet-200">{g.rows.length} 人</Badge>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{g.content}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* 右栏：题干 + 学生作答 */}
          {active && (
            <Card className="border-slate-200/60 shadow-sm">
              <div className="p-5 border-b border-slate-100 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-gradient-to-r from-violet-600 to-teal-600 text-white">{questionTypeLabel(active.question_type)}</Badge>
                  <span className="text-sm font-semibold text-slate-700">第 {activeIdx + 1} 题</span>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={saveAll} disabled={savingAll || active.rows.length === 0} className="cursor-pointer">
                    <Send className="w-4 h-4" />{savingAll ? '保存中…' : '全部保存剩余'}
                  </Button>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{active.content}</p>
                {parseOptions(active.options).length > 0 && (
                  <div className="text-sm text-slate-600 flex flex-wrap gap-2">
                    {parseOptions(active.options).map((o) => (
                      <span key={o.key} className="bg-slate-100 rounded-md px-2 py-0.5 text-xs"><b>{o.key}.</b> {o.text}</span>
                    ))}
                  </div>
                )}
                {active.answer && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2.5"><b>参考答案：</b>{active.answer}</div>
                )}
                {active.analysis && (
                  <div className="text-xs text-slate-500 bg-sky-50 rounded-lg p-2.5 whitespace-pre-wrap"><b>解析：</b>{active.analysis}</div>
                )}
              </div>
              <div className="p-5 space-y-4">
                {active.rows.map((g) => (
                  <div key={g.grading_id} className="border border-slate-100 rounded-xl p-4 space-y-3 bg-gradient-to-br from-white to-slate-50/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-teal-500 text-white text-xs font-bold flex items-center justify-center">
                        {g.student_name[0] || '?'}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{g.student_name}</span>
                      <Badge className="bg-amber-50 text-amber-600 border border-amber-200">待批</Badge>
                      {g.ai_total_score != null && (
                        <Badge className="bg-violet-50 text-violet-600 border border-violet-200">
                          <Sparkles className="w-3 h-3 mr-1" />AI 建议 {g.ai_total_score} 分
                        </Badge>
                      )}
                      <div className="flex-1" />
                      <span className="text-xs text-slate-400">满分 {g.full_score} 分</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg p-3 text-sm text-slate-600">
                      <div className="text-xs text-slate-400 mb-1">学生作答</div>
                      <RichContentView content={g.student_answer} />
                    </div>

                    {g.ai_overall_comment && (
                      <div className="bg-violet-50/70 border border-violet-100 rounded-lg p-3 space-y-1.5">
                        <div className="text-xs font-medium text-violet-600 flex items-center gap-1"><Sparkles className="w-3 h-3" />AI 评语</div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{g.ai_overall_comment}</p>
                        {(g.ai_annotations || []).length > 0 && (
                          <ul className="text-xs text-slate-500 space-y-1 pt-1 border-t border-violet-100/70">
                            {g.ai_annotations!.map((a, idx) => (
                              <li key={idx}>• {a.content}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">分数（0 ~ {g.full_score}）</label>
                        <Input
                          type="number"
                          min={0}
                          max={g.full_score}
                          step={0.5}
                          value={scores[g.grading_id] ?? ''}
                          placeholder={g.ai_total_score != null ? `AI: ${g.ai_total_score}` : `0 ~ ${g.full_score}`}
                          onChange={(e) => setScores((p) => ({ ...p, [g.grading_id]: e.target.value }))}
                          className="w-full"
                        />
                      </div>
                      <div className="flex gap-2 justify-start sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => adoptAI(g)} disabled={g.ai_total_score == null} className="cursor-pointer" title="采用 AI 建议分与评语">
                          <Wand2 className="w-4 h-4" />采纳 AI 分
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={savingId === g.grading_id}
                          onClick={() => saveRow(g)}
                          className="bg-gradient-to-r from-violet-600 to-teal-600 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />{savingId === g.grading_id ? '保存中…' : '保存单条'}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">批改评语（可选）</label>
                      <Textarea
                        value={comments[g.grading_id] ?? ''}
                        placeholder="填写批改评语…"
                        onChange={(e) => setComments((p) => ({ ...p, [g.grading_id]: e.target.value }))}
                        className="min-h-16"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
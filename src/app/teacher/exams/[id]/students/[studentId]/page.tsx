'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { questionTypeLabel } from '@/lib/labels';
import { formatDateTime } from '@/lib/date';
import { BackButton } from '@/components/ui/back-button';
import { Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaperQuestion {
  id: number; question_type: string; content: string; options: unknown; answer: string; analysis: string | null;
  knowledge_point: { name: string } | null;
}
interface PaperAnswer { id: number; student_answer: string | null; is_answered: boolean | null; marked: boolean | null; saved_at: string | null; }
interface PaperGrading { id: number; full_score: number; total_score: number | null; teacher_override_score: number | null; status: string; overall_comment: string | null; error_type: string | null; completed_at: string | null; }
interface PaperDetail { question: PaperQuestion; answer: PaperAnswer | null; grading: PaperGrading | null; }
interface PaperData {
  exam: { id: number; title: string; course_name: string; total_score: number; status: string; grades_published: boolean; has_subjective: boolean };
  student: { id: number; real_name: string; username: string; class_id: number | null; class_name: string; student_level: string | null };
  attempt: { status: string; submitted_via: string | null; submitted_at: string | null } | null;
  details: PaperDetail[];
  summary: { totalScore: number; fullScore: number; gradedCount: number; totalCount: number };
}

const OBJ_TYPES = new Set(['single_choice', 'judgment', 'multiple_choice', 'multi_choice']);

/** 选项归一化：兼容 字符串 / {A:..} / [{label,key,text,isCorrect}] */
function renderOptions(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options
      .map((o, i) => {
        if (typeof o === 'string') return o;
        if (o && typeof o === 'object') {
          const t = (o as { text?: string }).text ?? '';
          const l = (o as { label?: string; key?: string }).label || (o as { key?: string }).key || String.fromCharCode(65 + i);
          return t ? `${l}. ${t}` : l;
        }
        return String(o);
      })
      .filter((s) => s.trim());
  }
  if (options && typeof options === 'object') {
    return Object.entries(options as Record<string, unknown>).map(([k, v]) => `${k}. ${String(v ?? '')}`);
  }
  return [];
}

export default function ExamStudentPaperPage() {
  const { id, studentId } = useParams() as { id: string; studentId: string };
  const router = useRouter();
  const [data, setData] = useState<PaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/students/${studentId}`);
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '加载失败'); router.push(`/teacher/exams/${id}/report`); return; }
      setData(j.data);
      // 预填评分/评语
      const sc: Record<number, string> = {}; const cm: Record<number, string> = {};
      for (const d of j.data.details) {
        if (d.grading) {
          sc[d.grading.id] = String(d.grading.teacher_override_score ?? d.grading.total_score ?? '');
          cm[d.grading.id] = d.grading.overall_comment ?? '';
        }
      }
      setScores(sc); setComments(cm);
    } catch { toast.error('网络异常'); }
    setLoading(false);
  }, [id, studentId, router]);

  useEffect(() => { load(); }, [load]);

  const saveScore = async (g: PaperGrading) => {
    const val = Number(scores[g.id]);
    if (Number.isNaN(val) || val < 0 || val > g.full_score) { toast.error(`分值需在 0 ~ ${g.full_score} 之间`); return; }
    setSaving(g.id);
    try {
      const res = await apiFetch(`/api/teacher/exams/${id}/grading`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ grading_id: g.id, score: val, comment: comments[g.id] ?? '' }] }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '保存失败'); return; }
      toast.success('已保存');
      load();
    } catch { toast.error('网络异常'); }
    setSaving(null);
  };

  const stateLabel = data?.exam.grades_published ? { submitted: '已交卷', auto_submitted: '已交卷', terminated: '已结束' } : {};

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up pb-16">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton to={`/teacher/exams/${id}/report`} />
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">学生整卷</h1>
        <Badge className="bg-gradient-to-r from-violet-600 to-teal-600 text-white">{data?.exam.title || '…'}</Badge>
      </div>

      {loading || !data ? (
        <div className="animate-pulse h-64 bg-slate-100 rounded-2xl" />
      ) : (
        <>
          {/* 学生信息 + 总分卡 */}
          <Card className="border-slate-200/60 shadow-sm">
            <div className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-teal-500 text-white font-bold text-lg flex items-center justify-center">
                {data.student.real_name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-40">
                <p className="font-semibold text-slate-800">{data.student.real_name}<span className="text-xs text-slate-400 ml-1">{data.student.username}</span></p>
                <p className="text-xs text-slate-400">
                  {data.student.class_name || '未知班级'}
                  {data.student.student_level ? ` · ${data.student.student_level}` : ''} · 满分 {data.summary.fullScore} 分
                </p>
                {data.attempt?.submitted_at && (
                  <p className="text-xs text-slate-400">交卷于 {formatDateTime(data.attempt.submitted_at)}（{data.attempt.submitted_via || '手动'}）</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold bg-gradient-to-r from-violet-600 to-teal-600 bg-clip-text text-transparent">{data.summary.totalScore}</p>
                <p className="text-xs text-slate-400">总分 · 已批 {data.summary.gradedCount}/{data.summary.totalCount} 题</p>
              </div>
            </div>
          </Card>

          {/* 题目明细 */}
          <div className="space-y-4">
            {data.details.map((d, i) => {
              const g = d.grading;
              const isObj = OBJ_TYPES.has(d.question.question_type);
              const finalScore = g ? (g.teacher_override_score ?? g.total_score) : null;
              const answeredText = [d.question.question_type, 'single_choice', 'judgment'].includes(d.question.question_type)
                ? (typeof d.answer?.student_answer === 'string' && d.answer.student_answer.trim().length > 2 ? '(已填内容)' : d.answer?.student_answer ?? '')
                : (d.answer?.student_answer ?? '');
              return (
                <Card key={d.question.id} className="border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-sm font-bold text-slate-500">第 {i + 1} 题</span>
                      <Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(d.question.question_type)}</Badge>
                      {d.question.knowledge_point && <Badge className="text-xs bg-slate-50 text-slate-500">{d.question.knowledge_point.name}</Badge>}
                      {d.answer?.marked && <Badge className="text-xs bg-amber-50 text-amber-600">标记</Badge>}
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap mb-3">{d.question.content}</p>

                    {renderOptions(d.question.options).length > 0 && (
                      <div className="space-y-1 mb-3">
                        {renderOptions(d.question.options).map((op, oi) => (
                          <div key={oi} className="text-sm text-slate-600 flex items-center gap-2">
                            <span className="text-slate-300">•</span>{op}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-xs text-slate-400 mb-1">学生作答</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{answeredText || <span className="text-slate-300">未作答</span>}</p>
                      </div>
                      {!isObj && (
                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                          <p className="text-xs text-slate-400 mb-1">参考作答</p>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{d.question.answer || '-'}</p>
                        </div>
                      )}
                    </div>

                    {g && (
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <div className={cn('text-sm font-semibold px-3 py-1 rounded-lg',
                          (finalScore ?? 0) >= g.full_score ? 'bg-teal-50 text-teal-700' : (finalScore ?? 0) >= g.full_score * 0.6 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600')}>
                          {finalScore ?? '-'} / {g.full_score} 分
                        </div>
                        {g.overall_comment && (
                          <span className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1">{g.overall_comment}</span>
                        )}
                        {isObj && <span className="text-xs text-slate-400">客观题：规则自动判分（全对满分、错则 0 分）</span>}
                      </div>
                    )}

                    {!isObj && g && (
                      <div className="mt-3 border-t border-slate-100 pt-3 grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">重新评分（0 ~ {g.full_score}）</label>
                            <Input type="number" value={scores[g.id] ?? ''} placeholder={String(g.full_score ?? '')} onChange={(e) => setScores((p) => ({ ...p, [g.id]: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">评语（可选）</label>
                            <Input value={comments[g.id] ?? ''} placeholder="教师评语…" onChange={(e) => setComments((p) => ({ ...p, [g.id]: e.target.value }))} />
                          </div>
                        </div>
                        <Button size="sm" disabled={saving === g.id} onClick={() => saveScore(g)} className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-md shadow-violet-200 cursor-pointer gap-1">
                          {saving === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}保存
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
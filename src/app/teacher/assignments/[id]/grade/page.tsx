'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { renderRichContent } from '@/lib/rich-text';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Loader2, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-helper';
import { toast } from 'sonner';

interface QuestionDetail {
  question: {
    id: number;
    content: string;
    question_type: string;
    options: string[] | null;
    answer: string;
    default_score: number;
    knowledge_point: { name: string } | null;
  };
  answer: {
    id: number;
    student_answer: string;
    is_submitted: boolean;
  } | null;
  grading: {
    id: number;
    total_score: number;
    full_score: number;
    dimension_scores: Record<string, number>;
    annotations: Array<{ content: string; type: string; comment: string; point_deduction: number }>;
    status: string;
    teacher_override_score: number | null;
    teacher_override_comment: string | null;
  } | null;
}

interface GradingData {
  assignment: { id: number; title: string; total_score: number; course: { name: string } };
  student: { id: number; real_name: string; student_level: string };
  details: QuestionDetail[];
  summary: { totalScore: number; fullScore: number; gradedCount: number; totalCount: number };
}

const levelLabels: Record<string, string> = {
  top: '全优层',
  medium: '勤奋中等层',
  weak: '提升层',
};

const levelColors: Record<string, string> = {
  top: 'bg-yellow-100 text-yellow-800',
  medium: 'bg-amber-100 text-amber-800',
  weak: 'bg-red-100 text-red-800',
};

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

const typeLabels: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  multi_choice: '多选题',
  judgment: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
  essay: '论述题',
  code: '编程题',
  concept_confusion: '概念混淆',
  calculation_error: '计算错误',
  logic_error: '逻辑错误',
  knowledge_missing: '知识缺失',
  careless: '粗心大意',
  empty: '未作答',
};

export default function TeacherGradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [studentId, setStudentId] = useState<string>('');
  const [data, setData] = useState<GradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);

  // Get studentId from query params or localStorage
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = searchParams.get('studentId');
    if (fromQuery) {
      setStudentId(fromQuery);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/students/${studentId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 教师提交覆盖分/评语（成功后刷新）
  const submitOverride = useCallback(async (gradingTaskId: number, payload: Record<string, unknown>, successMsg: string) => {
    try {
      const res = await apiFetch('/api/teacher/assignments/grade/override', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(successMsg);
        fetchData();
      } else {
        toast.error('保存失败：' + (json.error || '未知错误'));
      }
    } catch (e) {
      console.error(e);
      toast.error('保存请求失败');
    }
  }, [fetchData]);

  const handleBatchGrade = async () => {
    setGrading(true);
    try {
      const res = await apiFetch('/api/ai/grade/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: Number(id), student_id: Number(studentId) }),
      });
      const json = await res.json();
      if (json.success) {
        const failedCount = json.data.failed_count ?? 0;
        if (failedCount > 0) {
          toast.success(`批改完成！共批改 ${json.data.graded_count} 题，${failedCount} 题批改失败`);
        } else {
          toast.success(`批改完成！共批改 ${json.data.graded_count} 题`);
        }
        fetchData();
      } else {
        toast.error('批改失败：' + (json.error || '未知错误'));
      }
    } catch (e) {
      console.error(e);
      toast.error('批改请求失败');
    } finally {
      setGrading(false);
    }
  };

  // 退回重做（学习通式闭环）
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [returning, setReturning] = useState(false);
  const handleReturn = async () => {
    if (!returnComment.trim()) {
      toast.error('请填写退回理由，学生需据此改进');
      return;
    }
    setReturning(true);
    try {
      const res = await apiFetch('/api/teacher/assignments/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: Number(id), student_id: Number(studentId), comment: returnComment }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('已退回该学生的作业，学生可修改后重新提交');
        setReturnOpen(false);
        setReturnComment('');
        fetchData();
      } else {
        toast.error('退回失败：' + (json.error || '未知错误'));
      }
    } catch {
      toast.error('退回请求失败');
    } finally {
      setReturning(false);
    }
  };

  // 一键确认全部：以 AI 分为准，批量确认该学生所有「已批但未确认」的题目
  const [confirmAllLoading, setConfirmAllLoading] = useState(false);
  const handleConfirmAll = useCallback(async () => {
    const unconfirmed = (data?.details || []).filter(
      (d) => d.grading?.status === 'completed' && d.grading.teacher_override_score == null
    );
    if (unconfirmed.length === 0) {
      toast.info('当前没有待确认的 AI 评分');
      return;
    }
    setConfirmAllLoading(true);
    let ok = 0;
    try {
      for (const d of unconfirmed) {
        const g = d.grading!;
        const res = await apiFetch('/api/teacher/assignments/grade/override', {
          method: 'POST',
          body: JSON.stringify({ grading_task_id: g.id, override_score: g.total_score }),
        });
        const json = await res.json();
        if (json.success) ok += 1;
      }
      toast.success(`已批量确认 ${ok}/${unconfirmed.length} 题为 AI 评分`);
    } catch (e) {
      console.error(e);
      toast.error('部分确认失败，请重试');
    } finally {
      setConfirmAllLoading(false);
      fetchData();
    }
  }, [data, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <p>无法加载批改详情</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />返回
        </Button>
      </div>
    );
  }

  const { assignment, student, details, summary } = data;
  const allGraded = summary.gradedCount === summary.totalCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Student Info + Score Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">学生信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{student.real_name}</span>
              <Badge className={levelColors[student.student_level] || 'bg-gray-100'}>
                {levelLabels[student.student_level] || student.student_level}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">得分情况</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${summary.totalScore >= summary.fullScore * 0.6 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fmt(summary.totalScore)}
              </span>
              <span className="text-lg text-muted-foreground">/ {fmt(summary.fullScore)}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({summary.fullScore > 0 ? Math.round((summary.totalScore / summary.fullScore) * 100) : 0}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">批改状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm">
                已批 {summary.gradedCount}/{summary.totalCount} 题
              </span>
              {allGraded ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <Button size="sm" onClick={handleBatchGrade} disabled={grading} className="gap-1">
                  {grading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  一键批改
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 确认状态提示：AI 批改后需教师确认分数 */}
      {(() => {
        const graded = details.filter((d) => d.grading?.status === 'completed');
        const confirmed = graded.filter((d) => d.grading?.teacher_override_score != null).length;
        if (graded.length === 0) return null;
        const allConfirmed = confirmed === graded.length;
        return (
          <div className={`flex flex-wrap items-center gap-3 p-3 rounded-lg text-sm border ${allConfirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {allConfirmed
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <Clock className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>
                {allConfirmed
                  ? `已全部确认（${confirmed}/${graded.length} 题）——学生端成绩以你的确认分为准`
                  : `AI 已批改 ${graded.length} 题，其中 ${confirmed} 题经你确认、${graded.length - confirmed} 题暂按 AI 评分生效——逐题修改分数即视为确认`}
              </span>
            </div>
            {!allConfirmed && (
              <Button
                size="sm"
                variant={allConfirmed ? 'ghost' : 'outline'}
                className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={handleConfirmAll}
                disabled={confirmAllLoading}
              >
                {confirmAllLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                一键确认全部
              </Button>
            )}
          </div>
        );
      })()}

      {/* 退回重做（学习通式闭环） */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          {!returnOpen ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">学生作业需要修改？</p>
                <p className="text-xs text-amber-600 mt-0.5">退回后学生将收到通知，可修改并重新提交，重新提交后可再次批改</p>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0" onClick={() => setReturnOpen(true)}>
                退回重做
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder="请填写退回理由（必填，将通知给学生）"
                className="w-full text-sm border border-amber-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-amber-200 min-h-[60px]"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setReturnOpen(false)}>取消</Button>
                <Button size="sm" disabled={returning} className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleReturn}>
                  {returning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} 确认退回
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Question Details */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">逐题详情</h2>
        {details.map((detail, idx) => {
          const q = detail.question;
          const a = detail.answer;
          const g = detail.grading;
          const isCorrect = g && g.total_score >= g.full_score * 0.6;
          const isGraded = g && g.status === 'completed';

          return (
            <Card key={q.id} className={isGraded ? (isCorrect ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-red-400') : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">
                        第{idx + 1}题 · {typeLabels[q.question_type] || '其他题型'}
                      </span>
                      <span className="text-sm text-muted-foreground">({q.default_score}分)</span>
                      {q.knowledge_point && (
                        <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>
                      )}
                    </div>
                    <p className="text-base font-medium text-slate-800 mt-2">{q.content}</p>
                    {q.options && (
                      <div className="mt-2 space-y-1">
                        {(Array.isArray(q.options) ? q.options : Object.entries(q.options as Record<string, string>)).map((opt: string | [string, string], i: number) => (
                          <p key={i} className="text-sm text-slate-600">
                            {Array.isArray(opt) ? `${opt[0]}. ${opt[1]}` : opt}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {isGraded && (
                    <div className="ml-4 text-right">
                      {isCorrect ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500 inline" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 inline" />
                      )}
                      <p className={`text-lg font-bold mt-1 ${isCorrect ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmt(g.total_score)}/{fmt(g.full_score)}
                      </p>
                    </div>
                  )}
                  {!isGraded && (
                    <AlertTriangle className="w-5 h-5 text-amber-400 ml-4" />
                  )}
                </div>

                {/* Answer comparison：对错着色（学生答案对绿错红，参考答案绿） */}
                <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-slate-50 rounded-lg">
                  <div className={`rounded-lg p-2 border ${!a?.student_answer ? 'border-red-200 bg-red-50' : isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
                    <p className="text-xs text-muted-foreground mb-1">学生作答</p>
                    {a?.student_answer && /<(img|table|p|div|pre|ul|ol|h\d|br)[\s>]|<span[^>]*white-space:\s*pre[^>]*>/i.test(a.student_answer) ? (
                      <div className="text-sm font-medium rich-view" dangerouslySetInnerHTML={{ __html: renderRichContent(a.student_answer) }} />
                    ) : (
                      <p className={`text-sm font-medium ${!a?.student_answer ? 'text-red-400 italic' : isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                        {a?.student_answer || '（未作答）'}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg p-2 border border-emerald-300 bg-emerald-50">
                    <p className="text-xs text-muted-foreground mb-1">参考答案（正确）</p>
                    <p className="text-sm font-semibold text-emerald-700">{q.answer || '—'}</p>
                  </div>
                </div>

                {/* Grading annotations */}
                {isGraded && g.annotations && (g.annotations as Array<Record<string, unknown>>).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-red-600 mb-1">AI批改详情（扣分项）：</p>
                    {(g.annotations as Array<Record<string, unknown>>).map((ann: Record<string, unknown>, i: number) => (
                      <div key={i} className="p-2 bg-red-50 border border-red-100 rounded text-sm">
                        <span className="font-medium text-red-700">{ann.content as string}</span>
                        <span className="text-red-600 ml-2">扣{fmt(ann.point_deduction as number)}分</span>
                        {ann.comment ? <p className="text-red-500 text-xs mt-1">{String(ann.comment)}</p> : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* 教师确认：改分提交后以教师分为准；留空则按 AI 分生效 */}
                {isGraded && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">AI评分：</span>
                      <span className={`font-bold ${g.teacher_override_score != null ? 'text-slate-400 line-through' : 'text-amber-700'}`}>{fmt(g.total_score)}/{fmt(g.full_score)}</span>
                      {g.teacher_override_score != null && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <Badge className="text-xs bg-emerald-50 text-emerald-700 border-0">已确认</Badge>
                          <span className="font-bold text-emerald-700">{fmt(g.teacher_override_score)}/{fmt(g.full_score)}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">教师确认分：</span>
                      <input
                        type="number"
                        className="w-16 px-2 py-1 border rounded text-sm font-bold"
                        defaultValue={g.teacher_override_score ?? ''}
                        placeholder={String(fmt(g.total_score))}
                        min={0}
                        max={g.full_score}
                        step="any"
                        onBlur={e => {
                          const val = Number(e.target.value);
                          // 空值/非法值不发请求（留空按 AI 评分生效）
                          if (e.target.value.trim() === '' || !Number.isFinite(val)) return;
                          if (val < 0 || val > g.full_score) {
                            toast.error(`分值需在 0 ~ ${fmt(g.full_score)} 之间`);
                            fetchData();
                            return;
                          }
                          submitOverride(
                            g.id,
                            { grading_task_id: g.id, override_score: val },
                            `已确认第 ${idx + 1} 题分数为 ${fmt(val)} 分`
                          );
                        }}
                      />
                      <span className="text-muted-foreground">/ {fmt(g.full_score)}</span>
                    </div>
                    <p className="text-[11px] text-amber-600 mt-1.5">填入分数并失焦即提交确认——学生端成绩将以你的分数为准；留空则按 AI 评分生效。</p>
                    <textarea
                      className="w-full mt-2 px-2 py-1 border rounded text-sm"
                      rows={2}
                      placeholder="教师评语（可选）"
                      defaultValue={g.teacher_override_comment || ''}
                      onBlur={e => {
                        if (!e.target.value.trim()) return;
                        submitOverride(
                          g.id,
                          { grading_task_id: g.id, override_comment: e.target.value },
                          '评语已保存'
                        );
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

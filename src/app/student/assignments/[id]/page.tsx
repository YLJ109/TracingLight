'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helper';
import RichAnswer from '@/components/rich-answer';
import { sanitizeRichHTML, renderRichContent, htmlToPlainText } from '@/lib/rich-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Clock, CheckCircle2, AlertCircle, BookOpen,
  Sparkles, Send, Eye, Loader2, FileText, Trophy, XCircle, Save,
  BookMarked, ChevronRight
} from 'lucide-react';

interface QuestionDetail {
  id: number;
  content: string;
  question_type: string;
  difficulty: string;
  answer: string;
  default_score: number;
  analysis: string;
  options: string[] | null;
  min_chars?: number | null;
  max_chars?: number | null;
  min_select?: number | null;
  max_select?: number | null;
  knowledge_point: { name: string } | null;
}

interface AnswerDetail {
  question_id: number;
  student_answer: string;
  is_submitted: boolean;
  grading: {
    total_score: number;
    full_score: number;
    status: string;
    dimension_scores: { knowledge_accuracy: number; logic_completeness: number; expression_clarity: number; expansion: number };
    ai_score?: number | null;
    annotations: Array<{ content: string; type: string; comment: string; point_deduction: number }>;
  } | null;
}

interface AssignmentDetail {
  id: number;
  title: string;
  description: string;
  total_score: number;
  start_time: string;
  end_time: string;
  status: string;
  course: { name: string };
  questions: QuestionDetail[];
  answers: AnswerDetail[];
  my_score: number | null;
  grades_published: boolean;
  is_submitted: boolean;
  returned?: boolean;
  return_comment?: string | null;
}

// 富文本作答范围：客观题（含填空）之外的全部题型（简答/编程/论述等）
const OBJECTIVE_TYPES = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment', 'fill_blank'];
const isRichType = (t: string) => !OBJECTIVE_TYPES.includes(t);

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

const typeLabels: Record<string, string> = {
  single_choice: '单选题', multiple_choice: '多选题', multi_choice: '多选题',
  judgment: '判断题', 选择题: '单选题', 多选题: '多选题', 判断题: '判断题',
  fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
  填空题: '填空题', 简答题: '简答题', 论述题: '论述题',
  code: '编程题', concept_confusion: '概念混淆', calculation_error: '计算错误',
  logic_error: '逻辑错误', knowledge_missing: '知识缺失', careless: '粗心大意', empty: '未作答',
};

const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export default function StudentAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('questions');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const searchParams = useSearchParams();
  const redoRequested = searchParams.get('redo') === 'true';
  // 学习通式门控：仅教师退回（returned=true）的作业才允许进入重做模式
  const redoMode = redoRequested && detail?.returned === true;
  const draftKey = `tracinglight_draft_${assignmentId}`;

  // ── Load assignment data + restore draft from localStorage ──
  useEffect(() => {
    getCurrentUser().then((user) => {
      const studentId = String(user?.id || 3);
      apiFetch(`/api/student/assignments/${assignmentId}?student_id=${studentId}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setDetail(data.data);
            setSubmitted(data.data.is_submitted);
            const existing: Record<number, string> = {};

            // First, restore from server answers
            data.data.answers?.forEach((a: AnswerDetail) => {
              if (a.student_answer) existing[a.question_id] = a.student_answer;
            });

            // Then, overlay localStorage draft if available (draft takes priority for unsaved answers)
            try {
              const draft = localStorage.getItem(draftKey);
              if (draft) {
                const draftData = JSON.parse(draft) as Record<string, string>;
                // Only overlay if server doesn't have submitted answer
                for (const [qId, val] of Object.entries(draftData)) {
                  const numId = Number(qId);
                  if (!data.data.is_submitted || redoMode) {
                    existing[numId] = val;
                  }
                }
              }
            } catch { /* ignore corrupt draft */ }

            setAnswers(existing);
            setDraftRestored(true);
          }
        })
        .finally(() => setLoading(false));
    });
  }, [assignmentId]);

  // ── Auto-save draft to localStorage (debounced 2s) ──
  useEffect(() => {
    if (!draftRestored) return;
    // 重做模式或已提交但尚未批改（继续修改）时允许自动保存；已批改锁定的作业不自动保存
    const fullyGraded = detail && detail.questions.length > 0 && detail.questions.every((q) =>
      detail.answers?.find(a => a.question_id === q.id)?.grading?.status === 'completed');
    if (submitted && !redoMode && fullyGraded) return;
    const timer = setTimeout(() => {
      const nonEmpty: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (v && v.trim()) nonEmpty[k] = v;
      }
      if (Object.keys(nonEmpty).length > 0) {
        localStorage.setItem(draftKey, JSON.stringify(nonEmpty));
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [answers, draftRestored, submitted, redoMode, detail, draftKey]);

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    const user = await getCurrentUser();
    const studentId = String(user?.id || 3);
    try {
      const res = await apiFetch('/api/student/assignments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: detail.id,
          student_id: parseInt(studentId),
          answers: detail.questions.map(q => ({
            question_id: q.id,
            student_answer: isRichType(q.question_type) ? sanitizeRichHTML(answers[q.id] || '') : (answers[q.id] || ''),
          })),
          save_only: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!detail) return;
    // 前端先校验字数上限/下限与多选数量限制，命中则阻止提交并提示
    for (const q of detail.questions) {
      if (isRichType(q.question_type)) {
        const len = htmlToPlainText(answers[q.id] || '').length;
        if (q.max_chars != null && len > q.max_chars) {
          alert(`第 ${q.id} 题作答超过字数上限（最多 ${q.max_chars} 字，当前 ${len} 字），请删减后再提交`);
          setSubmitting(false);
          return;
        }
        if (q.min_chars != null && len > 0 && len < q.min_chars) {
          alert(`第 ${q.id} 题作答不足最低字数（至少 ${q.min_chars} 字，当前 ${len} 字）`);
          setSubmitting(false);
          return;
        }
      }
      if (q.question_type === 'multi_choice' || q.question_type === 'multiple_choice') {
        const picked = (answers[q.id] || '').split(',').filter(Boolean).length;
        if (q.max_select != null && picked > q.max_select) {
          alert(`第 ${q.id} 题选择项过多（最多 ${q.max_select} 项，当前 ${picked} 项）`);
          setSubmitting(false);
          return;
        }
        if (q.min_select != null && picked < q.min_select) {
          alert(`第 ${q.id} 题选择项不足（至少 ${q.min_select} 项，当前 ${picked} 项）`);
          setSubmitting(false);
          return;
        }
      }
    }
    setSubmitting(true);
    const user = await getCurrentUser();
    const studentId = String(user?.id || 3);
    try {
      const res = await apiFetch('/api/student/assignments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: detail.id,
          student_id: parseInt(studentId),
          answers: detail.questions.map(q => ({
            question_id: q.id,
            student_answer: isRichType(q.question_type) ? sanitizeRichHTML(answers[q.id] || '') : (answers[q.id] || ''),
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setActiveTab('result');
        // Clear draft on successful submit
        localStorage.removeItem(draftKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-slate-400" />
        <p className="text-slate-500">作业不存在</p>
        <Button variant="outline" onClick={() => router.back()}>返回</Button>
      </div>
    );
  }

  const getAnswerForQuestion = (qId: number) => {
    return detail.answers?.find(a => a.question_id === qId);
  };

  // 整份作业是否已全部批改完成 → 锁定编辑；重做模式始终可编辑
  const isFullyGraded = detail.questions.length > 0 && detail.questions.every((q) => getAnswerForQuestion(q.id)?.grading?.status === 'completed');
  const locked = submitted && isFullyGraded && !redoMode;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="page-title">{detail.title}{redoMode && <span className="ml-3 text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">重做模式</span>}</h1>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="secondary" className="gap-1">
                <BookOpen className="w-3 h-3" /> {detail.course?.name}
              </Badge>
              <span className="text-sm text-slate-500">
                <Clock className="w-3 h-3 inline mr-1" />
                {detail.start_time} ~ {detail.end_time}
              </span>
            </div>
          </div>
        </div>
        {detail.my_score !== null && (
          <div className="text-center">
            <div className={`text-4xl font-bold ${detail.my_score >= detail.total_score * 0.6 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(detail.my_score)}
            </div>
            <div className="text-sm text-slate-500">/ {fmt(detail.total_score)} 分</div>
          </div>
        )}
        {/* 已提交但成绩未发布：提示学生等待老师发布 */}
        {detail.is_submitted && detail.grades_published === false && (
          <div className="text-center">
            <div className="text-lg font-semibold text-amber-600 flex items-center gap-2">
              <Clock className="w-5 h-5" /> 成绩待发布
            </div>
            <div className="text-xs text-slate-500 mt-1">老师发布成绩后即可查看批改结果</div>
          </div>
        )}
      </div>

      {/* P1-3：失分作业 → 引导去错题本复习（闭环衔接） */}
      {detail.my_score !== null && detail.my_score < detail.total_score && !redoMode && (
        <button
          onClick={() => router.push('/student/errors')}
          className="w-full flex items-center justify-between rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-left transition-colors hover:border-amber-300"
        >
          <span className="flex items-center gap-2 text-sm text-amber-800">
            <BookMarked className="w-4 h-4" />
            本次失分题目已归档至错题本，去看看 AI 解析与举一反三吧
          </span>
          <ChevronRight className="w-4 h-4 text-amber-600" />
        </button>
      )}

      {/* 退回提示横幅：仅被退回的作业显示（学习通式闭环） */}
      {detail.returned && !redoMode && (
        <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> 老师退回了这份作业，请修改后重新提交
              </p>
              {detail.return_comment && (
                <p className="text-xs text-red-600 mt-1">退回理由：{detail.return_comment}</p>
              )}
            </div>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white shrink-0" onClick={() => window.location.href = `/student/assignments/${assignmentId}?redo=true`}>
              重做作业
            </Button>
          </div>
        </div>
      )}

      {/* Description */}
      {detail.description && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardContent className="p-4">
            <p className="text-sm text-slate-600">{detail.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="questions" className="gap-2">
            <FileText className="w-4 h-4" /> 题目
          </TabsTrigger>
          <TabsTrigger value="result" className="gap-2" disabled={!submitted && detail.my_score === null}>
            <Trophy className="w-4 h-4" /> 批改结果
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2" disabled={!submitted && detail.my_score === null}>
            <Sparkles className="w-4 h-4" /> 解析
          </TabsTrigger>
        </TabsList>

        {/* Questions */}
        <TabsContent value="questions" className="mt-4 space-y-4">
          {detail.questions.map((q, idx) => {
            const existingAnswer = getAnswerForQuestion(q.id);
            const isGraded = !redoMode && existingAnswer?.grading?.status === 'completed';
            return (
              <Card key={q.id} className={`border-0 shadow-sm ${isGraded ? 'ring-1 ring-green-200' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                      isGraded
                        ? existingAnswer!.grading!.total_score === existingAnswer!.grading!.full_score
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                        : 'bg-indigo-100 text-indigo-600'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || '其他题型'}</Badge>
                        <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">
                          {q.difficulty === 'easy' ? '简单' : q.difficulty === 'medium' ? '中等' : '困难'}
                        </Badge>
                        <span className="text-xs text-slate-400">{q.default_score}分</span>
                        {q.knowledge_point && (
                          <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{q.content}</p>

                      {/* Judgment (true/false) questions - render BEFORE options check */}
                      {q.question_type === 'judgment' ? (
                        <div className="flex gap-4 mb-3">
                          {['正确', '错误'].map(val => {
                            const isSelected = answers[q.id] === val;
                            const correctAnswer = (q as any).answer || q.answer;
                            const isCorrectOpt = correctAnswer === val;
                            let border = 'border-slate-200 hover:border-slate-300';
                            let bg = '';
                            let icon = null;
                            if (isGraded) {
                              if (isSelected && isCorrectOpt) {
                                border = 'border-green-400'; bg = 'bg-green-50';
                                icon = <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />;
                              } else if (isSelected && !isCorrectOpt) {
                                border = 'border-red-400'; bg = 'bg-red-50';
                                icon = <XCircle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />;
                              } else if (isCorrectOpt) {
                                border = 'border-green-300 border-dashed';
                              }
                            } else if (isSelected) {
                              border = 'border-indigo-500'; bg = 'bg-indigo-50';
                            }
                            return (
                              <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${border} ${bg} ${isGraded ? 'pointer-events-none' : ''}`}>
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  value={val}
                                  checked={isSelected}
                                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                  disabled={isGraded}
                                  className="text-indigo-600"
                                />
                                <span className="text-sm">{val}</span>
                                {icon}
                              </label>
                            );
                          })}
                        </div>
                      ) : /* Options for single/multi choice (non-judgment questions with options) */
                      (() => { const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; return opts && opts.length > 0; })() ? (
                        (() => {
                          const isMulti = q.question_type === 'multi_choice' || q.question_type === 'multiple_choice';
                          const selectedLetters = isMulti
                            ? (answers[q.id] || '').split(',').filter(Boolean)
                            : [answers[q.id] || ''];
                          const correctAnswer = (q as any).answer || q.answer;
                          const correctLetters = isMulti && correctAnswer
                            ? correctAnswer.split(',').map((s: string) => s.trim())
                            : [correctAnswer];

                          if (isMulti) {
                            // Checkbox for multiple choice
                            return (
                              <div className="mb-3">
                                {(q.max_select != null || q.min_select != null) && (
                                  <p className="text-xs text-slate-400 mb-1.5">
                                    {q.max_select != null ? `最多选择 ${q.max_select} 项` : ''}{q.max_select != null && q.min_select != null ? ' · ' : ''}{q.min_select != null ? `至少选择 ${q.min_select} 项` : ''}
                                  </p>
                                )}
                              <div className="grid grid-cols-2 gap-2">
                                {(typeof q.options === 'string' ? JSON.parse(q.options) : q.options)!.map((opt: string, oi: number) => {
                                  const optLetter = opt.charAt(0);
                                  const isSelected = selectedLetters.includes(optLetter);
                                  const isCorrectOpt = correctLetters.includes(optLetter);
                                  let border = 'border-slate-200 hover:border-slate-300';
                                  let bg = '';
                                  let icon = null;
                                  if (isGraded) {
                                    if (isSelected && isCorrectOpt) {
                                      border = 'border-green-400'; bg = 'bg-green-50';
                                      icon = <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />;
                                    } else if (isSelected && !isCorrectOpt) {
                                      border = 'border-red-400'; bg = 'bg-red-50';
                                      icon = <XCircle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />;
                                    } else if (isCorrectOpt) {
                                      border = 'border-green-300 border-dashed';
                                    }
                                  } else if (isSelected) {
                                    border = 'border-indigo-500'; bg = 'bg-indigo-50';
                                  }
                                  return (
                                    <label key={oi} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${border} ${bg} ${isGraded ? 'pointer-events-none' : ''}`}>
                                      <input
                                        type="checkbox"
                                        value={optLetter}
                                        checked={isSelected}
                                        disabled={isGraded || (!isSelected && q.max_select != null && selectedLetters.length >= q.max_select)}
                                        onChange={e => {
                                          if (isGraded) return;
                                          setAnswers(prev => {
                                            const cur = (prev[q.id] || '').split(',').filter(Boolean);
                                            if (e.target.checked) {
                                              if (q.max_select != null && cur.length >= q.max_select) return prev;
                                              cur.push(optLetter);
                                            } else {
                                              const idx = cur.indexOf(optLetter);
                                              if (idx >= 0) cur.splice(idx, 1);
                                            }
                                            return { ...prev, [q.id]: cur.join(',') };
                                          });
                                        }}
                                        className="text-indigo-600 rounded"
                                      />
                                      <span className="text-sm">{opt}</span>
                                      {icon}
                                    </label>
                                  );
                                })}
                              </div>
                              </div>
                            );
                          } else {
                            // Radio for single choice
                            return (
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {(typeof q.options === 'string' ? JSON.parse(q.options) : q.options)!.map((opt: string, oi: number) => {
                                  const optLetter = opt.charAt(0);
                                  const isSelected = answers[q.id] === optLetter;
                                  const isCorrectOpt = correctAnswer && correctAnswer === optLetter;
                                  let border = 'border-slate-200 hover:border-slate-300';
                                  let bg = '';
                                  let icon = null;
                                  if (isGraded) {
                                    if (isSelected && isCorrectOpt) {
                                      border = 'border-green-400'; bg = 'bg-green-50';
                                      icon = <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />;
                                    } else if (isSelected && !isCorrectOpt) {
                                      border = 'border-red-400'; bg = 'bg-red-50';
                                      icon = <XCircle className="w-4 h-4 text-red-500 ml-auto flex-shrink-0" />;
                                    } else if (isCorrectOpt) {
                                      border = 'border-green-300 border-dashed';
                                    }
                                  } else if (isSelected) {
                                    border = 'border-indigo-500'; bg = 'bg-indigo-50';
                                  }
                                  return (
                                    <label key={oi} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${border} ${bg} ${isGraded ? 'pointer-events-none' : ''}`}>
                                      <input
                                        type="radio"
                                        name={`q-${q.id}`}
                                        value={optLetter}
                                        checked={isSelected}
                                        onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        disabled={isGraded}
                                        className="text-indigo-600"
                                      />
                                      <span className="text-sm">{opt}</span>
                                      {icon}
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          }
                        })()
                      ) : (
                        <>
                        {/* Open-ended：简答/论述/编程 → 富文本作答（表格/图片/公式/代码） */}
                        {isRichType(q.question_type) ? (
                        isGraded ? (
                          <div className="mb-3 space-y-1.5">
                            <div className={`rounded-lg border p-3 text-sm ${existingAnswer!.grading && existingAnswer!.grading.total_score >= existingAnswer!.grading.full_score ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                              <p className={`text-xs font-medium mb-1 ${existingAnswer!.grading && existingAnswer!.grading.total_score >= existingAnswer!.grading.full_score ? 'text-green-600' : 'text-red-500'}`}>
                                {existingAnswer!.grading && existingAnswer!.grading.total_score >= existingAnswer!.grading.full_score ? '✓ 你的作答（正确）' : '✗ 你的作答'}
                              </p>
                              <div className="rich-view" dangerouslySetInnerHTML={{ __html: renderRichContent(existingAnswer!.student_answer || '') }} />
                            </div>
                            {(q as any).answer && (
                              <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
                                <p className="text-xs font-medium mb-1">✓ 参考答案</p>
                                {(q as any).answer}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <RichAnswer
                              value={answers[q.id] || ''}
                              onChange={(html) => setAnswers(prev => ({ ...prev, [q.id]: html }))}
                              placeholder="在此作答：支持加粗、代码块、公式（$..$）、表格与图片上传"
                            />
                            {(q.min_chars != null || q.max_chars != null) && (
                              (() => {
                                const len = htmlToPlainText(answers[q.id] || '').length;
                                const over = q.max_chars != null && len > q.max_chars;
                                return (
                                  <p className={`mt-1 text-xs ${over ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                                    字数：<span className={over ? 'font-semibold' : ''}>{len}</span>
                                    {q.max_chars != null && <> / {q.max_chars}</>}
                                    <span className="ml-1">
                                      {q.min_chars != null ? `最少 ${q.min_chars} 字` : ''}{q.max_chars != null ? ` 最多 ${q.max_chars} 字` : ''}
                                    </span>
                                    {over && ' · 已超上限，无法提交'}
                                  </p>
                                );
                              })()
                            )}
                          </>
                        )
                      ) : isGraded ? (
                        <div className="mb-3 space-y-1.5">
                          <div className={`p-2 rounded-lg border text-sm ${existingAnswer!.grading && existingAnswer!.grading.total_score >= existingAnswer!.grading.full_score ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-600'}`}>
                            <span className="text-xs opacity-70 mr-1">你的答案：</span>
                            <span className="whitespace-pre-wrap break-words font-mono text-xs">
                              {existingAnswer!.student_answer ? htmlToPlainText(existingAnswer!.student_answer) : '未作答'}
                            </span>
                          </div>
                          {(q as any).answer && existingAnswer!.grading!.total_score < existingAnswer!.grading!.full_score && (
                            <div className="p-2 rounded-lg border border-green-300 bg-green-50 text-sm text-green-700">
                              <span className="text-xs opacity-70 mr-1">正确答案：</span>
                              <span className="whitespace-pre-wrap break-words font-mono text-xs">{(q as any).answer}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          placeholder="请输入你的答案..."
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          disabled={isGraded}
                          className="mb-3"
                        />
                      )}
                        </>
                      )}

                      {/* Grading result */}
                      {isGraded && existingAnswer!.grading && (
                        <div className={`p-3 rounded-lg ${
                          existingAnswer!.grading.total_score === existingAnswer!.grading.full_score
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {existingAnswer!.grading.total_score === existingAnswer!.grading.full_score ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-sm font-medium">
                                得分：{fmt(existingAnswer!.grading.total_score)}/{fmt(existingAnswer!.grading.full_score)}
                              </span>
                              {existingAnswer!.grading.ai_score != null && existingAnswer!.grading.ai_score !== existingAnswer!.grading.total_score && (
                                <span className="text-xs text-slate-400">（AI 原评 {fmt(existingAnswer!.grading.ai_score)} 分 · 老师已确认）</span>
                              )}
                            </div>
                            {existingAnswer!.grading.dimension_scores && (
                              <div className="flex gap-2 text-xs text-slate-500">
                                <span>知识:{existingAnswer!.grading.dimension_scores.knowledge_accuracy}</span>
                                <span>逻辑:{existingAnswer!.grading.dimension_scores.logic_completeness}</span>
                                <span>表达:{existingAnswer!.grading.dimension_scores.expression_clarity}</span>
                                <span>拓展:{existingAnswer!.grading.dimension_scores.expansion}</span>
                              </div>
                            )}
                          </div>
                          {/* Show correct answer when wrong */}
                          {existingAnswer!.grading.total_score < existingAnswer!.grading.full_score && (q as any).answer && (
                            <div className="mt-2 p-2 bg-white rounded border border-green-200">
                              <p className="text-xs text-green-600 font-medium mb-1">✓ 正确答案：</p>
                              <p className="text-sm text-green-700">{(q as any).answer}</p>
                            </div>
                          )}
                          {existingAnswer!.grading.annotations?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-medium text-red-600 mb-1">AI批改点评：</p>
                              {existingAnswer!.grading.annotations.map((ann, ai) => (
                                <p key={ai} className="text-xs text-red-600">• {ann.comment}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {!locked && (
            <div className="flex justify-end gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || submitting}
                variant="outline"
                className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? '保存中...' : saved ? '已保存 ✓' : '保存作业'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={submitting || saving}
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? '提交中...' : '提交作业'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认提交作业？</AlertDialogTitle>
                    <AlertDialogDescription>
                      提交后作业将被锁定评阅，在截止时间前通常无法再修改。请确认所有题目均已作答完成。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmit}>确认提交</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </TabsContent>

        {/* Result Summary */}
        <TabsContent value="result" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" /> 批改结果
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <div className={`text-6xl font-bold mb-2 ${(detail.my_score || 0) >= detail.total_score * 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt(detail.my_score || 0)}<span className="text-2xl text-slate-400">/{fmt(detail.total_score)}</span>
                </div>
                <p className="text-slate-500">
                  {(detail.my_score || 0) >= detail.total_score * 0.9 ? '非常优秀！继续保持！' :
                   (detail.my_score || 0) >= detail.total_score * 0.6 ? '表现不错，还有提升空间' :
                   '需要加油，建议重点复习错题'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {detail.questions.map((q, idx) => {
                  const ans = getAnswerForQuestion(q.id);
                  const score = ans?.grading?.total_score;
                  const full = ans?.grading?.full_score || q.default_score;
                  const isCorrect = score === full;
                  return (
                    <div key={q.id} className={`flex items-center gap-3 p-3 rounded-lg ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                      <span className="text-sm font-bold text-slate-500">#{idx + 1}</span>
                      <span className="text-sm flex-1 truncate">{q.content}</span>
                      <Badge className={isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                        {fmt(score ?? 0)}/{fmt(full)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis */}
        <TabsContent value="analysis" className="mt-4 space-y-3">
          {detail.questions.map((q, idx) => {
            const ans = getAnswerForQuestion(q.id);
            return (
              <Card key={q.id} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-bold text-slate-400 mt-0.5">#{idx + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700 mb-2">{q.content}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className={`p-2 rounded-lg ${ans?.grading ? (ans.grading.total_score === ans.grading.full_score ? 'bg-green-50' : 'bg-red-50') : 'bg-slate-50'}`}>
                          <span className="text-slate-500">你的答案：</span>
                          <span className={
                            ans?.grading
                              ? (ans.grading.total_score === ans.grading.full_score ? 'text-green-600 font-medium' : 'text-red-500 font-medium')
                              : 'text-slate-400'
                          }>
                            <span className="whitespace-pre-wrap break-words font-mono text-xs block mt-1">
                              {ans?.student_answer ? htmlToPlainText(ans.student_answer) : '未作答'}
                            </span>
                          </span>
                        </div>
                        <div className="p-2 bg-green-50 rounded-lg">
                          <span className="text-slate-500">正确答案：</span>
                          <span className="text-green-600 font-semibold font-mono">
                            <span className="whitespace-pre-wrap break-words font-mono text-xs block mt-1">{q.answer || '—'}</span>
                          </span>
                        </div>
                      </div>
                      {q.analysis && (
                        <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                          <p className="text-xs text-indigo-700 font-medium mb-1">题目解析</p>
                          <p className="text-sm text-indigo-800">{q.analysis}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

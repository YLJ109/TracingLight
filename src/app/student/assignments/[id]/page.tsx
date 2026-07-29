'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Clock, CheckCircle2, AlertCircle, BookOpen,
  Sparkles, Send, Eye, Loader2, FileText, Trophy, XCircle, Save
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
  knowledge_point: { name: string } | null;
}

interface AnswerDetail {
  question_id: number;
  student_answer: string;
  is_submitted: boolean;
  grading: {
    total_score: number;
    full_score: number;
    dimension_scores: { knowledge_accuracy: number; logic_completeness: number; expression_clarity: number; expansion: number };
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
  is_submitted: boolean;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

const typeLabels: Record<string, string> = {
  single_choice: '单选题', multiple_choice: '多选题', judgment: '判断题',
  fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
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
  const searchParams = useSearchParams();
  const redoMode = searchParams.get('redo') === 'true';

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
            data.data.answers?.forEach((a: AnswerDetail) => {
              if (a.student_answer) existing[a.question_id] = a.student_answer;
            });
            setAnswers(existing);
          }
        })
        .finally(() => setLoading(false));
    });
  }, [assignmentId]);

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
            student_answer: answers[q.id] || '',
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
            student_answer: answers[q.id] || '',
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setActiveTab('result');
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{detail.title}{redoMode && <span className="ml-3 text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">重做模式</span>}</h1>
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
      </div>

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
            const isGraded = !redoMode && (existingAnswer?.grading !== null && existingAnswer?.grading !== undefined);
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
                        <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
                        <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">
                          {q.difficulty === 'easy' ? '简单' : q.difficulty === 'medium' ? '中等' : '困难'}
                        </Badge>
                        <span className="text-xs text-slate-400">{q.default_score}分</span>
                        {q.knowledge_point && (
                          <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{q.content}</p>

                      {/* Options for single/multi choice */}
                      {(function() {
                        const opts = q.options;
                        if (!opts) return null;
                        const optEntries: [string, string][] = Array.isArray(opts)
                          ? opts.map((o: string) => [o.charAt(0), o] as [string, string])
                          : Object.entries(opts as Record<string, string>);
                        if (optEntries.length === 0) return null;
                        return (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {optEntries.map(([key, val]) => (
                            <label key={key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                              answers[q.id] === key
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-slate-200 hover:border-slate-300'
                            } ${isGraded ? 'pointer-events-none' : ''}`}>
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                value={key}
                                checked={answers[q.id] === key}
                                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                disabled={isGraded}
                                className="text-indigo-600"
                              />
                              <span className="text-sm">{key}. {val}</span>
                            </label>
                          ))}
                        </div>
                        );})()}

                      {/* Text input for non-choice questions */}
                      {(!q.options || (Array.isArray(q.options) ? q.options.length === 0 : Object.keys(q.options).length === 0)) && (
                        <div>
                          {q.question_type === 'judgment' ? (
                            <div className="flex gap-4 mb-3">
                              {['正确', '错误'].map(val => (
                                <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                                  answers[q.id] === val
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-200 hover:border-slate-300'
                                } ${isGraded ? 'pointer-events-none' : ''}`}>
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    value={val}
                                    checked={answers[q.id] === val}
                                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    disabled={isGraded}
                                    className="text-indigo-600"
                                  />
                                  <span className="text-sm">{val}</span>
                                </label>
                              ))}
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
                        </div>
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
                            </div>
                            <div className="flex gap-2 text-xs text-slate-500">
                              <span>知识:{existingAnswer!.grading.dimension_scores.knowledge_accuracy}</span>
                              <span>逻辑:{existingAnswer!.grading.dimension_scores.logic_completeness}</span>
                              <span>表达:{existingAnswer!.grading.dimension_scores.expression_clarity}</span>
                              <span>拓展:{existingAnswer!.grading.dimension_scores.expansion}</span>
                            </div>
                          </div>
                          {existingAnswer!.grading.annotations?.length > 0 && (
                            <div className="mt-2 space-y-1">
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

          {!submitted && detail.my_score === null && (
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
              <Button
                onClick={handleSubmit}
                disabled={submitting || saving}
                className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? '提交中...' : '提交作业'}
              </Button>
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
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-500">你的答案：</span>
                          <span className={ans?.grading?.total_score === ans?.grading?.full_score ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                            {ans?.student_answer || '未作答'}
                          </span>
                        </div>
                        <div className="p-2 bg-green-50 rounded-lg">
                          <span className="text-slate-500">正确答案：</span>
                          <span className="text-green-600 font-medium font-mono">{q.answer}</span>
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

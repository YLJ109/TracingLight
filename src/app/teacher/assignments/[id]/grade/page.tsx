'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth-helper';

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
  const [message, setMessage] = useState('');

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

  const handleBatchGrade = async () => {
    setGrading(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/ai/grade/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: Number(id), student_id: Number(studentId) }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(`批改完成！共批改 ${json.data.graded_count} 题，${json.data.error_count} 题已自动归档错题本`);
        fetchData();
      } else {
        setMessage('批改失败：' + (json.error || '未知错误'));
      }
    } catch (e) {
      setMessage('批改请求失败');
    } finally {
      setGrading(false);
    }
  };

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
          <div>
            <h1 className="text-2xl font-bold text-slate-800">批改详情</h1>
            <p className="text-sm text-muted-foreground">
              {assignment.title} · {assignment.course.name}
            </p>
          </div>
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

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">
          {message}
        </div>
      )}

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
                        第{idx + 1}题 · {typeLabels[q.question_type] || q.question_type}
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

                {/* Answer comparison */}
                <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">学生作答</p>
                    <p className={`text-sm font-medium ${!a?.student_answer ? 'text-red-400 italic' : 'text-slate-700'}`}>
                      {a?.student_answer || '（未作答）'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">参考答案</p>
                    <p className="text-sm font-medium text-emerald-700">{q.answer}</p>
                  </div>
                </div>

                {/* Grading annotations */}
                {isGraded && g.annotations && (g.annotations as Array<Record<string, unknown>>).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {(g.annotations as Array<Record<string, unknown>>).map((ann: Record<string, unknown>, i: number) => (
                      <div key={i} className="p-2 bg-red-50 border border-red-100 rounded text-sm">
                        <span className="font-medium text-red-700">{ann.content as string}</span>
                        <span className="text-red-600 ml-2">扣{fmt(ann.point_deduction as number)}分</span>
                        {ann.comment ? <p className="text-red-500 text-xs mt-1">{String(ann.comment)}</p> : null}
                      </div>
                    ))}
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

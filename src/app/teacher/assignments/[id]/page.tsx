'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Clock, CheckCircle2, Users, FileText, Sparkles,
  BookOpen, TrendingUp, AlertCircle, Eye, Loader2, BarChart3, Send, BellRing, Download, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentDetail {
  id: number;
  title: string;
  description: string;
  course: { name: string };
  total_score: number;
  start_time: string;
  end_time: string;
  status: string;
  allow_resubmit?: boolean;
  question_ids: number[];
  questions: Array<{
    id: number;
    content: string;
    question_type: string;
    difficulty: string;
    answer: string;
    default_score: number;
    knowledge_point: { name: string } | null;
  }>;
  submissions: Array<{
    student_id: number;
    real_name: string;
    student_level: string;
    is_submitted: boolean;
    total_score: number | null;
    graded_count: number;
    total_questions: number;
  }>;
}

const levelConfig: Record<string, { label: string; className: string }> = {
  top: { label: '全优层', className: 'bg-yellow-100 text-yellow-700' },
  medium: { label: '勤奋中等层', className: 'bg-blue-100 text-blue-700' },
  weak: { label: '提升层', className: 'bg-red-100 text-red-700' },
};

const typeLabels: Record<string, string> = {
  single_choice: '单选题', multiple_choice: '多选题', multi_choice: '多选题',
  judgment: '判断题', fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
  code: '编程题', concept_confusion: '概念混淆', calculation_error: '计算错误',
  logic_error: '逻辑错误', knowledge_missing: '知识缺失', careless: '粗心大意', empty: '未作答',
};

const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

// 客观题题型（与后端 objective-grading 的 OBJECTIVE_TYPES 保持一致）。
// 用于前端仅依据题目实际题型判定是否「纯客观」，不受创建时 has_subjective 字段取值差异影响。
const OBJECTIVE_TYPES = new Set([
  'single_choice', 'multiple_choice', 'multi_choice', 'fill_blank', 'judgment',
]);

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

export default function TeacherAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [gradesPublished, setGradesPublished] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    apiFetch(`/api/teacher/assignments/${assignmentId}/questions`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setDetail(data.data);
      })
      .finally(() => setLoading(false));
    // 查询成绩发布状态
    apiFetch(`/api/teacher/assignments/${assignmentId}/publish-grades`)
      .then(r => r.json())
      .then(data => { if (data.success) setGradesPublished(!!data.grades_published); })
      .catch(() => {});
  }, [assignmentId]);

  const handleBatchGrade = useCallback(async () => {
    if (!detail) return;
    const ungraded = detail.submissions.filter(s => s.is_submitted && s.graded_count < s.total_questions);
    if (ungraded.length === 0) return;

    for (const sub of ungraded) {
      await apiFetch('/api/ai/grade/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: detail.id, student_id: sub.student_id }),
      });
    }
    // Refresh
    window.location.reload();
  }, [detail]);

  // 一键发布成绩：发布后学生端即可查看批改结果/分数
  const handlePublishGrades = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${assignmentId}/publish-grades`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setGradesPublished(true);
        toast.success('成绩已发布，学生现在可以查看批改结果');
      } else {
        toast.error('发布失败：' + (json.error || '未知错误'));
      }
    } catch {
      toast.error('发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  }, [assignmentId]);

  // 补考 / 重开提交（C6）：已截止作业可由教师开启补考，学生在截止时间后仍可提交
  const handleToggleReopen = useCallback(async () => {
    if (!detail) return;
    const next = !detail.allow_resubmit;
    setReopening(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${assignmentId}/reopen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_resubmit: next }),
      });
      const json = await res.json();
      if (json.success) {
        setDetail((d) => d ? { ...d, allow_resubmit: next } : d);
        toast.success(next ? '已开启补考，学生可重新提交' : '已关闭补考，提交通道关闭');
      } else {
        toast.error('操作失败：' + (json.error || '未知错误'));
      }
    } catch {
      toast.error('操作失败，请稍后重试');
    } finally {
      setReopening(false);
    }
  }, [assignmentId, detail]);

  // 导出成绩/作答/未交名单为 CSV（浏览器 fetch+Blob 下载，携带同源凭证）
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${assignmentId}/export`, { method: 'POST' });
      if (!res.ok) {
        let msg = '导出失败';
        try { const j = await res.json(); msg = j.error || msg; } catch { /* keep default */ }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      // 优先使用服务端 RFC 5987 中文文件名，取不到则回退
      let filename = `${detail?.title || '作业'}_成绩导出.csv`;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (m && m[1]) {
        try { filename = decodeURIComponent(m[1]); } catch { /* keep default */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [assignmentId, detail]);

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

  const submittedCount = detail.submissions.filter(s => s.is_submitted).length;
  const gradedCount = detail.submissions.filter(s => s.graded_count === s.total_questions).length;
  const avgScore = detail.submissions
    .filter(s => s.total_score !== null)
    .reduce((sum, s) => sum + (s.total_score || 0), 0) / (gradedCount || 1);
  // 是否含主观题（依据实际题目题型）：纯客观 → 批改完成自动发布；含主观 → 建议教师复核后手动发布
  const hasSubjective = detail.questions.some(q => !OBJECTIVE_TYPES.has(q.question_type));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="page-title">{detail.title}</h1>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="secondary" className="gap-1">
                <BookOpen className="w-3 h-3" /> {detail.course?.name}
              </Badge>
              <span className="text-sm text-slate-500">
                {detail.start_time} ~ {detail.end_time}
              </span>
              <Badge className={detail.status === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}>
                {detail.status === 'published' ? '进行中' : '已结束'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant={detail.allow_resubmit ? "outline" : "default"}
            onClick={handleToggleReopen}
            disabled={reopening}
            className={detail.allow_resubmit
              ? "gap-2 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
              : "gap-2 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"}
          >
            {reopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {detail.allow_resubmit ? '补考中' : '开启补考'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
              >
                <Sparkles className="w-4 h-4" /> AI 一键批改
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认 AI 一键批改？</AlertDialogTitle>
                <AlertDialogDescription>
                  将对该作业中已提交但尚未完成批改的学生作答发起 AI 批量批改。批改结果会写入成绩，发布前学生不可见，操作不可一键撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleBatchGrade}>确认批改</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            onClick={handleExport}
            disabled={exporting}
            variant="outline"
            className="gap-2"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 导出成绩
          </Button>
          {gradesPublished ? (
            <Badge className="gap-1.5 h-10 px-4 bg-emerald-50 text-emerald-700 border-emerald-200 text-sm font-medium">
              <BellRing className="w-4 h-4" /> 成绩已发布
            </Badge>
          ) : gradesPublished === null ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={publishing}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 发布成绩
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认发布成绩？</AlertDialogTitle>
                <AlertDialogDescription>
                  发布后，学生端将立即看到本次作业的批改分数与评语。此操作不可撤销，请确认已批改完成。
                  {(() => {
                    const pending = detail.submissions.filter(s => s.is_submitted && s.graded_count < s.total_questions).length;
                    if (pending > 0) {
                      return ` 当前还有 ${pending} 名已提交但未全部批改的学生，发布后这些学生仍看不到成绩。`;
                    }
                    return '';
                  })()}
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePublishGrades}>确认发布</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* 发布策略提示：未发布时，按是否含主观题给出自动/手动发布指引 */}
      {gradesPublished === false && (
        hasSubjective ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4" /> 含主观题，建议教师复核后手动发布成绩
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4" /> 纯客观题作业，AI 批改完成后将自动发布成绩
          </div>
        )
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{detail.submissions.length}</p>
                <p className="text-xs text-slate-500">学生总数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{submittedCount}<span className="text-sm text-slate-400">/{detail.submissions.length}</span></p>
                <p className="text-xs text-slate-500">已提交</p>
              </div>
            </div>
            <Progress value={(submittedCount / detail.submissions.length) * 100} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{gradedCount}<span className="text-sm text-slate-400">/{submittedCount}</span></p>
                <p className="text-xs text-slate-500">已批改</p>
              </div>
            </div>
            <Progress value={submittedCount > 0 ? (gradedCount / submittedCount) * 100 : 0} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{avgScore.toFixed(1)}</p>
                <p className="text-xs text-slate-500">班级均分</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <FileText className="w-4 h-4" /> 题目概览
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-2">
            <Users className="w-4 h-4" /> 学生提交
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="w-4 h-4" /> 成绩统计
          </TabsTrigger>
        </TabsList>

        {/* Questions Overview */}
        <TabsContent value="overview" className="mt-4 space-y-3">
          {detail.questions.map((q, idx) => (
            <Card key={q.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={typeLabels[q.question_type] ? 'bg-slate-100 text-slate-700' : 'bg-slate-100'} variant="secondary">
                        {typeLabels[q.question_type] || '其他题型'}
                      </Badge>
                      <Badge className={difficultyConfig[q.difficulty] || 'bg-slate-100'} variant="secondary">
                        {q.difficulty === 'easy' ? '简单' : q.difficulty === 'medium' ? '中等' : '困难'}
                      </Badge>
                      <span className="text-sm text-slate-400">{q.default_score}分</span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-3">{q.content}</p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                      <span className="text-xs text-slate-500">
                        <span className="font-medium">答案：</span>
                        <span className="text-green-600 font-mono">{q.answer}</span>
                      </span>
                      {q.knowledge_point && (
                        <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Student Submissions */}
        <TabsContent value="submissions" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {detail.submissions.map((sub) => (
                  <div key={sub.student_id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        sub.student_level === 'top' ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                        sub.student_level === 'medium' ? 'bg-gradient-to-br from-blue-400 to-indigo-500' :
                        'bg-gradient-to-br from-red-400 to-rose-500'
                      }`}>
                        {sub.real_name[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{sub.real_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={levelConfig[sub.student_level]?.className || 'bg-slate-100'} variant="secondary">
                            {levelConfig[sub.student_level]?.label || sub.student_level}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {sub.is_submitted ? (
                        <>
                          {sub.graded_count === sub.total_questions ? (
                            <Badge className="bg-green-100 text-green-700 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> 已批改
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 gap-1">
                              <Clock className="w-3 h-3" /> 待批改
                            </Badge>
                          )}
                          {sub.total_score !== null && (
                            <span className={`text-lg font-bold ${sub.total_score >= detail.total_score * 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                              {fmt(sub.total_score)}/{fmt(detail.total_score)}
                            </span>
                          )}
                        </>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500 gap-1">
                          <AlertCircle className="w-3 h-3" /> 未提交
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => router.push(`/teacher/assignments/${detail.id}/grade?studentId=${sub.student_id}`)}
                      >
                        <Eye className="w-3 h-3" /> 查看
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats */}
        <TabsContent value="stats" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">分数分布</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const ranges = [
                    { label: '40-45分', min: 40, max: 45, color: 'bg-green-500' },
                    { label: '30-39分', min: 30, max: 39, color: 'bg-blue-500' },
                    { label: '20-29分', min: 20, max: 29, color: 'bg-amber-500' },
                    { label: '10-19分', min: 10, max: 19, color: 'bg-orange-500' },
                    { label: '0-9分', min: 0, max: 9, color: 'bg-red-500' },
                  ];
                  return ranges.map(r => {
                    const count = detail.submissions.filter(s => s.total_score !== null && s.total_score >= r.min && s.total_score <= r.max).length;
                    const maxCount = Math.max(1, ...ranges.map(r2 => detail.submissions.filter(s => s.total_score !== null && s.total_score >= r2.min && s.total_score <= r2.max).length));
                    return (
                      <div key={r.label} className="flex items-center gap-3 mb-3">
                        <span className="text-sm text-slate-600 w-16">{r.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                          <div className={`h-full ${r.color} rounded-full transition-all flex items-center justify-end pr-2`}
                            style={{ width: `${(count / maxCount) * 100}%` }}>
                            {count > 0 && <span className="text-xs text-white font-medium">{count}人</span>}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">分层表现</CardTitle></CardHeader>
              <CardContent>
                {['top', 'medium', 'weak'].map(level => {
                  const levelStudents = detail.submissions.filter(s => s.student_level === level && s.total_score !== null);
                  const levelAvg = levelStudents.length > 0
                    ? levelStudents.reduce((sum, s) => sum + (s.total_score || 0), 0) / levelStudents.length
                    : 0;
                  return (
                    <div key={level} className="flex items-center justify-between mb-3 p-3 rounded-lg bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Badge className={levelConfig[level]?.className}>{levelConfig[level]?.label}</Badge>
                        <span className="text-sm text-slate-500">{levelStudents.length}人</span>
                      </div>
                      <span className="font-bold text-slate-800">{levelAvg.toFixed(1)}分</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

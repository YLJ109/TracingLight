'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RichContentView from '@/components/rich-content-view';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Sparkles, CheckCircle2, Clock, ChevronLeft, ChevronRight, Users, FileText, Download, RefreshCw } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { getCurrentUser } from '@/lib/auth-helper';
import { isObjectiveType } from '@/lib/objective-grading';
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
    ai_generated_probability: number | null;
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

/** 客观题学生作答的紧凑展示（答题卡用） */
function studentSelectionText(q: { question_type: string }, raw?: string | null): string {
  const v = (raw || '').trim();
  if (!v) return '未作答';
  if (q.question_type === 'judgment') return v === '正确' ? '对' : v === '错误' ? '错' : v;
  return v;
}

/** 评分细则四维度中文标签（与 dimension_scores 键一一对应） */
const DIM_LABELS: Array<{ key: string; label: string }> = [
  { key: 'knowledge_accuracy', label: '知识点准确性' },
  { key: 'logic_completeness', label: '逻辑完整性' },
  { key: 'expression_clarity', label: '表达条理性' },
  { key: 'expansion', label: '拓展加分' },
];

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

/** 选项展示归一化：兼容「字符串」「{A:'..'}`对象」「{label,key,text,isCorrect}」三种存法，避免把对象当 React 子元素渲染 */
function optDisplay(opt: unknown, index: number): string {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'object') {
    const o = opt as { label?: string; key?: string; text?: string };
    const label = o.label || o.key || String.fromCharCode(65 + index);
    const text = o.text ?? '';
    return text ? `${label}. ${text}` : label;
  }
  return String(opt);
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
  attachment: '实验题',
};

// ── 实验题/附件题：解析学生作答 JSON 并展示附件下载 + 实验报告字段 ──
const ATTACH_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'experiment_name', label: '实验名称' },
  { key: 'materials', label: '实验材料及器材' },
  { key: 'purpose', label: '实验目的' },
  { key: 'steps', label: '实验步骤' },
  { key: 'data_record', label: '数据记录' },
  { key: 'result_analysis', label: '结果与分析' },
  { key: 'conclusion', label: '实验结论' },
];

function parseAttachAnswer(raw?: string | null): { files: Array<{ name: string; path: string; size: number; mime: string }>; template: Record<string, string> } {
  try {
    const o = JSON.parse(raw || '{}');
    return {
      files: Array.isArray(o.files) ? o.files : [],
      template: (o.template && typeof o.template === 'object') ? o.template : {},
    };
  } catch {
    return { files: [], template: {} };
  }
}

function attachSize(n?: number): string {
  if (n == null) return '';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB';
  if (n >= 1024) return Math.round(n / 1024) + 'KB';
  return n + 'B';
}

function AttachmentTeacherView({ value }: { value: string }) {
  const { files, template } = parseAttachAnswer(value || '');
  const filled = ATTACH_FIELDS.filter((f) => (template[f.key] || '').trim());
  if (files.length === 0 && filled.length === 0) {
    return <p className="text-sm italic text-red-400">未提交附件或实验报告</p>;
  }
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">附件（{files.length}）· 点击可下载</p>
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <a href={`/${f.path}`} target="_blank" rel="noopener noreferrer" className="truncate flex-1 font-medium hover:text-indigo-700">{f.name}</a>
                <span className="text-xs text-slate-400 shrink-0">{attachSize(f.size)}</span>
                <a href={`/${f.path}`} download className="text-slate-400 hover:text-indigo-600 shrink-0" title="下载">
                  <Download className="w-4 h-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {filled.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1">
          <p className="text-xs font-medium text-slate-500">实验报告</p>
          {filled.map((f) => (
            <p key={f.key} className="text-sm"><span className="text-slate-500">{f.label}：</span><span className="whitespace-pre-wrap text-slate-700">{template[f.key]}</span></p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherGradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  // 导出成绩 CSV：复用 /export（含每题得分、均分、未交清单）
  const handleExport = async () => {
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/export`);
      if (!res.ok) { toast.error('导出失败：' + ((await res.json().catch(() => ({ error: '' }))).error || '')); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `作业成绩_${id}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('成绩已导出，请查收下载');
    } catch {
      toast.error('导出失败，请重试');
    }
  };
  const [studentId, setStudentId] = useState<string>('');
  const [data, setData] = useState<GradingData | null>(null);
  const [, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);

  // ── 批改台导航（上一份/下一份作业 + 上一人/下一人）──
  const [nav, setNav] = useState<{
    course_id: number;
    course_title?: string;
    sibling: { prev: { id: number; title: string } | null; next: { id: number; title: string } | null };
    queue: Array<{ studentId: number; studentName: string; status: string; gradedCount: number; totalQuestions: number; index: number }>;
    total_students: number;
  } | null>(null);
  const [navLoading, setNavLoading] = useState(true);
  // 内容区过渡键：每次数据刷新递增，触发内容丝滑淡入（避免整页白屏刷新感）
  const [transitionKey, setTransitionKey] = useState(0);

  useEffect(() => {
    apiFetch(`/api/teacher/assignments/${id}/nav`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setNav(j.data);
      })
      .catch((e) => console.error('load nav', e))
      .finally(() => setNavLoading(false));
  }, [id]);

  // 默认进入第一个未批完学生的批改
  useEffect(() => {
    if (nav && !studentId) {
      const first = nav.queue.find((s) => s.status !== 'completed') || nav.queue[0];
      if (first) goToStudent(first.studentId);
      else if (nav.queue.length > 0) goToStudent(nav.queue[0].studentId);
      else setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  // Get studentId from query params or localStorage
  useEffect(() => {
    if (studentId) return;
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = searchParams.get('studentId');
    if (fromQuery) setStudentId(fromQuery);
  }, [studentId]);

  const goToStudent = useCallback((sid: number) => {
    const next = String(sid);
    window.history.pushState({}, '', `${window.location.pathname}?studentId=${next}`);
    setStudentId(next);
  }, []);

  const goPrevStudent = useCallback(() => {
    if (!nav || !studentId) return;
    const cur = nav.queue.find((s) => s.studentId === Number(studentId));
    if (!cur || cur.index <= 0) { toast.info('已经是第一份学生作业'); return; }
    goToStudent(nav.queue[cur.index - 1].studentId);
  }, [nav, studentId, goToStudent]);

  const goNextStudent = useCallback(() => {
    if (!nav || !studentId) return;
    const cur = nav.queue.find((s) => s.studentId === Number(studentId));
    if (!cur) { if (nav.queue.length) goToStudent(nav.queue[0].studentId); return; }
    if (cur.index >= nav.queue.length - 1) { toast.info('已经是最后一份学生作业'); return; }
    goToStudent(nav.queue[cur.index + 1].studentId);
  }, [nav, studentId, goToStudent]);

  // 键盘快捷键：←/→ 切换学生、Alt+←/→ 切作业
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey && e.key === 'ArrowLeft' && nav?.sibling.prev) goToAssignment(nav.sibling.prev.id);
      if (e.altKey && e.key === 'ArrowRight' && nav?.sibling.next) goToAssignment(nav.sibling.next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  const goToAssignment = useCallback((aid: number) => {
    // 切作业：先清空当前学生与内容，新作业 nav 就绪后自动进入第一个待批学生；
    // 清空 data 展示骨架（导航条保持常显），而非整页白屏刷新。
    setStudentId('');
    setData(null);
    setTransitionKey((k) => k + 1);
    router.push(`/teacher/assignments/${aid}/grade`);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/students/${studentId}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTransitionKey((k) => k + 1); // 触发内容淡入过渡
      }
    } catch (e) {
      console.error(e);
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

  // 客观题按规则重算：重刷当前学生全部客观题为 0/满分（回刷历史部分分）
  const [regradeLoading, setRegradeLoading] = useState(false);
  const handleRegradeObjective = useCallback(async () => {
    if (!studentId) { toast.info('请先选择学生'); return; }
    setRegradeLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/assignments/${id}/regrade-objective`, {
        method: 'POST',
        body: JSON.stringify({ studentId: Number(studentId) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`已按规则重算 ${json.updated} 道客观题（归零 ${json.correctedToZero}，修正为满分 ${json.correctedToFull}）`);
        fetchData();
      } else {
        toast.error('重算失败：' + (json.error || '未知错误'));
      }
    } catch {
      toast.error('重算请求失败，请重试');
    } finally {
      setRegradeLoading(false);
    }
  }, [id, studentId, fetchData]);

  // 顶部导航区：返回列表 + 上一份/下一份作业 + 上一人/下一人（恒常渲染，切换时保持不动、不整页刷新）
  const navHeader = (
    <>
      <div className="flex items-center gap-3">
        <BackButton to="/teacher/assignments" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-slate-800 truncate">{nav?.course_title || '批改台'}</h1>
          <p className="text-xs text-muted-foreground">作业批改 · 返回作业列表</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={handleExport}
          title="导出成绩 CSV（含每题得分、均分、未交清单）"
        >
          <Download className="w-3.5 h-3.5 mr-1" /> 导出成绩
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={handleRegradeObjective}
          disabled={regradeLoading}
          title="按客观题规则重算该生全部客观题：做错一律0分、做对满分（用于回刷历史部分分）"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${regradeLoading ? 'animate-spin' : ''}`} /> 客观题按规则重算
        </Button>
      </div>

      <div className={`rounded-2xl border bg-gradient-to-r from-indigo-50 to-sky-50 border-indigo-100 p-3 shadow-sm ${!nav ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            onClick={() => nav?.sibling.prev ? goToAssignment(nav.sibling.prev.id) : toast.info('已经是第一份作业')}
          >
            <ChevronLeft className="w-4 h-4" /> 上一份作业
          </Button>
          <span className="text-xs text-indigo-500">{nav?.course_title || '作业'}</span>
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            onClick={() => nav?.sibling.next ? goToAssignment(nav.sibling.next.id) : toast.info('已经是最后一份作业')}
          >
            下一份作业 <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={goPrevStudent} disabled={!nav}>
              <ChevronLeft className="w-4 h-4" /> 上一人
            </Button>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/70 border border-indigo-100 text-sm text-indigo-700">
              <Users className="w-4 h-4" />
              {(() => {
                const cur = nav?.queue.find((s) => s.studentId === Number(studentId));
                return cur ? `${cur.index + 1} / ${nav?.total_students ?? '—'}` : `${nav?.total_students ?? '—'} 人`;
              })()}
            </div>
            <Button size="sm" variant="ghost" onClick={goNextStudent} disabled={!nav}>
              下一人 <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* 队列进度（未批完高亮） */}
        {nav && nav.queue.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {nav.queue.map((s) => {
              const active = Number(studentId) === s.studentId;
              const done = s.status === 'completed';
              const pending = s.status === 'part' || s.status === 'submitted';
              return (
                <button
                  key={s.studentId}
                  onClick={() => goToStudent(s.studentId)}
                  title={`${s.studentName}：${s.gradedCount}/${s.totalQuestions} 题已批`}
                  className={`px-2.5 py-1 rounded-md text-xs border transition ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                      : done
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : pending
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  {s.studentName}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  // 首次加载 / 切换作业中：导航区保持常显，仅内容区显示轻量骨架，避免整页白屏刷新感
  if (!data) {
    return (
      <div className="space-y-6">
        {navHeader}
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载批改详情...
        </div>
      </div>
    );
  }

  const { assignment, student, details, summary } = data;
  const allGraded = summary.gradedCount === summary.totalCount;

  return (
    <div className="space-y-6">
      {navHeader}

      {/* 内容区：切换学生/刷新数据时保留导航区，仅此处丝滑淡入过渡 */}
      <div key={transitionKey} className="content-enter space-y-6">

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

      {/* 逐题详情 变两栏：左=题目，右=答题卡（学习通式竖栏，吸顶） */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">逐题详情</h2>
        {details.map((detail, idx) => {
          const q = detail.question;
          const a = detail.answer;
          const g = detail.grading;
          const isCorrect = g && g.total_score >= g.full_score * 0.6;
          const isGraded = g && g.status === 'completed';
          // 题型标签旁的满分统一采用“归一化后”的实评分 full_score，与评分区一致，避免显示 default_score 造成“15分 vs 18分”偏差
          const displayFull = g?.full_score ?? q.default_score;

          return (
            <Card key={q.id} id={`qcard-${q.id}`} className={isGraded ? (isCorrect ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-red-400') : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">
                        第{idx + 1}题 · {typeLabels[q.question_type] || '其他题型'}
                      </span>
                      <span className="text-sm text-muted-foreground">({displayFull}分)</span>
                      {q.knowledge_point && (
                        <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>
                      )}
                      {(() => {
                        const aiProb = g?.ai_generated_probability;
                        if (!isGraded || typeof aiProb !== 'number' || aiProb == null || isObjectiveType(q.question_type)) return null;
                        const pct = Math.round(aiProb * 100);
                        const high = pct >= 70;
                        const mid = pct >= 40;
                        return (
                          <Badge
                            className={`text-xs ${high ? 'bg-red-50 text-red-700 border-red-200' : mid ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                            title="该题由 AI 评估的学生作答疑似 AI 生成概率，仅供复核参考，不作定论"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            AI疑似 {pct}%
                          </Badge>
                        );
                      })()}
                    </div>
                    <p className="text-base font-medium text-slate-800 mt-2">{q.content}</p>
                    {q.options && q.question_type !== 'attachment' && (
                      <div className="mt-2 space-y-1">
                        {(Array.isArray(q.options) ? q.options : Object.entries((q.options ?? {}) as Record<string, unknown>))
                          .map((opt: unknown, i: number) => (Array.isArray(opt) ? `${opt[0]}. ${opt[1]}` : optDisplay(opt, i)))
                          .map((text: string, i: number) => (
                            <p key={i} className="text-sm text-slate-600">{text}</p>
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
                    {q.question_type === 'attachment' ? (
                      <AttachmentTeacherView value={a?.student_answer || ''} />
                    ) : (
                      <div className="text-sm font-medium"><RichContentView content={a?.student_answer || ''} /></div>
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

                {/* 评分细则：已批主观题的四维度细化分（dimension_scores 缺失则隐藏） */}
                {isGraded && g.dimension_scores && (() => {
                  const dims = g.dimension_scores as Record<string, number>;
                  const entries = DIM_LABELS.filter((dl) => Number.isFinite(Number(dims[dl.key])) && Number(dims[dl.key]) >= 0);
                  if (entries.length === 0) return null;
                  return (
                    <details className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2 group">
                      <summary className="cursor-pointer text-sm font-medium text-indigo-700 list-none flex items-center justify-between">
                        <span>评分细则（AI 四维度）</span>
                        <span className="text-xs text-indigo-400 group-open:hidden">展开 ▾</span>
                        <span className="hidden text-xs text-indigo-400 group-open:inline">收起 ▴</span>
                      </summary>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                        {entries.map((dl) => (
                          <div key={dl.key} className="rounded-lg bg-white border border-indigo-100 p-2 text-center">
                            <p className="text-[11px] text-slate-500">{dl.label}</p>
                            <p className="text-base font-bold text-indigo-700">{fmt(Number(dims[dl.key]))}<span className="text-xs text-slate-400">/100</span></p>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })()}

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

        {/* 答题卡（学习通式竖栏，吸顶）：客观题显对错与所选，主观题显待批状态 */}
        <aside className="hidden lg:block w-56 xl:w-60 shrink-0">
          <Card className="sticky top-4">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm text-muted-foreground">答题卡</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4">
              {details.length === 0 ? (
                <p className="text-sm text-slate-400">暂无题目</p>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {details.map((detail, i) => {
                    const q = detail.question;
                    const g = detail.grading;
                    const obj = isObjectiveType(q.question_type);
                    const isGraded = g && g.status === 'completed';
                    const isCorrect = isGraded && g.total_score >= g.full_score * 0.6;
                    const cls = obj
                      ? (isCorrect
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-red-100 text-red-600 border-red-200')
                      : (isGraded
                          ? 'bg-teal-100 text-teal-700 border-teal-200'
                          : 'bg-amber-100 text-amber-600 border-amber-200');
                    return (
                      <button
                        key={q.id}
                        onClick={() => document.getElementById(`qcard-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className={`aspect-square w-full rounded-md border text-xs font-bold flex items-center justify-center transition-shadow hover:shadow-md ${cls}`}
                        title={`第${i + 1}题 · ${typeLabels[q.question_type] || '其他'}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      </div>{/* /content-enter 内容区结束 */}

      <style jsx>{`
        @keyframes traeGradeContentEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .content-enter { animation: traeGradeContentEnter 0.28s ease-out; }
      `}</style>
    </div>
  );
}

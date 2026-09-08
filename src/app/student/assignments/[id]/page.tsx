'use client';

import { formatDateRange, formatDateTime } from '@/lib/date';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helper';
import RichAnswer from '@/components/rich-answer';
import { sanitizeRichHTML, renderRichContent, htmlToPlainText } from '@/lib/rich-text';
import { groupQuestionsBySection } from '@/lib/question-order';
import { useAssignmentMonitor } from '@/hooks/use-assignment-monitor';
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
  Clock, CheckCircle2, AlertCircle, BookOpen,
  Sparkles, Send, Eye, Loader2, FileText, Trophy, XCircle, Save,
  BookMarked, ChevronRight, Upload, X, Download, Users
} from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

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
  allow_resubmit?: boolean;
  return_comment?: string | null;
  monitor_config?: Record<string, unknown> | null;
}

// 富文本作答范围：客观题（含填空）之外的全部题型（简答/编程/论述等）
const OBJECTIVE_TYPES = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment', 'fill_blank'];
const isRichType = (t: string) => !OBJECTIVE_TYPES.includes(t);
// 作业分区排序：客观题在上（按题型细分）、主观题在下（按题型细分）
const isSubjective = (t: string) => !OBJECTIVE_TYPES.includes(t);
const isAttachmentType = (t: string) => t === 'attachment';

// ── 实验题/附件题：实验报告字段（学生作答端，可只填已完成的） ──
const ATTACH_TEMPLATE_FIELDS: Array<{ key: string; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'experiment_name', label: '实验名称', placeholder: '填写实验名称' },
  { key: 'materials', label: '实验材料及器材', placeholder: '列出使用的材料、器材与仪器', multiline: true },
  { key: 'purpose', label: '实验目的', placeholder: '说明要验证或探究的目标', multiline: true },
  { key: 'steps', label: '实验步骤', placeholder: '分步描述操作过程', multiline: true },
  { key: 'data_record', label: '数据记录', placeholder: '记录观测到的数据', multiline: true },
  { key: 'result_analysis', label: '结果与分析', placeholder: '对数据进行处理与误差分析', multiline: true },
  { key: 'conclusion', label: '实验结论', placeholder: '写出最终结论', multiline: true },
];

interface AttachFileMeta { name: string; path: string; size: number; mime: string; }

// 解析学生作答 JSON：{ files: [...], template: {...} }
function parseAttachmentAnswer(raw: string): { files: AttachFileMeta[]; template: Record<string, string> } {
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

// 读取题目 options 中的实验模板（options = { template: {...} }）
function getQuestionTemplate(q: QuestionDetail): Record<string, string> | null {
  let opts: unknown = q.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }
  if (opts && typeof opts === 'object') {
    const t = (opts as { template?: Record<string, string> } | null)?.template;
    if (t && typeof t === 'object') return t;
  }
  return null;
}

function formatSize(n?: number): string {
  if (n == null) return '';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB';
  if (n >= 1024) return Math.round(n / 1024) + 'KB';
  return n + 'B';
}

// 附件题作答编辑器：文件选择 + 已选列表（可移除）+ 实验模板字段（有模板时显示）
function AttachmentAnswerEditor({ value, onChange, disabled, template }: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  template: Record<string, string> | null;
}) {
  const [uploading, setUploading] = useState(false);
  const { files, template: tpl } = parseAttachmentAnswer(value);
  const setVal = (filesArr: AttachFileMeta[], t: Record<string, string>) =>
    onChange(JSON.stringify({ files: filesArr, template: t }));

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (inputFiles.length === 0) return;
    if (files.length + inputFiles.length > 5) { alert('一次最多上传 5 个附件，请先移除部分文件'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      inputFiles.forEach((f) => fd.append('files', f));
      const res = await apiFetch('/api/student/assignments/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) setVal([...files, ...json.data], tpl);
      else alert('上传失败：' + (json.error || '未知错误'));
    } catch {
      alert('上传请求失败，请稍后重试');
    }
    setUploading(false);
  };

  return (
    <div className="mb-3 space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/40 p-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-600 hover:text-indigo-700">
          <Upload className="w-4 h-4" />
          <span>{uploading ? '上传中...' : '选择附件（docx/xlsx/pptx/pdf/zip/图片/文本/代码，≤20MB，最多5个）'}</span>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.zip,.rar,.7z,.tar,.gz,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json,.xml,.html,.log,.c,.cpp,.py,.java,.js,.ts,.tsx,.sql"
            onChange={handleFiles}
            disabled={uploading || disabled}
          />
        </label>
        <span className="text-xs text-slate-400 shrink-0">{files.length}/5</span>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{formatSize(f.size)}</span>
              {!disabled && (
                <button type="button" onClick={() => setVal(files.filter((_, j) => j !== i), tpl)} className="text-slate-400 hover:text-red-500 shrink-0" title="移除">
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {template && (
        <div className="space-y-2 rounded-lg border border-indigo-100 bg-slate-50/60 p-3">
          <p className="text-xs font-medium text-indigo-700">实验报告填写（可只填已完成的）</p>
          {ATTACH_TEMPLATE_FIELDS.map((f) => {
            const Com = f.multiline ? Textarea : Input;
            return (
              <div key={f.key}>
                <p className="text-xs text-slate-500 mb-1">{f.label}</p>
                <Com
                  rows={f.multiline ? 2 : undefined}
                  value={tpl[f.key] || ''}
                  disabled={disabled}
                  onChange={(e: { target: { value: string } }) => setVal(files, { ...tpl, [f.key]: e.target.value })}
                  placeholder={(template[f.key] || '').trim() ? template[f.key] : f.placeholder}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 附件题作答只读视图（已提交/已批改时展示文件下载 + 实验报告字段）
function AttachmentReadView({ value }: { value: string }) {
  const { files, template } = parseAttachmentAnswer(value);
  const filled = ATTACH_TEMPLATE_FIELDS.filter((f) => (template[f.key] || '').trim());
  if (files.length === 0 && filled.length === 0) {
    return <p className="text-sm text-slate-400 italic">未提交附件或实验报告</p>;
  }
  return (
    <div className="mb-3 space-y-2">
      {files.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">上传附件（{files.length}）</p>
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <a href={`/${f.path}`} target="_blank" rel="noopener noreferrer" className="truncate flex-1 hover:text-indigo-700">{f.name}</a>
                <span className="text-xs text-slate-400 shrink-0">{formatSize(f.size)}</span>
                <a href={`/${f.path}`} download className="text-slate-400 hover:text-indigo-600 shrink-0" title="下载">
                  <Download className="w-4 h-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {filled.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          {filled.map((f) => (
            <p key={f.key} className="text-sm"><span className="text-slate-500">{f.label}：</span><span className="whitespace-pre-wrap text-slate-700">{template[f.key]}</span></p>
          ))}
        </div>
      )}
    </div>
  );
}

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
  attachment: '实验题',
};

const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

/** 评分细则四维度中文标签 */
const DIM_LABELS: Array<{ key: string; label: string }> = [
  { key: 'knowledge_accuracy', label: '知识点准确性' },
  { key: 'logic_completeness', label: '逻辑完整性' },
  { key: 'expression_clarity', label: '表达条理性' },
  { key: 'expansion', label: '拓展加分' },
];

/** 我收到的互评（按题目分组用） */
interface ReceivedPeerReview {
  id: number;
  question_id: number;
  question: { content: string; question_type: string } | null;
  reviewer_name: string;
  total_score: number | null;
  dimension_scores: Record<string, number> | null;
  comment: string | null;
  created_at: string | null;
}

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
  // 我收到的互评（同伴互评参考）
  const [myPeerReviews, setMyPeerReviews] = useState<ReceivedPeerReview[]>([]);
  const redoRequested = searchParams.get('redo') === 'true';
  // 学习通式门控：仅教师退回（returned=true）的作业才允许进入重做模式
  const redoMode = redoRequested && detail?.returned === true;
  const draftKey = `tracinglight_draft_${assignmentId}`;

  // ── 防作弊监督埋点（老师可配置是否禁止复制/粘贴/开发者工具）──
  const mConfig = (detail?.monitor_config as Partial<{ disable_copy: boolean; disable_paste: boolean; enable_fullscreen: boolean; disable_devtools: boolean }> | null) || {};
  const monitor = useAssignmentMonitor({
    disableCopy: !!mConfig.disable_copy,
    disablePaste: !!mConfig.disable_paste,
    disableDevtools: !!mConfig.disable_devtools,
  });

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

  useEffect(() => {
    if (detail?.grades_published) {
      apiFetch(`/api/student/peer-review?assignment_id=${assignmentId}&mine=1`)
        .then((r) => r.json())
        .then((json) => { if (json.success) setMyPeerReviews(json.data || []); })
        .catch(() => {});
    } else {
      setMyPeerReviews([]);
    }
  }, [assignmentId, detail?.grades_published]);

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

  // 作答序列化：附件题原样存 JSON（files + template），富文本题做 HTML 清洗，客观题存原始串
  const serializeAnswer = (q: QuestionDetail): string => {
    const v = answers[q.id] || '';
    if (isAttachmentType(q.question_type)) return v; // 已是 { files, template } 的 JSON 字符串
    return isRichType(q.question_type) ? sanitizeRichHTML(v) : v;
  };

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
            student_answer: serializeAnswer(q),
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
      if (isRichType(q.question_type) && !isAttachmentType(q.question_type)) {
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
            student_answer: serializeAnswer(q),
          })),
          monitor: monitor.getMonitor(),
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

  // 题目分区：客观题在上、主观题在下（区内按题型连续排列，统一顺序来自 question-order）
  const sections = useMemo(() => {
    if (!detail) return [];
    return groupQuestionsBySection(detail.questions.map((q) => ({ ...q })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);
  // 连续题号（客观题1..N，主观题N+1..M）
  const displayNum = useMemo(() => {
    const map: Record<number, number> = {};
    let n = 1;
    for (const s of sections) for (const it of s.items) map[it.id] = n++;
    return map;
  }, [sections]);

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

  // 答题卡：点击某题格滚动到对应题目
  const scrollToQuestion = (qId: number) => {
    document.getElementById(`qcard-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 某题收到的同伴互评（互评参考）
  const peerReviewsForQuestion = (qId: number) => myPeerReviews.filter((r) => r.question_id === qId);

  // 整份作业是否已全部批改完成 → 锁定编辑
  const isFullyGraded = detail.questions.length > 0 && detail.questions.every((q) => getAnswerForQuestion(q.id)?.grading?.status === 'completed');
  // 作业已截止：超截止时间、未开放补交且非退回重做 → 只能阅读，不能作答
  const expired = !redoMode && !detail?.allow_resubmit && !!detail?.end_time && new Date().toISOString() > detail.end_time;
  // 已提交学生的作答：成绩已公布或全部批改完成 → 仅可阅读、禁止修改（重做模式例外：教师退回后需重新作答）。
  // 未提交学生首次作答不受发布状态限制（纯客观题作业会随首次提交即时发布，不能因此锁死其他学生）。
  const locked = (submitted && !redoMode && (detail.grades_published === true || isFullyGraded)) || expired; // 已截止→只读不可作答

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 已截止提示：超截止时间 → 只读，不能作答 */}
      {expired && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="font-medium">本作业已截止（{formatDateTime(detail.end_time)}）</span>
          <span className="text-red-600/80">当前仅可查看题目与解析，无法作答或修改。</span>
        </div>
      )}
      {/* 监督提示（防作弊 · 威慑） */}
      {!locked && (mConfig.disable_copy || mConfig.disable_paste || mConfig.enable_fullscreen || mConfig.disable_devtools) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-700">
          <Eye className="w-4 h-4 shrink-0" />
          <span>本题作答已开启过程监督：
            {mConfig.disable_copy ? '已禁用复制，' : ''}
            {mConfig.disable_paste ? '已禁用粘贴，' : ''}
            {mConfig.disable_devtools ? '已禁用开发者工具(F12/右键)，' : ''}
            {mConfig.enable_fullscreen ? <><button className="underline underline-offset-2 hover:text-amber-900" onClick={() => monitor.requestFullscreen()}>点击进入全屏(F11)</button>，</> : ''}
            系统将记录作答用时、切屏与粘贴行为供老师复核。
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="page-title">{detail.title}{redoMode && <span className="ml-3 text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">重做模式</span>}</h1>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="secondary" className="gap-1">
                <BookOpen className="w-3 h-3" /> {detail.course?.name}
              </Badge>
              <span className="text-sm text-slate-500">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatDateRange(detail.start_time, detail.end_time)}
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
        <TabsContent value="questions" className="mt-4">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0 space-y-4">
          {sections.map((sec) => {
            const secScore = sec.items.reduce((s, q) => s + (q.default_score || 0), 0);
            return (
              <div key={sec.key} className="space-y-4">
                {/* 分区标题：客观题 / 主观题 */}
                <div className="flex items-center gap-2 pt-1">
                  <div className={`w-1.5 h-5 rounded-full ${sec.key === 'objective' ? 'bg-indigo-500' : 'bg-teal-500'}`} />
                  <span className="font-semibold text-slate-800">{sec.title}</span>
                  <span className="text-xs text-slate-400">{sec.items.length}题 · 共{secScore}分</span>
                  <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full ${sec.key === 'objective' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                    {sec.key === 'objective' ? '系统自动评分' : '教师批改'}
                  </span>
                </div>
                {sec.items.map((q) => {
                  const qNum = displayNum[q.id];
                  const existingAnswer = getAnswerForQuestion(q.id);
                  const isGraded = !redoMode && existingAnswer?.grading?.status === 'completed';
                  return (
                    <Card key={q.id} id={`qcard-${q.id}`} className={`border-0 shadow-sm ${isGraded ? 'ring-1 ring-green-200' : ''}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                            isGraded
                              ? existingAnswer!.grading!.total_score === existingAnswer!.grading!.full_score
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                              : sec.key === 'objective' ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'
                          }`}>
                            {qNum}
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
                        {/* 实验题/附件题：专属附件上传 + 实验报告填写 / 已提交只读视图 */}
                        {isAttachmentType(q.question_type) ? (
                          isGraded ? (
                            <div className="mb-1">
                              <p className="text-xs font-medium text-slate-500 mb-1.5">附件作答</p>
                              <AttachmentReadView value={existingAnswer!.student_answer || ''} />
                            </div>
                          ) : (
                            <AttachmentAnswerEditor
                              value={answers[q.id] || ''}
                              onChange={(v) => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                              disabled={isGraded}
                              template={getQuestionTemplate(q)}
                            />
                          )
                        ) : isRichType(q.question_type) ? (
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
                              (() => {
                                const dims = existingAnswer!.grading.dimension_scores as Record<string, number>;
                                const entries = DIM_LABELS.filter((dl) => Number.isFinite(Number(dims[dl.key])));
                                if (entries.length === 0) return null;
                                return (
                                  <div className="text-right text-xs">
                                    <p className="text-slate-400 mb-1">评分细则（AI 四维度）</p>
                                    <div className="flex gap-2">
                                      {entries.map((dl) => (
                                        <span key={dl.key} className="rounded bg-white px-2 py-0.5 border border-slate-200">
                                          <span className="text-slate-400">{dl.label} </span>
                                          <span className="font-semibold text-slate-600">{dims[dl.key]}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()
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
                          {/* 同伴互评（互评参考，清晰标注：非官方成绩） */}
                          {(() => {
                            const peers = peerReviewsForQuestion(q.id);
                            if (peers.length === 0) return null;
                            const scoreTotal = peers.filter((p) => p.total_score != null);
                            const avg = scoreTotal.length > 0
                              ? scoreTotal.reduce((s, p) => s + (p.total_score || 0), 0) / scoreTotal.length
                              : null;
                            return (
                              <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-teal-600" />
                                  <p className="text-xs font-semibold text-teal-700">同伴互评（互评参考，不计入官方成绩）</p>
                                  {avg != null && (
                                    <span className="ml-auto text-sm font-bold text-teal-700 font-mono">
                                      {fmt(Math.round(avg * 10) / 10)}/{fmt(existingAnswer!.grading!.full_score)}
                                    </span>
                                  )}
                                </div>
                                {peers.map((p) => (
                                  <div key={p.id} className="mt-1.5 text-sm">
                                    <span className="font-medium text-teal-800">{p.reviewer_name}</span>
                                    {p.total_score != null && <span className="text-slate-500 ml-1">（{fmt(p.total_score)}分）</span>}
                                    {p.comment && <p className="text-slate-600 whitespace-pre-wrap">💬 {p.comment}</p>}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
              </div>
            );
          })}
            </div>

            {/* 右侧答题卡（学习通式竖栏，吸顶） */}
            <aside className="hidden lg:block w-full lg:w-56 shrink-0">
              {(() => {
                const answeredCount = detail.questions.reduce((n, q) => {
                  const e = getAnswerForQuestion(q.id);
                  if (!redoMode && e?.grading?.status === 'completed') return n;
                  const local = (answers[q.id] || '').trim();
                  return local && !/^\{"files":\[\],"template":\{\}\}$/.test(local) ? n + 1 : n;
                }, 0);
                return (
                  <Card className="border-0 shadow-sm sticky top-4">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        <CardTitle className="text-sm text-muted-foreground">答题卡</CardTitle>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">已作答 <span className="font-semibold text-indigo-600">{answeredCount}</span> / {detail.questions.length}</p>
                    </CardHeader>
                    <CardContent className="px-4 py-4">
                      {sections.map((sec) => (
                        <div key={sec.key} className="mb-3 last:mb-0">
                          <div className="flex items-center justify-between px-0.5 mb-1.5 mt-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-1 h-3.5 rounded-full ${sec.key === 'objective' ? 'bg-indigo-400' : 'bg-teal-400'}`} />
                              <span className="text-[11px] font-medium text-slate-500">{sec.title}</span>
                            </div>
                            <span className="text-[11px] text-slate-400">{sec.items.length}题</span>
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            {sec.items.map((q) => {
                              const existing = getAnswerForQuestion(q.id);
                              const isGrad = !redoMode && existing?.grading?.status === 'completed';
                              const local = (answers[q.id] || '').trim();
                              const filled = isGrad ? !!existing?.student_answer?.trim() : local !== '' && !/^\{"files":\[\],"template":\{\}\}$/.test(local);
                              let cls;
                              if (isGrad) {
                                const g = existing!.grading!;
                                cls = g.total_score >= g.full_score ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-600 border-red-200';
                              } else if (filled) {
                                cls = sec.key === 'objective' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-teal-100 text-teal-700 border-teal-200';
                              } else {
                                cls = 'bg-slate-100 text-slate-400 border-slate-200';
                              }
                              return (
                                <button
                                  key={q.id}
                                  type="button"
                                  onClick={() => scrollToQuestion(q.id)}
                                  className={`aspect-square w-full rounded-md border text-xs font-bold flex items-center justify-center transition-shadow hover:shadow-md ${cls}`}
                                  title={`第${displayNum[q.id]}题 · ${typeLabels[q.question_type] || '其他'}`}
                                >
                                  {displayNum[q.id]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })()}
            </aside>
          </div>

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
  {isAttachmentType(q.question_type) && ans?.student_answer ? (
    <div className="mt-1">
      <AttachmentReadView value={ans.student_answer} />
    </div>
  ) : (
    <span className={
      ans?.grading
        ? (ans.grading.total_score === ans.grading.full_score ? 'text-green-600 font-medium' : 'text-red-500 font-medium')
        : 'text-slate-400'
    }>
      <span className="whitespace-pre-wrap break-words font-mono text-xs block mt-1">
        {ans?.student_answer ? htmlToPlainText(ans.student_answer) : '未作答'}
      </span>
    </span>
  )}
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

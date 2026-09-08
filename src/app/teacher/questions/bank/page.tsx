'use client';

import { apiFetch } from '@/lib/api-fetch';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Filter, Edit2, Trash2,
  BookOpen, ChevronLeft, ChevronRight, X, Lock, Unlock, CheckSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface Question {
  id: number;
  course_id: number;
  knowledge_point_id: number;
  question_type: string;
  difficulty: string;
  content: string;
  options: Record<string, string>;
  answer: string;
  analysis: string;
  default_score: number;
  source: string;
  locked?: boolean;
  min_chars?: number | null;
  max_chars?: number | null;
  min_select?: number | null;
  max_select?: number | null;
  accuracy?: number | null;
  accuracy_attempts?: number;
  course?: { id: number; name: string; short_name: string };
  knowledge_point?: { id: number; name: string };
}

const questionTypeLabels: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  multi_choice: '多选题',
  judgment: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
  essay: '论述题',
  programming: '编程题',
  code: '编程题',
  attachment: '实验题',
};

const displayQuestionTypes = [
  { key: 'single_choice', label: '单选题' },
  { key: 'multi_choice', label: '多选题' },
  { key: 'judgment', label: '判断题' },
  { key: 'fill_blank', label: '填空题' },
  { key: 'short_answer', label: '简答题' },
  { key: 'programming', label: '编程题' },
  { key: 'attachment', label: '实验题' },
];

// Map from display key to DB-compatible values for filtering
const filterTypeMap: Record<string, string[]> = {
  single_choice: ['single_choice'],
  multi_choice: ['multi_choice'],
  judgment: ['judgment'],
  fill_blank: ['fill_blank'],
  short_answer: ['short_answer'],
  programming: ['programming', 'code'],
  attachment: ['attachment'],
};

const difficultyLabels: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const difficultyColors: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-rose-100 text-rose-700',
};

function accuracyColor(acc: number | null | undefined): string {
  if (acc == null) return 'bg-slate-100 text-slate-500';
  if (acc >= 80) return 'bg-emerald-100 text-emerald-700';
  if (acc >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

// 主观/客观判定：字数限制对主观题，选择数量限制对多选题
const SUBJECTIVE_TYPES = new Set(['short_answer', 'essay', 'programming', 'code']);
const isSubjectiveType = (t: string) => SUBJECTIVE_TYPES.has(t);
const isMultiChoiceType = (t: string) => t === 'multi_choice' || t === 'multiple_choice';

// 将可空数值表字段规范为表单字符串（null/undefined → ''）
function numToForm(v?: number | null): string {
  return v == null ? '' : String(v);
}

// Convert DB array format ['A内容','B内容'] to form object {A:'...', B:'...'}
function arrayToOptionsObj(arr: string[]): Record<string, string> {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const obj: Record<string, string> = {};
  arr.forEach((v, i) => { obj[letters[i] || String(i)] = v; });
  return obj;
}

// Convert form object {A:'...', B:'...'} to DB array ['A内容','B内容']
function optionsObjToArray(obj: Record<string, string>): string[] {
  return Object.values(obj).filter(v => v && v.trim() !== '');
}

// ── 实验题/附件题：实验报告模板字段 ──
const EXPERIMENT_TEMPLATE_FIELDS: Array<{ key: string; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'experiment_name', label: '实验名称', placeholder: '如：测量自由落体加速度' },
  { key: 'materials', label: '实验材料及器材', placeholder: '列举所需的材料与仪器', multiline: true },
  { key: 'purpose', label: '实验目的', placeholder: '说明本实验要验证或探究的目标', multiline: true },
  { key: 'steps', label: '实验步骤', placeholder: '分步描述操作过程', multiline: true },
  { key: 'data_record', label: '数据记录', placeholder: '记录观测数据', multiline: true },
  { key: 'result_analysis', label: '结果与分析', placeholder: '数据处理、误差分析与结果讨论', multiline: true },
  { key: 'conclusion', label: '实验结论', placeholder: '得出的最终结论', multiline: true },
];

function defaultExperimentTemplate(): Record<string, string> {
  return { experiment_name: '', materials: '', purpose: '', steps: '', data_record: '', result_analysis: '', conclusion: '' };
}

// 从题目 options 中解析实验报告模板（options 结构为 { template: { ... } }，兼容已存在字符串 JSON）
function extractTemplateFromQuestion(q: Question): Record<string, string> {
  let opts: unknown = q.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = undefined; } }
  const t = (opts as { template?: Record<string, string> } | undefined)?.template;
  return { ...defaultExperimentTemplate(), ...(t || {}) };
}

export default function QuestionBankPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [courses, setCourses] = useState<{ id: number; name: string; short_name: string }[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<{ id: number; name: string }[]>([]);

  // Filters
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterKp, setFilterKp] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [searchText, setSearchText] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    course_id: '',
    knowledge_point_id: '',
    question_type: 'single_choice',
    difficulty: 'medium',
    content: '',
    options: { A: '', B: '', C: '', D: '' } as Record<string, string>,
    answer: '',
    analysis: '',
    default_score: '10',
    source: 'manual',
    min_chars: '',
    max_chars: '',
    min_select: '',
    max_select: '',
    experiment_template: defaultExperimentTemplate(),
  });

  const fetchQuestions = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (filterCourse && filterCourse !== 'all') params.set('course_id', filterCourse);
    if (filterKp && filterKp !== 'all') params.set('knowledge_point_id', filterKp);
    if (filterType && filterType !== 'all') params.set('question_type', filterType);
    if (filterDifficulty && filterDifficulty !== 'all') params.set('difficulty', filterDifficulty);

    const res = await apiFetch(`/api/teacher/questions/bank?${params}`);
    const json = await res.json();
    if (json.success) {
      setQuestions(json.data.questions);
      setTotal(json.data.total);
      setCourses(json.data.courses);
      setKnowledgePoints(json.data.knowledgePoints);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, [page, filterCourse, filterKp, filterType, filterDifficulty]);

  const handleCourseFilterChange = async (val: string) => {
    setFilterCourse(val);
    setFilterKp('all');
    setPage(1);
    if (val && val !== 'all') {
      const res = await apiFetch(`/api/teacher/questions/bank?course_id=${val}&page=1&pageSize=1`);
      const json = await res.json();
      if (json.success) setKnowledgePoints(json.data.knowledgePoints);
    }
  };

  const openCreate = () => {
    setEditingQuestion(null);
    setFormData({
      course_id: filterCourse !== 'all' ? filterCourse : '',
      knowledge_point_id: '',
      question_type: 'single_choice',
      difficulty: 'medium',
      content: '',
      options: { A: '', B: '', C: '', D: '' },
      answer: '',
      analysis: '',
      default_score: '10',
      source: 'manual',
      min_chars: '',
      max_chars: '',
      min_select: '',
      max_select: '',
      experiment_template: defaultExperimentTemplate(),
    });
    setDialogOpen(true);
  };

  const openEdit = (q: Question) => {
    setEditingQuestion(q);
    setFormData({
      course_id: String(q.course_id),
      knowledge_point_id: String(q.knowledge_point_id),
      question_type: q.question_type,
      difficulty: q.difficulty,
      content: q.content,
      options: q.options && Array.isArray(q.options)
        ? arrayToOptionsObj(q.options as unknown as string[])
        : { A: '', B: '', C: '', D: '' },
      answer: q.answer,
      analysis: q.analysis || '',
      default_score: String(q.default_score),
      source: q.source || 'manual',
      min_chars: numToForm(q.min_chars),
      max_chars: numToForm(q.max_chars),
      min_select: numToForm(q.min_select),
      max_select: numToForm(q.max_select),
      experiment_template: extractTemplateFromQuestion(q),
    });
    setDialogOpen(true);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loadKnowledgePoints = async (courseId: string) => {
    if (!courseId) { setKnowledgePoints([]); return; }
    const res = await apiFetch(`/api/teacher/questions/bank?course_id=${courseId}&page=1&pageSize=1`);
    const json = await res.json();
    if (json.success) setKnowledgePoints(json.data.knowledgePoints);
  };

  const handleSave = async () => {
    setSaveError('');
    const courseId = parseInt(formData.course_id);
    const kpId = parseInt(formData.knowledge_point_id);

    if (!courseId) { setSaveError('请选择课程'); return; }
    if (!kpId) { setSaveError('请选择知识点'); return; }
    if (!formData.content.trim()) { setSaveError('请输入题目内容'); return; }
    const isAttachment = formData.question_type === 'attachment';
    if (!isAttachment && !formData.answer.trim()) { setSaveError('请输入答案'); return; }

    setSaving(true);
    const payload: Record<string, any> = {
      course_id: courseId,
      knowledge_point_id: kpId,
      question_type: formData.question_type,
      difficulty: formData.difficulty,
      content: formData.content.trim(),
      // 实验题：将实验模板存入 question.options = { template: {...} }
      options: isAttachment
        ? { template: Object.fromEntries(EXPERIMENT_TEMPLATE_FIELDS.map(({ key }) => [key, (formData.experiment_template[key] || '').trim()])) }
        : optionsObjToArray(formData.options),
      answer: formData.answer ? formData.answer.trim() : '',
      analysis: formData.analysis.trim(),
      default_score: parseInt(formData.default_score) || 10,
      source: formData.source,
      min_chars: isAttachment ? null : (formData.min_chars === '' ? null : parseInt(formData.min_chars) || null),
      max_chars: isAttachment ? null : (formData.max_chars === '' ? null : parseInt(formData.max_chars) || null),
      min_select: formData.min_select === '' ? null : parseInt(formData.min_select) || null,
      max_select: formData.max_select === '' ? null : parseInt(formData.max_select) || null,
    };

    const url = '/api/teacher/questions/bank';
    const method = editingQuestion ? 'PUT' : 'POST';

    if (editingQuestion) {
      payload.id = editingQuestion.id;
    }

    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        setSaveError('');
        fetchQuestions();
      } else {
        setSaveError(json.error || '保存失败，请重试');
      }
    } catch {
      setSaveError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这道题目吗？')) return;
    const res = await apiFetch(`/api/teacher/questions/bank?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) fetchQuestions();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const pageIds = questions.map(q => q.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));
    setSelectedIds(prev => allSelected
      ? prev.filter(id => !pageIds.includes(id))
      : [...new Set([...prev, ...pageIds])]);
  };

  // 批量操作（统一难度 / 锁定解锁），调用 /api/teacher/questions/batch
  const runBatch = async (op: 'set_difficulty' | 'set_locked', difficulty?: string, locked?: boolean) => {
    if (selectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      const res = await apiFetch('/api/teacher/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, op, difficulty, locked }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedIds([]);
        fetchQuestions();
      } else {
        alert(json.error || '批量操作失败');
      }
    } catch {
      alert('网络错误，请重试');
    } finally {
      setBatchBusy(false);
    }
  };

  // 单题锁定/解锁（复用批量接口）
  const toggleLockSingle = async (q: Question) => {
    setBatchBusy(true);
    try {
      const res = await apiFetch('/api/teacher/questions/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [q.id], op: 'set_locked', locked: !q.locked }),
      });
      const json = await res.json();
      if (json.success) fetchQuestions();
    } catch {
      alert('操作失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const allOnPageSelected = questions.length > 0 && questions.every(q => selectedIds.includes(q.id));

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索题目内容..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCourse} onValueChange={handleCourseFilterChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="全部课程" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部课程</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterKp} onValueChange={(v) => { setFilterKp(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="全部知识点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部知识点</SelectItem>
              {knowledgePoints.map((kp) => (
                <SelectItem key={kp.id} value={String(kp.id)}>{kp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部题型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部题型</SelectItem>
              {displayQuestionTypes.map(t => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={(v) => { setFilterDifficulty(v); setPage(1); }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="全部难度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部难度</SelectItem>
              {Object.entries(difficultyLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="gap-2 ml-auto shrink-0">
            <Plus className="w-4 h-4" />
            新增题目
          </Button>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={toggleSelectAll} className="gap-1">
          <CheckSquare className="w-4 h-4" />
          {allOnPageSelected ? '取消本页全选' : '本页全选'}
        </Button>
        <span className="text-sm text-slate-500">
          已选 <span className="font-semibold text-indigo-600">{selectedIds.length}</span> 题
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={selectedIds.length === 0 || batchBusy} onClick={() => runBatch('set_locked', undefined, true)} className="gap-1">
          <Lock className="w-4 h-4" /> 批量锁定
        </Button>
        <Button variant="outline" size="sm" disabled={selectedIds.length === 0 || batchBusy} onClick={() => runBatch('set_locked', undefined, false)} className="gap-1">
          <Unlock className="w-4 h-4" /> 批量解锁
        </Button>
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-500">难度 →</span>
          {Object.entries(difficultyLabels).map(([k, v]) => (
            <Button key={k} variant="outline" size="sm" disabled={selectedIds.length === 0 || batchBusy} onClick={() => runBatch('set_difficulty', k)}>
              {v}
            </Button>
          ))}
        </div>
      </div>

      {/* Question List */}
      <div className="bg-white rounded-xl border divide-y">
        {loading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">还没有题目</p>
            <p className="text-sm text-slate-400 mt-1">去&ldquo;AI 出题&rdquo;用大模型快速生成高质量题库</p>
          </div>
        ) : (
          questions
            .filter((q) => !searchText || q.content.includes(searchText))
            .map((q) => (
              <div key={q.id} className={`p-4 transition-colors ${selectedIds.includes(q.id) ? 'bg-indigo-50/40 hover:bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Checkbox
                      className="mt-1"
                      data-state={selectedIds.includes(q.id) ? 'checked' : 'unchecked'}
                      checked={selectedIds.includes(q.id)}
                      onCheckedChange={() => toggleSelect(q.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {questionTypeLabels[q.question_type] || '其他题型'}
                        </Badge>
                        <Badge className={`text-xs ${difficultyColors[q.difficulty] || ''}`}>
                          {difficultyLabels[q.difficulty] || q.difficulty}
                        </Badge>
                        <span className="text-xs text-slate-400">{q.default_score}分</span>
                        <Badge className={`text-xs ${accuracyColor(q.accuracy)}`}>
                          正确率 {q.accuracy != null ? `${q.accuracy}%` : '—'}{q.accuracy_attempts ? `(${q.accuracy_attempts}次)` : ''}
                        </Badge>
                        {q.locked && (
                          <Badge className="text-xs bg-slate-700 text-white gap-1">
                            <Lock className="w-3 h-3" /> 已锁定
                          </Badge>
                        )}
                        {q.course && (
                          <span className="text-xs text-slate-500">{q.course.short_name || q.course.name}</span>
                        )}
                        {q.knowledge_point && (
                          <span className="text-xs text-teal-600">{q.knowledge_point.name}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-800 line-clamp-2">{q.content}</p>
                      <p className="text-xs text-slate-400 mt-1">答案：{q.answer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={batchBusy} onClick={() => toggleLockSingle(q)} title={q.locked ? '解锁' : '锁定'}>
                      {q.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(q.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            第 {page} 页，共 {totalPages} 页
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? '编辑题目' : '新增题目'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>课程 <span className="text-red-500">*</span></Label>
                <Select value={formData.course_id} onValueChange={(v) => { setFormData({ ...formData, course_id: v, knowledge_point_id: '' }); loadKnowledgePoints(v); }}>
                  <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>知识点 <span className="text-red-500">*</span></Label>
                <Select value={formData.knowledge_point_id} onValueChange={(v) => setFormData({ ...formData, knowledge_point_id: v })}>
                  <SelectTrigger><SelectValue placeholder="先选课程" /></SelectTrigger>
                  <SelectContent>
                    {knowledgePoints.map((kp) => (
                      <SelectItem key={kp.id} value={String(kp.id)}>{kp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>题型</Label>
                <Select value={formData.question_type} onValueChange={(v) => setFormData({ ...formData, question_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {displayQuestionTypes.map(t => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>难度</Label>
                <Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(difficultyLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>默认分值</Label>
                <Input
                  type="number"
                  value={formData.default_score}
                  onChange={(e) => setFormData({ ...formData, default_score: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>题目内容</Label>
              <Textarea
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="输入题目内容..."
              />
            </div>
            {['single_choice', 'multi_choice', 'choice_single', 'choice_multiple'].includes(formData.question_type) && (
              <div className="grid grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D'].map((key) => (
                  <div key={key}>
                    <Label>选项 {key}</Label>
                    <Input
                      value={formData.options[key as keyof typeof formData.options] || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        options: { ...formData.options, [key]: e.target.value },
                      })}
                      placeholder={`选项 ${key} 内容`}
                    />
                  </div>
                ))}
              </div>
            )}
            {isSubjectiveType(formData.question_type) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>最低字数（选填，留空不限）</Label>
                  <Input
                    type="number" min={0}
                    value={formData.min_chars}
                    onChange={(e) => setFormData({ ...formData, min_chars: e.target.value })}
                    placeholder="如 50"
                  />
                </div>
                <div>
                  <Label>最高字数（选填，留空不限）</Label>
                  <Input
                    type="number" min={0}
                    value={formData.max_chars}
                    onChange={(e) => setFormData({ ...formData, max_chars: e.target.value })}
                    placeholder="如 300"
                  />
                </div>
              </div>
            )}
            {isMultiChoiceType(formData.question_type) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>最少选择项数（选填，留空不限）</Label>
                  <Input
                    type="number" min={0}
                    value={formData.min_select}
                    onChange={(e) => setFormData({ ...formData, min_select: e.target.value })}
                    placeholder="如 2"
                  />
                </div>
                <div>
                  <Label>最多选择项数（选填，留空不限）</Label>
                  <Input
                    type="number" min={0}
                    value={formData.max_select}
                    onChange={(e) => setFormData({ ...formData, max_select: e.target.value })}
                    placeholder="如 3"
                  />
                </div>
              </div>
            )}
            {formData.question_type === 'attachment' && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
                <p className="text-xs font-medium text-indigo-700">
                  实验报告模板（选填，学生端将按此字段作答，AI 依据填写情况与附件批改）
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {EXPERIMENT_TEMPLATE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      {f.multiline ? (
                        <Textarea
                          rows={2}
                          value={formData.experiment_template[f.key] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            experiment_template: { ...formData.experiment_template, [f.key]: e.target.value },
                          })}
                          placeholder={f.placeholder}
                        />
                      ) : (
                        <Input
                          value={formData.experiment_template[f.key] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            experiment_template: { ...formData.experiment_template, [f.key]: e.target.value },
                          })}
                          placeholder={f.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>答案</Label>
              <Input
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                placeholder={formData.question_type === 'attachment' ? '可填写实验评分要点或标准（选填，留空则按通用标准）' : '如：A 或 ABC'}
              />
            </div>
            <div>
              <Label>解析（可选）</Label>
              <Textarea
                rows={3}
                value={formData.analysis}
                onChange={(e) => setFormData({ ...formData, analysis: e.target.value })}
                placeholder="题目解析..."
              />
            </div>
            {saveError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{saveError}</div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setDialogOpen(false); setSaveError(''); }}>取消</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : editingQuestion ? '保存修改' : '创建题目'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUESTION_TYPE_LABELS } from '@/lib/labels';
import { SlidersHorizontal, Plus, Pencil, Trash2, Copy, Loader2, Info, Power } from 'lucide-react';

interface GradeLevel { min: number; label: string }
interface RuleItem {
  id: number;
  name: string;
  course_id: number | null;
  course_name: string;
  question_type: string | null;
  scoring_criteria: string | null;
  deduction_rules: string | null;
  comment_style: string | null;
  grade_levels: GradeLevel[] | null;
  is_active: boolean | null;
}
interface CourseItem { id: number; name: string }

const DEFAULT_LEVELS: GradeLevel[] = [
  { min: 90, label: '优秀' }, { min: 75, label: '良好' }, { min: 60, label: '及格' }, { min: 0, label: '不及格' },
];
const COMMENT_STYLES = ['严谨专业', '鼓励式', '简洁明了'];

interface FormState {
  id?: number;
  name: string;
  course_id: string; // '' = 全部课程
  question_type: string; // '' = 全部题型
  scoring_criteria: string;
  deduction_rules: string;
  comment_style: string;
  levels: GradeLevel[];
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '', course_id: '', question_type: '', scoring_criteria: '', deduction_rules: '', comment_style: '严谨专业', levels: DEFAULT_LEVELS.map((l) => ({ ...l })), is_active: true,
};

export default function GradingConfigPage() {
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/teacher/grading-config').then((r) => r.json()),
        apiFetch('/api/teacher/courses').then((r) => r.json()),
      ]);
      if (r1.success) setRules(r1.data || []);
      if (r2.success) setCourses((r2.data?.courses || r2.data || []).map?.call ? r2.data?.courses || r2.data : []);
    } catch { /* 忽略 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (r?: RuleItem) => {
    if (r) {
      setForm({
        id: r.id, name: r.name,
        course_id: r.course_id ? String(r.course_id) : '',
        question_type: r.question_type || '',
        scoring_criteria: r.scoring_criteria || '',
        deduction_rules: r.deduction_rules || '',
        comment_style: r.comment_style || '严谨专业',
        levels: (r.grade_levels?.length ? r.grade_levels : DEFAULT_LEVELS).map((l) => ({ ...l })),
        is_active: r.is_active !== false,
      });
    } else {
      setForm({ ...EMPTY_FORM, levels: DEFAULT_LEVELS.map((l) => ({ ...l })) });
    }
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('请填写规则名称'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        course_id: form.course_id ? Number(form.course_id) : null,
        question_type: form.question_type || null,
        scoring_criteria: form.scoring_criteria,
        deduction_rules: form.deduction_rules,
        comment_style: form.comment_style,
        grade_levels: [...form.levels].sort((a, b) => b.min - a.min),
        is_active: form.is_active,
      };
      const res = await apiFetch(form.id ? `/api/teacher/grading-config/${form.id}` : '/api/teacher/grading-config', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(form.id ? '规则已更新，批改立即按新规则执行' : '规则已创建并立即生效');
        setFormOpen(false);
        load();
      } else {
        toast.error(d.error || '保存失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (r: RuleItem) => {
    try {
      const res = await apiFetch(`/api/teacher/grading-config/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(d.data?.is_active ? '规则已启用，批改立即生效' : '规则已停用');
        load();
      } else toast.error(d.error || '操作失败');
    } catch { toast.error('网络错误'); }
  };

  const duplicate = (r: RuleItem) => {
    setForm({
      id: undefined, name: `${r.name}（副本）`,
      course_id: r.course_id ? String(r.course_id) : '',
      question_type: r.question_type || '',
      scoring_criteria: r.scoring_criteria || '',
      deduction_rules: r.deduction_rules || '',
      comment_style: r.comment_style || '严谨专业',
      levels: (r.grade_levels?.length ? r.grade_levels : DEFAULT_LEVELS).map((l) => ({ ...l })),
      is_active: false,
    });
    setFormOpen(true);
    toast.info('已复制为新规则（默认停用，编辑后启用）');
  };

  const remove = async (id: number) => {
    try {
      const res = await apiFetch(`/api/teacher/grading-config/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) { toast.success('已删除'); setRules((prev) => prev.filter((r) => r.id !== id)); }
      else toast.error(d.error || '删除失败');
    } catch { toast.error('网络错误'); }
  };

  const scopeBadge = (r: RuleItem) => {
    const parts: string[] = [];
    parts.push(r.course_id ? (r.course_name || `课程${r.course_id}`) : '全部课程');
    parts.push(r.question_type ? (QUESTION_TYPE_LABELS[r.question_type] || r.question_type) : '全部题型');
    return parts;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">批改规则</h1>
            <p className="page-subtitle">自定义 AI 批改的评分标准、扣分规则、评语风格与成绩等级，修改后立即生效</p>
          </div>
        </div>
        <Button onClick={() => openForm()} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
          <Plus className="w-4 h-4" /> 新建规则
        </Button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          匹配规则：布置作业的课程与题型与规则一致时自动应用（越具体的规则优先，如「某课程+简答题」优先于「全部课程」）。
          同一规则可在不同作业间复用，无需逐作业设置。配置修改保存后，下一次 AI 批改立即按新规则执行。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <SlidersHorizontal className="w-12 h-12" />
          <p className="text-sm mt-3">还没有批改规则</p>
          <p className="text-xs mt-1 opacity-70">AI 将按默认标准批改。创建规则后可自定义评分标准与评语风格</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <Card key={r.id} className={`border-0 shadow-sm ${r.is_active ? '' : 'opacity-60'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                      {scopeBadge(r).map((p) => <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>)}
                      <Badge className={`text-xs border-0 ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Power className="w-3 h-3 mr-0.5" />{r.is_active ? '启用中' : '已停用'}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                      {r.scoring_criteria && <p className="truncate">评分标准：{r.scoring_criteria}</p>}
                      {r.deduction_rules && <p className="truncate">扣分规则：{r.deduction_rules}</p>}
                      {r.comment_style && <p>评语风格：{r.comment_style}</p>}
                      {r.grade_levels && r.grade_levels.length > 0 && (
                        <p>等级：{r.grade_levels.map((g) => `${g.label}≥${g.min}`).join(' / ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => toggleActive(r)} title={r.is_active ? '停用' : '启用'}>
                      <Power className={`w-3.5 h-3.5 ${r.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openForm(r)} title="编辑"><Pencil className="w-3.5 h-3.5 text-slate-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => duplicate(r)} title="复制复用"><Copy className="w-3.5 h-3.5 text-slate-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => remove(r.id)} title="删除"><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 表单弹层 */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800">{form.id ? '编辑批改规则' : '新建批改规则'}</h3>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">规则名称 <span className="text-red-500">*</span></label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="如：Python 课程简答题严格标准" className="text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">适用课程</label>
                <Select value={form.course_id || 'all'} onValueChange={(v) => setForm((p) => ({ ...p, course_id: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部课程</SelectItem>
                    {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">适用题型</label>
                <Select value={form.question_type || 'all'} onValueChange={(v) => setForm((p) => ({ ...p, question_type: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部题型</SelectItem>
                    {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">评分标准（告诉 AI 按什么维度和权重给分）</label>
              <textarea
                value={form.scoring_criteria}
                onChange={(e) => setForm((p) => ({ ...p, scoring_criteria: e.target.value }))}
                placeholder={'默认：按知识准确性/逻辑完整性/表达清晰度/拓展性四个维度评分。\n可自定义，如：代码题重点考查功能正确性(70%)与代码规范(30%)，功能正确即不低于 60%。'}
                rows={4}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">扣分规则</label>
              <textarea
                value={form.deduction_rules}
                onChange={(e) => setForm((p) => ({ ...p, deduction_rules: e.target.value }))}
                placeholder={'如：每出现一处概念性错误扣 2 分；未答完整按完成度扣分；错别字不扣分；抄袭雷同直接 0 分。'}
                rows={3}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">评语风格</label>
              <div className="flex gap-2">
                {COMMENT_STYLES.map((st) => (
                  <button
                    key={st}
                    onClick={() => setForm((p) => ({ ...p, comment_style: st }))}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${form.comment_style === st ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >{st}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">成绩等级划分（按得分百分比，下限需从高到低且最低为 0）</label>
              <div className="space-y-1.5">
                {form.levels.map((lv, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="number" min={0} max={100} value={lv.min}
                      onChange={(e) => {
                        const min = Number(e.target.value);
                        setForm((p) => ({ ...p, levels: p.levels.map((l, j) => (j === i ? { ...l, min } : l)) }));
                      }}
                      className="w-20 text-sm"
                    />
                    <span className="text-xs text-slate-400">分以上 →</span>
                    <Input
                      value={lv.label}
                      onChange={(e) => setForm((p) => ({ ...p, levels: p.levels.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)) }))}
                      className="flex-1 text-sm"
                      placeholder="等级名称"
                    />
                    {form.levels.length > 1 && (
                      <button onClick={() => setForm((p) => ({ ...p, levels: p.levels.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-500 text-lg leading-none px-1">×</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setForm((p) => ({ ...p, levels: [...p.levels, { min: 0, label: '' }] }))}
                className="text-xs text-violet-600 hover:text-violet-700 mt-1.5"
              >+ 添加等级</button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} className="accent-violet-600" />
                立即启用（启用后 AI 批改按此规则执行）
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
                <Button className="bg-violet-600 hover:bg-violet-700" disabled={saving} onClick={save}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存规则'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

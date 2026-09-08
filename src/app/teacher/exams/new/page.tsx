'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { questionTypeLabel, difficultyLabel } from '@/lib/labels';
import { Plus, X, RefreshCw, Briefcase } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

interface Course { id: number; name: string; class_id: number | null; }
interface Cls { id: number; name: string; }
interface QBQuestion { id: number; question_type: string; difficulty: string; content: string; options?: Array<{ key: string; text: string }>; default_score?: number; knowledge_point_name?: string; }

// 已选题按题型分区：客观题在上、主观题在下
const OBJ_TYPES = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment', 'fill_blank'];
const isSubjective = (t: string) => !OBJ_TYPES.includes(t);

/** 客观题选项预览：「A. … B. …」方便选题时直接核对答案项 */
const OBJ_PREVIEW = ['single_choice', 'multiple_choice', 'multi_choice', 'judgment'];
const optionPreview = (q: QBQuestion, max = 4) =>
  OBJ_PREVIEW.includes(q.question_type) && q.options?.length
    ? q.options.slice(0, max).map((o) => `${o.key}. ${o.text}`).join('　')
    : '';

export default function NewExamPage() {
  const { user, loading: authLoading } = useCurrentUser();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [bank, setBank] = useState<QBQuestion[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selected, setSelected] = useState<QBQuestion[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', exam_type: 'unit', course_id: 0,
    class_ids: [] as number[], time_mode: 'fixed',
    start_at: '', end_at: '', duration: 60, auto_submit: true, allow_resubmit: false,
    publish_mode: 'manual', publish_at: '', randomized: true,
    require_face: true, face_strategy: 'once', fullscreen_locked: true,
    max_switch: 3, disable_copy: true, disable_paste: true, disable_devtools: true,
    disable_zoom: true, watermark: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'teacher') { window.location.href = '/'; return; }
    apiFetch('/api/teacher/classes').then((r) => r.json()).then((j) => {
      setCourses(j.courses || []);
      setClasses(j.classes || []);
      if ((j.courses || []).length) setForm((f) => ({ ...f, course_id: j.courses[0].id }));
      // 默认选中该课程对应班级
      if (j.courses?.[0]?.class_id) setForm((f) => ({ ...f, class_ids: [j.courses[0].class_id] }));
    });
  }, [user, authLoading]);

  const loadBank = async () => {
    if (!form.course_id) return;
    setBankLoading(true);
    try {
      const res = await apiFetch(`/api/teacher/exams/question-bank?course_id=${form.course_id}`);
      const j = await res.json();
      setBank(j.questions || []);
    } catch { setBank([]); }
    setBankLoading(false);
  };

  useEffect(() => { if (form.course_id) loadBank(); }, [form.course_id]);

  const toggleSelect = (q: QBQuestion) => {
    setSelected((prev) => prev.some((x) => x.id === q.id) ? prev.filter((x) => x.id !== q.id) : [...prev, q]);
  };

  const addBank = (q: QBQuestion) => setSelected((prev) => prev.some((x) => x.id === q.id) ? prev : [...prev, q]);
  const removeQ = (id: number) => setSelected((prev) => prev.filter((x) => x.id !== id));

  const totalScore = useMemo(() => 100, []);

  // 已选题分区：客观题在上、主观题在下（连续编号）
  const selectedSections = useMemo(() => {
    const obj = selected.filter((q) => !isSubjective(q.question_type));
    const sub = selected.filter((q) => isSubjective(q.question_type));
    const res: Array<{ key: string; title: string; items: QBQuestion[] }> = [];
    if (obj.length) res.push({ key: 'objective', title: '客观题', items: obj });
    if (sub.length) res.push({ key: 'subjective', title: '主观题', items: sub });
    return res;
  }, [selected]);
  const selectedNum = useMemo(() => {
    const map: Record<number, number> = {};
    let n = 1;
    for (const s of selectedSections) for (const it of s.items) map[it.id] = n++;
    return map;
  }, [selectedSections]);

  const submit = async () => {
    if (!form.title.trim()) return toast.error('请填写考试名称');
    if (!form.course_id) return toast.error('请选择课程');
    if (selected.length === 0) return toast.error('请至少选择 1 道题目');
    if (classes.filter((c) => form.class_ids.includes(c.id)).length === 0) return toast.error('请选择报考班级');
    if (!form.start_at) return toast.error('请设置开考时间');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/teacher/exams', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title, description: form.description, exam_type: form.exam_type,
          course_id: form.course_id, class_ids: form.class_ids,
          time_mode: form.time_mode, start_at: form.start_at, end_at: form.end_at || null,
          duration: Number(form.duration), auto_submit: form.auto_submit, allow_resubmit: form.allow_resubmit,
          publish_mode: form.publish_mode, publish_at: form.publish_at || null,
          question_ids: selected.map((q) => q.id), randomized: form.randomized,
          proctor_config: {
            require_face: form.require_face, face_strategy: form.face_strategy,
            fullscreen_locked: form.fullscreen_locked, max_switch: Number(form.max_switch),
            disable_copy: form.disable_copy, disable_paste: form.disable_paste,
            disable_devtools: form.disable_devtools, disable_zoom: form.disable_zoom,
            watermark: form.watermark,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) return toast.error(j.error || '创建失败');
      toast.success('考试草稿已创建');
      router.push('/teacher/exams');
    } catch { toast.error('网络异常'); }
    setSubmitting(false);
  };

  const defaultStart = () => {
    const d = new Date(Date.now() + 3600 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <SetActiveNav href="/teacher/exams" />
      <div className="flex items-center gap-3">
        <BackButton to="/teacher/exams" />
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-violet-700 to-teal-600 bg-clip-text text-transparent">布置考试</h1>
          <p className="text-sm text-slate-500">配置考试信息 · 从题库选题 · 设定防作弊策略</p>
        </div>
      </div>

      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-4 h-4 text-violet-500" />考试信息</CardTitle></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="text-sm text-slate-500 block mb-1.5">考试名称</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：Python 程序设计 · 期中考试" /></div>
          <div><label className="text-sm text-slate-500 block mb-1.5">课程</label>
            <Select value={String(form.course_id)} onValueChange={(v) => { setForm({ ...form, course_id: Number(v) }); setSelected([]); }}>
              <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><label className="text-sm text-slate-500 block mb-1.5">考试类型</label>
            <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quiz">随堂测验</SelectItem>
                <SelectItem value="unit">单元测验</SelectItem>
                <SelectItem value="midterm">期中考试</SelectItem>
                <SelectItem value="final">期末考试</SelectItem>
                <SelectItem value="makeup">补考</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><label className="text-sm text-slate-500 block mb-1.5">考试说明（可选）</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="对考生的考试要求、范围说明等" rows={2} /></div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2">时间与发布</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox id="tm-fixed" checked={form.time_mode === 'fixed'} onCheckedChange={(v) => setForm({ ...form, time_mode: v ? 'fixed' : 'window' })} />
              <label htmlFor="tm-fixed" className="text-sm text-slate-700">定时开考 + 固定时长</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="tm-window" checked={form.time_mode === 'window'} onCheckedChange={(v) => setForm({ ...form, time_mode: v ? 'window' : 'fixed' })} />
              <label htmlFor="tm-window" className="text-sm text-slate-700">开放窗口 + 个人计时</label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="text-sm text-slate-500 block mb-1.5">{form.time_mode === 'fixed' ? '开考时间' : '窗口开始时间'}</label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
            {form.time_mode === 'window' && <div><label className="text-sm text-slate-500 block mb-1.5">窗口结束时间</label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>}
            <div><label className="text-sm text-slate-500 block mb-1.5">作答时长（分钟）</label><Input type="number" min={5} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-3 pt-5">
              <Switch id="auto" checked={form.auto_submit} onCheckedChange={(v) => setForm({ ...form, auto_submit: v })} />
              <label htmlFor="auto" className="text-sm text-slate-600">到时自动交卷</label>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <Switch id="rs" checked={form.allow_resubmit} onCheckedChange={(v) => setForm({ ...form, allow_resubmit: v })} />
              <label htmlFor="rs" className="text-sm text-slate-600">允许补交</label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="text-sm text-slate-500 block mb-1.5">成绩发布方式</label>
              <Select value={form.publish_mode} onValueChange={(v) => setForm({ ...form, publish_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">手动公布</SelectItem>
                  <SelectItem value="auto">交卷后自动公布（客观题）</SelectItem>
                  <SelectItem value="at_time">按时间公布</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.publish_mode === 'at_time' && <div><label className="text-sm text-slate-500 block mb-1.5">公布时间</label><Input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} /></div>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">考试题目 <Badge className="bg-violet-100 text-violet-700">{selected.length} 题 · 满分 {totalScore} 分</Badge></CardTitle>
          <Button variant="outline" size="sm" onClick={loadBank} disabled={!form.course_id}><RefreshCw className="w-3.5 h-3.5 mr-1" />刷新题库</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm text-slate-500 mb-2">① 从题库勾选题目</p>
            <div className="max-h-80 overflow-y-auto border rounded-xl divide-y">
              {bankLoading ? <div className="p-6 text-center text-slate-400">加载题库中…</div> :
               bank.length === 0 ? <div className="p-6 text-center text-slate-400">该课程暂无可用题目（需先在题库管理添加题目）</div> :
               bank.map((q) => (
                <div key={q.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                  <Checkbox id={`bank-${q.id}`} checked={selected.some((x) => x.id === q.id)} onCheckedChange={() => toggleSelect(q)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-1">{q.content}</p>
                    {optionPreview(q) && <p className="text-xs text-slate-400 truncate mt-0.5" title={optionPreview(q)}>选项：{optionPreview(q)}</p>}
                    <div className="flex gap-2 mt-0.5"><Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge><Badge className="text-xs bg-amber-50 text-amber-600">{difficultyLabel(q.difficulty)}</Badge>{q.knowledge_point_name && <span className="text-xs text-slate-400">{q.knowledge_point_name}</span>}</div>
                  </div>
                  {!selected.some((x) => x.id === q.id) && <Button variant="ghost" size="icon" title="加入" onClick={() => addBank(q)}><Plus className="w-4 h-4 text-teal-600" /></Button>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-2">② 已选题目（共 {selected.length} 题，满分自动归一化至 100 分）{form.randomized && '· 已开启题目&选项乱序（防邻座）'}</p>
            {selected.length === 0 ? <div className="text-center text-slate-400 border border-dashed rounded-xl py-8">尚未选题</div> : (
              <div className="space-y-4">
                {selectedSections.map((sec) => (
                  <div key={sec.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-1 h-4 rounded-full ${sec.key === 'objective' ? 'bg-indigo-500' : 'bg-teal-500'}`} />
                      <span className="text-xs font-semibold text-slate-600">{sec.title}</span>
                      <span className="text-xs text-slate-400">{sec.items.length}题</span>
                    </div>
                    <div className="space-y-2">
                      {sec.items.map((q) => (
                        <div key={q.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                          <span className={`w-6 h-6 rounded-md text-white text-xs font-bold flex items-center justify-center shrink-0 ${sec.key === 'objective' ? 'bg-gradient-to-br from-indigo-500 to-violet-500' : 'bg-gradient-to-br from-teal-500 to-emerald-500'}`}>{selectedNum[q.id]}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm line-clamp-1">{q.content}</p>
                            {optionPreview(q) && <p className="text-xs text-slate-400 truncate mt-0.5" title={optionPreview(q)}>选项：{optionPreview(q)}</p>}
                            <div className="flex gap-2 mt-0.5"><Badge className="text-xs bg-teal-50 text-teal-600">{questionTypeLabel(q.question_type)}</Badge><Badge className="text-xs bg-amber-50 text-amber-600">{difficultyLabel(q.difficulty)}</Badge></div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeQ(q.id)}><X className="w-4 h-4 text-red-400" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">防作弊与开考策略</CardTitle>
          <Switch id="rand" checked={form.randomized} onCheckedChange={(v) => setForm({ ...form, randomized: v })} />
          <label htmlFor="rand" className="text-sm text-slate-600">题目 & 选项乱序</label>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3"><Switch id="cf" checked={form.require_face} onCheckedChange={(v) => setForm({ ...form, require_face: v })} /><label htmlFor="cf" className="text-sm text-slate-600">人脸识别开考</label></div>
          {form.require_face && <div><label className="text-sm text-slate-500 block mb-1.5">人脸策略</label>
            <Select value={form.face_strategy} onValueChange={(v) => setForm({ ...form, face_strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="once">开考即验</SelectItem><SelectItem value="continuous">全程在场</SelectItem></SelectContent>
            </Select>
          </div>}
          <div className="flex items-center gap-3"><Switch id="fs" checked={form.fullscreen_locked} onCheckedChange={(v) => setForm({ ...form, fullscreen_locked: v })} /><label htmlFor="fs" className="text-sm text-slate-600">强制全屏（退出拉回）</label></div>
          <div><label className="text-sm text-slate-500 block mb-1.5">切屏/退全屏累计上限（超限自动提交）</label><Input type="number" min={0} value={form.max_switch} onChange={(e) => setForm({ ...form, max_switch: Number(e.target.value) })} /></div>
          <div className="flex items-center gap-3"><Switch id="dc" checked={form.disable_copy} onCheckedChange={(v) => setForm({ ...form, disable_copy: v })} /><label htmlFor="dc" className="text-sm text-slate-600">禁止复制</label></div>
          <div className="flex items-center gap-3"><Switch id="dp" checked={form.disable_paste} onCheckedChange={(v) => setForm({ ...form, disable_paste: v })} /><label htmlFor="dp" className="text-sm text-slate-600">禁止粘贴</label></div>
          <div className="flex items-center gap-3"><Switch id="dd" checked={form.disable_devtools} onCheckedChange={(v) => setForm({ ...form, disable_devtools: v })} /><label htmlFor="dd" className="text-sm text-slate-600">禁止开发者工具</label></div>
          <div className="flex items-center gap-3"><Switch id="dz" checked={form.disable_zoom} onCheckedChange={(v) => setForm({ ...form, disable_zoom: v })} /><label htmlFor="dz" className="text-sm text-slate-600">禁止缩放手势</label></div>
          <div className="flex items-center gap-3"><Switch id="wm" checked={form.watermark} onCheckedChange={(v) => setForm({ ...form, watermark: v })} /><label htmlFor="wm" className="text-sm text-slate-600">答题区个人水印</label></div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end pb-6">
        <Button variant="outline" onClick={() => router.push('/teacher/exams')}>取消</Button>
        <Button className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200 px-6" onClick={submit} disabled={submitting}>{submitting ? '创建中…' : '创建考试草稿'}</Button>
      </div>
    </div>
  );
}
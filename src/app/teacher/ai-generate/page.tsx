'use client';

import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Sparkles, Loader2, Save, RotateCcw, CheckCircle2, Trash2, BookOpen, ArrowRight, Copy, ImagePlus, Minus, Plus } from 'lucide-react';

interface CourseItem {
  id: number;
  name: string;
}

interface KnowledgePoint {
  id: number;
  name: string;
  course_id: number;
  description?: string;
}

interface GeneratedQuestion {
  id?: number;
  content: string;
  question_type: string;
  difficulty: string;
  answer: string;
  analysis?: string;
  options?: string;
  default_score: number;
  course_id: number;
  knowledge_point_id: number;
  knowledge_point?: { name: string } | null;
  course?: { name: string } | null;
}

const typeLabels: Record<string, string> = {
  single_choice: '单选题', multiple_choice: '多选题', multi_choice: '多选题', judgment: '判断题',
  fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
  code: '编程题', programming: '编程题',
};

const difficultyLabels: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' };
const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
};

export default function AIGeneratePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // 配置 state
  const [courseId, setCourseId] = useState('');
  const [kpId, setKpId] = useState('');
  const [questionType, setQuestionType] = useState('single_choice');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(3);
  const [customPrompt, setCustomPrompt] = useState('');

  // 生成 state
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);

  const [allKps, setAllKps] = useState<KnowledgePoint[]>([]);

  // 加载课程和知识点（使用 API 的 courses / allKps 直接获取）
  useEffect(() => {
    apiFetch('/api/teacher/questions/bank?pageSize=1')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          const dd = data.data;
          setCourses(Array.isArray(dd.courses) ? dd.courses : []);
          const kps = Array.isArray(dd.allKps) ? dd.allKps : (Array.isArray(dd.knowledgePoints) ? dd.knowledgePoints : []);
          setAllKps(kps);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 根据选中课程过滤知识点
  useEffect(() => {
    if (!courseId) { setKnowledgePoints([]); setKpId(''); return; }
    const cid = parseInt(courseId);
    setKnowledgePoints(allKps.filter((kp) => kp.course_id === cid));
    setKpId('');
  }, [courseId, allKps]);

  // AI 出题
  const handleGenerate = async () => {
    if (!kpId) { toast.error('请选择知识点'); return; }
    setGenerating(true);
    setGenerated([]);
    try {
      const res = await apiFetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: parseInt(courseId) || undefined,
          knowledge_point_id: parseInt(kpId),
          question_type: questionType,
          difficulty,
          count,
          persist: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // 后端返回格式：{ generated: [...], inserted: [...], count: N }
        const items = data.data?.generated || data.data?.inserted || [];
        const questionList = Array.isArray(items) ? items : [items];
        setGenerated(questionList);
      } else {
        toast.error(data.error || 'AI 出题失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setGenerating(false);
    }
  };

  // 删除单题
  const handleDelete = (idx: number) => {
    setGenerated(prev => prev.filter((_, i) => i !== idx));
  };

  // P2-6：预览审校后确认入库——**仅入库勾选的题目**（教师手动选题）
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());

  // ── 图片出题（多模态）：上传题目图片 → 视觉模型提取文字 → 进入自定义要求 ──
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error('图片不能超过 4MB'); e.target.value = ''; return; }
    setOcrLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiFetch('/api/ai/image-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const d = await res.json();
      if (d.success && d.data?.text) {
        const extracted = d.data.text.trim();
        setCustomPrompt((prev: string) => (prev ? prev + '\n\n（来自图片的题目内容）\n' + extracted : '（来自图片的题目内容）\n' + extracted));
        toast.success('图片识别完成，已填入自定义要求');
      } else if (d.code === 'AI_NOT_CONFIGURED') {
        toast.error(d.error, { duration: 8000 });
      } else {
        toast.error(d.error || '图片识别失败');
      }
    } catch {
      toast.error('图片处理失败，请重试');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  // ── 出题质量自检（本地规则，零 AI 调用）──
const validateQuestion = (q: { question_type: string; content: string; options?: unknown; answer?: string; analysis?: string }): string[] => {
  const issues: string[] = [];
  if (!q.content || q.content.trim().length < 8) issues.push('题干过短');
  const isChoice = /choice/i.test(q.question_type);
  if (isChoice) {
    const opts = typeof q.options === 'string' ? (() => { try { return JSON.parse(q.options); } catch { return q.options; } })() : q.options;
    const entries: [string, string][] = opts && typeof opts === 'object' && !Array.isArray(opts)
      ? Object.entries(opts as Record<string, string>)
      : Array.isArray(opts) ? (opts as string[]).map((o: string, i: number): [string, string] => [String.fromCharCode(65 + i), o]) : [];
    if (entries.length < 3) issues.push('选项少于 3 个');
    const letters = entries.map(([k]) => String(k).charAt(0).toUpperCase());
    const ans = String(q.answer || '').toUpperCase().replace(/\s/g, '');
    const valid = ans && ans.split('').every((ch) => letters.includes(ch));
    if (!q.answer) issues.push('缺少答案');
    else if (!valid) issues.push(`答案 ${q.answer} 不在选项 ${letters.join('/')} 内`);
  } else if (!q.answer || !String(q.answer).trim()) {
    issues.push('缺少参考答案');
  }
  return issues;
};

// 快捷新建知识点
  const [kpCreatingInput, setKpCreatingInput] = useState(false);
  const [kpCreating, setKpCreating] = useState(false);
  const [newKpName, setNewKpName] = useState('');
  const createKnowledgePoint = async () => {
    const name = newKpName.trim();
    if (!name || !courseId) return;
    setKpCreating(true);
    try {
      const res = await apiFetch('/api/teacher/knowledge-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: parseInt(courseId), name }),
      });
      const d = await res.json();
      if (d.success) {
        const created = d.data;
        setKnowledgePoints((prev) => [...prev, { id: created.id, name: created.name, course_id: created.course_id }]);
        setKpId(String(created.id));
        setNewKpName('');
        toast.success(`知识点「${created.name}」已创建`);
      } else {
        toast.error(d.error || '创建失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setKpCreating(false);
    }
  };
  // 生成结果变化时默认全选
  useEffect(() => {
    setSelectedIdx(new Set(generated.map((_, i) => i)));
  }, [generated]);

  const toggleSelect = (idx: number) => {
    setSelectedIdx((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  };

  // 选项对象 → 可读行列表（修复对象直接渲染崩溃）
  const optionLines = (options: unknown): Array<[string, string]> => {
    if (!options) return [];
    if (Array.isArray(options)) return options.map((o, i) => [String.fromCharCode(65 + i), String(o)]);
    if (typeof options === 'object') return Object.entries(options as Record<string, string>);
    return [];
  };

  const handleSaveAll = async () => {
    if (!courseId) { toast.error('请先选择课程，用于题目归属'); return; }
    const chosen = generated.filter((_, i) => selectedIdx.has(i));
    if (chosen.length === 0) { toast.error('请至少勾选一道题目'); return; }
    if (!kpId) { toast.error('请选择知识点'); return; }
    setSaving(true);
    let ok = 0;
    try {
      for (const q of chosen) {
        const res = await apiFetch('/api/teacher/questions/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_id: parseInt(courseId),
            knowledge_point_id: parseInt(kpId),
            question_type: q.question_type,
            difficulty: q.difficulty,
            content: q.content,
            options: q.options,
            answer: q.answer,
            analysis: q.analysis,
            default_score: q.default_score,
            source: 'ai',
          }),
        });
        if (res.ok) ok++;
      }
      setSavedCount(ok);
      setGenerated([]);
    } finally {
      setSaving(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = (q: GeneratedQuestion) => {
    const text = `${typeLabels[q.question_type]} [${difficultyLabels[q.difficulty] || '中等'}]\n${q.content}\n\n答案：${q.answer}${q.analysis ? `\n解析：${q.analysis}` : ''}`;
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  return (
    <div className="space-y-6">

      {/* ── 顶部：出题配置（通栏） ── */}
      <Card className="relative overflow-hidden border-0 shadow-sm">
        {/* 顶部渐变装饰线 */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500" />
        <CardHeader className="border-b border-slate-100 bg-white/70 backdrop-blur pb-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                <Wand2 className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">出题配置</CardTitle>
                <p className="text-xs text-slate-400">选择课程与知识点，AI 智能生成可审校的高质量题目</p>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating || !kpId}
              className="gap-2 h-10 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200"
            >
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> 出题中…</> : <><Sparkles className="w-4 h-4" /> 生成题目</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">课程 <span className="text-red-500">*</span></Label>
              <Select value={courseId} onValueChange={(v) => { setCourseId(v); setKpId(''); }}>
                <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label className="text-sm font-medium text-slate-700">知识点 <span className="text-red-500">*</span></Label>
              <Select value={kpId} onValueChange={setKpId} disabled={!courseId}>
                <SelectTrigger><SelectValue placeholder={courseId ? '选择知识点' : '请先选择课程'} /></SelectTrigger>
                <SelectContent>
                  {knowledgePoints.map(kp => <SelectItem key={kp.id} value={String(kp.id)}>{kp.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 pt-1">
                {kpCreatingInput ? (
                  <>
                    <Input
                      autoFocus
                      value={newKpName}
                      onChange={(e) => setNewKpName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createKnowledgePoint(); }}
                      placeholder="输入新知识点名称"
                      className="flex-1 h-8 text-xs"
                    />
                    <Button size="sm" className="h-8 px-2.5 text-xs bg-violet-600 hover:bg-violet-700" disabled={kpCreating || !newKpName.trim() || !courseId} onClick={createKnowledgePoint}>
                      {kpCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : '创建'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setKpCreatingInput(false); setNewKpName(''); }}>取消</Button>
                  </>
                ) : (
                  <button
                    onClick={() => setKpCreatingInput(true)}
                    disabled={!courseId}
                    className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-0.5 disabled:opacity-40"
                  >+ 没有想要的知识点？新建一个</button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">题型</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_choice">单选题</SelectItem>
                  <SelectItem value="multiple_choice">多选题</SelectItem>
                  <SelectItem value="judgment">判断题</SelectItem>
                  <SelectItem value="fill_blank">填空题</SelectItem>
                  <SelectItem value="short_answer">简答题</SelectItem>
                  <SelectItem value="code">编程题</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">难度</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">简单</SelectItem>
                  <SelectItem value="medium">中等</SelectItem>
                  <SelectItem value="hard">困难</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">生成数量 <span className="text-slate-400 font-normal text-xs">(1~20)</span></Label>
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white h-9">
                <button
                  type="button"
                  onClick={() => setCount(Math.max(1, count - 1))}
                  disabled={count <= 1}
                  className="w-9 shrink-0 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                ><Minus className="w-4 h-4" /></button>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  className="flex-1 h-full min-w-0 text-center text-sm font-semibold text-slate-700 outline-none border-x border-slate-100 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setCount(Math.min(20, count + 1))}
                  disabled={count >= 20}
                  className="w-9 shrink-0 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                ><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">自定义要求（可选）</Label>
              <label
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors cursor-pointer ${ocrLoading ? 'bg-violet-100 text-violet-500' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
                title="上传含题目的图片，AI 自动识别文字作为出题依据"
              >
                {ocrLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {ocrLoading ? '识别中…' : '图片出题'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={ocrLoading} />
              </label>
            </div>
            <Textarea
              placeholder="例如：结合生活实际场景出题、侧重代码理解...；也可上传题目图片自动识别填入"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 下方：生成结果（通栏，不再被挤压变窄） ── */}
      {!generating && generated.length === 0 ? (
        <Card className="border-0 shadow-sm flex items-center justify-center min-h-[320px]">
          <CardContent className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
              <Wand2 className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">AI 智能出题</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">在上方选择课程、知识点和题型，点击「生成题目」，AI 将自动生成高质量题目，审校后入库题库</p>
            <div className="flex items-center justify-center gap-6 mt-6 text-xs text-slate-400">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 6种题型</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 3级难度</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 生成后审校入库</span>
            </div>
          </CardContent>
        </Card>
      ) : generating ? (
        <Card className="border-0 shadow-sm flex items-center justify-center min-h-[340px]">
          <CardContent className="text-center py-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">AI 正在出题…</h3>
            <p className="text-sm text-slate-500 mt-2">正在根据知识点和难度生成 {count} 道{typeLabels[questionType] || '题目'}…</p>
            <div className="flex items-center justify-center gap-1.5 mt-5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 结果操作栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                生成结果
              </h2>
              <Badge variant="secondary" className="text-xs">{generated.length} 题</Badge>
              {(() => {
                const pass = generated.filter((q) => validateQuestion(q).length === 0).length;
                return pass === generated.length
                  ? <Badge className="text-xs bg-green-50 text-green-700 border-0">质量自检 {pass}/{generated.length} 通过</Badge>
                  : <Badge className="text-xs bg-amber-50 text-amber-700 border-0">自检 {pass}/{generated.length} 通过</Badge>;
              })()}
              <Badge className="text-xs bg-indigo-50 text-indigo-700 border-0">已选 {selectedIdx.size} 题</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700" disabled={saving || selectedIdx.size === 0} onClick={handleSaveAll}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? '入库中…' : '确认入库'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleGenerate}>
                <RotateCcw className="w-3 h-3" /> 重新生成
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => router.push('/teacher/questions/bank')}>
                <BookOpen className="w-3 h-3" /> 查看题库
              </Button>
            </div>
          </div>

          {savedCount !== null && (
            <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">已入库 {savedCount} 题，可在题库管理中查看</div>
          )}

          {/* 题目列表（通栏） */}
          <div className="space-y-3">
            {generated.map((q, idx) => (
              <Card key={idx} className={`border-0 shadow-sm hover:shadow-md transition-shadow ${selectedIdx.has(idx) ? '' : 'opacity-50'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIdx.has(idx)}
                      onChange={() => toggleSelect(idx)}
                      className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                      title="勾选后才会入库"
                    />
                    <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || '其他题型'}</Badge>
                        <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">{difficultyLabels[q.difficulty] || '中等'}</Badge>
                        <span className="text-xs text-slate-400">{q.default_score}分</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{q.content}</p>

                      {/* 质量自检提示 */}
                      {validateQuestion(q).length > 0 && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                          <p className="text-xs text-amber-700 font-medium">⚠ 质量自检提示：{validateQuestion(q).join('；')}</p>
                        </div>
                      )}

                      {/* 详情常显：选项/答案/解析（修复 options 对象渲染崩溃） */}
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-2">
                        {optionLines(q.options).length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-slate-500">选项：</span>
                            <div className="mt-1 space-y-0.5">
                              {optionLines(q.options).map(([k, v]) => (
                                <p key={k} className="text-sm text-slate-600"><b className="text-slate-700">{k}.</b> {v}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-medium text-slate-500">答案：</span>
                          <p className="text-sm text-green-700 font-mono mt-0.5">{q.answer || '（AI 未提供，请补填后再入库）'}</p>
                        </div>
                        {q.analysis && (
                          <div>
                            <span className="text-xs font-medium text-slate-500">解析：</span>
                            <p className="text-sm text-slate-600 mt-0.5">{q.analysis}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleCopy(q)} title="复制">
                        <Copy className="w-4 h-4 text-slate-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleDelete(idx)} title="删除">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

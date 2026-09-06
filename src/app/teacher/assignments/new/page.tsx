'use client';

import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Sparkles, BookOpen, Clock, CheckCircle2, Search, Loader2, Wand2, RefreshCw, Plus, Zap } from 'lucide-react';

interface QuestionItem {
  id: number;
  content: string;
  question_type: string;
  difficulty: string;
  answer: string;
  analysis?: string;
  default_score: number;
  course_id: number;
  knowledge_point_id: number;
  knowledge_point: { name: string } | null;
  course: { name: string } | null;
  options?: string[] | string;
}

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

const typeLabels: Record<string, string> = {
  single_choice: '单选题', multiple_choice: '多选题', multi_choice: '多选题',
  judgment: '判断题', fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
  code: '编程题', programming: '编程题',
};

const difficultyLabels: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' };
const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export default function NewAssignmentPage() {
  const router = useRouter();
  // P2-1：学情看板「针对薄弱点 AI 布置作业」入口预填
  const searchParamsNew = useSearchParams();
  const [step, setStep] = useState(1);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<QuestionItem[]>([]);
  const [reviewMode, setReviewMode] = useState('auto_judge'); // auto_judge / teacher_review / auto
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  // AI 出题 state
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiCourseId, setAiCourseId] = useState('');
  const [aiKpId, setAiKpId] = useState('');
  const [aiType, setAiType] = useState('single_choice');
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [aiCount, setAiCount] = useState(3);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState<QuestionItem[]>([]);

  // 随机组卷 state
  const [randCourseId, setRandCourseId] = useState('');
  const [randDifficulty, setRandDifficulty] = useState('all');
  const [randCount, setRandCount] = useState(5);
  const [randomizing, setRandomizing] = useState(false);

  // 存储全部知识点缓存
  const [allKnowledgePoints, setAllKnowledgePoints] = useState<KnowledgePoint[]>([]);

  // 加载题库、课程和知识点（一次请求全量获取）
  useEffect(() => {
    // P2-1：看板跳转预填课程并自动展开 AI 出题面板
    if (searchParamsNew.get('auto_ai') === '1') {
      const qCourse = searchParamsNew.get('course_id');
      if (qCourse) { setCourseId(qCourse); setAiCourseId(qCourse); }
      setShowAIPanel(true);
    }
    apiFetch('/api/teacher/questions/bank?pageSize=500&exclude_locked=1')
      .then(r => r.json())
      .then(qData => {
        if (qData.success) {
          const dd = qData.data;
          const questionsList = Array.isArray(dd) ? dd : (dd.questions || []);
          setQuestions(questionsList);
          // 使用 API 返回的课程列表
          if (dd.courses && Array.isArray(dd.courses)) {
            setCourses(dd.courses);
          } else {
            const courseMap = new Map<number, string>();
            questionsList.forEach((q: QuestionItem) => {
              if (q.course) courseMap.set(q.course_id, q.course.name);
            });
            setCourses(Array.from(courseMap.entries()).map(([id, name]) => ({ id, name })));
          }
          // 缓存所有知识点
          if (dd.allKps && Array.isArray(dd.allKps)) {
            setAllKnowledgePoints(dd.allKps);
          } else if (dd.knowledgePoints && Array.isArray(dd.knowledgePoints)) {
            setAllKnowledgePoints(dd.knowledgePoints);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 根据选中的课程过滤知识点
  useEffect(() => {
    if (!aiCourseId) { setKnowledgePoints([]); return; }
    const courseKps = allKnowledgePoints.filter(
      kp => kp.course_id === parseInt(aiCourseId)
    );
    setKnowledgePoints(courseKps);
  }, [aiCourseId, allKnowledgePoints]);

  const filteredQuestions = questions.filter(q => {
    if (filterType !== 'all' && q.question_type !== filterType) return false;
    if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
    if (filterCourse && filterCourse !== 'all' && q.course_id !== parseInt(filterCourse)) return false;
    if (searchTerm && !q.content.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // 选题分页：每页 10 题（筛选变化时回到第 1 页）
  const PAGE_SIZE = 10;
  const [questionPage, setQuestionPage] = useState(1);
  const questionTotalPages = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const safePage = Math.min(questionPage, questionTotalPages);
  const pagedQuestions = filteredQuestions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setQuestionPage(1); }, [filterType, filterDifficulty, filterCourse, searchTerm]);

  const toggleQuestion = (q: QuestionItem) => {
    setSelectedQuestions(prev =>
      prev.find(p => p.id === q.id)
        ? prev.filter(p => p.id !== q.id)
        : [...prev, q]
    );
  };

  const totalScore = 100;

  // AI 出题
  const handleAIGenerate = async () => {
    if (!aiKpId) { toast.error('请选择知识点'); return; }
    setAiGenerating(true);
    setAiGenerated([]);
    try {
      const res = await apiFetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: parseInt(aiCourseId) || undefined,
          knowledge_point_id: parseInt(aiKpId),
          question_type: aiType,
          difficulty: aiDifficulty,
          count: aiCount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const generated = Array.isArray(data.data?.generated)
          ? data.data.generated
          : Array.isArray(data.data) ? data.data : [data.data].filter(Boolean);
        setAiGenerated(generated);
        // 刷新题库
        const qRes = await apiFetch('/api/teacher/questions/bank?pageSize=500&exclude_locked=1');
        const qData = await qRes.json();
        if (qData.success) {
          const questionsList = Array.isArray(qData.data) ? qData.data : (qData.data.questions || []);
          setQuestions(questionsList);
        }
      } else {
        toast.error(data.error || 'AI 出题失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setAiGenerating(false);
    }
  };

  // 随机组卷：按课程+难度+数量从题库随机抽取加入选中（服务端校验课程归属并跳过锁定题）
  const handleRandomPaper = async () => {
    if (!randCourseId) { toast.error('请选择课程'); return; }
    setRandomizing(true);
    try {
      const res = await apiFetch('/api/teacher/questions/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: parseInt(randCourseId),
          difficulty: randDifficulty === 'all' ? undefined : randDifficulty,
          count: randCount,
          excludeIds: selectedQuestions.map(q => q.id),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const picked: QuestionItem[] = Array.isArray(data.data) ? data.data : [];
        if (picked.length === 0) {
          toast.error('没有更多符合条件的题目（可能已全部选中或题库为空）');
        } else {
          setSelectedQuestions(prev => {
            const existing = new Set(prev.map(q => q.id));
            const added = picked.filter(q => !existing.has(q.id));
            return [...prev, ...added];
          });
          toast.success(`已随机抽取 ${picked.length} 道题`);
        }
      } else {
        toast.error(data.error || '随机组卷失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setRandomizing(false);
    }
  };

  const handleSubmit = async () => {
    if (!title) { toast.error('请输入作业标题'); return; }
    if (!courseId) { toast.error('请选择课程'); return; }
    if (!startTime) { toast.error('请选择开始时间'); return; }
    if (!endTime) { toast.error('请选择截止时间'); return; }
    if (selectedQuestions.length === 0) { toast.error('请至少选择一道题目'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/teacher/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description,
          course_id: parseInt(courseId),
          question_ids: selectedQuestions.map(q => q.id),
          total_score: totalScore,
          start_time: startTime, end_time: endTime,
          review_mode: reviewMode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/teacher/assignments');
      } else {
        toast.error(data.error || '创建作业失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              {s > 1 && <div className="w-8 h-px bg-slate-300" />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${step === s ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">{s}</span>
                {s === 1 ? '选题' : s === 2 ? '设置' : '预览发布'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          {/* AI 出题入口 */}
          {!showAIPanel ? (
            <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border-l-4 border-l-indigo-500">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                      <Wand2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">AI 智能出题</h3>
                      <p className="text-sm text-slate-500">选择课程和知识点，AI 自动生成题目并加入题库</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowAIPanel(true)}
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                  >
                    <Sparkles className="w-4 h-4" /> 开始出题
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50/50 via-purple-50/30 to-transparent">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <Wand2 className="w-4 h-4 text-white" />
                    </div>
                    AI 智能出题
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAIPanel(false)}>收起</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">课程</Label>
                    <Select value={aiCourseId} onValueChange={(v) => { setAiCourseId(v); setAiKpId(''); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="选择课程" /></SelectTrigger>
                      <SelectContent>
                        {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">知识点</Label>
                    <Select value={aiKpId} onValueChange={setAiKpId} disabled={!aiCourseId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={aiCourseId ? '选择知识点' : '先选课程'} /></SelectTrigger>
                      <SelectContent>
                        {knowledgePoints.map(kp => <SelectItem key={kp.id} value={String(kp.id)}>{kp.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">题型</Label>
                    <Select value={aiType} onValueChange={setAiType}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">难度</Label>
                    <Select value={aiDifficulty} onValueChange={setAiDifficulty}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">简单</SelectItem>
                        <SelectItem value="medium">中等</SelectItem>
                        <SelectItem value="hard">困难</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-500">生成数量</Label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setAiCount(n)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${aiCount === n ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={handleAIGenerate}
                    disabled={aiGenerating || !aiKpId}
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                  >
                    {aiGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</> : <><Zap className="w-4 h-4" /> 生成题目</>}
                  </Button>
                </div>

                {/* AI 生成结果 */}
                {aiGenerated.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-slate-700">AI 已生成 {aiGenerated.length} 道题目（已加入题库）</span>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={() => {
                        aiGenerated.forEach(q => {
                          if (!selectedQuestions.find(s => s.id === q.id)) {
                            setSelectedQuestions(prev => [...prev, q]);
                          }
                        });
                      }}>
                        <Plus className="w-3 h-3" /> 全部选中
                      </Button>
                    </div>
                    {aiGenerated.map((q, idx) => (
                      <div key={q.id} className="p-3 bg-white rounded-lg border border-indigo-100 flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || '其他题型'}</Badge>
                            <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">{difficultyLabels[q.difficulty]}</Badge>
                            <span className="text-xs text-slate-400">{q.default_score}分</span>
                          </div>
                          <p className="text-sm text-slate-700 line-clamp-2">{q.content}</p>
                          <p className="text-xs text-green-600 mt-1 font-mono">答案：{q.answer}</p>
                          {q.options && (() => {
                            const opts: string[] = typeof q.options === 'string' ? (() => { try { return JSON.parse(q.options as string); } catch { return []; } })() : (q.options as unknown as string[]);
                            if (!Array.isArray(opts) || opts.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {opts.map((opt, i) => (
                                  <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    opt.trim() === q.answer?.trim() ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-50 text-slate-500 border border-slate-150'
                                  }`}>{opt}</span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <Button
                          size="sm"
                          variant={selectedQuestions.find(s => s.id === q.id) ? 'default' : 'outline'}
                          className="shrink-0 h-8"
                          onClick={() => toggleQuestion(q)}
                        >
                          {selectedQuestions.find(s => s.id === q.id) ? '已选' : '选择'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 随机组卷 */}
          <Card className="border-0 shadow-sm bg-gradient-to-r from-amber-50/60 to-orange-50/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-semibold text-slate-700">随机组卷</span>
                </div>
                <Select value={randCourseId} onValueChange={setRandCourseId}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="选择课程" /></SelectTrigger>
                  <SelectContent>
                    {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={randDifficulty} onValueChange={setRandDifficulty}>
                  <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="难度" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部难度</SelectItem>
                    {Object.entries(difficultyLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">抽</span>
                  <Input
                    type="number" min={1} max={100}
                    value={randCount}
                    onChange={e => setRandCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    className="w-16 h-9 text-center"
                  />
                  <span className="text-xs text-slate-500">题</span>
                </div>
                <Button
                  onClick={handleRandomPaper}
                  disabled={randomizing || !randCourseId}
                  className="gap-1 h-9 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {randomizing ? <><Loader2 className="w-4 h-4 animate-spin" /> 抽取中...</> : <><RefreshCw className="w-4 h-4" /> 随机抽取</>}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">按“课程 + 难度 + 数量”从题库随机抽取并加入右侧已选列表（自动跳过已锁定与已选题目，仅限本人课程）</p>
            </CardContent>
          </Card>

          {/* 题库筛选 */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="搜索题目..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterCourse} onValueChange={setFilterCourse}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="全部课程" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部课程</SelectItem>
                    {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="题型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部题型</SelectItem>
                    <SelectItem value="single_choice">单选题</SelectItem>
                    <SelectItem value="multiple_choice">多选题</SelectItem>
                    <SelectItem value="judgment">判断题</SelectItem>
                    <SelectItem value="fill_blank">填空题</SelectItem>
                    <SelectItem value="short_answer">简答题</SelectItem>
                    <SelectItem value="code">编程题</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="难度" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部难度</SelectItem>
                    <SelectItem value="easy">简单</SelectItem>
                    <SelectItem value="medium">中等</SelectItem>
                    <SelectItem value="hard">困难</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className="gap-1 text-sm px-3 py-1.5">
                  <CheckCircle2 className="w-3 h-3" /> 已选 {selectedQuestions.length} 题
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* 题库列表（分页） */}
          <div className="grid gap-3">
            {pagedQuestions.map((q) => {
              const isSelected = selectedQuestions.some(s => s.id === q.id);
              return (
                <Card
                  key={q.id}
                  className={`border-0 cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-100 bg-indigo-50/30' : 'shadow-sm'}`}
                  onClick={() => toggleQuestion(q)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || '其他题型'}</Badge>
                          <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">{difficultyLabels[q.difficulty]}</Badge>
                          <span className="text-xs text-slate-400">{q.default_score}分</span>
                          {q.knowledge_point && <Badge variant="outline" className="text-xs">{q.knowledge_point.name}</Badge>}
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2">{q.content}</p>
                        <p className="text-xs text-green-600 mt-1 font-mono">答案：{q.answer}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredQuestions.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">没有符合筛选条件的题目</p>
            )}
          </div>

          {/* 分页控件 */}
          {filteredQuestions.length > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                共 {filteredQuestions.length} 题 · 第 {safePage}/{questionTotalPages} 页 · 已选 {selectedQuestions.length} 题
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setQuestionPage(safePage - 1)}>上一页</Button>
                {Array.from({ length: questionTotalPages }, (_, i) => i + 1).slice(
                  Math.max(0, safePage - 3), Math.max(0, safePage - 3) + 5
                ).map((p) => (
                  <Button key={p} size="sm" variant={p === safePage ? 'default' : 'outline'} className="w-8 h-8 p-0" onClick={() => setQuestionPage(p)}>{p}</Button>
                ))}
                <Button size="sm" variant="outline" disabled={safePage >= questionTotalPages} onClick={() => setQuestionPage(safePage + 1)}>下一页</Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={selectedQuestions.length === 0}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
            >
              下一步：设置作业信息 <ArrowLeft className="w-4 h-4 rotate-180" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="border-0 shadow-sm max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" /> 作业信息设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>作业标题 <span className="text-red-500">*</span></Label>
              <Input placeholder="例如：Python第一次作业：基础语法" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>作业描述</Label>
              <Textarea placeholder="作业说明、要求等..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>所属课程 <span className="text-red-500">*</span></Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始时间 <span className="text-red-500">*</span></Label>
                <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>截止时间 <span className="text-red-500">*</span></Label>
                <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>批改方式</Label>
              <Select value={reviewMode} onValueChange={setReviewMode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择批改方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_judge">自动判断（含主观题则需复核）</SelectItem>
                  <SelectItem value="teacher_review">强制教师复核</SelectItem>
                  <SelectItem value="auto">全自动批改</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)} disabled={!title || !courseId || !startTime || !endTime} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                下一步：预览发布
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4 max-w-2xl mx-auto">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> 作业预览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                <h2 className="text-xl font-bold text-slate-800">{title || '未设置标题'}</h2>
                {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
                <div className="flex items-center gap-4 mt-3">
                  <Badge variant="secondary" className="gap-1"><BookOpen className="w-3 h-3" /> {courses.find(c => String(c.id) === courseId)?.name || '未选择'}</Badge>
                  <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> {startTime || '?'} ~ {endTime || '?'}</Badge>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-700 mb-3">已选题目（{selectedQuestions.length}题）</h3>
                <div className="space-y-2">
                  {selectedQuestions.map((q, idx) => (
                    <div key={q.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold shrink-0">{idx + 1}</span>
                      <span className="text-sm text-slate-700 flex-1 line-clamp-1">{q.content}</span>
                      <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type]}</Badge>
                      <span className="text-sm text-slate-500">{q.default_score}分</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>上一步</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 发布中...</> : '确认发布作业'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

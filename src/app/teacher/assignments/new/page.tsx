'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  single_choice: '单选题', multiple_choice: '多选题', judgment: '判断题',
  fill_blank: '填空题', short_answer: '简答题', essay: '论述题',
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
  const [searchTerm, setSearchTerm] = useState('');
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

  // 加载题库和课程
  useEffect(() => {
    apiFetch('/api/teacher/questions/bank?limit=100')
      .then(r => r.json())
      .then(qData => {
        if (qData.success) {
          const questionsList = Array.isArray(qData.data) ? qData.data : (qData.data.questions || []);
          setQuestions(questionsList);
          const courseMap = new Map<number, string>();
          questionsList.forEach((q: QuestionItem) => {
            if (q.course) courseMap.set(q.course_id, q.course.name);
          });
          setCourses(Array.from(courseMap.entries()).map(([id, name]) => ({ id, name })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 加载知识点
  useEffect(() => {
    if (!aiCourseId) { setKnowledgePoints([]); return; }
    apiFetch('/api/teacher/questions/bank?limit=1')
      .then(r => r.json())
      .then(() => {
        // 从题库中提取该课程的知识点
        const kps: KnowledgePoint[] = [];
        const seen = new Set<number>();
        questions.forEach(q => {
          if (q.course_id === parseInt(aiCourseId) && q.knowledge_point && !seen.has(q.knowledge_point_id)) {
            seen.add(q.knowledge_point_id);
            kps.push({ id: q.knowledge_point_id, name: q.knowledge_point.name, course_id: q.course_id });
          }
        });
        // 如果题库中没有，从数据库获取
        if (kps.length === 0) {
          apiFetch(`/api/teacher/analytics?course_id=${aiCourseId}`)
            .then(r => r.json())
            .then(data => {
              if (data.success && data.data?.knowledgePoints) {
                setKnowledgePoints(data.data.knowledgePoints);
              }
            })
            .catch(() => {});
        } else {
          setKnowledgePoints(kps);
        }
      })
      .catch(() => {});
  }, [aiCourseId, questions]);

  const filteredQuestions = questions.filter(q => {
    if (filterType !== 'all' && q.question_type !== filterType) return false;
    if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
    if (courseId && q.course_id !== parseInt(courseId)) return false;
    if (searchTerm && !q.content.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

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
    if (!aiKpId) { alert('请选择知识点'); return; }
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
        const generated = Array.isArray(data.data) ? data.data : [data.data];
        setAiGenerated(generated);
        // 刷新题库
        const qRes = await apiFetch('/api/teacher/questions/bank?limit=100');
        const qData = await qRes.json();
        if (qData.success) {
          const questionsList = Array.isArray(qData.data) ? qData.data : (qData.data.questions || []);
          setQuestions(questionsList);
        }
      } else {
        alert(data.error || 'AI 出题失败');
      }
    } catch {
      alert('网络错误，请重试');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!title) { alert('请输入作业标题'); return; }
    if (!courseId) { alert('请选择课程'); return; }
    if (!startTime) { alert('请选择开始时间'); return; }
    if (!endTime) { alert('请选择截止时间'); return; }
    if (selectedQuestions.length === 0) { alert('请至少选择一道题目'); return; }
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
          teacher_id: 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/teacher/assignments');
      } else {
        alert(data.error || '创建作业失败');
      }
    } catch {
      alert('网络错误，请重试');
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
        <div>
          <h1 className="text-2xl font-bold text-slate-800">新建作业</h1>
          <p className="text-sm text-slate-500">AI 智能出题或从题库选题，设置作业信息后发布</p>
        </div>
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
                    className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200"
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
                    className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200"
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
                            <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
                            <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">{difficultyLabels[q.difficulty]}</Badge>
                            <span className="text-xs text-slate-400">{q.default_score}分</span>
                          </div>
                          <p className="text-sm text-slate-700 line-clamp-2">{q.content}</p>
                          <p className="text-xs text-green-600 mt-1 font-mono">答案：{q.answer}</p>
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

          {/* 题库筛选 */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="搜索题目..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
                <Select value={courseId} onValueChange={setCourseId}>
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
                    {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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

          {/* 题库列表 */}
          <div className="grid gap-3">
            {filteredQuestions.slice(0, 30).map((q) => {
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
                          <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
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
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={selectedQuestions.length === 0}
              className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200"
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
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)} disabled={!title || !courseId || !startTime || !endTime} className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white">
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
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 发布中...</> : '确认发布作业'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

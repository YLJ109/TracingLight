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
import { Wand2, Sparkles, Loader2, Zap, Save, RotateCcw, CheckCircle2, Trash2, Eye, BookOpen, ArrowRight, Copy } from 'lucide-react';

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
  single_choice: '单选题', multiple_choice: '多选题', judgment: '判断题',
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // 加载课程
  useEffect(() => {
    apiFetch('/api/teacher/questions/bank?limit=1')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const questions = Array.isArray(data.data) ? data.data : (data.data.questions || []);
          const courseMap = new Map<number, string>();
          questions.forEach((q: GeneratedQuestion) => {
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
    if (!courseId) { setKnowledgePoints([]); return; }
    apiFetch('/api/teacher/questions/bank?limit=200')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const questions = Array.isArray(data.data) ? data.data : (data.data.questions || []);
          const kps: KnowledgePoint[] = [];
          const seen = new Set<number>();
          questions.forEach((q: GeneratedQuestion) => {
            if (q.course_id === parseInt(courseId) && q.knowledge_point && !seen.has(q.knowledge_point_id)) {
              seen.add(q.knowledge_point_id);
              kps.push({ id: q.knowledge_point_id, name: q.knowledge_point.name, course_id: q.course_id });
            }
          });
          setKnowledgePoints(kps);
        }
      })
      .catch(() => {});
  }, [courseId]);

  // AI 出题
  const handleGenerate = async () => {
    if (!kpId) { alert('请选择知识点'); return; }
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
        }),
      });
      const data = await res.json();
      if (data.success) {
        // 后端返回格式：{ generated: [...], inserted: [...], count: N }
        const items = data.data?.generated || data.data?.inserted || [];
        const questionList = Array.isArray(items) ? items : [items];
        setGenerated(questionList);
      } else {
        alert(data.error || 'AI 出题失败');
      }
    } catch {
      alert('网络错误，请重试');
    } finally {
      setGenerating(false);
    }
  };

  // 删除单题
  const handleDelete = (idx: number) => {
    setGenerated(prev => prev.filter((_, i) => i !== idx));
  };

  // 复制到剪贴板
  const handleCopy = (q: GeneratedQuestion) => {
    const text = `${typeLabels[q.question_type]} [${difficultyLabels[q.difficulty]}]\n${q.content}\n\n答案：${q.answer}${q.analysis ? `\n解析：${q.analysis}` : ''}`;
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            AI 智能出题
          </h1>
          <p className="text-sm text-slate-500 mt-1">选择课程和知识点，AI 自动生成高质量题目并保存到题库</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左侧配置面板 */}
        <div className="col-span-4 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> 出题配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">课程 <span className="text-red-500">*</span></Label>
                <Select value={courseId} onValueChange={(v) => { setCourseId(v); setKpId(''); }}>
                  <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
                  <SelectContent>
                    {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">知识点 <span className="text-red-500">*</span></Label>
                <Select value={kpId} onValueChange={setKpId} disabled={!courseId}>
                  <SelectTrigger><SelectValue placeholder={courseId ? '选择知识点' : '请先选择课程'} /></SelectTrigger>
                  <SelectContent>
                    {knowledgePoints.map(kp => <SelectItem key={kp.id} value={String(kp.id)}>{kp.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">题型</Label>
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
                <Label className="text-sm">难度</Label>
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
                <Label className="text-sm">生成数量</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all ${count === n ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">自定义要求（可选）</Label>
                <Textarea
                  placeholder="例如：结合生活实际场景出题、侧重代码理解..."
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !kpId}
                className="w-full gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200 h-10"
              >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 出题中...</> : <><Sparkles className="w-4 h-4" /> 生成题目</>}
              </Button>
            </CardContent>
          </Card>

          {/* 统计卡片 */}
          {generated.length > 0 && (
            <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50">
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-indigo-700">{generated.length}</p>
                  <p className="text-sm text-slate-600 mt-1">道题目已生成</p>
                  <p className="text-xs text-slate-500 mt-2">题目已自动保存到题库管理</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1"
                    onClick={() => router.push('/teacher/questions/bank')}
                  >
                    <BookOpen className="w-3 h-3" /> 查看题库
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧结果区域 */}
        <div className="col-span-8">
          {!generating && generated.length === 0 ? (
            <Card className="border-0 shadow-sm h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
                  <Wand2 className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">AI 智能出题</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xs">
                  在左侧选择课程、知识点和题型，AI 将自动生成高质量题目并保存到题库
                </p>
                <div className="flex items-center gap-4 mt-6 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 6种题型</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 3级难度</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 自动入库</span>
                </div>
              </CardContent>
            </Card>
          ) : generating ? (
            <Card className="border-0 shadow-sm h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">AI 正在出题...</h3>
                <p className="text-sm text-slate-500 mt-2">正在根据知识点和难度生成高质量题目</p>
                <div className="flex items-center justify-center gap-1 mt-4">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  生成结果
                  <Badge variant="secondary" className="text-xs">{generated.length} 题</Badge>
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={handleGenerate}>
                    <RotateCcw className="w-3 h-3" /> 重新生成
                  </Button>
                </div>
              </div>

              {generated.map((q, idx) => (
                <Card key={idx} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
                          <Badge className={`text-xs ${difficultyConfig[q.difficulty]}`} variant="secondary">{difficultyLabels[q.difficulty]}</Badge>
                          <span className="text-xs text-slate-400">{q.default_score}分</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{q.content}</p>

                        {/* 展开详情 */}
                        {expandedIdx === idx && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-2">
                            <div>
                              <span className="text-xs font-medium text-slate-500">答案：</span>
                              <p className="text-sm text-green-700 font-mono mt-0.5">{q.answer}</p>
                            </div>
                            {q.analysis && (
                              <div>
                                <span className="text-xs font-medium text-slate-500">解析：</span>
                                <p className="text-sm text-slate-600 mt-0.5">{q.analysis}</p>
                              </div>
                            )}
                            {q.options && (
                              <div>
                                <span className="text-xs font-medium text-slate-500">选项：</span>
                                <p className="text-sm text-slate-600 font-mono mt-0.5 whitespace-pre-wrap">{q.options}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} title="查看详情">
                          <Eye className="w-4 h-4 text-slate-400" />
                        </Button>
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
          )}
        </div>
      </div>
    </div>
  );
}

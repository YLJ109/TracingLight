'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Eye, CheckCircle2, Clock, AlertCircle, Sparkles, Loader2, BookOpen, X, Users, GraduationCap, FileText, BarChart3, ChevronRight, SlidersHorizontal } from 'lucide-react';

interface AssignmentItem {
  id: number;
  title: string;
  course: { id: number; name: string } | null;
  course_id: number;
  question_ids: number[];
  question_count: number;
  total_score: number;
  start_time: string;
  end_time: string;
  status: string;
  submitted_count: number;
  graded_count: number;
  total_students: number;
  avg_score: number;
  student_stats: StudentStat[];
}

interface StudentStat {
  studentId: number;
  studentName: string;
  studentLevel: string;
  totalQuestions: number;
  completedCount: number;
  submittedCount: number;
  totalScore: number;
  totalFull: number;
  avgScore: number;
  status: 'completed' | 'submitted' | 'pending';
}

interface QuestionItem {
  id: number;
  content: string;
  question_type: string;
  difficulty: string;
  answer: string;
  default_score: number;
  course_id: number;
  knowledge_point_id: number;
  knowledge_point: { name: string } | null;
}

interface CourseItem { id: number; name: string; }

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  published: { label: '进行中', icon: Clock, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  closed: { label: '已结束', icon: CheckCircle2, className: 'bg-green-50 text-green-700 border-green-200' },
  draft: { label: '草稿', icon: AlertCircle, className: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const difficultyConfig: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

const typeLabels: Record<string, string> = {
  single_choice: '单选', multi_choice: '多选', judgment: '判断',
  fill_blank: '填空', short_answer: '简答', programming: '编程',
};

const levelLabels: Record<string, { label: string; color: string }> = {
  top: { label: '学霸', color: 'text-blue-600' },
  medium: { label: '中等', color: 'text-amber-600' },
  weak: { label: '提升', color: 'text-red-600' },
};

export default function TeacherAssignments() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'student'>('list');

  // Filters
  const [filterCourseId, setFilterCourseId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStudentId, setFilterStudentId] = useState<string>('');
  const [expandedAsgn, setExpandedAsgn] = useState<number | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [questionBank, setQuestionBank] = useState<QuestionItem[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterType, setFilterType] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newCourseId, setNewCourseId] = useState('');
  const [creating, setCreating] = useState(false);

  // AI grading
  const [aiGrading, setAiGrading] = useState<number | null>(null);
  const [aiProgress, setAiProgress] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCourseId) params.set('course_id', filterCourseId);
      if (filterStatus) params.set('status', filterStatus);
      if (filterStudentId) params.set('student_id', filterStudentId);
      const res = await apiFetch(`/api/teacher/assignments?${params}`);
      const data = await res.json();
      if (data.success) {
        setAssignments(data.data);
        setCourses(data.courses || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterCourseId, filterStatus, filterStudentId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const fetchQuestionBank = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (newCourseId) params.set('course_id', newCourseId);
      if (filterDifficulty) params.set('difficulty', filterDifficulty);
      if (filterType) params.set('question_type', filterType);
      params.set('page_size', '100');
      const res = await apiFetch(`/api/teacher/questions/bank?${params}`);
      const data = await res.json();
      if (data.success) setQuestionBank(data.data);
    } catch (e) { console.error(e); }
  }, [newCourseId, filterDifficulty, filterType]);

  useEffect(() => {
    if (createOpen) fetchQuestionBank();
  }, [createOpen, fetchQuestionBank]);

  const toggleQuestion = (qid: number) => {
    setSelectedQuestions(prev =>
      prev.includes(qid) ? prev.filter(id => id !== qid) : [...prev, qid]
    );
  };

  const handleCreate = async () => {
    if (!newTitle || !newStartTime || !newEndTime || selectedQuestions.length === 0) return;
    setCreating(true);
    try {
      const selectedQs = questionBank.filter(q => selectedQuestions.includes(q.id));
      const totalScore = 100;
      const courseId = newCourseId ? parseInt(newCourseId) : selectedQs[0]?.course_id || 1;

      const res = await apiFetch('/api/teacher/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId, title: newTitle,
          description: newDesc, question_ids: selectedQuestions,
          total_score: totalScore, start_time: newStartTime,
          end_time: newEndTime, status: 'published',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateOpen(false);
        setNewTitle(''); setNewDesc(''); setNewStartTime(''); setNewEndTime('');
        setSelectedQuestions([]); setNewCourseId('');
        fetchAssignments();
      }
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleAIGrading = useCallback(async (asgnId: number) => {
    setAiGrading(asgnId);
    setAiProgress('正在获取未批改学生列表...');
    try {
      const res = await apiFetch(`/api/teacher/assignments/${asgnId}/questions`);
      const data = await res.json();
      if (!data.success) { setAiProgress('获取数据失败'); return; }

      const students = data.data.submissions || [];
      const ungraded = students.filter((s: any) => s.graded_count < s.total_count);

      if (ungraded.length === 0) {
        setAiProgress('所有学生已批改完成！');
        setTimeout(() => { setAiGrading(null); setAiProgress(''); }, 1500);
        return;
      }

      let completed = 0;
      for (const s of ungraded) {
        setAiProgress(`正在批改 ${s.real_name} 的作业... (${completed + 1}/${ungraded.length})`);
        await apiFetch('/api/ai/grade/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignment_id: asgnId, student_id: s.student_id }),
        });
        completed++;
      }

      setAiProgress(`批改完成！共批改 ${completed} 名学生，错题已自动归档`);
      fetchAssignments();
    } catch {
      setAiProgress('AI 批改出错，请重试');
    } finally {
      setTimeout(() => { setAiGrading(null); setAiProgress(''); }, 2000);
    }
  }, [fetchAssignments]);

  if (!mounted) return null;

  // Group assignments by course
  const groupedByCourse = assignments.reduce((acc: Record<number, { course: any; assignments: AssignmentItem[] }>, asgn) => {
    const cid = asgn.course_id;
    if (!acc[cid]) acc[cid] = { course: asgn.course, assignments: [] };
    acc[cid].assignments.push(asgn);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* AI Grading Banner */}
      {aiGrading && (
        <Card className="border-teal-200 bg-teal-50/50 py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
            <div>
              <p className="text-sm font-medium text-teal-800">AI 批改智能体运行中</p>
              <p className="text-xs text-teal-600">{aiProgress}</p>
            </div>
            <Sparkles className="w-4 h-4 text-teal-500 ml-auto animate-pulse" />
          </CardContent>
        </Card>
      )}

      {/* Filters & Stats */}
      <Card className="border-slate-200/60 shadow-sm py-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button
              onClick={() => { setFilterCourseId('all'); setLoading(true); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterCourseId === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >全部课程</button>
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => { setFilterCourseId(String(c.id)); setLoading(true); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterCourseId === String(c.id) ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >{c.name}</button>
            ))}
            <div className="border-l border-slate-200 h-5 mx-2" />
            {(['all','published','closed','draft'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setLoading(true); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filterStatus === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >{{all: '全部', published: '进行中', closed: '已结束', draft: '草稿'}[s]}</button>
            ))}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'student')} className="ml-auto">
              <TabsList className="bg-slate-100 p-1 rounded-lg">
                <TabsTrigger value="list" className="rounded-md text-xs data-[state=active]:bg-white">
                  <FileText className="w-3.5 h-3.5 mr-1" /> 作业视图
                </TabsTrigger>
                <TabsTrigger value="student" className="rounded-md text-xs data-[state=active]:bg-white">
                  <Users className="w-3.5 h-3.5 mr-1" /> 学生视图
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3 ml-2">
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => router.push('/teacher/grading-config')}>
                <SlidersHorizontal className="w-4 h-4 mr-1" /> 批改规则
              </Button>
              <Button size="sm" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" onClick={() => router.push('/teacher/assignments/new')}>
                <Plus className="w-4 h-4 mr-1" /> 新建作业
              </Button>
            </div>
          </div>
          <div className="flex gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span>共 <strong className="text-slate-700">{assignments.length}</strong> 份作业</span>
            <span className="text-teal-600"><strong>{assignments.filter(a => a.status === 'published').length}</strong> 进行中</span>
            <span className="text-slate-400"><strong>{assignments.filter(a => a.status === 'closed').length}</strong> 已结束</span>
            <span className="text-amber-600"><strong>{assignments.filter(a => a.status === 'draft').length}</strong> 草稿</span>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
        </div>
      ) : assignments.length === 0 ? (
        <Card className="py-0">
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">暂无作业</p>
            <p className="text-sm text-slate-400 mt-1">点击&ldquo;新建作业&rdquo;从题库选题布置</p>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* ===== 作业视图：按课程分组 ===== */
        <div className="space-y-8">
          {Object.entries(groupedByCourse).map(([cid, group]) => (
            <div key={cid}>
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-slate-800">{group.course?.name || `课程${cid}`}</h2>
                <Badge className="bg-slate-100 text-slate-500 text-xs">{group.assignments.length}次作业</Badge>
              </div>
              <div className="grid gap-3">
                {group.assignments.map((asgn) => {
                  const config = statusConfig[asgn.status] || statusConfig.published;
                  const StatusIcon = config.icon;
                  return (
                    <Card key={asgn.id} className="hover:shadow-md transition-shadow py-0">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-slate-800">{asgn.title}</h3>
                              <Badge className={`text-xs ${config.className}`} variant="outline">
                                <StatusIcon className="w-3 h-3 mr-1" /> {config.label}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                              <span>截止: {new Date(asgn.end_time).toLocaleDateString('zh-CN')}</span>
                              <span>{asgn.question_count}题 · 满分{fmt(asgn.total_score)}</span>
                              {asgn.submitted_count > 0 ? (
                                <span className="inline-flex items-center gap-2">
                                  <span>已交 {asgn.submitted_count}/{asgn.total_students}</span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span>已批 {asgn.graded_count}/{asgn.submitted_count}</span>
                                    <span className="relative inline-block w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden align-middle">
                                      <span className="absolute inset-y-0 left-0 bg-teal-500 rounded-full" style={{ width: `${(asgn.graded_count / Math.max(asgn.submitted_count, 1)) * 100}%` }} />
                                    </span>
                                  </span>
                                </span>
                              ) : (
                                <span>提交 0 人</span>
                              )}
                              {asgn.avg_score > 0 && (
                                <span className="font-mono font-medium text-slate-700">均分 {asgn.avg_score}</span>
                              )}
                            </div>
                            {/* Student stats expand */}
                            {expandedAsgn === asgn.id && asgn.student_stats && (
                              <div className="mt-4 border-t pt-3">
                                <p className="text-xs text-slate-400 mb-2">学生完成情况</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                                  {asgn.student_stats.map((ss) => (
                                    <div
                                      key={ss.studentId}
                                      className={`border rounded-lg p-2.5 cursor-pointer hover:shadow-sm transition-all ${
                                        ss.status === 'completed' ? 'border-green-200 bg-green-50/50' :
                                        ss.status === 'submitted' ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'
                                      }`}
                                      onClick={() => router.push(`/teacher/students/${ss.studentId}`)}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-slate-700 truncate">{ss.studentName}</span>
                                        <span className={`text-xs ${levelLabels[ss.studentLevel]?.color || 'text-slate-400'}`}>
                                          {levelLabels[ss.studentLevel]?.label || ''}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400">
                                          {ss.status === 'completed' ? '已批改' : ss.status === 'submitted' ? '待批改' : '未提交'}
                                        </span>
                                        {ss.avgScore > 0 && (
                                          <span className={`text-xs font-mono font-bold ${
                                            ss.avgScore >= 75 ? 'text-green-600' : ss.avgScore >= 60 ? 'text-amber-600' : 'text-red-600'
                                          }`}>
                                            {ss.avgScore}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setExpandedAsgn(expandedAsgn === asgn.id ? null : asgn.id)}
                            >
                              <Users className="w-4 h-4 mr-1" />
                              {expandedAsgn === asgn.id ? '收起' : '学生'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => router.push(`/teacher/assignments/${asgn.id}`)}>
                              <Eye className="w-4 h-4 mr-1" /> 详情
                            </Button>
                            {asgn.submitted_count > 0 && asgn.graded_count < asgn.submitted_count && (
                              <Button
                                size="sm"
                                className="bg-teal-600 hover:bg-teal-700"
                                disabled={!!aiGrading}
                                onClick={() => router.push(`/teacher/assignments/${asgn.id}`)}
                              >
                                <Sparkles className="w-4 h-4 mr-1" /> 批改
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ===== 学生视图：按学生聚合 ===== */
        <div className="space-y-4">
          {(() => {
            // Aggregate all student stats across assignments
            const studentMap = new Map<number, {
              studentId: number; studentName: string; studentLevel: string;
              totalAssignments: number; completedAssignments: number;
              totalScore: number; totalFull: number; assignments: any[];
            }>();
            assignments.forEach((asgn) => {
              (asgn.student_stats || []).forEach((ss) => {
                if (!studentMap.has(ss.studentId)) {
                  studentMap.set(ss.studentId, {
                    studentId: ss.studentId, studentName: ss.studentName,
                    studentLevel: ss.studentLevel, totalAssignments: 0,
                    completedAssignments: 0, totalScore: 0, totalFull: 0, assignments: [],
                  });
                }
                const sm = studentMap.get(ss.studentId)!;
                sm.totalAssignments++;
                if (ss.status === 'completed') sm.completedAssignments++;
                sm.totalScore += ss.totalScore;
                sm.totalFull += ss.totalFull;
                sm.assignments.push({ ...ss, assignmentTitle: asgn.title, assignmentId: asgn.id });
              });
            });
            const studentList = Array.from(studentMap.values());

            return studentList.map((sm) => (
              <Card key={sm.studentId} className="hover:shadow-md transition-shadow cursor-pointer py-0"
                onClick={() => router.push(`/teacher/students/${sm.studentId}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                        {sm.studentName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{sm.studentName}</span>
                          <span className={`text-xs ${levelLabels[sm.studentLevel]?.color || ''}`}>
                            {levelLabels[sm.studentLevel]?.label || ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {sm.completedAssignments}/{sm.totalAssignments} 次作业已完成
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-xs text-slate-400">综合评分</p>
                        <p className={`text-lg font-bold font-mono ${
                          sm.totalFull > 0 && (sm.totalScore / sm.totalFull) * 100 >= 75 ? 'text-green-600' :
                          sm.totalFull > 0 && (sm.totalScore / sm.totalFull) * 100 >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {sm.totalFull > 0 ? Math.round((sm.totalScore / sm.totalFull) * 1000) / 10 : '-'}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300" />
                    </div>
                  </div>
                  {/* Mini progress per assignment */}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {sm.assignments.map((a: any) => (
                      <div key={a.assignmentId} className={`px-2 py-1 rounded text-xs ${
                        a.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
                        a.status === 'submitted' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-50 text-slate-400 border border-slate-200'
                      }`}>
                        {a.assignmentTitle}
                        {a.avgScore > 0 && <span className="ml-1 font-mono font-bold">{a.avgScore}</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
        </div>
      )}

      {/* Create Assignment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建作业 - 从题库选题</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>作业标题</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="如：第一次课后练习" />
              </div>
              <div>
                <Label>课程</Label>
                <Select value={newCourseId} onValueChange={setNewCourseId}>
                  <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>开始时间</Label>
                <Input type="datetime-local" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} />
              </div>
              <div>
                <Label>截止时间</Label>
                <Input type="datetime-local" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>作业说明</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="可选" rows={2} />
            </div>

            {/* Question bank filters */}
            <div className="flex gap-2">
              <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="难度" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部难度</SelectItem>
                  <SelectItem value="easy">简单</SelectItem>
                  <SelectItem value="medium">中等</SelectItem>
                  <SelectItem value="hard">困难</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="题型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部题型</SelectItem>
                  <SelectItem value="single_choice">单选</SelectItem>
                  <SelectItem value="multi_choice">多选</SelectItem>
                  <SelectItem value="judgment">判断</SelectItem>
                  <SelectItem value="fill_blank">填空</SelectItem>
                  <SelectItem value="short_answer">简答</SelectItem>
                  <SelectItem value="programming">编程</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500 self-center ml-auto">
                已选 {selectedQuestions.length} 题 · 总分 {
                  questionBank.filter(q => selectedQuestions.includes(q.id)).reduce((s, q) => s + q.default_score, 0)
                }分
              </span>
            </div>

            {/* Question list */}
            <div className="border rounded-lg max-h-80 overflow-y-auto">
              {questionBank.map((q) => (
                <div
                  key={q.id}
                  className={`flex items-start gap-3 p-3 border-b last:border-0 cursor-pointer hover:bg-slate-50 transition-colors ${
                    selectedQuestions.includes(q.id) ? 'bg-teal-50 border-l-4 border-l-teal-500' : ''
                  }`}
                  onClick={() => toggleQuestion(q.id)}
                >
                  <input type="checkbox" checked={selectedQuestions.includes(q.id)} readOnly className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 line-clamp-2">{q.content}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge className={`text-xs ${difficultyConfig[q.difficulty] || ''}`}>{q.difficulty === "easy" ? "简单" : q.difficulty === "medium" ? "中等" : q.difficulty === "hard" ? "困难" : q.difficulty}</Badge>
                      <Badge className="text-xs bg-slate-100 text-slate-500">{typeLabels[q.question_type] || q.question_type}</Badge>
                      <span className="text-xs text-slate-400">{q.default_score}分</span>
                      {q.knowledge_point && (
                        <span className="text-xs text-teal-600">{q.knowledge_point.name}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                disabled={creating || !newTitle || selectedQuestions.length === 0}
                onClick={handleCreate}
              >
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                布置作业 ({selectedQuestions.length}题)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

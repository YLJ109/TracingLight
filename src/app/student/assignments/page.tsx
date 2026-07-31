'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUser } from '@/lib/auth-helper';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Clock, XCircle, Send, Eye, Loader2, BookOpen, Search } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface AssignmentItem {
  id: number;
  title: string;
  course_name: string;
  course_id: number;
  status: string;
  total_score: number;
  start_time: string;
  end_time: string;
  question_count: number;
  my_score?: number;
  is_submitted: boolean;
}

interface QuestionDetail {
  id: number;
  content: string;
  question_type: string;
  difficulty: string;
  answer: string;
  default_score: number;
  knowledge_point: { name: string } | null;
  student_answer: string | null;
  is_submitted: boolean;
  grading: {
    total_score: number;
    full_score: number;
    dimension_scores: any;
    annotations: any;
    status: string;
  } | null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  graded: { label: '已批改', icon: CheckCircle2, className: 'bg-green-50 text-green-700' },
  submitted: { label: '待批改', icon: Clock, className: 'bg-amber-50 text-amber-700' },
  pending: { label: '待提交', icon: XCircle, className: 'bg-slate-100 text-slate-600' },
};

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
};
const STATUS_TABS = [
  { key: 'all', label: '全部', color: 'bg-slate-600' },
  { key: 'pending', label: '待提交', color: 'bg-amber-500' },
  { key: 'submitted', label: '已提交', color: 'bg-blue-500' },
  { key: 'graded', label: '已批改', color: 'bg-teal-500' },
];


export default function StudentAssignments() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<number>(3);

  // 筛选
  const [filterCourse, setFilterCourse] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 课程列表和筛选结果
  const courses = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach(a => { if (a.course_name) set.add(a.course_name); });
    return Array.from(set);
  }, [assignments]);

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      if (filterCourse !== 'all' && a.course_name !== filterCourse) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'pending' && a.status !== 'pending') return false;
        if (filterStatus === 'submitted' && a.status !== 'submitted') return false;
        if (filterStatus === 'graded' && a.status !== 'graded') return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !(a.course_name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [assignments, filterCourse, filterStatus, searchQuery]);

  // 提交弹窗
  const [submitOpen, setSubmitOpen] = useState(false);
  const [detailQuestions, setDetailQuestions] = useState<QuestionDetail[]>([]);
  const [detailAssignment, setDetailAssignment] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  // 查看批改弹窗
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<QuestionDetail[]>([]);
  const [reviewAssignment, setReviewAssignment] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) setStudentId(user.id);
    });
  }, []);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/student/assignments?student_id=${studentId}`);
      const data = await res.json();
      if (data.success) setAssignments(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { if (studentId) fetchAssignments(); }, [fetchAssignments, studentId]);

  const handleOpenSubmit = async (asgn: AssignmentItem) => {
    setSubmitOpen(true);
    setDetailLoading(true);
    setAnswers({});
    try {
      const res = await apiFetch(`/api/student/assignments/${asgn.id}?student_id=${studentId}`);
      const data = await res.json();
      if (data.success) {
        setDetailAssignment(data.data);
        setDetailQuestions(data.data.questions || []);
        // Pre-fill existing answers
        const existing: Record<number, string> = {};
        (data.data.questions || []).forEach((q: QuestionDetail) => {
          if (q.student_answer) existing[q.id] = q.student_answer;
        });
        setAnswers(existing);
      }
    } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  };

  const handleOpenReview = async (asgn: AssignmentItem) => {
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const res = await apiFetch(`/api/student/assignments/${asgn.id}?student_id=${studentId}`);
      const data = await res.json();
      if (data.success) {
        setReviewAssignment(data.data);
        setReviewQuestions(data.data.questions || []);
      }
    } catch (e) { console.error(e); }
    finally { setReviewLoading(false); }
  };

  const handleSubmit = async () => {
    if (!detailAssignment) return;
    setSubmitting(true);
    try {
      const answerList = Object.entries(answers).map(([qid, ans]) => ({
        question_id: parseInt(qid),
        student_answer: ans,
      }));

      const res = await apiFetch('/api/student/assignments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: detailAssignment.id,
          student_id: studentId,
          answers: answerList,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitOpen(false);
        fetchAssignments();
      }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleSave = async () => {
    if (!detailAssignment) return;
    setSaving(true);
    try {
      const answerList = Object.entries(answers).map(([qid, ans]) => ({
        question_id: parseInt(qid),
        student_answer: ans,
      }));

      const res = await apiFetch('/api/student/assignments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: detailAssignment.id,
          student_id: studentId,
          answers: answerList,
          is_draft: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('作业已保存！');
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (!mounted) return null;

  const pending = assignments.filter(a => a.status === 'pending');
  const submitted = assignments.filter(a => a.status === 'submitted' || a.status === 'graded');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold text-slate-800">我的作业</h1>
        <p className="text-sm text-slate-500">查看和提交作业</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-teal-600">{pending.length}</div>
            <p className="text-sm text-slate-500">待提交</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-amber-600">{submitted.length}</div>
            <p className="text-sm text-slate-500">已提交/已批改</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-600">
              {assignments.filter(a => a.status === 'graded').length}
            </div>
            <p className="text-sm text-slate-500">已批改</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={filterCourse === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterCourse('all')} className="rounded-full">全部</Button>
          {courses.map((c: string) => (
            <Button key={c} variant={filterCourse === c ? 'default' : 'outline'} size="sm" onClick={() => setFilterCourse(c)} className="rounded-full">{c}</Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map((tab: { key: string; label: string; color: string }) => (
            <button key={tab.key} onClick={() => setFilterStatus(tab.key)} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filterStatus === tab.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{tab.label} <span className="ml-1.5 text-xs opacity-70">{tab.key === 'all' ? assignments.length : assignments.filter(a => a.status === tab.key || (tab.key === 'submitted' && (a.status === 'submitted' || a.status === 'graded'))).length}</span></button>
          ))}
        </div>
      </div>

      {/* Assignment List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">暂无作业</p>
            <p className="text-sm text-slate-400 mt-1">请等待教师发布作业</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(asgn => {
            const config = statusConfig[asgn.status] || statusConfig.pending;
            const Icon = config.icon;
            return (
              <Card key={asgn.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-800">{asgn.title}</h3>
                        <Badge variant="outline" className="text-xs">{asgn.course_name}</Badge>
                        <Badge className={`text-xs ${config.className}`} variant="outline">
                          <Icon className="w-3 h-3 mr-1" />{config.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 text-sm text-slate-500 flex-wrap">
                        <span>截止: {new Date(asgn.end_time).toLocaleDateString('zh-CN')}</span>
                        <span>题目: {asgn.question_count}题</span>
                        <span>满分: {fmt(asgn.total_score)}分</span>
                        {asgn.my_score !== undefined && (
                          <span className="font-medium text-teal-600">
                            得分: {fmt(asgn.my_score)}/{fmt(asgn.total_score)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {asgn.status === 'graded' && (
                        <Button size="sm" variant="outline" onClick={() => router.push(`/student/assignments/${asgn.id}?tab=redo`)}>
                          <Send className="w-3 h-3 mr-1" /> 重做
                        </Button>
                      )}
                      <Button size="sm" onClick={() => router.push(`/student/assignments/${asgn.id}`)}>
                        {asgn.status === 'pending' ? <><Send className="w-3 h-3 mr-1" /> 去作答</> :
                         asgn.status === 'submitted' ? <><Clock className="w-3 h-3 mr-1" /> 继续修改</> :
                         <><Eye className="w-3 h-3 mr-1" /> 查看批改</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 提交作业弹窗 */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提交作业: {detailAssignment?.title}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="text-center py-8 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-500">
                共 {detailQuestions.length} 道题，满分 {detailAssignment?.total_score != null ? fmt(detailAssignment.total_score) : ''} 分
              </p>
              {detailQuestions.map((q, idx) => (
                <div key={q.id} className="p-4 border rounded-lg bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-slate-400">#{idx + 1}</span>
                    <Badge variant="outline" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
                    <span className="text-xs text-slate-400">{q.default_score}分</span>
                  </div>
                  <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap">{q.content}</p>
                  {q.question_type === 'single_choice' || q.question_type === 'judgment' ? (
                    <Input
                      placeholder="输入你的答案（如 A / 正确 / 错误）"
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  ) : (
                    <Textarea
                      placeholder="输入你的答案..."
                      className="min-h-[80px]"
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSubmitOpen(false)}>取消</Button>
                <Button variant="outline" onClick={handleSave} disabled={submitting}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  保存作业
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  确认提交
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 查看批改弹窗 */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批改详情: {reviewAssignment?.title}</DialogTitle>
          </DialogHeader>
          {reviewLoading ? (
            <div className="text-center py-8 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-teal-600">
                  总分: {reviewAssignment?.total_score != null ? fmt(reviewAssignment.total_score) : ''}/{reviewAssignment?.assignment_total != null ? fmt(reviewAssignment.assignment_total) : ''}
                </span>
                <span className="text-slate-400">共 {reviewQuestions.length} 题</span>
              </div>
              {reviewQuestions.map((q, idx) => {
                const g = q.grading;
                const isCorrect = g && g.total_score === g.full_score;
                return (
                  <div key={q.id} className={`p-4 border rounded-lg ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-slate-400">#{idx + 1}</span>
                      <Badge variant="outline" className="text-xs">{typeLabels[q.question_type] || q.question_type}</Badge>
                      {g && (
                        <Badge className={`text-xs ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {fmt(g.total_score)}/{fmt(g.full_score)}分
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mb-2 whitespace-pre-wrap">{q.content}</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">你的答案:</span>
                        <p className="text-slate-700 mt-0.5">{q.student_answer || '(未作答)'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">正确答案:</span>
                        <p className="text-teal-600 mt-0.5">{q.answer}</p>
                      </div>
                    </div>
                    {g?.annotations && Array.isArray(g.annotations) && (g.annotations as any[]).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        {(g.annotations as any[]).map((ann: any, i: number) => (
                          <p key={i} className="text-xs text-red-600">
                            {ann.comment || ann.content} {ann.point_deduction ? `(-${ann.point_deduction}分)` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

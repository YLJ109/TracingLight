'use client';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Calendar, CheckCircle2, Clock, BookOpen, Sparkles, RotateCcw, Loader2,
  Brain, Target, AlertTriangle, Zap, Play, ExternalLink,
  Plus, Pencil, Trash2,
} from 'lucide-react';

type SessionStatus = 'pending' | 'in_progress' | 'completed';

interface StudySession {
  time: string; topic: string; type: string; kp: string;
  priority: string; resources: string; duration: number; status: SessionStatus;
  knowledgePointId?: number | null;
}

interface DayPlan { day: string; date: string; sessions: StudySession[]; }

interface WeakPoint { name: string; mastery: number; }

interface ScheduleItem { id?: number; day_of_week: number; start_time: string; end_time: string; title: string; category?: string; }
interface ScheduleForm { id?: number; title: string; day_of_week: number; start_time: string; end_time: string; }

/** day_of_week 库中为 JSON 数组（如 [1,3,5]），归一为数字数组 */
const schedDays = (d: unknown): number[] => Array.isArray(d) ? d.map(Number).filter((n) => !isNaN(n)) : [Number(d ?? 1)].filter((n) => !isNaN(n));
/** 多天显示：[1,3,5] → 周一/三/五 */
const schedDaysLabel = (d: unknown): string => schedDays(d).map((n) => DAY_NAMES[n % 7] || `周${n}`).join('、');

interface ExamItem { subject: string; exam_date: string; exam_time: string; }

interface PlanData {
  plans: DayPlan[]; weakKnowledgePoints: WeakPoint[];
  schedules: ScheduleItem[]; exams: ExamItem[];
  generatedAt: string | null; totalSessions: number; completedSessions: number;
}

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const STORAGE_KEY = 'tracinglight_study_plan_progress';

function loadProgress(): Record<string, SessionStatus> {
  if (typeof window === 'undefined') return {};
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

function saveProgress(progress: Record<string, SessionStatus>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch {}
}

function sessionKey(dayIdx: number, sessionIdx: number) { return `${dayIdx}_${sessionIdx}`; }

/** 学习规划面板：作为「个性化推荐」薄弱分析右侧的 Tab 渲染 */
export function StudyPlanPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [source, setSource] = useState<'ai' | 'local' | null>(null);
  const [timers, setTimers] = useState<Record<string, number>>({});
  const timerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const applyProgress = useCallback((data: PlanData): PlanData => {
    const saved = loadProgress();
    const plans = data.plans.map((dp, di) => ({
      ...dp,
      sessions: dp.sessions.map((s, si) => ({
        ...s,
        status: saved[sessionKey(di, si)] || s.status || 'pending',
      })),
    }));
    const completedSessions = plans.reduce((sum, dp) =>
      sum + dp.sessions.filter(s => s.status === 'completed').length, 0);
    return { ...data, plans, completedSessions };
  }, []);

  const loadPlan = async (studentId: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/student/study-plan?student_id=${studentId}`);
      const data = await res.json();
      if (data.success && data.data?.plans?.length > 0) {
        setPlanData(applyProgress(data.data)); setSource('ai');
      } else { await generateAIPlan(studentId); }
    } catch (e) { await generateAIPlan(studentId); }
    finally { setLoading(false); }
  };

  const generateAIPlan = async (studentId: number) => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/student/study-plan/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, course_id: 1 }),
      });
      const data = await res.json();
      if (data.success && data.data?.weeklyPlan) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dayMap = new Map<string, DayPlan>();
        data.data.weeklyPlan.forEach((item: { plan_date: string; time_slot: string; subject: string; content: string; duration_minutes: number; plan_type: string }) => {
          const key = item.plan_date;
          if (!dayMap.has(key)) {
            const d = new Date(key);
            dayMap.set(key, { day: `${dayNames[d.getDay()]} ${key.slice(5)}`, date: key, sessions: [] });
          }
          dayMap.get(key)!.sessions.push({
            time: item.time_slot,
            topic: `${item.subject || ''} - ${(item.content || '').slice(0, 25)}`,
            type: item.plan_type, kp: item.subject || '',
            priority: item.plan_type === 'review' ? 'P0' : item.plan_type === 'practice' ? 'P1' : 'P2',
            resources: item.content || item.subject || '',
            duration: item.duration_minutes, status: 'pending',
          });
        });
        const basisRes = await apiFetch(`/api/student/study-plan?student_id=${studentId}`);
        const basisData = await basisRes.json();
        const rawPlan: PlanData = {
          plans: Array.from(dayMap.values()),
          weakKnowledgePoints: basisData.success ? basisData.data.weakKnowledgePoints : [],
          schedules: basisData.success ? (basisData.data.schedules || []).map((x: ScheduleItem) => ({ ...x, day_of_week: schedDays(x.day_of_week)[0] ?? 1 })) : [],
          exams: basisData.success ? basisData.data.exams : [],
          generatedAt: new Date().toISOString(),
          totalSessions: data.data.weeklyPlan.length, completedSessions: 0,
        };
        setPlanData(applyProgress(rawPlan)); setSource('ai'); return;
      }
    } catch (e) { console.error('AI plan generation failed', e); }
    finally { setGenerating(false); }
    setSource('local'); setGenerating(false);
  };

  const handleRegenerate = () => { getCurrentUser().then((user) => { generateAIPlan(user?.id || 3); }); };

  // ── 课表安排 CRUD ──
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({ title: '', day_of_week: 1, start_time: '19:00', end_time: '21:00' });

  const refreshSchedules = async () => {
    const user = await getCurrentUser();
    const res = await apiFetch(`/api/student/study-plan?student_id=${user?.id || 3}`);
    const d = await res.json();
    if (d.success) {
      setPlanData((prev) => prev ? { ...prev, schedules: (d.data.schedules || []).map((x: ScheduleItem) => ({ ...x, day_of_week: schedDays(x.day_of_week)[0] ?? 1 })) } : prev);
    }
  };

  const openScheduleForm = (s?: ScheduleItem) => {
    setScheduleForm(s
      ? { id: s.id, title: s.title, day_of_week: schedDays(s.day_of_week)[0] ?? 1, start_time: s.start_time, end_time: s.end_time }
      : { title: '', day_of_week: 1, start_time: '19:00', end_time: '21:00' });
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!scheduleForm.title.trim()) return;
    setScheduleSaving(true);
    try {
      const editing = !!scheduleForm.id;
      const res = await apiFetch('/api/student/schedule', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scheduleForm.id,
          title: scheduleForm.title.trim(),
          day_of_week: scheduleForm.day_of_week,
          start_time: scheduleForm.start_time,
          end_time: scheduleForm.end_time,
          schedule_type: 'fixed',
          category: '个人',
        }),
      });
      const d = await res.json();
      if (d.success) {
        setScheduleOpen(false);
        await refreshSchedules();
      } else {
        toast.error(d.error || '保存失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setScheduleSaving(false);
    }
  };

  const deleteSchedule = async (id?: number) => {
    if (!id) return;
    try {
      await apiFetch(`/api/student/schedule?id=${id}`, { method: 'DELETE' });
      setPlanData((prev) => prev ? { ...prev, schedules: prev.schedules.filter((s) => s.id !== id) } : prev);
      toast.success('已删除该安排');
    } catch {
      toast.error('删除失败');
    }
  };

  const updateSessionStatus = (dayIdx: number, sessionIdx: number, status: SessionStatus) => {
    setPlanData(prev => {
      if (!prev) return prev;
      const plans = prev.plans.map((dp, di) => {
        if (di !== dayIdx) return dp;
        return { ...dp, sessions: dp.sessions.map((s, si) => si === sessionIdx ? { ...s, status } : s) };
      });
      const completedSessions = plans.reduce((sum, dp) => sum + dp.sessions.filter(s => s.status === 'completed').length, 0);
      const saved = loadProgress(); saved[sessionKey(dayIdx, sessionIdx)] = status; saveProgress(saved);
      return { ...prev, plans, completedSessions };
    });
  };

  const handleStart = (dayIdx: number, sessionIdx: number) => {
    updateSessionStatus(dayIdx, sessionIdx, 'in_progress');
    const key = sessionKey(dayIdx, sessionIdx);
    setTimers(prev => ({ ...prev, [key]: 0 }));
    if (timerRefs.current[key]) clearInterval(timerRefs.current[key]);
    timerRefs.current[key] = setInterval(() => { setTimers(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 })); }, 1000);
  };

  const handleComplete = (dayIdx: number, sessionIdx: number) => {
    updateSessionStatus(dayIdx, sessionIdx, 'completed');
    const key = sessionKey(dayIdx, sessionIdx);
    if (timerRefs.current[key]) { clearInterval(timerRefs.current[key]); delete timerRefs.current[key]; }
    setTimers(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleNavigate = (session: StudySession) => {
    // 真实跳转：优先携带知识点上下文（错题/材料精准定位）
    const kpQ = session.knowledgePointId ? `?knowledge_point_id=${session.knowledgePointId}` : '';
    switch (session.type) {
      case 'review':    // 复习 → 该知识点错题专项复习
        router.push(`/student/errors${kpQ}`); break;
      case 'practice':  // 练习 → 学习材料针对性补漏
        router.push(`/student/materials${kpQ}`); break;
      case 'preview':   // 预习 → 学习材料先睹为快
        router.push(`/student/materials${kpQ}`); break;
      case 'diagnose':  // 诊断 → 知识图谱
        router.push('/student/knowledge-graph'); break;
      default:          // 复习及其他 → 错题本（杜绝空操作）
        router.push(`/student/errors${kpQ}`); break;
    }
  };

  useEffect(() => { return () => { Object.values(timerRefs.current).forEach(clearInterval); }; }, []);

  useEffect(() => { getCurrentUser().then((user) => { loadPlan(user?.id || 3); }); }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60); const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || generating) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-slate-500">{generating ? 'AI 正在分析学情数据并生成计划...' : '加载学习计划...'}</p>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-slate-500">暂无学习计划</p>
        <Button onClick={handleRegenerate} className="gap-2"><Sparkles className="h-4 w-4" /> 生成学习计划</Button>
      </div>
    );
  }

  const progress = planData.totalSessions > 0 ? (planData.completedSessions / planData.totalSessions) * 100 : 0;
  const generatedDate = planData.generatedAt ? new Date(planData.generatedAt) : null;
  // eslint-disable-next-line react-hooks/purity -- 渲染期只读当前时间换算"几天前"，无副作用，客户端展示可接受
  const daysAgo = generatedDate ? Math.floor((Date.now() - generatedDate.getTime()) / 86400000) : null;

  return (
    <div className="space-y-6">
      {/* Tab 内标题 + AI 状态/操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">学习规划</h2>
          <p className="text-xs text-slate-500 mt-0.5">基于学情数据的个性化学习方案</p>
        </div>
        <div className="flex items-center gap-3">
          {source === 'ai' && (
            <Badge variant="secondary" className="gap-1.5 bg-amber-50 text-amber-700 border-amber-200">
              <Sparkles className="h-3.5 w-3.5" />AI 智能生成
              {daysAgo !== null && daysAgo <= 1 && <span className="text-xs ml-1">· {daysAgo === 0 ? '今天' : '昨天'}</span>}
            </Badge>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRegenerate} disabled={generating}>
            <RotateCcw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />重新生成
          </Button>
        </div>
      </div>

      {/* AI Analysis Basis */}
      {source === 'ai' && (
        <Card className="border-teal-100 bg-gradient-to-br from-teal-50/50 to-white">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Brain className="h-5 w-5 text-teal-600" />AI 智能分析依据<Badge variant="outline" className="text-xs font-normal ml-2">数据来源</Badge></CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Target className="h-4 w-4 text-red-500" />薄弱知识点<Badge variant="outline" className="text-xs">{planData.weakKnowledgePoints.length}个</Badge></div>
                {planData.weakKnowledgePoints.length > 0 ? (
                  <div className="space-y-1.5">{planData.weakKnowledgePoints.slice(0, 5).map((wp, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs"><span className="text-slate-600 truncate flex-1">{wp.name}</span><div className="w-16"><Progress value={wp.mastery} className="h-1.5" /></div><span className="text-slate-400 w-8 text-right">{wp.mastery}%</span></div>
                  ))}</div>) : <p className="text-xs text-slate-400">暂无薄弱知识点数据</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Calendar className="h-4 w-4 text-blue-500" />课表安排<Badge variant="outline" className="text-xs">{planData.schedules.length}节课</Badge></div>
                  <button
                    onClick={() => openScheduleForm()}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  ><Plus className="w-3 h-3" /> 添加安排</button>
                </div>
                {planData.schedules.length > 0 ? (
                  <div className="space-y-1.5">{planData.schedules.map((s) => (
                    <div key={s.id ?? `${s.day_of_week}-${s.start_time}`} className="group flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-2">
                      <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="text-slate-700 font-medium shrink-0">{schedDaysLabel(s.day_of_week)}</span>
                      <span className="text-slate-500 shrink-0">{s.start_time}-{s.end_time}</span>
                      <span className="text-slate-600 truncate flex-1">{s.title}</span>
                      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openScheduleForm(s)} title="编辑" className="p-1 rounded hover:bg-slate-200 text-slate-500"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => deleteSchedule(s.id)} title="删除" className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                      </span>
                    </div>
                  ))}</div>) : <p className="text-xs text-slate-400">暂无课表，点击「添加安排」创建你的固定时间安排</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: '计划周期', value: `${planData.plans.length} 天`, sub: `${planData.plans[0]?.date} ~ ${planData.plans[planData.plans.length - 1]?.date}`, valueClass: 'text-teal-600', progress: false },
          { label: '总学习节数', value: `${planData.totalSessions}`, sub: `已完成 ${planData.completedSessions} 节`, valueClass: 'text-blue-600', progress: false },
          { label: '完成进度', value: `${progress.toFixed(0)}%`, sub: null, valueClass: 'text-amber-600', progress: true },
          { label: '重点知识点', value: `${planData.weakKnowledgePoints.length}`, sub: '薄弱知识点待攻克', valueClass: 'text-purple-600', progress: false },
        ].map((card, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">{card.label}</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</div>
              {card.sub && <p className="text-xs text-slate-500 mt-1">{card.sub}</p>}
              {card.progress && <Progress value={progress} className="mt-2" />}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-teal-600" />本周学习计划</CardTitle>
            {source === 'ai' && <div className="flex items-center gap-1.5 text-xs text-slate-500"><Zap className="h-3.5 w-3.5 text-amber-500" />已避开课表冲突时段</div>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {planData.plans.map((dayPlan, dayIndex) => (
              <div key={dayIndex} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">{dayPlan.day}</h3>
                  <Badge variant={dayPlan.sessions.every(s => s.status === 'completed') ? 'default' : 'secondary'}>
                    {dayPlan.sessions.filter(s => s.status === 'completed').length}/{dayPlan.sessions.length} 已完成
                  </Badge>
                </div>
                <div className="space-y-2">
                  {dayPlan.sessions.map((session, sessionIndex) => {
                    const key = sessionKey(dayIndex, sessionIndex);
                    const elapsed = timers[key] || 0;
                    const statusBg: Record<SessionStatus, string> = {
                      pending: 'bg-slate-50',
                      in_progress: 'bg-blue-50 border border-blue-200',
                      completed: 'bg-green-50 border border-green-200',
                    };
                    return (
                      <div key={sessionIndex} className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-200 ${statusBg[session.status]}`}>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Clock className={`h-4 w-4 ${session.status === 'in_progress' ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />
                          <span className="text-sm font-mono text-slate-600">{session.time}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${session.status === 'completed' ? 'text-green-700' : session.status === 'in_progress' ? 'text-blue-700' : 'text-slate-900'}`}>{session.topic}</span>
                            <Badge variant="outline" className="text-xs">{session.type === 'review' ? '复习' : session.type === 'practice' ? '练习' : '预习'}</Badge>
                            <Badge variant="outline" className={`text-xs ${session.priority === 'P0' ? 'border-red-300 text-red-600' : session.priority === 'P1' ? 'border-amber-300 text-amber-600' : 'border-blue-300 text-blue-600'}`}>{session.priority}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <BookOpen className="h-3 w-3" /><span>{session.resources}</span><span>·</span><span>{session.duration}分钟</span>
                            {session.status === 'in_progress' && <><span>·</span><span className="text-blue-600 font-mono font-medium">{formatTime(elapsed)}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {session.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : session.status === 'in_progress' ? (
                            <>
                              <Button size="sm" variant="outline" className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => handleNavigate(session)}><ExternalLink className="h-3 w-3 mr-1" />跳转</Button>
                              <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700" onClick={() => handleComplete(dayIndex, sessionIndex)}><CheckCircle2 className="h-3 w-3 mr-1" />完成</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" className="text-xs border-teal-300 text-teal-700 hover:bg-teal-50" onClick={() => handleNavigate(session)}><ExternalLink className="h-3 w-3 mr-1" />跳转</Button>
                              <Button size="sm" className="text-xs bg-teal-600 hover:bg-teal-700" onClick={() => handleStart(dayIndex, sessionIndex)}><Play className="h-3 w-3 mr-1" />开始</Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 课表安排 表单弹层 */}
      {scheduleOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setScheduleOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{scheduleForm.id ? '编辑安排' : '添加安排'}</h3>
              <button onClick={() => setScheduleOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">安排名称</label>
                <input
                  autoFocus
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="如：兼职、社团活动、健身"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">星期</label>
                  <select
                    value={scheduleForm.day_of_week}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, day_of_week: Number(e.target.value) }))}
                    className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-teal-200 bg-white"
                  >
                    {['周一','周二','周三','周四','周五','周六','周日'].map((d, i) => (
                      <option key={i} value={(i + 1) % 7}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">开始</label>
                  <input
                    type="time"
                    value={scheduleForm.start_time}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, start_time: e.target.value }))}
                    className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-teal-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">结束</label>
                  <input
                    type="time"
                    value={scheduleForm.end_time}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, end_time: e.target.value }))}
                    className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-teal-200"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">AI 生成学习计划时会自动避开这些固定时段</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" disabled={scheduleSaving || !scheduleForm.title.trim()} onClick={saveSchedule}>
                {scheduleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StudyPlanPanel;
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { getCurrentUser } from '@/lib/auth-helper';
import { SetActiveNav } from '@/components/app-shell';
import PracticePanel from '@/components/practice-panel';
import {
  CheckCircle2, RotateCcw, Brain, CalendarCheck, XCircle, Loader2,
  Lightbulb, ArrowRight, ThumbsUp, ThumbsDown, Minus, Sparkles,
} from 'lucide-react';

const errorTypeLabels: Record<string, string> = {
  concept_confusion: '概念混淆', calculation_error: '计算错误', calculation: '计算错误',
  logic_error: '逻辑错误', logic: '逻辑错误', knowledge_missing: '知识缺失', knowledge: '知识缺失',
  careless: '粗心大意', empty: '未作答', incomplete: '未答完整', wrong: '答案错误',
  method_error: '方法错误', expression: '表达问题', step_missing: '步骤缺失', other: '其他',
  practice: '练习错题',
};
const sessionTypeLabels: Record<string, string> = {
  review: '复习', practice: '练习', preview: '预习',
};

interface DueReview { id: number; type: 'review'; questionContent: string; student_answer: string | null; correct_answer: string | null; knowledgePointName: string; errorType: string; suggestion: string | null; reviewStatus: string | null; }
interface WeakPractice { type: 'practice'; knowledgePointId: number; knowledgePointName: string; masteryRate: number; errorCount: number; }
interface TodaySession { type: 'session'; id: number; knowledgePointName: string; sessionType: string; startTime: string; endTime: string; duration: number | null; isCompleted: boolean; }
type Task = DueReview | WeakPractice | TodaySession;

interface TodayData {
  date: string; totals: { reviews: number; practice: number; sessions: number; todo: number };
  dueReviews: DueReview[]; weakPractice: WeakPractice[]; sessions: TodaySession[];
}

export default function TodayPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [practiceKp, setPracticeKp] = useState<WeakPractice | null>(null);

  useEffect(() => { getCurrentUser().then((u) => setStudentId(u?.id ?? 3)); }, []);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/student/today?student_id=${studentId}`);
      const j = await r.json();
      if (j.success) setData(j.data);
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitReview = async (id: number, outcome: 'too_easy' | 'just_right' | 'too_hard') => {
    setBusy(id);
    setFeedback((f) => ({ ...f, [id]: outcome }));
    try {
      const r = await apiFetch('/api/student/today', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_book_id: id, outcome }),
      });
      const j = await r.json();
      if (j.success) {
        setFeedback((f) => ({ ...f, [id]: j.data.message }));
        fetchData(); // 刷新列表（掌握项移除）
      } else {
        setFeedback((f) => ({ ...f, [id]: j.error || '操作失败' }));
      }
    } catch { setFeedback((f) => ({ ...f, [id]: '网络错误' })); }
    setBusy(null);
  };

  const taskCount = data?.totals ? data.totals.reviews + data.totals.practice + data.totals.sessions : 0;

  return (
    <div className="space-y-6">
      <SetActiveNav href="/student/today" />

      {/* 头部 */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-16 top-12 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative">
          <p className="text-sm opacity-80 flex items-center gap-2"><Sparkles className="w-4 h-4" />今日学习 · {data?.date || '…'}</p>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2"><CalendarCheck className="w-6 h-6" />今日任务</h1>
          <p className="mt-2 text-sm opacity-90">根据错题遗忘曲线与薄弱点自动排期，今天只需完成 <b>{data?.totals.todo ?? '—'}</b> 项，循序渐进。</p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: '到期复习错题', value: data?.totals.reviews ?? 0, icon: <RotateCcw className="w-5 h-5" />, color: 'bg-rose-100 text-rose-600' },
          { label: '薄弱点练习', value: data?.totals.practice ?? 0, icon: <Brain className="w-5 h-5" />, color: 'bg-amber-100 text-amber-600' },
          { label: '计划内学习', value: data?.totals.sessions ?? 0, icon: <CalendarCheck className="w-5 h-5" />, color: 'bg-teal-100 text-teal-600' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.color}`}>{c.icon}</div>
            <div><p className="text-2xl font-bold text-slate-900">{c.value}</p><p className="text-xs text-slate-500">{c.label}</p></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : taskCount === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-700 font-medium text-lg">今日任务已清空</p>
          <p className="text-sm text-slate-400 mt-1">没有待复习的错题和薄弱点，保持这个节奏！</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* 到期错题复习 */}
          {data!.dueReviews.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-rose-500" />到期复习（{data!.dueReviews.length}）</h3>
              <div className="space-y-3">
                {data!.dueReviews.map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium">{r.knowledgePointName}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">{errorTypeLabels[r.errorType] || '其他错误'}</span>
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{r.questionContent}</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-xl bg-red-50/60 border border-red-100"><p className="text-xs font-medium text-red-600 mb-1">我的作答</p><p className="text-sm text-red-800 whitespace-pre-wrap">{r.student_answer || '未作答'}</p></div>
                      <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100"><p className="text-xs font-medium text-emerald-600 mb-1">正确答案</p><p className="text-sm text-emerald-800 whitespace-pre-wrap">{r.correct_answer || '（见解析）'}</p></div>
                    </div>
                    {r.suggestion && (
                      <div className="mt-3 p-3 rounded-xl bg-teal-50 border border-teal-100 flex gap-2">
                        <Lightbulb className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-teal-800">{r.suggestion}</p>
                      </div>
                    )}

                    {/* 反馈 */}
                    {feedback[r.id] ? (
                      <div className={`mt-4 p-3 rounded-xl text-sm ${(feedback[r.id].includes('掌握') || feedback[r.id].includes('已排')) && !feedback[r.id].includes('失败') && !feedback[r.id].includes('网络') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {feedback[r.id]}
                      </div>
                    ) : (
                      <div className="mt-4">
                        <p className="text-xs text-slate-400 mb-2">这次复习感觉如何？（决定下次何时再来）</p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => submitReview(r.id, 'too_easy')} disabled={busy === r.id} className="btn-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"><ThumbsUp className="w-3.5 h-3.5" />太简单 · 已掌握</button>
                          <button onClick={() => submitReview(r.id, 'just_right')} disabled={busy === r.id} className="btn-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"><Minus className="w-3.5 h-3.5" />刚好 · 再巩固3天</button>
                          <button onClick={() => submitReview(r.id, 'too_hard')} disabled={busy === r.id} className="btn-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"><ThumbsDown className="w-3.5 h-3.5" />太难 · 明天再复习</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 薄弱点练习 */}
          {data!.weakPractice.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-amber-500" />薄弱点专项（{data!.weakPractice.length}）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data!.weakPractice.map((w, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-800">{w.knowledgePointName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.masteryRate < 40 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>掌握度 {w.masteryRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-400" style={{ width: `${w.masteryRate}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mb-3">累计错题 {w.errorCount} 道</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPracticeKp(w)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-amber-500/25 hover:opacity-90 transition-opacity">开始练习</button>
                      <button onClick={() => router.push('/student/assistant?q=' + encodeURIComponent(`请用通俗易懂的方式帮我讲解「${w.knowledgePointName}」这个知识点，多举例子让我真正理解`))} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">问 AI 老师</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 今日计划 */}
          {data!.sessions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-teal-500" />今日计划（{data!.sessions.length}）</h3>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {data!.sessions.map((s) => (
                  <div key={s.id} className="p-4 flex items-center gap-3">
                    {s.isCompleted
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      : <CapsuleIcon type={s.sessionType} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.knowledgePointName}</p>
                      <p className="text-xs text-slate-400">{sessionTypeLabels[s.sessionType] || s.sessionType} · {s.startTime}-{s.endTime}{s.duration ? ` · ${s.duration}分钟` : ''}</p>
                    </div>
                    {s.isCompleted && <span className="text-xs text-emerald-600 shrink-0">已完成</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data!.totals.sessions === 0 && data!.totals.reviews === 0 && data!.totals.practice === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">今天没有更多任务了</p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => router.push('/student/recommend')} className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700">
          查看完整学情分析 <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 薄弱点就地练习面板 */}
      {practiceKp && (
        <PracticePanel
          kpId={practiceKp.knowledgePointId}
          kpName={practiceKp.knowledgePointName}
          onClose={() => setPracticeKp(null)}
          onDone={() => fetchData()}
        />
      )}
    </div>
  );
}

function CapsuleIcon({ type }: { type: string }) {
  const cls = type === 'preview'
    ? 'bg-violet-100 text-violet-600'
    : type === 'practice' ? 'bg-amber-100 text-amber-600' : 'bg-teal-100 text-teal-600';
  const Icon = type === 'preview' ? Sparkles : type === 'practice' ? Brain : RotateCcw;
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls} shrink-0`}>
      <Icon className="w-4 h-4" />
    </div>
  );
}
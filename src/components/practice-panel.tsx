'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { X, Loader2, CheckCircle2, XCircle, Lightbulb, Send, Dumbbell } from 'lucide-react';

interface PracticeQuestion {
  index: number;
  content: string;
  question_type: string;
  options: Record<string, string> | null;
  default_score: number;
}
interface ResultItem {
  index: number;
  is_correct: boolean;
  total_score: number;
  full_score: number;
  correct_answer: string;
  analysis: string;
  comment: string;
}

interface Props {
  kpId: number;
  kpName: string;
  onClose: () => void;
  onDone: () => void;
}

/** 今日任务 · 薄弱点就地练习面板：点击即出题、提交判分，结果同步知识图谱掌握度与错题本。 */
export default function PracticePanel({ kpId, kpName, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'generating' | 'doing' | 'submitting' | 'done'>('generating');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceId, setPracticeId] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<ResultItem[]>([]);
  const [scorePercent, setScorePercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/api/student/practice/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledge_point_id: kpId }),
        });
        const j = await r.json();
        if (j.success) {
          setQuestions(j.data.questions);
          setPracticeId(j.data.practice_id);
          setPhase('doing');
        } else {
          setError(j.error || '出题失败');
          setPhase('done');
        }
      } catch {
        setError('网络错误，请重试');
        setPhase('done');
      }
    })();
  }, [kpId]);

  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.index] ?? '') !== '');
  const typeLabel: Record<string, string> = { single_choice: '单选题', judgment: '判断题', fill_blank: '填空题', multiple_choice: '多选题', multi_choice: '多选题', code: '编程题', short_answer: '简答题' };

  const submit = async () => {
    setPhase('submitting');
    try {
      const r = await apiFetch('/api/student/practice/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practice_id: practiceId,
          answers: questions.map((q) => ({ index: q.index, student_answer: answers[q.index] ?? '' })),
        }),
      });
      const j = await r.json();
      if (j.success) {
        setResult(j.data.results);
        setScorePercent(j.data.score_percent);
        setPhase('done');
      } else {
        setError(j.error || '提交失败');
        setPhase('done');
      }
    } catch {
      setError('网络错误，请重试');
      setPhase('done');
    }
  };

  const finish = () => { onDone(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            <div>
              <p className="text-sm font-bold leading-tight">薄弱点练习</p>
              <p className="text-xs opacity-90">{kpName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="mt-3 text-sm text-slate-500">AI 正在针对该知识点生成练习…</p>
            </div>
          )}

          {phase === 'doing' && (
            <>
              <div className="space-y-5">
                {questions.map((q) => (
                  <div key={q.index} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                        {typeLabel[q.question_type] || '其他题型'}
                      </span>
                      <span className="text-xs text-slate-400">第{questions.findIndex((x) => x.index === q.index) + 1}题 · {q.default_score}分</span>
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{q.content}</p>
                    <div className="mt-3 space-y-2">
                      {q.options ? (
                        Object.entries(q.options).map(([key, text]) => {
                          const selected = answers[q.index] === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setAnswers((a) => ({ ...a, [q.index]: key }))}
                              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                                selected ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="font-semibold mr-2">{key}.</span>{text}
                            </button>
                          );
                        })
                      ) : (
                        <input
                          value={answers[q.index] ?? ''}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.index]: e.target.value }))}
                          placeholder="输入答案"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={submit}
                disabled={!allAnswered}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
                提交练习并同步
              </button>
            </>
          )}

          {(phase === 'submitting') && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="mt-3 text-sm text-slate-500">正在判分并同步知识图谱与错题本…</p>
            </div>
          )}

          {phase === 'done' && result.length > 0 && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-2xl ${scorePercent === 100 ? 'bg-emerald-50 border border-emerald-200' : scorePercent >= 60 ? 'bg-amber-50 border border-amber-200' : 'bg-rose-50 border border-rose-200'}`}>
                <span className="text-2xl font-bold text-slate-800">{scorePercent}%</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">作答完成，判断已同步</p>
                  <p className="text-xs text-slate-500">掌握度已回写知识图谱；答错的题已加入错题本（明天到期复习）</p>
                </div>
              </div>

              <div className="space-y-4">
                {questions.map((q, i) => {
                  const rs = result.find((r) => r.index === q.index) ?? result[i];
                  return (
                    <div key={q.index} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {rs?.is_correct
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          : <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rs?.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {rs?.is_correct ? '答对' : '答错'} · {rs?.total_score ?? 0}/{rs?.full_score ?? q.default_score}分
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">{typeLabel[q.question_type] || '其他题型'}</span>
                      </div>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{q.content}</p>
                      {!rs?.is_correct && (
                        <div className="mt-3 flex gap-2">
                          <span className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 whitespace-pre-wrap">
                            正确答案：<b className="text-slate-800">{rs?.correct_answer}</b>
                          </span>
                        </div>
                      )}
                      {(rs?.analysis || q.content) && (
                        <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100 flex gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{rs?.analysis || '（暂无解析）'}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={finish}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/25"
              >
                完成，回到今日任务
              </button>
            </div>
          )}

          {phase === 'done' && (error || result.length === 0) && (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-500">{error || '没有可用的题目'}</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">关闭</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
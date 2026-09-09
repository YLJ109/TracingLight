"use client";

import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { useState, useEffect, useCallback, useRef } from "react";
import * as echarts from "echarts";
import { initChart } from "@/lib/echarts-utils";
import { StudyPlanPanel } from "@/components/study-plan-panel";
import {
  BookOpen, Target, Calendar, Sparkles, TrendingUp,
  AlertTriangle, Lightbulb, ChevronRight, Loader2, CheckCircle2,
  XCircle, ArrowUpRight, Flame, Info,
} from "lucide-react";

const errorTypeLabels: Record<string, string> = {
  concept_confusion: "概念混淆", calculation_error: "计算错误", calculation: "计算错误",
  logic_error: "逻辑错误", logic: "逻辑错误", knowledge_missing: "知识缺失", knowledge: "知识缺失",
  careless: "粗心大意", empty: "未作答", incomplete: "未答完整", wrong: "答案错误",
  method_error: "方法错误", expression: "表达问题", step_missing: "步骤缺失", other: "其他",
};
const materialTypeLabels: Record<string, string> = {
  video: "视频", document: "文档", slide: "课件",
};

// ===== 类型定义 =====
interface KnowledgeMastery {
  id: number; name: string; mastery: number; errorCount: number;
  level: "strong" | "medium" | "weak"; courseId: number; courseName: string;
}
interface WeakPoint {
  knowledgePointId: number; name: string; masteryRate: number; errorCount: number; courseId: number;
  recentErrors: Array<{ id: number; content: string; difficulty: string; errorType: string }>;
  prerequisites: Array<{ nodeName: string; mastery: number }>;
  relatedKnowledge: Array<{ nodeName: string; mastery: number }>;
  aiSuggestion: string; priority: "P0" | "P1" | "P2";
  materialCount: number;
  materials: Array<{ id: number; title: string; type: string; duration: number; url: string; courseId: number; progress: number }>;
}
interface UpcomingExam { id: number; title: string; examDate: string; location: string; daysUntil: number; }
interface AiInsight { type: "warning" | "success" | "info"; icon: string; title: string; detail: string; }

interface RecommendData {
  knowledgeMastery: KnowledgeMastery[];
  masteryByCourse: Record<number, KnowledgeMastery[]>;
  weakPoints: WeakPoint[];
  totalErrors: number;
  overallMastery: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  radarData: Array<{ dimension: string; label: string; score: number }>;
  trendData: Array<{ date: string; mastery: number }>;
  courseComparison: Array<{ courseId: number; name: string; shortName: string; avgMastery: number; kpCount: number; errorCount: number }>;
  upcomingExams: UpcomingExam[]; aiInsights: AiInsight[]; courses: Array<{ id: number; name: string; short_name: string }>;
}

export default function RecommendPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [studentId, setStudentId] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    const stored = localStorage.getItem("current_user");
    return stored ? JSON.parse(stored).id : 3;
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecommendData | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "mastery" | "weak" | "plan">(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "plan") return "plan";
    return "overview";
  });

  useEffect(() => {
    const stored = localStorage.getItem("current_user");
    if (stored) { try { const u = JSON.parse(stored); if (u.id && u.role === "student") setStudentId(u.id); } catch { /* */ } }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const recRes = await apiFetch(`/api/student/recommend?student_id=${studentId}`);
      const rec = await recRes.json();
      if (rec.success) {
        setData(rec.data);
      }
    } catch { /* */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const radarRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const courseRef = useRef<HTMLDivElement>(null);

  // 总览驾驶舱：雷达 + 趋势 + 课程对比（真实数据，全部来自 /api/student/recommend）
  useEffect(() => {
    if (activeTab !== "overview" || !data) return;
    const cleanups: Array<() => void> = [];
    const t = setTimeout(() => {
      // —— 能力雷达（radarData 8 维）——
      if (radarRef.current && data.radarData?.length) {
        const chart = initChart(radarRef.current);
        chart.setOption({
          tooltip: { backgroundColor: "#fff", borderColor: "#e2e8f0", textStyle: { color: "#334155" }, extraCssText: "border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);" },
          radar: { center: ["50%", "54%"], radius: "60%", indicator: data.radarData.map((r) => ({ name: r.label, max: 100 })), axisName: { color: "#475569", fontSize: 11 }, splitArea: { areaStyle: { color: ["#f8fafc", "#f1f5f9"] } }, splitLine: { lineStyle: { color: "#e2e8f0" } } },
          series: [{ type: "radar", data: [{ value: data.radarData.map((r) => r.score), name: "能力画像", areaStyle: { color: "rgba(13,148,136,0.18)" }, lineStyle: { color: "#0d9488", width: 2 }, itemStyle: { color: "#0d9488" }, symbol: "circle", symbolSize: 5 }] }],
        });
        const h = () => chart.resize();
        window.addEventListener("resize", h);
        cleanups.push(() => { window.removeEventListener("resize", h); chart.dispose(); });
      }
      // —— 成绩趋势（trendData）——
      if (trendRef.current && data.trendData?.length) {
        const chart = initChart(trendRef.current);
        const dates = data.trendData.map((d) => d.date);
        const vals = data.trendData.map((d) => d.mastery);
        chart.setOption({
          tooltip: { trigger: "axis", backgroundColor: "#fff", borderColor: "#e2e8f0", textStyle: { color: "#334155" }, extraCssText: "border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);" },
          grid: { left: 40, right: 16, top: 24, bottom: 30 },
          xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel: { color: "#94a3b8", fontSize: 10 }, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false } },
          yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#94a3b8", fontSize: 10 }, splitLine: { lineStyle: { color: "#f1f5f9" } } },
          series: [{ name: "掌握度", type: "line", smooth: true, symbol: "circle", symbolSize: 6, data: vals,
            lineStyle: { color: "#0d9488", width: 2.5 },
            itemStyle: { color: "#0d9488" },
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(13,148,136,0.25)" }, { offset: 1, color: "rgba(13,148,136,0.02)" }]) } }],
        });
        const h = () => chart.resize();
        window.addEventListener("resize", h);
        cleanups.push(() => { window.removeEventListener("resize", h); chart.dispose(); });
      }
      // —— 课程对比（courseComparison 横向条形）——
      if (courseRef.current && data.courseComparison?.length) {
        const chart = initChart(courseRef.current);
        const cc = [...data.courseComparison].sort((a, b) => a.avgMastery - b.avgMastery);
        chart.setOption({
          tooltip: { trigger: "axis", backgroundColor: "#fff", borderColor: "#e2e8f0", textStyle: { color: "#334155" }, extraCssText: "border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.08);",
            formatter: (p: any) => { const d = cc[p[0]?.dataIndex]; return d ? `${d.name}<br/>平均掌握度 <b>${d.avgMastery}%</b><br/>知识点 ${d.kpCount} 个 · 错题 ${d.errorCount} 道` : ""; } },
          grid: { left: 90, right: 30, top: 12, bottom: 24 },
          xAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#94a3b8", fontSize: 10 }, splitLine: { lineStyle: { color: "#f1f5f9" } } },
          yAxis: { type: "category", data: cc.map((c) => c.shortName), axisLabel: { color: "#475569", fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
          series: [{ type: "bar", barWidth: 16, data: cc.map((c) => ({ value: c.avgMastery, itemStyle: { borderRadius: [0, 8, 8, 0], color: c.avgMastery >= 80 ? "#10b981" : c.avgMastery >= 60 ? "#f59e0b" : "#ef4444" } })), label: { show: true, position: "right", color: "#334155", fontSize: 11, formatter: "{c}%" } }],
        });
        const h = () => chart.resize();
        window.addEventListener("resize", h);
        cleanups.push(() => { window.removeEventListener("resize", h); chart.dispose(); });
      }
    }, 80);
    return () => { clearTimeout(t); cleanups.forEach((fn) => fn()); };
  }, [activeTab, data]);

  const getPriorityStyle = (p: string) => {
    if (p === "P0") return "bg-red-50 text-red-700 border-red-200";
    if (p === "P1") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  const getMasteryColor = (v: number) => v >= 80 ? "#10b981" : v >= 60 ? "#f59e0b" : "#ef4444";

  const getInsightIcon = (icon: string) => {
    const map: Record<string, React.ReactNode> = {
      AlertTriangle: <AlertTriangle className="w-4 h-4" />, TrendingUp: <TrendingUp className="w-4 h-4" />,
      Calendar: <Calendar className="w-4 h-4" />, Target: <Target className="w-4 h-4" />,
    };
    return map[icon] || <Info className="w-4 h-4" />;
  };

  const getInsightStyle = (type: string) => {
    if (type === "warning") return "bg-amber-50 border-amber-200 text-amber-800";
    if (type === "success") return "bg-emerald-50 border-emerald-200 text-emerald-800";
    return "bg-blue-50 border-blue-200 text-blue-800";
  };

  if (loading && activeTab !== "plan") return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      {/* Tab 导航 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([["overview", "总览"], ["mastery", "知识掌握"], ["weak", "薄弱分析"], ["plan", "学习规划"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              router.replace(`${pathname}?tab=${key}`);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >{label}</button>
        ))}
      </div>

      {/* ===== 总览 Tab ===== */}
      {activeTab === "overview" && data && (
        <div className="space-y-6">
          {/* KPI 指标条 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl p-4 bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-200">
              <div className="flex items-center gap-2 text-white/85 text-xs"><Target className="w-3.5 h-3.5" />综合掌握度</div>
              <div className="text-3xl font-bold mt-1">{data.overallMastery ?? 0}<span className="text-base font-medium text-white/80">%</span></div>
              <div className="text-[11px] text-white/70 mt-0.5">能力雷达 | 作业 | 巩固的综合得分</div>
            </div>
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />已掌握</div>
              <div className="text-3xl font-bold text-emerald-600 mt-1">{data.strongCount ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">掌握度 ≥ 80% 的知识点</div>
            </div>
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs"><TrendingUp className="w-3.5 h-3.5 text-amber-500" />需加强</div>
              <div className="text-3xl font-bold text-amber-500 mt-1">{data.mediumCount ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{'60% ≤ 掌握度 < 80%'}</div>
            </div>
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs"><AlertTriangle className="w-3.5 h-3.5 text-red-500" />薄弱 / 累计错题</div>
              <div className="text-3xl font-bold text-red-500 mt-1">{data.weakCount ?? 0}<span className="text-sm font-medium text-slate-300 mx-1">/</span>{data.totalErrors ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">薄弱点 {data.weakCount} 个 · 错题 {data.totalErrors} 道</div>
            </div>
          </div>

          {/* 图表区：雷达 + 趋势 + 课程对比 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-teal-600" />能力雷达</h3>
              {data.radarData?.length ? <div ref={radarRef} className="h-60 w-full" /> : <p className="text-sm text-slate-400 h-60 flex items-center justify-center">暂无能力数据</p>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-teal-600" />成绩趋势</h3>
              {data.trendData?.length ? <div ref={trendRef} className="h-60 w-full" /> : <p className="text-sm text-slate-400 h-60 flex items-center justify-center">完成作业后展示成绩趋势</p>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-teal-600" />课程对比</h3>
              {data.courseComparison?.length ? <div ref={courseRef} className="h-60 w-full" /> : <p className="text-sm text-slate-400 h-60 flex items-center justify-center">暂无课程数据</p>}
            </div>
          </div>

          {/* 优先级行动区（P0 薄弱点一键处置） */}
          {data.weakPoints.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-red-500" />优先攻克 <span className="text-xs font-normal text-slate-400">（P0 薄弱点，点击即走专项通道）</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.weakPoints.slice(0, 3).map((wp) => (
                  <div key={wp.knowledgePointId} className="rounded-xl p-4 bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">{wp.name}</span>
                      <span className="text-xs font-bold text-red-600 shrink-0">{wp.masteryRate}%</span>
                    </div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-red-400 to-orange-400" style={{ width: `${wp.masteryRate}%` }} /></div>
                    <div className="grid grid-cols-2 gap-1.5 mt-auto">
                      <button onClick={() => router.push(`/student/errors?knowledge_point_id=${wp.knowledgePointId}`)} className="text-[11px] py-1.5 rounded-lg bg-white text-red-600 hover:bg-red-100 transition-colors">专项错题</button>
                      <button onClick={() => router.push('/student/assistant?q=' + encodeURIComponent(`请帮我详细讲解「${wp.name}」这个薄弱知识点，给出学习方法和例题`))} className="text-[11px] py-1.5 rounded-lg bg-white text-violet-600 hover:bg-violet-100 transition-colors">问 AI</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI 智能洞察 */}
          {data.aiInsights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-500 flex items-center gap-2"><Sparkles className="w-4 h-4 text-teal-500" />AI 智能洞察</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.aiInsights.map((insight, i) => (
                  <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${getInsightStyle(insight.type)}`}>
                    <div className="mt-0.5">{getInsightIcon(insight.icon)}</div>
                    <div><p className="font-medium text-sm">{insight.title}</p><p className="text-xs mt-0.5 opacity-80">{insight.detail}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 近期考试 */}
          {data.upcomingExams.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-teal-600" />近期考试</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.upcomingExams.map(exam => (
                  <div key={exam.id} className="p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-900">{exam.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${exam.daysUntil <= 3 ? "bg-red-100 text-red-700" : exam.daysUntil <= 7 ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>{exam.daysUntil}天后</span>
                    </div>
                    <p className="text-xs text-slate-500">{exam.examDate} · {exam.location || "地点待定"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 知识掌握 Tab ===== */}
      {activeTab === "mastery" && data && (
        <div className="space-y-6">
          {data.courses.map(course => {
            const kps = data.masteryByCourse[course.id] || [];
            if (kps.length === 0) return null;
            return (
              <div key={course.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><BookOpen className="w-4 h-4 text-teal-600" />{course.name}</h3>
                  <span className="text-xs text-slate-400">{kps.length}个知识点 · 平均{Math.round(kps.reduce((s, k) => s + k.mastery, 0) / kps.length)}%</span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {kps.map(kp => (
                      <div key={kp.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ backgroundColor: getMasteryColor(kp.mastery) }}>{kp.mastery}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-slate-800 truncate">{kp.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${kp.level === "strong" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : kp.level === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                              {kp.level === "strong" ? "已掌握" : kp.level === "medium" ? "需加强" : "薄弱"}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${kp.mastery}%`, backgroundColor: getMasteryColor(kp.mastery) }} />
                          </div>
                          {kp.errorCount > 0 && <p className="text-xs text-slate-400 mt-1">错题 {kp.errorCount} 道</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 薄弱分析 Tab ===== */}
      {activeTab === "weak" && data && (
        <div className="space-y-4">
          {data.weakPoints.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center"><CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" /><p className="text-slate-600 font-medium">太棒了！没有薄弱知识点</p><p className="text-sm text-slate-400 mt-1">所有知识点掌握度均在70%以上</p></div>}
          {data.weakPoints.map((wp, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${wp.priority === "P0" ? "bg-red-100 text-red-600" : wp.priority === "P1" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                    {wp.priority === "P0" ? <Flame className="w-5 h-5" /> : wp.priority === "P1" ? <AlertTriangle className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{wp.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getPriorityStyle(wp.priority)}`}>{wp.priority}级</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">掌握度 {wp.masteryRate}% · 错题 {wp.errorCount} 道</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: getMasteryColor(wp.masteryRate) }}>{wp.masteryRate}%</div>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${wp.masteryRate}%`, backgroundColor: getMasteryColor(wp.masteryRate) }} />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 space-y-3">
                {/* 前置依赖 */}
                {wp.prerequisites.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />前置知识依赖</p>
                    <div className="flex flex-wrap gap-2">
                      {wp.prerequisites.map((pre, i) => (
                        <span key={i} className={`text-xs px-2.5 py-1 rounded-lg ${pre.mastery < 60 ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                          {pre.nodeName} <span className="opacity-70">({pre.mastery}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* 近期错题 */}
                {wp.recentErrors.length > 0 && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-xs font-medium text-red-700 mb-2 flex items-center gap-1"><XCircle className="w-3 h-3" />典型错题</p>
                    {wp.recentErrors.map((err, i) => (
                      <div key={i} className="text-xs text-red-800 py-1 border-b border-red-100 last:border-0">
                        <span className="font-medium">{errorTypeLabels[err.errorType] || '其他错误'}</span>
                        <span className="text-red-600 ml-2">{err.content?.slice(0, 60)}{err.content && err.content.length > 60 ? "..." : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* AI 建议 */}
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-100">
                  <p className="text-xs font-medium text-teal-700 mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" />AI 补习建议</p>
                  <p className="text-sm text-teal-800">{wp.aiSuggestion}</p>
                </div>
                {/* 推荐学习材料（真实关联该知识点） */}
                {wp.materials.length > 0 && (
                  <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-violet-700 flex items-center gap-1"><BookOpen className="w-3 h-3" />推荐学习材料（{wp.materialCount}）</p>
                      <button
                        onClick={() => router.push(`/student/learn?knowledge_point_id=${wp.knowledgePointId}`)}
                        className="text-xs font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1"
                      >查看全部 <ChevronRight className="w-3 h-3" /></button>
                    </div>
                    <div className="space-y-1.5">
                      {wp.materials.slice(0, 3).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => router.push(`/student/learn?knowledge_point_id=${wp.knowledgePointId}`)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-violet-100 hover:border-violet-300 transition-colors text-left"
                        >
                          <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${m.type === "video" ? "bg-fuchsia-50 text-fuchsia-600" : m.type === "slide" ? "bg-teal-50 text-teal-600" : "bg-violet-100 text-violet-600"}`}>{materialTypeLabels[m.type] || "文档"}</span>
                          <span className="flex-1 text-xs text-slate-700 truncate">{m.title}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{m.duration ? `${m.duration}分钟` : ""}</span>
                          <div className="w-12 h-1 rounded-full bg-slate-100 overflow-hidden shrink-0">
                            <div className={`h-full ${m.progress >= 100 ? "bg-teal-400" : "bg-violet-400"}`} style={{ width: `${m.progress}%` }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* 一键行动：真实跳转，路径直达 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    onClick={() => router.push('/student/learn')}
                    className="text-xs py-2 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                  >今日学习</button>
                  <button
                    onClick={() => router.push(`/student/errors?knowledge_point_id=${wp.knowledgePointId}`)}
                    className="text-xs py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >专项错题复习</button>
                  <button
                    onClick={() => setActiveTab('plan')}
                    className="text-xs py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                  >加入学习规划</button>
                  <button
                    onClick={() => router.push('/student/assistant?q=' + encodeURIComponent(`请帮我讲解「${wp.name}」这个我掌握比较薄弱的知识点，给出学习方法和例题`))}
                    className="text-xs py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >问 AI 老师</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 学习规划 Tab ===== */}
      {activeTab === "plan" && (
        <StudyPlanPanel />
      )}

    </div>
  );
}

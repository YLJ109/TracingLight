"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from '@/lib/api-fetch';
import { BackButton } from '@/components/ui/back-button';
import {
  User,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  Target,
  Award,
  Activity,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Flame,
  BarChart3,
  PieChart,
  LineChart,
  Sparkles,
  Loader2,
  FileDown, Printer,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReportMarkdown from '@/components/report-markdown';
import { htmlToPlainText } from '@/lib/rich-text';

// 中文标签映射
const typeLabels: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  multi_choice: "多选题",
  judgment: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  programming: "编程题",
};

const errorTypeLabels: Record<string, string> = {
  concept_confusion: "概念混淆",
  calculation_error: "计算错误",
  calculation: "计算错误",
  logic_error: "逻辑错误",
  logic: "逻辑错误",
  expression: "表达问题",
  knowledge: "知识缺失",
  method_error: "方法错误",
  method_unknown: "方法不会",
  step_missing: "步骤缺失",
  incomplete: "未答完整",
  wrong: "答案错误",
  empty: "未作答",
  careless: "粗心大意",
  knowledge_gap: "知识盲区",
  knowledge_missing: "知识缺失",
  typo: "书写错误",
  syntax_error: "语法错误",
  practice: "练习",
  other: "其他",
};

const questionTypeLabels: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  multi_choice: "多选题",
  fill_blank: "填空题",
  short_answer: "简答题",
  judgment: "判断题",
  code: "编程题",
  programming: "编程题",
};
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { initChart } from "@/lib/echarts-utils";

const levelConfig: Record<string, { label: string; color: string; bg: string }> = {
  top: { label: "学霸层", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  medium: { label: "中等层", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  weak: { label: "提升层", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

export default function StudentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState<any>(null);
  const [participationLoading, setParticipationLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("radar");
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const generateReport = async () => {
    setReportLoading(true);
    setReportError("");
    try {
      const res = await apiFetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: Number(id) }),
      });
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      } else {
        setReportError(json.error || "生成失败");
      }
    } catch (e) {
      setReportError("网络错误，请重试");
    } finally {
      setReportLoading(false);
    }
  };

  // ── 学情报告导出（Word / 打印-PDF）──
  const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const reportHtml = () => {
    if (!report) return '';
    const stu = student || {};
    const paragraphs = report.report.split('\n').filter(Boolean)
      .map((line: string) => `<p style="margin:6px 0;">${escapeHtml(line)}</p>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>学情分析报告</title></head>
<body style="font-family:'Microsoft YaHei',SimSun,sans-serif;max-width:760px;margin:24px auto;color:#222;">
  <h1 style="text-align:center;font-size:20px;border-bottom:2px solid #7c3aed;padding-bottom:10px;">AI 学情分析报告</h1>
  <p style="text-align:center;color:#666;font-size:12px;margin:8px 0 16px;">
    学生：${escapeHtml(stu.real_name || '')} ｜ 平均 ${report.avg} 分 ｜ 掌握度 ${report.avgMastery}% ｜ 错题 ${report.errorCount} 题
  </p>
  ${paragraphs}
  <p style="margin-top:24px;text-align:right;color:#999;font-size:11px;">溯光 TracingLight · 生成于 ${new Date().toLocaleString('zh-CN')}</p>
</body></html>`;
  };

  const exportReportWord = () => {
    const blob = new Blob(['\ufeff', reportHtml()], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学情报告_${(student?.real_name || '学生').replace(/[\\/:*?"<>|]/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(reportHtml());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch(`/api/teacher/students/${id}`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/teacher/students/${id}/participation`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.success) setParticipation(json.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setParticipationLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // ECharts - Radar Chart (only when tab is active)
  useEffect(() => {
    if (!data || activeTab !== "radar") return;

    const timer = setTimeout(() => {
      const container = document.getElementById("student-radar-chart");
      if (!container) return;

      const radarChart = initChart(container);
      radarChart.setOption({
        tooltip: { trigger: "item" },
        radar: {
          indicator: [
            { name: "知识准确性", max: 100 },
            { name: "逻辑完整性", max: 100 },
            { name: "表达条理性", max: 100 },
            { name: "拓展能力", max: 100 },
            { name: "作业完成率", max: 100 },
            { name: "错题解决率", max: 100 },
          ],
          radius: "65%",
          name: { textStyle: { fontSize: 12 } },
        },
        series: [{
          type: "radar",
          data: [{
            value: [
              Math.max(0, Math.min(100, data.radarData?.knowledgeAccuracy || 0)),
              Math.max(0, Math.min(100, data.radarData?.logicCompleteness || 0)),
              Math.max(0, Math.min(100, data.radarData?.expressionClarity || 0)),
              Math.max(0, Math.min(100, data.radarData?.expansionAbility || 0)),
              Math.max(0, Math.min(100, data.radarData?.completionRate || 0)),
              Math.max(0, Math.min(100, data.radarData?.errorResolutionRate || 0)),
            ],
            name: data.student?.real_name || "学生",
            areaStyle: { color: "rgba(13, 148, 136, 0.2)" },
            lineStyle: { color: "#0d9488", width: 2 },
            itemStyle: { color: "#0d9488" },
          }],
        }],
      });

      const handleResize = () => radarChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        radarChart.dispose();
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [data, activeTab]);

  // ECharts - Assignment Bar Chart
  useEffect(() => {
    if (!data || activeTab !== "assignments") return;

    const timer = setTimeout(() => {
      const container = document.getElementById("assignment-bar-chart");
      if (!container) return;

      const barChart = initChart(container);
      const assignments = data.assignmentHistory || [];
      barChart.setOption({
        tooltip: { trigger: "axis" },
        grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
        xAxis: {
          type: "category",
          data: assignments.map((a: any) => a.assignmentTitle || `作业${a.id}`),
          axisLabel: { rotate: 30, fontSize: 10 },
        },
        yAxis: { type: "value", min: 0, max: 100 },
        series: [{
          type: "bar",
          data: assignments.map((a: any) => ({
            value: Math.round((a.score / a.fullScore) * 100),
            itemStyle: {
              color: (a.score / a.fullScore) >= 0.8 ? "#10b981" : (a.score / a.fullScore) >= 0.6 ? "#f59e0b" : "#ef4444",
            },
          })),
          barWidth: "50%",
        }],
      });

      const handleResize = () => barChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        barChart.dispose();
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [data, activeTab]);

  // ECharts - Error Type Pie Chart
  useEffect(() => {
    if (!data || activeTab !== "errors") return;

    const timer = setTimeout(() => {
      const container = document.getElementById("error-pie-chart");
      if (!container) return;

      const pieChart = initChart(container);
      const errorTypes = data.errorAnalysis?.errorTypeDistribution || [];
      pieChart.setOption({
        tooltip: { trigger: "item" },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [{
          type: "pie",
          radius: ["35%", "65%"],
          itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, fontSize: 11, formatter: "{b}: {c}" },
          labelLayout: { hideOverlap: true },
          data: errorTypes.map((e: any) => ({
            value: e.count,
            name: errorTypeLabels[e.type] || e.type,
            itemStyle: {
              color: e.type === "concept_confusion" || e.type === "概念混淆" ? "#3b82f6" : e.type === "calculation_error" || e.type === "计算错误" ? "#f59e0b" : e.type === "logic_error" || e.type === "逻辑错误" ? "#ef4444" : "#8b5cf6",
            },
          })),
        }],
      });

      const handleResize = () => pieChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        pieChart.dispose();
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [data, activeTab]);

  // ECharts - Knowledge Mastery Bar Chart
  useEffect(() => {
    if (!data || activeTab !== "knowledge") return;

    const timer = setTimeout(() => {
      const container = document.getElementById("kp-bar-chart");
      if (!container) return;

      const kpChart = initChart(container);
      const kps = data.knowledgeMastery || [];
      kpChart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
        xAxis: { type: "value", min: 0, max: 100 },
        yAxis: {
          type: "category",
          data: kps.map((k: any) => k.name),
          axisLabel: { fontSize: 11 },
        },
        series: [{
          type: "bar",
          data: kps.map((k: any) => ({
            value: k.mastery,
            itemStyle: {
              color: k.mastery >= 80 ? "#10b981" : k.mastery >= 60 ? "#f59e0b" : "#ef4444",
            },
          })),
          barWidth: "60%",
        }],
      });

      const handleResize = () => kpChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        kpChart.dispose();
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [data, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        加载失败，请刷新重试
      </div>
    );
  }

  const { student, avgScore, totalErrors, masteredErrors, pendingErrors, assignmentHistory, knowledgeMastery, errorAnalysis, radarData } = data;
  const level = levelConfig[student.student_level || "medium"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-lg font-bold text-teal-700">
              {student.real_name?.slice(-1) || "?"}
            </div>
            <div>
              <h1 className="page-title">{student.real_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={cn("text-xs", level.bg, level.color)}>
                  {level.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {student.username} · 平均 {avgScore} 分
                </span>
              </div>
            </div>
          </div>
        </div>
        <Button
          onClick={generateReport}
          disabled={reportLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        >
          {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {reportLoading ? '生成中…' : 'AI 生成学情报告'}
        </Button>
        {report && (
          <>
            <Button
              onClick={exportReportWord}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
            >
              <FileDown className="w-4 h-4" /> 导出 Word
            </Button>
            <Button
              onClick={printReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
            >
              <Printer className="w-4 h-4" /> 打印 / PDF
            </Button>
          </>
        )}
      </div>

      {/* AI 学情报告 */}
      {reportError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{reportError}</p>
      )}
      {report && (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/40">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              AI 学情分析报告
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">平均 {report.avg} 分</Badge>
              <Badge variant="outline" className="text-xs">掌握度 {report.avgMastery}%</Badge>
              <Badge variant="outline" className="text-xs">错题 {report.errorCount} 题</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ReportMarkdown content={report.report} />
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Award className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">平均分</p>
              <p className="text-xl font-bold">{avgScore}<span className="text-sm font-normal text-slate-400"> 分</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">完成作业</p>
              <p className="text-xl font-bold">{assignmentHistory?.length || 0}<span className="text-sm font-normal text-slate-400"> 份</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">待复习错题</p>
              <p className="text-xl font-bold">{pendingErrors}<span className="text-sm font-normal text-slate-400"> 题</span></p>
              <p className="text-[11px] text-slate-400">{(pendingErrors + masteredErrors) > 0 ? `占错题 ${Math.round((pendingErrors / (pendingErrors + masteredErrors)) * 100)}%` : '暂无错题'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">已掌握错题</p>
              <p className="text-xl font-bold">{masteredErrors}<span className="text-sm font-normal text-slate-400"> 题</span></p>
              <p className="text-[11px] text-slate-400">{(pendingErrors + masteredErrors) > 0 ? `掌握率 ${Math.round((masteredErrors / (pendingErrors + masteredErrors)) * 100)}%` : '暂无错题'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 平时表现 / 学习参与度（D5 权重制） */}
      <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50/40 to-white py-1 gap-3">
        <CardHeader className="pt-3 pb-2 gap-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="w-4 h-4 text-violet-600" />
            平时表现分（近 30 天学习投入）
          </CardTitle>
          <CardDescription>
            按「签到 30% · 作业完成 20% · 阅读投入 25% · 讨论贡献 15% · 错题复习 10%」权重综合评定时分，满分 100
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {participationLoading ? (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
              <span className="text-sm text-muted-foreground">计算中…</span>
            </div>
          ) : participation ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ede9fe" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none" stroke="#8b5cf6" strokeWidth="3.5"
                      strokeLinecap="round" strokeDasharray={`${participation.score} 100`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-violet-700">
                    {participation.score}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground mt-1">平时表现分</span>
              </div>
              <div className="flex flex-col gap-2.5 lg:col-span-5">
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">签到率</span>
                  <Progress value={participation.signinRate} className="h-2 flex-1" />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-slate-600">{participation.signinDays}/{participation.windowDays} 天 · {participation.signinRate}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">作业完成</span>
                  <Progress value={participation.homeworkRate} className="h-2 flex-1" />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-slate-600">{participation.submittedCount}/{participation.assignedCount} 份 · {participation.homeworkRate}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">阅读投入</span>
                  <Progress value={participation.readingScore * 4} className="h-2 flex-1" />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-slate-600">{participation.readingMinutes} 分钟 · {participation.readingScore}/25 分</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">讨论贡献</span>
                  <Progress value={participation.discussionContribution * (100 / 15)} className="h-2 flex-1" />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-slate-600">{participation.postCount} 帖 · {participation.replyCount} 回 · {participation.discussionContribution}/15 分</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">错题复习</span>
                  <Progress value={participation.reviewRate} className="h-2 flex-1" />
                  <span className="w-36 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-slate-600">已练 {participation.reviewScore}/10 分 · 掌握 {participation.reviewRate}%</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">平时表现数据获取失败</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="radar" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="radar">六维能力雷达</TabsTrigger>
          <TabsTrigger value="assignments">作业历史</TabsTrigger>
          <TabsTrigger value="knowledge">知识掌握</TabsTrigger>
          <TabsTrigger value="errors">错题分析</TabsTrigger>
        </TabsList>

        {/* Tab 1: 六维能力雷达图 */}
        <TabsContent value="radar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" />
                六维能力雷达图
              </CardTitle>
              <CardDescription>
                知识准确性 · 逻辑完整性 · 表达条理性 · 拓展能力 · 作业完成率 · 错题解决率
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div id="student-radar-chart" className="h-96" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: 作业历史 */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                作业历史成绩
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div id="assignment-bar-chart" className="h-64" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: 知识掌握 */}
        <TabsContent value="knowledge">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4" />
                知识点掌握度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div id="kp-bar-chart" className="h-64" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: 错题分析 */}
        <TabsContent value="errors">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  错题类型分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div id="error-pie-chart" className="h-64" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  待复习错题
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(errorAnalysis?.recentErrors || []).map((err: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {questionTypeLabels[err.questionType] || "其他题型"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {err.courseName || ""}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">{htmlToPlainText(err.questionContent || "题目内容未知")}</p>
                      <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap break-words font-mono">
                        错误答案：{htmlToPlainText(err.wrongAnswer || "未知")}
                      </p>
                    </div>
                  ))}
                  {(!errorAnalysis?.recentErrors || errorAnalysis.recentErrors.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-8">暂无待复习错题</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { apiFetch } from '@/lib/api-fetch';
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Users,
  TrendingUp,
  Award,
  Target,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Flame,
  Zap,
  Brain,
  Sparkles,
  Activity,
  PieChart,
  LineChart,
  BarChart,
  Layers,
  Filter,
  MessagesSquare,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";

const levelConfig: Record<string, { label: string; color: string; bg: string }> = {
  top: { label: "学霸层", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  medium: { label: "中等层", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  weak: { label: "提升层", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

/** 秒 → 可读时长（不足 1 小时显示分钟，否则显示 x小时y分钟） */
function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

/** 人均阅读分钟数 */
function perStudentMinutes(stats: any): number {
  const total = stats?.totalReadonlySeconds || 0;
  const count = stats?.anytimeCount || 0;
  return count > 0 ? Math.round((total / 60) / count) : 0;
}

/** 错因类型 → 中文标签 */
function errorTypeLabel(t: string | null | undefined): string {
  const map: Record<string, string> = {
    concept_confusion: '概念混淆', calculation_error: '计算错误', calculation: '计算错误',
    logic_error: '逻辑错误', logic: '逻辑错误', knowledge_missing: '知识缺失', knowledge: '知识缺失',
    careless: '粗心大意', empty: '未作答', wrong: '答案错误', other: '其他',
  };
  return map[t || ''] || '其他';
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  // P2: 共性问题 + 临界生（AI 诊断）
  const [aiData, setAiData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 筛选维度：all / course / class
  const [dimension, setDimension] = useState<'all' | 'course' | 'class'>(
    searchParams.get('course_id') ? 'course' : 'all'
  );
  const [courseId, setCourseId] = useState<string>(searchParams.get('course_id') || '');
  const [classId, setClassId] = useState<string>('');

  const radarChartRef = useRef<echarts.ECharts | null>(null);
  const heatmapChartRef = useRef<echarts.ECharts | null>(null);
  const trendChartRef = useRef<echarts.ECharts | null>(null);
  const pieChartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = "/api/teacher/analytics";
        const params = new URLSearchParams();
        if (dimension === 'course' && courseId) params.set('course_id', courseId);
        if (dimension === 'class' && classId) params.set('class_id', classId);
        const qs = params.toString();
        if (qs) url += '?' + qs;
        const res = await apiFetch(url);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    // P2: 共性问题 + 临界生（仅在切到 AI tab 且未加载时拉取）
    const fetchAi = async () => {
      if (activeTab !== "ai" || aiData) return;
      setAiLoading(true);
      try {
        const params = new URLSearchParams();
        if (courseId) params.set('course_id', courseId);
        const qs = params.toString();
        const res = await apiFetch("/api/teacher/analytics/common-issues" + (qs ? `?${qs}` : ''));
        const json = await res.json();
        if (json.success) setAiData(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setAiLoading(false);
      }
    };
    fetchData();
    fetchAi();
  }, [dimension, courseId, classId, activeTab, aiData]);

  // Radar chart - only when tab is active
  useEffect(() => {
    if (!data || activeTab !== "radar") return;
    
    // 延迟初始化，确保 DOM 已渲染
    const timer = setTimeout(() => {
      const container = document.getElementById("radar-chart");
      if (!container) return;
      
      if (radarChartRef.current) {
        radarChartRef.current.dispose();
      }
      
      const radarChart = echarts.init(container);
      radarChartRef.current = radarChart;
      
      const radarData = data.students.map((s: any) => ({
        value: [
          s.radarData.knowledgeAccuracy,
          s.radarData.logicCompleteness,
          s.radarData.expressionClarity,
          s.radarData.expansionAbility,
          s.radarData.completionRate,
          s.radarData.errorResolutionRate,
        ],
        name: s.name,
      }));

      radarChart.setOption({
        tooltip: { trigger: "item" },
        legend: { data: data.students.map((s: any) => s.name), bottom: 0, textStyle: { fontSize: 11 } },
        radar: {
          indicator: [
            { name: "知识准确性", max: 100 },
            { name: "逻辑完整性", max: 100 },
            { name: "表达条理性", max: 100 },
            { name: "拓展能力", max: 100 },
            { name: "作业完成率", max: 100 },
            { name: "错题解决率", max: 100 },
          ],
          radius: "60%",
        },
        series: [{
          type: "radar",
          data: radarData,
          emphasis: { lineStyle: { width: 3 } },
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

  // Heatmap chart - only when tab is active
  useEffect(() => {
    if (!data || activeTab !== "heatmap") return;
    
    // 延迟初始化，确保 DOM 已渲染
    const timer = setTimeout(() => {
      const container = document.getElementById("heatmap-chart");
      if (!container) return;
      
      if (heatmapChartRef.current) {
        heatmapChartRef.current.dispose();
      }
      
      const heatmapChart = echarts.init(container);
      heatmapChartRef.current = heatmapChart;
      
      const students = data.students;
      const kps = data.knowledgePoints || [];
      const heatmapData = data.heatmapData || [];

      const heatmapOption = {
        tooltip: { position: "top" },
        grid: { height: "70%", top: "10%" },
        xAxis: { type: "category", data: kps, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: { type: "category", data: students.map((s: any) => s.name) },
        visualMap: {
          min: 0,
          max: 100,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: "0%",
          inRange: { color: ["#fee2e2", "#fef3c7", "#d1fae5"] },
        },
        series: [{
          type: "heatmap",
          data: heatmapData.map((h: any) => {
            const studentIdx = students.findIndex((s: any) => s.id === h.studentId);
            const kpIdx = kps.indexOf(h.kpName);
            // 数据库中 mastery 存储为 10000 = 100%, 需要转换
            return [kpIdx, studentIdx, Math.round(h.mastery / 100)];
          }),
          label: { show: true, fontSize: 10 },
        }],
      };
      heatmapChart.setOption(heatmapOption);

      const handleResize = () => heatmapChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        heatmapChart.dispose();
      };
    }, 100);
    
    return () => clearTimeout(timer);
  }, [data, activeTab]);

  // Trend chart - only when tab is active
  useEffect(() => {
    if (!data || activeTab !== "trend") return;
    
    // 延迟初始化，确保 DOM 已渲染
    const timer = setTimeout(() => {
      const container = document.getElementById("trend-chart");
      if (!container) return;
      
      if (trendChartRef.current) {
        trendChartRef.current.dispose();
      }
      
      const trendChart = echarts.init(container);
      trendChartRef.current = trendChart;
      
      trendChart.setOption({
        tooltip: { trigger: "axis" },
        legend: { data: ["班级平均", "学霸层", "中等层", "提升层"], bottom: 0 },
        grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
        xAxis: { type: "category", data: data.trendData?.weeks || [] },
        yAxis: { type: "value", min: 0, max: 100 },
        series: [
          { name: "班级平均", type: "line", data: data.trendData?.classAvg || [], smooth: true, lineStyle: { width: 3 }, itemStyle: { color: "#0d9488" } },
          { name: "学霸层", type: "line", data: data.trendData?.topLayer || [], smooth: true, lineStyle: { width: 2 }, itemStyle: { color: "#3b82f6" } },
          { name: "中等层", type: "line", data: data.trendData?.mediumLayer || [], smooth: true, lineStyle: { width: 2 }, itemStyle: { color: "#f59e0b" } },
          { name: "提升层", type: "line", data: data.trendData?.weakLayer || [], smooth: true, lineStyle: { width: 2 }, itemStyle: { color: "#ef4444" } },
        ],
      });

      const handleResize = () => trendChart.resize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        trendChart.dispose();
      };
    }, 100);
    
    return () => clearTimeout(timer);
  }, [data, activeTab]);

  // Pie chart - only when tab is active
  useEffect(() => {
    if (!data || activeTab !== "overview") return;
    
    // 延迟初始化，确保 DOM 已渲染
    const timer = setTimeout(() => {
      const container = document.getElementById("pie-chart");
      if (!container) return;
      
      if (pieChartRef.current) {
        pieChartRef.current.dispose();
      }
      
      const pieChart = echarts.init(container);
      pieChartRef.current = pieChart;
      
      pieChart.setOption({
        tooltip: { trigger: "item" },
        legend: { bottom: 0 },
        series: [{
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, formatter: "{b}: {c}人" },
          data: [
            { value: data.levelDistribution?.top || 0, name: "学霸层", itemStyle: { color: "#3b82f6" } },
            { value: data.levelDistribution?.medium || 0, name: "中等层", itemStyle: { color: "#f59e0b" } },
            { value: data.levelDistribution?.weak || 0, name: "提升层", itemStyle: { color: "#ef4444" } },
          ],
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

  const { students, classAvg, totalStudents, levelDistribution } = data;

  return (
    <div className="space-y-6">
      {/* 筛选栏：全部 / 按课程 / 按班级 + 右侧 讨论区/AI布置作业 */}
      <div className="flex flex-wrap items-center gap-3 justify-between rounded-xl border border-border bg-card p-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="w-4 h-4" />筛选维度
        </span>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {(['all', 'course', 'class'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDimension(d)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                dimension === d
                  ? "bg-white shadow-sm text-violet-600 font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d === 'all' ? '全部' : d === 'course' ? '按课程' : '按班级'}
            </button>
          ))}
        </div>
        {dimension === 'course' && (
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="选择课程" />
            </SelectTrigger>
            <SelectContent>
              {data?.courses?.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {dimension === 'class' && (
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="选择班级" />
            </SelectTrigger>
            <SelectContent>
              {data?.classes?.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* P2-1：从"发现薄弱"到"采取行动"的一键出口 */}
          <Button
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => router.push(`/teacher/discussion${courseId ? `?course_id=${courseId}` : ''}`)}
          >
            <MessagesSquare className="w-4 h-4" /> 讨论区
          </Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 gap-1.5 shrink-0"
            onClick={() => router.push(`/teacher/assignments/new?auto_ai=1${courseId ? `&course_id=${courseId}` : ''}`)}
          >
            <Zap className="w-4 h-4" /> 针对薄弱点 AI 布置作业
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">学生总数</p>
              <p className="text-xl font-bold">{totalStudents}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">班级平均分</p>
              <p className="text-xl font-bold">{classAvg}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Award className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">学霸层</p>
              <p className="text-xl font-bold">{levelDistribution.top}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">提升层</p>
              <p className="text-xl font-bold">{levelDistribution.weak}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 学习投入 · 阅读时长概览（D6） */}
      <Card className="border-violet-200/70 shadow-sm py-0">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">学习投入 · 材料阅读时长</span>
            </div>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              {data.readingStats?.anytimeCount || 0} 人开始学习
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-violet-50/60 p-3 flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg shrink-0"><Clock className="w-5 h-5 text-violet-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">班级累计阅读时长</p>
                <p className="text-xl font-bold text-violet-700">
                  {fmtDuration(data.readingStats?.totalReadonlySeconds || 0)}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-emerald-50/60 p-3 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg shrink-0"><BookOpen className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">已完成学习材料</p>
                <p className="text-xl font-bold text-emerald-700">
                  {data.readingStats?.completedMaterials || 0}
                  <span className="text-sm font-normal text-emerald-500"> / {data.readingStats?.totalMaterials || 0}</span>
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-orange-50/60 p-3 flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg shrink-0"><Activity className="w-5 h-5 text-orange-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">人均阅读</p>
                <p className="text-xl font-bold text-orange-700">{perStudentMinutes(data.readingStats)} 分钟</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">学生成绩概览</TabsTrigger>
          <TabsTrigger value="heatmap">知识点掌握热力图</TabsTrigger>
          <TabsTrigger value="radar">能力维度雷达图</TabsTrigger>
          <TabsTrigger value="trend">班级成绩趋势</TabsTrigger>
          <TabsTrigger value="ai">AI 共性问题</TabsTrigger>
        </TabsList>

        {/* Tab 1: 学生成绩概览 */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  学生层级分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div id="pie-chart" className="h-64" />
              </CardContent>
            </Card>

            {/* Student List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  学生成绩列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {students.map((student: any) => {
                    const level = levelConfig[student.level || "medium"];
                    return (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        onClick={() => router.push(`/teacher/students/${student.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                            {student.name.slice(-1)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{student.name}</p>
                            <Badge className={cn("text-xs", level.bg, level.color)}>
                              {level.label}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-teal-600">
                            <span className="text-lg font-bold">{student.avgScore}</span>
                            <span className="text-xs text-muted-foreground ml-1">分 · 完成 {student.completedAssignments} 次作业</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: 知识点掌握热力图 */}
        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" />
                知识点掌握热力图
              </CardTitle>
              <CardDescription>
                颜色越绿表示掌握度越高，红色表示需要加强
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div id="heatmap-chart" className="h-96" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: 能力维度雷达图 */}
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
              <div id="radar-chart" className="h-96" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: 班级成绩趋势 */}
        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                班级成绩趋势
              </CardTitle>
              <CardDescription>
                近 6 周班级平均分及各层级学生成绩变化趋势
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div id="trend-chart" className="h-96" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: AI 共性问题 + 临界生 */}
        <TabsContent value="ai" className="space-y-6">
          {aiLoading ? (
            <div className="flex items-center justify-center h-40 text-sm text-slate-400">
              <Brain className="w-5 h-5 animate-pulse mr-2" />AI 正在聚合分析全班学情…
            </div>
          ) : aiData ? (
            <>
              {/* AI 汇总 */}
              {aiData.summary && (
                <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-teal-700 flex items-center gap-2">
                      <Brain className="w-4 h-4" />教师行动建议
                      {aiData.aiGenerated
                        ? <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-200">AI 生成</Badge>
                        : <Badge variant="outline" className="text-[10px] text-slate-500">本地智能</Badge>}
                    </p>
                    <p className="mt-2 text-slate-700 leading-relaxed">{aiData.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* 共性问题 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" />全班共性问题清单</CardTitle>
                  <CardDescription>按知识点聚合错题与掌握度，识别最需要重点讲解的共性问题</CardDescription>
                </CardHeader>
                <CardContent>
                  {aiData.issues.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">暂无共性薄弱点，全班掌握情况良好</p>
                  ) : (
                    <div className="space-y-3">
                      {aiData.issues.map((it: any, i: number) => (
                        <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">{i + 1}</Badge>
                            <span className="font-medium text-slate-800">{it.knowledgePointName}</span>
                            <Badge variant="outline" className="text-[10px] text-slate-500">{it.courseName}</Badge>
                            <span className="text-xs text-rose-600 ml-auto">{it.affectedStudents} 名同学出错 · 平均掌握度 {Math.round(it.avgMastery * 100)}%</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200">错题 {it.errorCount} 道</Badge>
                            <Badge className="bg-rose-50 text-rose-700 border-rose-200">{errorTypeLabel(it.topErrorType) || '其他'}</Badge>
                          </div>
                          {it.actionSuggestion && (
                            <p className="mt-2 text-sm text-teal-800 flex gap-1"><Sparkles className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />{it.actionSuggestion}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 临界生预警 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Flame className="w-4 h-4 text-red-500" />临界生预警</CardTitle>
                    <CardDescription>持续薄弱、复习滞后或表现下滑，建议教师重点关注</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {aiData.atRisk.length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">暂无需要特别关注的学生</p>
                    ) : (
                      <div className="space-y-3">
                        {aiData.atRisk.map((s: any) => (
                          <div key={s.studentId} className="p-3 rounded-xl border border-red-100 bg-red-50/40">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-slate-800">{s.name}</p>
                              <Badge className="bg-red-100 text-red-700 border-red-200">平均 {s.avgScore}分</Badge>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                              {s.reasons.length > 0 && s.reasons.map((r: string, ri: number) => <p key={ri}>· {r}</p>)}
                              <p>错题 {s.errorCount} 道 · 解决率 {s.errorResolutionRate}%</p>
                            </div>
                            {s.aiDiagnosis && (
                              <p className="mt-2 text-xs text-red-700 bg-white/60 rounded-lg p-2">{s.aiDiagnosis}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 建议下一步 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-teal-600" />建议下一步</CardTitle>
                    <CardDescription>基于共性问题给出的课堂/作业建议</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {aiData.issues.slice(0, 5).length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">暂无建议</p>
                    ) : (
                      <>
                        {aiData.issues.slice(0, 5).map((it: any, i: number) => (
                          <p key={i} className="text-sm text-slate-600 flex gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>重点回顾「{it.knowledgePointName}」，可发起针对该知识点的专项练习覆盖 {it.affectedStudents} 名同学</span>
                          </p>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card><CardContent><p className="text-sm text-slate-400 py-8 text-center">暂无可用数据</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

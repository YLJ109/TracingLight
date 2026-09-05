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
  Activity,
  PieChart,
  LineChart,
  BarChart,
  Layers,
  Filter,
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

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

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
    fetchData();
  }, [dimension, courseId, classId]);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">学情看板</h1>
          <p className="text-sm text-muted-foreground mt-1">班级整体学情数据可视化分析</p>
        </div>
        {/* P2-1：从"发现薄弱"到"采取行动"的一键出口 */}
        <Button
          className="bg-violet-600 hover:bg-violet-700 gap-1.5"
          onClick={() => router.push(`/teacher/assignments/new?auto_ai=1${courseId ? `&course_id=${courseId}` : ''}`)}
        >
          <Zap className="w-4 h-4" /> 针对薄弱点 AI 布置作业
        </Button>
      </div>

      {/* 筛选栏：全部 / 按课程 / 按班级 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">学生成绩概览</TabsTrigger>
          <TabsTrigger value="heatmap">知识点掌握热力图</TabsTrigger>
          <TabsTrigger value="radar">能力维度雷达图</TabsTrigger>
          <TabsTrigger value="trend">班级成绩趋势</TabsTrigger>
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
                          <p className="text-lg font-bold text-teal-600">{student.avgScore}</p>
                          <p className="text-xs text-muted-foreground">
                            完成 {student.completedAssignments} 次作业
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
      </Tabs>
    </div>
  );
}

'use client';
import { apiFetch } from '@/lib/api-fetch';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Eye, TrendingUp, BookOpen, AlertTriangle } from 'lucide-react';

const levelLabels: Record<string, { label: string; className: string }> = {
  top: { label: '学霸层', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  medium: { label: '勤奋中等层', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  weak: { label: '提升层', className: 'bg-red-50 text-red-700 border-red-200' },
};

export default function TeacherStudents() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const [studentsRes, analyticsRes] = await Promise.all([
        apiFetch('/api/teacher/students'),
        apiFetch('/api/teacher/analytics'),
      ]);
      const studentsData = await studentsRes.json();
      const analyticsData = await analyticsRes.json();

      if (studentsData.success && analyticsData.success) {
        const enriched = (studentsData.data || []).map((s: any) => {
          const analytic = (analyticsData.data.students || []).find((a: any) => a.id === s.id);
          return {
            ...s,
            avgScore: analytic?.avgScore || 0,
            completedAssignments: analytic?.completedAssignments || 0,
          };
        });
        setStudents(enriched);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  if (!mounted) return null;

  const filtered = students.filter((s: any) => {
    if (filter !== 'all' && s.student_level !== filter) return false;
    if (search && !s.real_name.includes(search) && !s.username.includes(search)) return false;
    return true;
  });

  const topCount = students.filter((s: any) => s.student_level === 'top').length;
  const mediumCount = students.filter((s: any) => s.student_level === 'medium').length;
  const weakCount = students.filter((s: any) => s.student_level === 'weak').length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">学生管理</h1>
          <p className="text-sm text-slate-500">
            共{students.length}名学生 · 学霸{topCount}人 · 中等{mediumCount}人 · 提升{weakCount}人
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="搜索学生姓名或账号..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部层级</SelectItem>
                <SelectItem value="top">学霸层</SelectItem>
                <SelectItem value="medium">勤奋中等层</SelectItem>
                <SelectItem value="weak">提升层</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-3 text-xs font-medium text-slate-500">学生</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500">分层标签</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500">综合评分</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500">完成作业</th>
                    <th className="text-left p-3 text-xs font-medium text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student: any) => (
                    <tr key={student.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                            {student.real_name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{student.real_name}</p>
                            <p className="text-xs text-slate-400">@{student.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={levelLabels[student.student_level]?.className || 'bg-slate-100'}>
                          {levelLabels[student.student_level]?.label || '未分层'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span className={`text-sm font-mono font-medium ${
                          student.avgScore >= 75 ? 'text-green-600' :
                          student.avgScore >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {student.avgScore}分
                        </span>
                      </td>
                      <td className="p-3 text-sm text-slate-600">{student.completedAssignments}次</td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                          onClick={() => router.push(`/teacher/students/${student.id}`)}
                        >
                          <Eye className="w-3 h-3 mr-1" /> 学情详情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

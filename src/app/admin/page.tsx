'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Building2, Users, BookOpen, BarChart3, Settings,
  ScrollText, DatabaseBackup, LayoutDashboard, ChevronRight, Sparkles, FileText
} from 'lucide-react';

const modules = [
  { href: '/admin/organization', label: '组织架构', desc: '学校 · 学院 · 专业 · 班级', icon: Building2 },
  { href: '/admin/users', label: '用户管理', desc: '教师 · 学生 · 管理员', icon: Users },
  { href: '/admin/courses', label: '课程管理', desc: '课程审核 · 下架 · 统计', icon: BookOpen },
  { href: '/admin/analytics', label: '数据统计', desc: '使用数据 · AI 调用量', icon: BarChart3 },
  { href: '/admin/settings', label: '系统设置', desc: 'AI 模型 · 通知 · 参数', icon: Settings },
  { href: '/admin/logs', label: '日志审计', desc: '操作日志 · 登录日志', icon: ScrollText },
  { href: '/admin/backup', label: '数据备份', desc: '一键备份 · 恢复', icon: DatabaseBackup },
];

interface OverviewStats {
  totalUsers: number;
  totalCourses: number;
  totalClasses: number;
  totalQuestions: number;
  totalAssignments: number;
  totalExams: number;
  roleCount: Record<string, number>;
  typeCount: Record<string, number>;
}

export default function AdminPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStats(d?.data?.stats ?? null))
      .catch(() => setStats(null));
  }, []);

  const statCards = [
    {
      label: '用户总数',
      value: stats ? String(stats.totalUsers) : '—',
      sub: stats ? `教师 ${stats.roleCount?.teacher ?? 0} · 学生 ${stats.roleCount?.student ?? 0} · 管理员 ${stats.roleCount?.admin ?? 0}` : '加载中…',
      icon: Users,
      tone: 'from-violet-500 to-fuchsia-500',
    },
    {
      label: '课程总数',
      value: stats ? String(stats.totalCourses) : '—',
      sub: stats ? `覆盖 ${stats.totalClasses} 个班级` : '加载中…',
      icon: BookOpen,
      tone: 'from-fuchsia-500 to-pink-500',
    },
    {
      label: '题目总数',
      value: stats ? String(stats.totalQuestions) : '—',
      sub: stats ? `${Object.keys(stats.typeCount ?? {}).length} 大题型` : '加载中…',
      icon: BarChart3,
      tone: 'from-violet-600 to-indigo-500',
    },
    {
      label: '作业总数',
      value: stats ? String(stats.totalAssignments) : '—',
      sub: stats ? `另有 ${stats.totalExams ?? 0} 场考试` : '加载中…',
      icon: LayoutDashboard,
      tone: 'from-pink-500 to-rose-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <div className="rounded-2xl bg-violet-600 p-6 text-white">
        <div className="flex items-center gap-2 text-violet-100 text-sm mb-1">
          <Sparkles className="w-4 h-4" />
          溯光智慧教育平台 · 管理后台
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-0 shadow-sm py-0">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.tone} flex items-center justify-center text-white shrink-0`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold leading-tight">{s.value}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 快速入口 */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">管理功能</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link key={m.href} href={m.href}>
              <Card className="border-0 shadow-sm card-hover cursor-pointer h-full py-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                      <m.icon className="w-4 h-4 text-violet-600" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mt-3">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

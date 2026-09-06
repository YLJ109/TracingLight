'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-fetch';
import { BarChart3, Users, BookOpen, School } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalCourses: number;
  totalClasses: number;
  roleCount: Record<string, number>;
}

export default function AdminAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d.data.stats || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: '用户总数', value: stats?.totalUsers ?? 0, icon: Users, tone: 'from-violet-500 to-fuchsia-500' },
    { label: '课程总数', value: stats?.totalCourses ?? 0, icon: BookOpen, tone: 'from-fuchsia-500 to-pink-500' },
    { label: '班级总数', value: stats?.totalClasses ?? 0, icon: School, tone: 'from-violet-600 to-indigo-500' },
    { label: '教师数', value: stats?.roleCount?.teacher ?? 0, icon: BarChart3, tone: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <Card key={c.label} className="border-0 shadow-sm py-0">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tone} flex items-center justify-center text-white`}>
                    <c.icon className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{c.label}</p>
                  <p className="text-2xl font-bold">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-0 shadow-sm py-0">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">角色分布</p>
              <div className="space-y-2">
                {Object.entries(stats?.roleCount || {}).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{role === 'teacher' ? '教师' : role === 'student' ? '学生' : role === 'admin' ? '管理员' : role}</span>
                    <span className="font-medium">{count} 人</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

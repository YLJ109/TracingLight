'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-fetch';
import { BookOpen } from 'lucide-react';

interface CourseRow {
  id: number;
  name: string;
  short_name: string | null;
  teacher_id: number | null;
  class_id: number | null;
  semester: string | null;
}

export default function AdminCourses() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d) => { if (d.success) setCourses(d.data.courses || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center text-white shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">课程管理</h1>
          <p className="text-xs text-muted-foreground">课程审核 · 下架 · 统计</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted skeleton-shimmer" />)}</div>
      ) : courses.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-fuchsia-50 flex items-center justify-center mb-3">
              <BookOpen className="w-6 h-6 text-fuchsia-400" />
            </div>
            <p className="text-sm font-medium text-foreground">暂无课程数据</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              课程由教师在「我的课程」中创建后自动归档到本页。教师端新建课程后，这里即可看到课程列表。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((c) => (
            <Card key={c.id} className="rounded-2xl border-0 shadow-sm card-hover py-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center text-white shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      学期：{c.semester || '—'}　|　课程ID：{c.id}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

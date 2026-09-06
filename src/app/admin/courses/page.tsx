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
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted skeleton-shimmer" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((c) => (
            <Card key={c.id} className="border-0 shadow-sm py-0">
              <CardContent className="p-4">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  学期：{c.semester || '—'}　|　课程ID：{c.id}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Pin, Loader2 } from 'lucide-react';

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  teacher_name: string;
  course_id: number | null;
  is_pinned: boolean;
  created_at: string | null;
}

/** 学生端公告中心：查看老师/学校发布的公告 */
export default function StudentAnnouncements() {
  const searchParams = useSearchParams();
  const highlightId = Number(searchParams.get('aid')) || null;
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/student/announcements')
      .then((r) => r.json())
      .then((d) => { if (d.success) setItems(d.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="page-title">公告通知</h1>
          <p className="page-subtitle">老师与学校发布的通知都会汇总在这里</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Megaphone className="w-12 h-12" />
          <p className="text-sm mt-3">暂无公告</p>
          <p className="text-xs mt-1 opacity-70">老师发布的新公告会第一时间通知你</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card
              key={a.id}
              className={`border-0 shadow-sm ${a.id === highlightId ? 'ring-2 ring-violet-400' : ''}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {!!a.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                    {a.title}
                  </h3>
                  <span className="text-xs text-slate-400 shrink-0">{fmtDate(a.created_at)}</span>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary" className="text-xs">{a.teacher_name}</Badge>
                  {!!a.is_pinned && <Badge className="text-xs bg-amber-50 text-amber-700">置顶</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

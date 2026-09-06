'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotifications } from '@/lib/notification-store';
import { apiFetch } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BookOpen, Award, Megaphone, CheckCheck, Loader2, Pin } from 'lucide-react';

const TYPE_META: Record<string, { icon: typeof Bell; label: string; className: string }> = {
  assignment: { icon: BookOpen, label: '作业', className: 'bg-blue-50 text-blue-600' },
  grade: { icon: Award, label: '成绩', className: 'bg-emerald-50 text-emerald-600' },
  system: { icon: Megaphone, label: '系统', className: 'bg-violet-50 text-violet-600' },
};

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  teacher_name: string;
  course_id: number | null;
  is_pinned: boolean;
  created_at: string | null;
}

function formatTime(time?: string) {
  if (!time) return '';
  const t = time.includes('T') ? time.replace('T', ' ').slice(0, 19) : time.slice(0, 19);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return t;
  const [, y, mo, d, h, mi] = m;
  const numY = Number(y), numMo = Number(mo), numD = Number(d);
  const now = new Date();
  const isSameDay = now.getFullYear() === numY && now.getMonth() + 1 === numMo && now.getDate() === numD;
  if (isSameDay) return `${h}:${mi}`;
  if (now.getFullYear() === numY) return `${mo}-${d} ${h}:${mi}`;
  return `${y}-${mo}-${d}`;
}

const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '');

/** 学生端消息中心：公告通知 + 通知中心合二为一 */
export default function StudentNotifications() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'notification' | 'announcement'>('notification');
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const highlightId = Number(searchParams.get('aid')) || null;

  // 支持 ?tab=announcement 深链定位到公告
  useEffect(() => {
    if (searchParams.get('tab') === 'announcement') setTab('announcement');
  }, [searchParams]);

  // 进页后自动将可见通知置为已读
  useEffect(() => {
    if (loading) return;
    if (unreadCount > 0) markAllRead();
  }, [loading, unreadCount, markAllRead]);

  useEffect(() => { setLoading(false); }, []);

  const loadAnnouncements = useCallback(() => {
    if (announcements.length > 0) return;
    setAnnLoading(true);
    apiFetch('/api/student/announcements')
      .then((r) => r.json())
      .then((d) => { if (d.success) setAnnouncements(d.data || []); })
      .catch(() => {})
      .finally(() => setAnnLoading(false));
  }, [announcements.length]);

  useEffect(() => { if (tab === 'announcement') loadAnnouncements(); }, [tab, loadAnnouncements]);

  const handleOpen = (n: (typeof notifications)[0]) => {
    if (!n.read) markRead(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {tab === 'notification' && unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5 ml-auto">
            <CheckCheck className="w-4 h-4" /> 全部已读
          </Button>
        )}
      </div>

      {/* Tab 切换：通知 / 公告 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([['notification', '通知'], ['announcement', '公告']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >{label}</button>
        ))}
      </div>

      {/* ===== 通知 Tab ===== */}
      {tab === 'notification' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <Bell className="w-12 h-12" />
              <p className="text-sm mt-3">暂无通知</p>
              <p className="text-xs mt-1 opacity-70">布置作业或批改完成后会第一时间提醒你</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.slice(0, 50).map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.system;
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleOpen(n)}
                    className={`w-full text-left rounded-xl p-4 flex items-start gap-3 border transition-colors ${
                      !n.read
                        ? 'bg-blue-50/60 border-blue-100 hover:bg-blue-50'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.className}`}>
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                      </span>
                      {!!n.message && <span className="block text-sm text-slate-500 mt-0.5 line-clamp-2 text-ellipsis overflow-hidden">{n.message}</span>}
                      <span className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{meta.label}</span>
                        <span>{formatTime(n.time)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===== 公告 Tab ===== */}
      {tab === 'announcement' && (
        <>
          {annLoading && announcements.length === 0 ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : announcements.length === 0 ? (
            <div className="empty-state">
              <Megaphone className="w-12 h-12" />
              <p className="text-sm mt-3">暂无公告</p>
              <p className="text-xs mt-1 opacity-70">老师发布的新公告会第一时间通知你</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border bg-white shadow-sm ${a.id === highlightId ? 'ring-2 ring-violet-400' : 'border-slate-200'}`}
                >
                  <div className="p-5">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Megaphone, Pin } from 'lucide-react';
import { useNotifications } from '@/lib/notification-store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';

interface Announcement {
  id: number;
  title: string;
  content: string;
  teacher_name: string;
  is_pinned: number | boolean | null;
  created_at: string;
}

export function NotificationBell({ role }: { role?: 'student' | 'teacher' | 'admin' }) {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'notify' | 'announce'>('notify');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoaded, setAnnLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isStudent = role === 'student';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 打开时按需拉取公告（仅学生端）
  useEffect(() => {
    if (!open || !isStudent || tab !== 'announce' || annLoaded) return;
    apiFetch('/api/student/announcements')
      .then((r) => r.json())
      .then((json) => { if (json.success) setAnnouncements(json.data || []); })
      .catch(() => {})
      .finally(() => setAnnLoaded(true));
  }, [open, tab, isStudent, annLoaded]);

  const handleClick = (n: typeof notifications[0]) => {
    markRead(n.id);
    if (n.link) router.push(n.link);
    setOpen(false);
  };

  const fmtTime = (s?: string) => {
    if (!s) return '';
    const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
    if (isNaN(d.getTime())) return s.slice(0, 16);
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
        aria-label="消息中心"
      >
        <Bell className="w-[18px] h-[18px] text-slate-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-fade-in-up">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fade-in-up">
          {/* 标题 + Tab */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">消息中心</h3>
            {tab === 'notify' && unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> 全部已读
              </button>
            )}
          </div>

          {(isStudent) && (
            <div className="flex gap-1 px-3 pt-2">
              <button
                onClick={() => setTab('notify')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  tab === 'notify' ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                通知{unreadCount > 0 ? ` · ${unreadCount}` : ''}
              </button>
              <button
                onClick={() => setTab('announce')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  tab === 'announce' ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                公告
              </button>
            </div>
          )}

          <div className="max-h-[340px] overflow-y-auto">
            {tab === 'notify' ? (
              notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  暂无通知
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${!n.read ? 'bg-blue-50/50' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-700 truncate">{n.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{fmtTime(n.time)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )
            ) : (
              announcements.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  暂无公告
                </div>
              ) : (
                announcements.slice(0, 20).map((a) => (
                  <div key={a.id} className="px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      {Boolean(a.is_pinned) && <Pin className="w-3 h-3 text-amber-500 shrink-0" />}
                      <p className="flex-1 text-[13px] font-medium text-slate-700 truncate">{a.title}</p>
                      <span className="text-[10px] text-slate-400 shrink-0">{a.teacher_name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{fmtTime(a.created_at)}</p>
                  </div>
                ))
              )
            )}
          </div>

          {/* 底部：查看全部 */}
          {isStudent && (
            <div className="flex border-t border-slate-100">
              <Link
                href={tab === 'notify' ? '/student/notifications' : '/student/announcements'}
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 text-center text-xs font-medium text-violet-600 hover:bg-violet-50 transition-colors"
              >
                查看全部{tab === 'notify' ? '通知' : '公告'}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
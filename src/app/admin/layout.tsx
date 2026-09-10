'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, signOut, setUserAvatar, type CurrentUser, USER_UPDATED_EVENT_NAME } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import {
  LayoutDashboard, Building2, Users, BookOpen,
  BarChart3, Settings, ScrollText, DatabaseBackup, Activity, MonitorPlay,
} from 'lucide-react';
import AppShell, { type AppShellNavItem } from '@/components/app-shell';

const navItems: AppShellNavItem[] = [
  { href: '/admin', label: '系统总览', icon: LayoutDashboard },
  { href: '/admin/dashboard', label: '数据大屏', icon: MonitorPlay },
  { href: '/admin/organization', label: '组织架构', icon: Building2 },
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/courses', label: '课程管理', icon: BookOpen },
  { href: '/admin/grading-queue', label: '批改队列', icon: Activity },
  { href: '/admin/analytics', label: '数据统计', icon: BarChart3 },
  { href: '/admin/settings', label: '系统设置', icon: Settings },
  { href: '/admin/logs', label: '日志审计', icon: ScrollText },
  { href: '/admin/backup', label: '数据备份', icon: DatabaseBackup },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'admin') {
        router.push('/');
        return;
      }
      setCurrentUser(user);
      // 会话无头像时，从服务端拉取权威头像并同步，保证侧栏头像正确
      if (!user.avatar_url) {
        apiFetch('/api/account').then((r) => r.json()).then((json) => {
          if (json.success && json.data?.user?.avatar_url) setUserAvatar(json.data.user.avatar_url);
        }).catch(() => {});
      }
    });
  }, [router]);

  // 头像/资料更新后无需刷新即可同步到侧栏
  useEffect(() => {
    const handle = () => getCurrentUser().then((u) => { if (u) setCurrentUser(u); });
    window.addEventListener(USER_UPDATED_EVENT_NAME, handle);
    return () => window.removeEventListener(USER_UPDATED_EVENT_NAME, handle);
  }, []);

  const handleLogout = () => {
    signOut();
  };

  if (!currentUser) return null;

  return (
    <AppShell
      role="admin"
      tagline="平台运营中枢"
      rootLabel="管理端"
      rootHref="/admin"
      navItems={navItems}
      topRight={
        <span className="hidden sm:inline px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600 text-xs font-medium">
          溯光智慧教育平台
        </span>
      }
      avatarChar={(currentUser.real_name || '·')[0]}
      avatarUrl={currentUser.avatar_url}
      userName={currentUser.real_name}
      userMeta={<p className="text-xs text-slate-400">管理员</p>}
      onLogout={handleLogout}
    >
      {children}
    </AppShell>
  );
}
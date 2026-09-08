'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, signOut, setUserAvatar, type CurrentUser, USER_UPDATED_EVENT_NAME } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import {
  Users, BookOpen, BarChart3, Library, Wand2, ClipboardList, FileText,
} from 'lucide-react';
import AppShell, { type AppShellNavItem } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';

const navItems: AppShellNavItem[] = [
  { group: '学情', href: '/teacher/analytics', label: '学情看板', icon: BarChart3 },
  { group: '学情', href: '/teacher/students', label: '学生管理', icon: Users },
  { group: '教学准备', href: '/teacher/questions/bank', label: '题库管理', icon: Library },
  { group: '教学准备', href: '/teacher/ai-generate', label: 'AI智能出题', icon: Wand2 },
  { group: '教学准备', href: '/teacher/materials', label: '学习材料', icon: FileText },
  { group: '课堂执行', href: '/teacher/assignments', label: '作业管理', icon: BookOpen },
  { group: '课堂执行', href: '/teacher/exams', label: '考试管理', icon: ClipboardList },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'teacher') {
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
      role="teacher"
      tagline="教学管理中心"
      rootLabel="教师端"
      rootHref="/teacher"
      navItems={navItems}
      topRight={
        <>
          <span className="hidden sm:inline px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600 text-xs font-medium">
            计科2401班
          </span>
          <EyeCareToggle />
          <NotificationBell role="teacher" />
        </>
      }
      avatarChar={currentUser.real_name[0]}
      avatarUrl={currentUser.avatar_url}
      userName={currentUser.real_name}
      userMeta={<p className="text-xs text-slate-400">教师</p>}
      onLogout={handleLogout}
      profileHref="/teacher/profile"
    >
      {children}
    </AppShell>
  );
}
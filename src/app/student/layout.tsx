'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  BookOpen, BookMarked, BarChart3,
  Network, Lightbulb, FolderOpen,
  MessageCircle, Bell
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AppShell, { type AppShellNavItem } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';
import { useNotifications } from '@/lib/notification-store';

const navItems: AppShellNavItem[] = [
  { href: '/student/overview', label: '我的学情', icon: BarChart3 },
  { href: '/student/assignments', label: '我的作业', icon: BookOpen },
  { href: '/student/materials', label: '学习材料', icon: FolderOpen },
  { href: '/student/errors', label: '错题本', icon: BookMarked },
  { href: '/student/knowledge-graph', label: '知识图谱', icon: Network },
  { href: '/student/recommend', label: '个性化推荐', icon: Lightbulb },
  { href: '/student/assistant', label: 'AI 答疑', icon: MessageCircle },
  { href: '/student/notifications', label: '消息中心', icon: Bell },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { unreadCount } = useNotifications();

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'student') {
        router.push('/');
        return;
      }
      setCurrentUser(user);
    });
  }, [router]);

  const handleLogout = () => {
    signOut();
  };

  if (!currentUser) return null;

  const levelLabel = ((level?: string | null) => {
    switch (level) {
      case 'top': return '学霸层';
      case 'medium': return '勤奋中等层';
      case 'weak': return '提升层';
      default: return '';
    }
  })(currentUser.student_level);
  const levelClass = currentUser.student_level === 'top'
    ? 'level-top'
    : currentUser.student_level === 'medium'
      ? 'level-medium'
      : currentUser.student_level === 'weak'
        ? 'level-weak'
        : '';

  // 通知未读数挂到「消息中心」
  const items = navItems.map((n) =>
    n.href === '/student/notifications'
      ? { ...n, badge: unreadCount }
      : n
  );

  return (
    <AppShell
      role="student"
      tagline="智慧学习空间"
      rootLabel="学生端"
      rootHref="/student"
      navItems={items}
      topRight={
        <>
          <EyeCareToggle />
          <NotificationBell />
        </>
      }
      avatarChar={currentUser.real_name[0]}
      userName={currentUser.real_name}
      userMeta={
        levelLabel ? (
          <Badge className={`${levelClass} text-[10px] px-1.5 py-0 border-0`}>{levelLabel}</Badge>
        ) : undefined
      }
      onLogout={handleLogout}
    >
      {children}
    </AppShell>
  );
}
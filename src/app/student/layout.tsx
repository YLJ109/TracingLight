'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser, signOut, setUserAvatar, type CurrentUser, USER_UPDATED_EVENT_NAME } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import {
  BookOpen, BookMarked, BarChart3,
  Lightbulb, Timer,
  MessageCircle, Network, Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AppShell, { type AppShellNavItem } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';

// 侧边栏按「学情 → 学习 → 扩展」分组组织，形成清晰的学习闭环：
// 先看清短板（学情/图谱/推荐），再按昨日任务→材料→作业→错题执行，最后进入 AI 答疑
const navItems: AppShellNavItem[] = [
  { group: '学情', href: '/student/overview', label: '我的学情', icon: BarChart3 },
  { group: '学情', href: '/student/knowledge-graph', label: '知识图谱', icon: Network },
  { group: '学情', href: '/student/recommend', label: '个性化推荐', icon: Lightbulb },
  { group: '学习', href: '/student/learn', label: '今日学习', icon: Sparkles },
  { group: '学习', href: '/student/assignments', label: '我的作业', icon: BookOpen },
  { group: '学习', href: '/student/exams', label: '我的考试', icon: Timer },
  { group: '学习', href: '/student/errors', label: '错题本', icon: BookMarked },
  { group: '扩展', href: '/student/assistant', label: 'AI 答疑', icon: MessageCircle },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // 考试专考页走全屏沉浸式，脱离侧边栏外壳（外部包裹的独立路由外壳不含 AppShell）
  const isExamTake = /^\/student\/exams\/[^/]+\/take$/.test(pathname ?? '');

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'student') {
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

  // 头像/资料更新后无需刷新即可同步到侧栏（layout 不随路由重挂载）
  useEffect(() => {
    const handle = () => getCurrentUser().then((u) => { if (u) setCurrentUser(u); });
    window.addEventListener(USER_UPDATED_EVENT_NAME, handle);
    return () => window.removeEventListener(USER_UPDATED_EVENT_NAME, handle);
  }, []);

  const handleLogout = () => {
    signOut();
  };

  if (!currentUser) return null;

  // 专考页：全屏沉浸，不含侧边栏外壳（仍保留学生登录守卫）
  if (isExamTake) return <>{children}</>;

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

  // 通知未读数由顶栏铃铛(NotificationBell)统一展示
  const items = navItems;

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
          <NotificationBell role="student" />
        </>
      }
      avatarChar={currentUser.real_name[0]}
      avatarUrl={currentUser.avatar_url}
      userName={currentUser.real_name}
      userMeta={
        levelLabel ? (
          <Badge className={`${levelClass} text-[10px] px-1.5 py-0 border-0`}>{levelLabel}</Badge>
        ) : undefined
      }
      onLogout={handleLogout}
      profileHref="/student/profile"
    >
      {children}
    </AppShell>
  );
}
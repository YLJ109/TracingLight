'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  BookOpen, BookMarked, BarChart3,
  Network, LogOut, CalendarDays,
  ChevronRight, Lightbulb, FolderOpen,
  MessageCircle, Megaphone
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';
import MobileTabBar from '@/components/mobile-tab-bar';

const navItems = [
  { href: '/student/overview', label: '我的学情', icon: BarChart3 },
  { href: '/student/assignments', label: '我的作业', icon: BookOpen },
  { href: '/student/materials', label: '学习材料', icon: FolderOpen },
  { href: '/student/errors', label: '错题本', icon: BookMarked },
  { href: '/student/knowledge-graph', label: '知识图谱', icon: Network },
  { href: '/student/study-plan', label: '学习规划', icon: CalendarDays },
  { href: '/student/recommend', label: '个性化推荐', icon: Lightbulb },
  { href: '/student/assistant', label: 'AI 答疑', icon: MessageCircle },
  { href: '/student/announcements', label: '公告通知', icon: Megaphone },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

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

  const getLevelLabel = (level?: string | null) => {
    switch (level) {
      case 'top': return '学霸层';
      case 'medium': return '勤奋中等层';
      case 'weak': return '提升层';
      default: return '';
    }
  };

  const getLevelClass = (level?: string | null) => {
    switch (level) {
      case 'top': return 'level-top';
      case 'medium': return 'level-medium';
      case 'weak': return 'level-weak';
      default: return '';
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 bg-white border-r border-slate-200/70 text-slate-800 flex-col shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="溯光" className="w-9 h-9 rounded-lg" />
            <div>
              <h2 className="font-semibold text-sm tracking-wide">溯光 TracingLight</h2>
              <p className="text-xs text-slate-400">学生端</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-0.5 overflow-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                  isActive
                    ? 'bg-violet-100 text-violet-800 font-medium shadow-[inset_2px_0_0_0_#8b5cf6]'
                    : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold">
              {currentUser.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-800">{currentUser.real_name}</p>
              <Badge className={`${getLevelClass(currentUser.student_level)} text-[10px] px-1.5 py-0 border-0`}>
                {getLevelLabel(currentUser.student_level)}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-7 w-7" onClick={handleLogout}>
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-50 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/student" className="hover:text-foreground transition-colors">学生端</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium">
              {navItems.find(n => n.href === pathname)?.label || '我的学情'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <EyeCareToggle />
            <NotificationBell />
          </div>
        </header>
        <div className="page-surface p-3 md:p-6 pb-20 md:pb-6 flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <MobileTabBar role="student" />
    </div>
  );
}

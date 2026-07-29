'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  LayoutDashboard, BookOpen, BookMarked,
  Network, LogOut, CalendarDays,
  ChevronRight, Lightbulb
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';
import MobileTabBar from '@/components/mobile-tab-bar';

const navItems = [
  { href: '/student', label: '我的学情', icon: LayoutDashboard },
  { href: '/student/assignments', label: '我的作业', icon: BookOpen },
  { href: '/student/errors', label: '错题本', icon: BookMarked },
  { href: '/student/knowledge-graph', label: '知识图谱', icon: Network },
  { href: '/student/study-plan', label: '学习规划', icon: CalendarDays },
  { href: '/student/recommend', label: '个性化推荐', icon: Lightbulb },
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
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 bg-white border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="溯光" className="w-8 h-8 rounded-lg shadow-sm" />
            <div>
              <h2 className="font-bold text-sm text-slate-800">溯光 TracingLight</h2>
              <p className="text-xs text-slate-400">学生端</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                  isActive
                    ? 'bg-teal-50 text-teal-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
              {currentUser.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{currentUser.real_name}</p>
              <Badge className={`${getLevelClass(currentUser.student_level)} text-[10px] px-1.5 py-0`}>
                {getLevelLabel(currentUser.student_level)}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 h-7 w-7" onClick={handleLogout}>
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/student" className="hover:text-slate-700">学生端</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-800 font-medium">
              {navItems.find(n => n.href === pathname)?.label || '我的学情'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <EyeCareToggle />
            <NotificationBell />
          </div>
        </header>
        <div className="p-3 md:p-6 pb-20 md:pb-6 flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <MobileTabBar role="student" />
    </div>
  );
}

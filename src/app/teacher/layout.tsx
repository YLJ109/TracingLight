'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  Users, BookOpen,
  BarChart3, LogOut, ChevronRight, Library, Wand2,
  Megaphone
, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';
import MobileTabBar from '@/components/mobile-tab-bar';

const navItems = [
  { href: '/teacher/analytics', label: '学情看板', icon: BarChart3 },
  { href: '/teacher/students', label: '学生管理', icon: Users },
  { href: '/teacher/assignments', label: '作业管理', icon: BookOpen },
  { href: '/teacher/ai-generate', label: 'AI智能出题', icon: Wand2 },
  { href: '/teacher/grading-config', label: '批改规则', icon: SlidersHorizontal },
  { href: '/teacher/questions/bank', label: '题库管理', icon: Library },
  { href: '/teacher/announcements', label: '公告发布', icon: Megaphone },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'teacher') {
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

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200/70 text-slate-800 flex-col shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="溯光" className="w-9 h-9 rounded-lg" />
            <div>
              <h2 className="font-semibold text-sm tracking-wide">溯光 TracingLight</h2>
              <p className="text-xs text-slate-400">教师管理中心</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                  isActive
                    ? 'bg-violet-100 text-violet-800 font-medium shadow-[inset_2px_0_0_0_#8b5cf6]'
                    : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold">
              {currentUser.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-800">{currentUser.real_name}</p>
              <p className="text-xs text-slate-400">教师</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="relative z-50 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/teacher" className="hover:text-foreground transition-colors">教师端</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium">
              {navItems.find(n => n.href === pathname)?.label || '学情看板'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">计科2401班</span>
            <EyeCareToggle />
            <NotificationBell />
          </div>
        </header>

        {/* Page Content */}
        <div className="page-surface p-3 md:p-6 pb-20 md:pb-6 flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <MobileTabBar role="teacher" />
    </div>
  );
}

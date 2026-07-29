'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  LayoutDashboard, Users, BookOpen,
  BarChart3, LogOut, ChevronRight, Library, Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotificationBell } from '@/components/notification-bell';
import { EyeCareToggle } from '@/components/eye-care-toggle';
import MobileTabBar from '@/components/mobile-tab-bar';

const navItems = [
  { href: '/teacher', label: '教学总览', icon: LayoutDashboard },
  { href: '/teacher/students', label: '学生管理', icon: Users },
  { href: '/teacher/assignments', label: '作业管理', icon: BookOpen },
  { href: '/teacher/ai-generate', label: 'AI智能出题', icon: Wand2 },
  { href: '/teacher/questions/bank', label: '题库管理', icon: Library },
  { href: '/teacher/analytics', label: '学情看板', icon: BarChart3 },
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
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="溯光" className="w-8 h-8 rounded-lg shadow-sm" />
            <div>
              <h2 className="font-bold text-sm">溯光 TracingLight</h2>
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
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-sm font-bold">
              {currentUser.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentUser.real_name}</p>
              <p className="text-xs text-slate-400">教师</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/teacher" className="hover:text-slate-700">教师端</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-800 font-medium">
              {navItems.find(n => n.href === pathname)?.label || '教学总览'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 hidden sm:inline">计科2401班</span>
            <EyeCareToggle />
            <NotificationBell />
          </div>
        </header>

        {/* Page Content */}
        <div className="p-3 md:p-6 pb-20 md:pb-6 flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <MobileTabBar role="teacher" />
    </div>
  );
}

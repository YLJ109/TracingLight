'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getCurrentUser, signOut, type CurrentUser } from '@/lib/auth-helper';
import {
  LayoutDashboard, Building2, Users, BookOpen,
  BarChart3, Settings, ScrollText, DatabaseBackup, LogOut, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

const navItems = [
  { href: '/admin', label: '系统总览', icon: LayoutDashboard },
  { href: '/admin/organization', label: '组织架构', icon: Building2 },
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/courses', label: '课程管理', icon: BookOpen },
  { href: '/admin/analytics', label: '数据统计', icon: BarChart3 },
  { href: '/admin/settings', label: '系统设置', icon: Settings },
  { href: '/admin/logs', label: '日志审计', icon: ScrollText },
  { href: '/admin/backup', label: '数据备份', icon: DatabaseBackup },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user || user.role !== 'admin') {
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
      <aside className="hidden md:flex w-60 bg-white border-r border-slate-200/70 text-slate-800 flex-col shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="溯光" className="w-9 h-9 rounded-lg" />
            <div>
              <h2 className="font-semibold text-sm tracking-wide">溯光 TracingLight</h2>
              <p className="text-xs text-slate-400">管理后台</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
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
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold">
              {currentUser.real_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-800">{currentUser.real_name}</p>
              <p className="text-xs text-slate-400">管理员</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-50 h-14 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground transition-colors">管理端</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium">
              {navItems.find(n => n.href === pathname)?.label || '系统总览'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">溯光智慧教育平台</span>
          </div>
        </header>

        <div className="p-3 md:p-6 pb-20 md:pb-6 flex-1 min-h-0 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

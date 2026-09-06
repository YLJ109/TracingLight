'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';
import MobileTabBar from '@/components/mobile-tab-bar';

export interface AppShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number; // 数字角标（未读数等）
}

/** 允许子页显式声明"当前应高亮哪个菜单"，解决跨界入口（如从错题本进知识图谱）的默认不匹配问题 */
interface ActiveNavCtx {
  href: string | null;
  setHref: (h: string | null) => void;
}
const ActiveNavContext = createContext<ActiveNavCtx>({ href: null, setHref: () => {} });

export function useActiveNav() {
  return useContext(ActiveNavContext);
}

/** 挂载时把高亮指向指定菜单项(通过其 href)，卸载或传 null 时恢复为路径自动匹配 */
export function SetActiveNav({ href }: { href: string | null }) {
  const { setHref } = useActiveNav();
  useEffect(() => {
    setHref(href || null);
    return () => setHref(null);
  }, [href, setHref]);
  return null;
}

interface AppShellProps {
  /** 端侧标识：决定右侧行动区与移动端底栏 */
  role: 'student' | 'teacher' | 'admin';
  /** 侧栏品牌副标题 */
  tagline: string;
  /** 顶级面包屑名称与地址 */
  rootLabel: string;
  rootHref: string;
  navItems: AppShellNavItem[];
  /** 顶栏右侧自定义区域（护眼/铃铛/班级等） */
  topRight?: React.ReactNode;
  /** 当前用户头像首字 */
  avatarChar: string;
  /** 当前用户头像图片地址（有值时优先显示图片） */
  avatarUrl?: string;
  userName: string;
  userMeta?: React.ReactNode;
  onLogout: () => void;
  /** 个人中心地址：点击侧栏用户卡片 / 移动端头像跳转 */
  profileHref?: string;
  children: React.ReactNode;
}

export default function AppShell({
  role,
  tagline,
  rootLabel,
  rootHref,
  navItems,
  topRight,
  avatarChar,
  avatarUrl,
  userName,
  userMeta,
  onLogout,
  profileHref,
  children,
}: AppShellProps) {
  const pathname = usePathname();

  // 精确匹配 + 前缀匹配（详情子页仍高亮所属菜单）。
  // 排除根入口（如 /admin /student /teacher）：避免它对所有子路由前缀误命中导致双高亮。
  const match = (href: string) =>
    pathname === href || (href !== rootHref && pathname.startsWith(href + '/'));
  // 优先采用子页声明的归属菜单，否则按路径自动匹配
  const [navOverride, setNavOverride] = useState<string | null>(null);
  const autoHref = navItems.find((n) => match(n.href))?.href ?? null;
  const activeHref =
    navOverride && navItems.some((n) => n.href === navOverride) ? navOverride : autoHref;
  const currentLabel = navItems.find((n) => n.href === activeHref)?.label || rootLabel;
  // 进入个人中心时高亮底部用户卡片
  const isProfileActive = !!profileHref && pathname === profileHref;

  return (
    <ActiveNavContext.Provider value={{ href: navOverride, setHref: setNavOverride }}>
    <div className="app-shell flex h-screen overflow-hidden">
      {/* ─── Sidebar（桌面端 · 浅色玻璃） ─── */}
      <aside className="hidden md:flex w-64 flex-col shrink-0 glass-sidebar border-r border-white/60">
        <div className="px-5 pt-5 pb-4 flex items-center gap-3">
          <img src="/logo.png" alt="溯光" className="w-10 h-10 rounded-xl object-contain" />
          <div>
            <h2 className="font-bold text-sm tracking-wide text-slate-800 leading-tight">
              溯光 <span className="font-extrabold text-brand-gradient">TracingLight</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{tagline}</p>
          </div>
        </div>

        <div className="mx-3 mb-2 h-px bg-gradient-to-r from-transparent via-violet-200 to-transparent" />

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto pb-3">
          {navItems.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                  isActive
                    ? 'bg-white text-violet-800 shadow-soft'
                    : 'text-slate-600 hover:bg-white/70 hover:text-violet-700'
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full brand-gradient" />
                )}
                <span
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
                    isActive
                      ? 'brand-gradient text-white shadow-sm'
                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-violet-50 group-hover:text-violet-600'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/60">
          <div className={cn(
            'relative flex items-center gap-3 px-2 py-2 rounded-xl transition-all',
            isProfileActive
              ? 'bg-white text-violet-800 shadow-soft ring-1 ring-violet-200'
              : 'bg-white/50 hover:bg-white/80'
          )}>
            {isProfileActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full brand-gradient" />
            )}
            <div className="pl-1.5">
            {profileHref ? (
              <Link
                href={profileHref}
                className="flex items-center gap-3 flex-1 min-w-0 group"
                title="个人中心"
              >
                <div className={cn('w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center text-white text-xs font-bold shadow-sm group-hover:scale-105 transition-transform', isProfileActive ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 ring-2 ring-violet-300' : 'brand-gradient')}>
                  {avatarUrl ? <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" /> : avatarChar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate transition-colors', isProfileActive ? 'text-violet-800' : 'text-slate-800 group-hover:text-violet-700')}>{userName}</p>
                  {userMeta}
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl overflow-hidden brand-gradient flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {avatarUrl ? <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" /> : avatarChar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-slate-800">{userName}</p>
                  {userMeta}
                </div>
              </div>
            )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 shrink-0"
              onClick={onLogout}
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ─── 主区域 ─── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 · 毛玻璃 */}
        <header className="relative z-40 h-16 flex items-center justify-between px-4 md:px-6 shrink-0 glass-strong border-b border-white/50">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <Link href={rootHref} className="hover:text-foreground transition-colors shrink-0">
              {rootLabel}
            </Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="text-foreground font-semibold truncate">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {profileHref && (
              <Link
                href={profileHref}
                className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
                title="个人中心"
              >
                <User className="w-[18px] h-[18px]" />
              </Link>
            )}
            {topRight}
          </div>
        </header>

        <div className="page-surface p-3 md:p-6 pb-24 md:pb-6 flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>

      {/* 移动端底栏（学生/教师） */}
      {role !== 'admin' && <MobileTabBar role={role} />}
    </div>
    </ActiveNavContext.Provider>
  );
}
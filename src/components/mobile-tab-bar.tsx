'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  AlertCircle,
  Users,
  FileText,
  Library,
  Sparkles,
  MessageCircle,
} from 'lucide-react';

const studentTabs = [
  { href: '/student', label: '学情', icon: LayoutDashboard },
  { href: '/student/assignments', label: '作业', icon: BookOpen },
  { href: '/student/errors', label: '错题', icon: AlertCircle },
  { href: '/student/assistant', label: '答疑', icon: MessageCircle },
  { href: '/student/recommend', label: '推荐', icon: Sparkles },
];

const teacherTabs = [
  { href: '/teacher', label: '总览', icon: LayoutDashboard },
  { href: '/teacher/students', label: '学生', icon: Users },
  { href: '/teacher/assignments', label: '作业', icon: FileText },
  { href: '/teacher/questions/bank', label: '题库', icon: Library },
  { href: '/teacher/ai-generate', label: 'AI', icon: Sparkles },
];

export default function MobileTabBar({ role }: { role: 'student' | 'teacher' }) {
  const pathname = usePathname();
  const tabs = role === 'student' ? studentTabs : teacherTabs;

  function isActive(href: string) {
    if (href === '/student' || href === '/teacher') return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-white/50 pb-safe">
      <div className="flex items-center justify-around h-14 px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 rounded-lg transition-colors ${
                active
                  ? 'text-violet-600'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <span className="absolute -top-px w-6 h-0.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" />
              )}
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 2}
                className="shrink-0"
              />
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-violet-600' : ''}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

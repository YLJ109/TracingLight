'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  AlertCircle,
  GitGraph,
  Calendar,
  Users,
  FileText,
  Library,
  Sparkles,
} from 'lucide-react';

const studentTabs = [
  { href: '/student', label: '学情', icon: LayoutDashboard },
  { href: '/student/assignments', label: '作业', icon: BookOpen },
  { href: '/student/errors', label: '错题', icon: AlertCircle },
  { href: '/student/knowledge-graph', label: '图谱', icon: GitGraph },
  { href: '/student/study-plan', label: '计划', icon: Calendar },
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-slate-200/60 pb-safe">
      <div className="flex items-center justify-around h-14 px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 rounded-lg transition-colors ${
                active
                  ? 'text-teal-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 2}
                className="shrink-0"
              />
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-teal-600' : ''}`}>
                {tab.label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-5 h-0.5 bg-teal-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

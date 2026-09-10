import type { Metadata } from 'next';
import { NotificationProvider } from '@/lib/notification-store';
import { EyeCareProvider } from '@/lib/eye-care-store';
import { Toaster } from '@/components/ui/sonner';
// 屏蔽 Next 16 Turbopack 同步 redirect 触发的 performance.measure 负时间戳误报（见文件内注释）
import '@/lib/performance-guard';
import './globals.css';

export const metadata: Metadata = {
  title: '溯光 TracingLight | 高校智慧教育AI平台',
  description: '溯光TracingLight——面向高校师生的智慧教育平台。AI智能出题、自动批改、学情分析、知识图谱，实现从教学到评估的完整闭环。',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <EyeCareProvider>
          <NotificationProvider>
            {children}
            <Toaster position="top-center" richColors />
          </NotificationProvider>
        </EyeCareProvider>
      </body>
    </html>
  );
}

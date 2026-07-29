import type { Metadata } from 'next';
import { NotificationProvider } from '@/lib/notification-store';
import { EyeCareProvider } from '@/lib/eye-care-store';
import './globals.css';

export const metadata: Metadata = {
  title: '溯光 TracingLight | 高校智慧教育AI平台',
  description: '溯光TracingLight——面向高校师生的智慧教育平台。AI智能出题、自动批改、学情分析、知识图谱，实现从教学到评估的完整闭环。',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <EyeCareProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </EyeCareProvider>
      </body>
    </html>
  );
}

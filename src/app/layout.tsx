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
        {/*
          在 react-server-dom-turbopack 的 RSC 流式渲染 / hydration 之前注入补丁：
          屏蔽同步 redirect 触发的 performance.measure 负时间戳 DOMException
          （'...cannot have a negative time stamp.'）。
          不放在 <head>（避免与 dev 工具注入的属性产生 hydration 不匹配），
          用 body 顶部普通内联脚本，HTML 解析早期即执行。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var P = (typeof Performance !== 'undefined') ? Performance : null;
                if (!P || !P.prototype || typeof P.prototype.measure !== 'function') return;
                var orig = P.prototype.measure;
                var re = /negative time stamp|does not exist/i;
                P.prototype.measure = function(a,b,c){
                  try { return orig.apply(this, arguments); }
                  catch(e){
                    if (e && re.test(String((e && e.message) || e))) return;
                    throw e;
                  }
                };
              } catch(e){ /* ignore */ }
            })();`,
          }}
        />
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

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/** 全局路由级错误兜底：接口/渲染异常不再白屏 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center card-protected">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">页面出了点问题</h2>
        <p className="text-sm text-slate-500 mb-5">
          {error.digest ? `错误编号 ${error.digest} · ` : ''}请重试；若持续出现请刷新页面或联系管理员
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> 重试
        </button>
      </div>
    </div>
  );
}

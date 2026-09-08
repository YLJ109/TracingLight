'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** 统一的「返回」按钮：学院渐变圆形 + 阴影，显眼、美观。
 *  行为优先级：onClick > to（定向跳转）> router.back()。
 *  - to：跳到指定路由，适用于「返回列表」等明确目标，避免 history 栈为空时 back 失效。
 *  - onClick：完全自定义处理。
 */
export function BackButton({ onClick, to }: { onClick?: () => void; to?: string }) {
  const router = useRouter();
  const handle = onClick ?? (to ? () => router.push(to) : () => router.back());
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="返回"
      onClick={handle}
      className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:scale-105 transition-all cursor-pointer"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );
}
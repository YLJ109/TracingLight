'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * 公告通知已并入 /student/notifications（消息中心）。
 * 本页仅作历史链接重定向，保留 ?aid= 精确定位到对应公告。
 */
export default function StudentAnnouncementsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const aid = searchParams.get('aid');
    router.replace(`/student/notifications?tab=announcement${aid ? `&aid=${aid}` : ''}`);
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> 正在跳转到消息中心...
    </div>
  );
}
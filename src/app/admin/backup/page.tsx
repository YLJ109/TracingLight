'use client';

import { Card, CardContent } from '@/components/ui/card';
import { DatabaseBackup } from 'lucide-react';

export default function AdminBackup() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <DatabaseBackup className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="page-title">数据备份</h1>
          <p className="text-sm text-muted-foreground">SQLite 单文件备份</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm py-0">
        <CardContent className="p-6 space-y-3 text-sm">
          <p className="font-medium">备份说明</p>
          <p className="text-muted-foreground">
            本平台采用 SQLite 单文件数据库，备份只需复制一个文件：
          </p>
          <div className="rounded-lg bg-muted p-3 font-mono text-xs">
            data/tracinglight.db
          </div>
          <p className="text-muted-foreground">
            答辩演示前，复制该文件到安全位置即可完成备份；恢复时复制回来覆盖即可。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

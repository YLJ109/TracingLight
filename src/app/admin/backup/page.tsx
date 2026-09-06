'use client';

import { Card, CardContent } from '@/components/ui/card';

export default function AdminBackup() {
  return (
    <div className="space-y-4">
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

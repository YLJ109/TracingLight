'use client';

import { Card, CardContent } from '@/components/ui/card';

export default function AdminBackup() {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-0 shadow-sm py-0">
        <CardContent className="p-6 space-y-3 text-sm">
          <p className="font-medium">备份说明</p>
          <p className="text-muted-foreground">
            本平台采用 PostgreSQL 数据库，备份用 <code className="rounded bg-muted px-1 py-0.5">pg_dump</code> 导出 SQL 即可：
          </p>
          <div className="rounded-lg bg-muted p-3 font-mono text-xs">
            pg_dump -U tracinglight -d tracinglight &gt; tracinglight_backup.sql
          </div>
          <p className="text-muted-foreground">
            答辩演示前，导出到安全位置即可完成备份；恢复时用 psql 导入覆盖即可。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

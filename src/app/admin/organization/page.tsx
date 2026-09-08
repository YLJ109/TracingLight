'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-fetch';
import { Building2 } from 'lucide-react';

interface Org {
  schools: Array<{ id: number; name: string }>;
  colleges: Array<{ id: number; school_id: number; name: string }>;
  majors: Array<{ id: number; college_id: number; name: string }>;
  classes: Array<{ id: number; major_id: number; name: string }>;
}

export default function AdminOrganization() {
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d) => { if (d.success) setOrg(d.data.organization || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">组织架构</h1>
          <p className="text-xs text-muted-foreground">学校 · 学院 · 专业 · 班级</p>
        </div>
      </div>

      {loading ? (
        <div className="h-40 rounded-2xl bg-muted skeleton-shimmer" />
      ) : org && org.schools.length > 0 ? (
        <div className="space-y-3">
          {org.schools.map((s) => (
            <Card key={s.id} className="rounded-2xl border-0 shadow-sm py-0">
              <CardContent className="p-4">
                <p className="font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-violet-600" />{s.name}</p>
                <div className="mt-3 space-y-2 pl-4 border-l-2 border-violet-200">
                  {org.colleges.filter((c) => c.school_id === s.id).map((c) => (
                    <div key={c.id}>
                      <p className="text-sm font-medium text-violet-700">{c.name}</p>
                      <div className="mt-1 space-y-1 pl-4 border-l border-violet-100">
                        {org.majors.filter((m) => m.college_id === c.id).map((m) => (
                          <div key={m.id}>
                            <p className="text-sm text-muted-foreground">{m.name}</p>
                            <div className="flex flex-wrap gap-2 pl-4 mt-1">
                              {org.classes.filter((cl) => cl.major_id === m.id).map((cl) => (
                                <span key={cl.id} className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-xs">{cl.name}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-3">
              <Building2 className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-sm font-medium text-foreground">暂无组织架构数据</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              组织架构（学校/学院/专业/班级）由系统初始化或平台运营方录入后自动展示。可先在上方创建班级并关联专业，数据接入后本页即会显示完整层级。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

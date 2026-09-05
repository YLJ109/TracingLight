'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-fetch';
import { Settings, Sparkles, Database, Save } from 'lucide-react';

const AI_FIELDS = [
  { key: 'ai_base_url', label: 'API 地址 (Base URL)', placeholder: 'https://open.bigmodel.cn/api/paas/v4', hint: '兼容 OpenAI Chat Completions 格式的服务地址' },
  { key: 'ai_api_key', label: 'API Key', placeholder: '留空则继续使用 .env 中的 ZHIPU_API_KEY', hint: '密钥将存入平台数据库，替换环境变量' },
  { key: 'ai_model', label: '模型名称', placeholder: 'glm-4-flash', hint: '如 glm-4-flash / glm-4-plus 等，保存后立即生效' },
];

export default function AdminSettings() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/config')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setConfigs(d.data || []);
          const init: Record<string, string> = {};
          d.data.forEach((c: any) => { init[c.key] = c.value; });
          setEditing(init);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: string) => {
    setMessage('');
    setSavingKey(key);
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editing[key] ?? '' }),
      });
      const json = await res.json();
      setMessage(json.success ? `已保存 ${key}，AI 配置立即生效` : json.error || '保存失败');
    } catch {
      setMessage('网络错误');
    } finally {
      setSavingKey(null);
    }
  };

  const saveAllAI = async () => {
    for (const f of AI_FIELDS) {
      if (editing[f.key] !== undefined && editing[f.key] !== '') await save(f.key);
    }
  };

  const aiExisting = new Map(configs.map((c) => [c.key, c.value]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="page-title">系统设置</h1>
          <p className="text-sm text-muted-foreground">平台参数与 AI 配置</p>
        </div>
      </div>

      {message && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{message}</div>}

      {/* AI 服务配置：支持在线切换 API/模型，立即生效 */}
      <Card className="border-0 shadow-sm py-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h2 className="text-sm font-semibold text-foreground">AI 服务配置</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            配置平台的 AI 服务地址、密钥与模型。保存后所有 AI 功能（出题/批改/解析/规划/答疑）立即切换，无需重启。留空表示沿用 .env 环境变量。
          </p>
          <div className="space-y-3">
            {AI_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-4">
                <div className="w-52 shrink-0">
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
                <Input
                  className="flex-1"
                  type={f.key === 'ai_api_key' ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={editing[f.key] ?? ''}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
                <Button size="sm" variant="outline" disabled={savingKey === f.key} onClick={() => save(f.key)}>
                  {savingKey === f.key ? <Save className="w-3 h-3 animate-pulse" /> : '保存'}
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <p className="text-xs text-slate-400">
              当前生效：{aiExisting.get('ai_model') || 'glm-4-flash（默认）'} @ {aiExisting.get('ai_base_url') || '智谱官方地址'}
            </p>
            <Button size="sm" className="gap-1 bg-violet-600 hover:bg-violet-700" onClick={saveAllAI}>
              <Save className="w-3 h-3" /> 一键保存全部
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 其余系统配置 */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted skeleton-shimmer" />)}</div>
      ) : (
        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-0 divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3">
              <Database className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-medium text-foreground">其他系统参数</p>
            </div>
            {configs.filter((c) => !AI_FIELDS.some((f) => f.key === c.key)).map((c) => (
              <div key={c.key} className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-56 shrink-0">
                  <p className="text-sm font-medium text-foreground">{c.key}</p>
                  <p className="text-xs text-muted-foreground">{c.description || ''}</p>
                </div>
                <Input
                  className="flex-1"
                  value={editing[c.key] ?? ''}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [c.key]: e.target.value }))}
                />
                <Button size="sm" variant="outline" onClick={() => save(c.key)}>保存</Button>
              </div>
            ))}
            {configs.filter((c) => !AI_FIELDS.some((f) => f.key === c.key)).length === 0 && (
              <p className="px-4 py-4 text-xs text-muted-foreground">暂无其他配置项</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

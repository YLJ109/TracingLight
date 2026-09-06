'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-fetch';
import { Users, Plus, X } from 'lucide-react';

interface UserRow {
  id: number;
  username: string;
  real_name: string;
  role: string;
  student_level: string | null;
  class_id: number | null;
  is_active: boolean | number;
}

const roleLabel: Record<string, string> = { teacher: '教师', student: '学生', admin: '管理员', assistant: '助教' };
const roleBadge: Record<string, string> = {
  teacher: 'bg-blue-50 text-blue-600',
  student: 'bg-violet-50 text-violet-600',
  admin: 'bg-fuchsia-50 text-fuchsia-600',
  assistant: 'bg-teal-50 text-teal-600',
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', real_name: '', role: 'student', password: '' });

  const fetchUsers = useCallback(() => {
    apiFetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => { if (d.success) setUsers(d.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const doAction = async (action: string, extra: Record<string, any>) => {
    setMessage('');
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('操作成功');
        fetchUsers();
        if (action === 'create') setShowCreate(false);
      } else {
        setMessage(json.error || '操作失败');
      }
    } catch {
      setMessage('网络错误');
    }
  };

  const createUser = () => {
    if (!form.username.trim() || !form.real_name.trim()) { setMessage('请填写用户名和姓名'); return; }
    doAction('create', { ...form, username: form.username.trim(), real_name: form.real_name.trim() });
    setForm({ username: '', real_name: '', role: 'student', password: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="w-4 h-4" />新增用户
        </Button>
      </div>

      {message && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{message}</div>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted skeleton-shimmer" />)}</div>
      ) : (
        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">用户名</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-muted-foreground">{u.id}</td>
                    <td className="px-4 py-2.5 font-medium">{u.real_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.username}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        onChange={(e) => doAction('change_role', { user_id: u.id, role: e.target.value })}
                        className="px-2 py-1 rounded-md border border-border text-sm bg-transparent"
                      >
                        <option value="teacher">教师</option>
                        <option value="student">学生</option>
                        <option value="admin">管理员</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={u.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}>
                        {u.is_active ? '正常' : '禁用'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => doAction(u.is_active ? 'disable' : 'enable', { user_id: u.id })}
                          disabled={u.username === 'admin'}
                        >
                          {u.is_active ? '禁用' : '启用'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => doAction('reset_password', { user_id: u.id })}>
                          重置密码
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 新增用户弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">新增用户</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">用户名</label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">姓名</label>
                <Input value={form.real_name} onChange={(e) => setForm({ ...form, real_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">角色</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border text-sm"
                >
                  <option value="teacher">教师</option>
                  <option value="student">学生</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">初始密码（留空=用户名）</label>
                <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" placeholder="留空则默认为用户名" />
              </div>
              <Button onClick={createUser} className="w-full mt-2">创建</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

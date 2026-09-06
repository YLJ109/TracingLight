'use client';

import { useState, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Slider } from '@/components/ui/slider';
import {
  User, Camera, KeyRound, GraduationCap, BookOpen,
  Target, AlertCircle, CheckCircle2, Loader2, Shield, UserRound, LogOut, RotateCw, ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { signOut, setUserAvatar } from '@/lib/auth-helper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

interface AccountData {
  user: {
    id: number;
    username: string;
    real_name: string;
    role: string;
    student_level: string | null;
    avatar_url: string | null;
    created_at: string;
  };
  className: string | null;
  advisor: Array<{ id: number; name: string; username: string }>;
  stats: null | {
    completedAssignments: number;
    totalErrors: number;
    masteredErrors: number;
    avgScore: number;
  };
}

const ROLE_LABEL: Record<string, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
  assistant: '助教',
};

const LEVEL_LABEL: Record<string, string> = {
  top: '学霸层',
  medium: '勤奋中等层',
  weak: '提升层',
};

export default function ProfilePanel({ role }: { role: 'student' | 'teacher' | 'admin' }) {
  const isStudent = role === 'student';
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  // 编辑资料
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [level, setLevel] = useState<string>('medium');
  const [savingInfo, setSavingInfo] = useState(false);

  // 修改密码
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // 头像上传（含裁剪）
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const load = () => {
    apiFetch('/api/account')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setData(json.data);
          setName(json.data.user.real_name);
          setLevel(json.data.user.student_level || 'medium');
          // 若 DB 头像与会话不一致，同步到会话并广播，保证侧栏头像一致
          if (json.data.user.avatar_url) setUserAvatar(json.data.user.avatar_url);
        }
      })
      .catch(() => toast.error('加载个人信息失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const saveInfo = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 20) { toast.error('姓名长度须在 2-20 个字符之间'); return; }
    setSavingInfo(true);
    try {
      const res = await apiFetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ real_name: n, student_level: isStudent ? level : undefined }),
      });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || '保存失败'); return; }
      setData((prev) => prev ? { ...prev, user: { ...prev.user, real_name: d.user.real_name, student_level: d.user.student_level } } : prev);
      setEditOpen(false);
      toast.success('资料已更新');
      // 刷新侧栏用户名（下次进入生效）
    } catch { toast.error('网络错误，请重试'); }
    finally { setSavingInfo(false); }
  };

  const changePassword = async () => {
    if (newPwd.length < 6) { toast.error('新密码至少 6 位'); return; }
    if (newPwd !== confirmPwd) { toast.error('两次输入的新密码不一致'); return; }
    setChangingPwd(true);
    try {
      const res = await apiFetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || '修改失败'); return; }
      toast.success('密码修改成功，请重新登录');
      setPwdOpen(false);
      setTimeout(() => signOut(), 600);
    } catch { toast.error('网络错误，请重试'); }
    finally { setChangingPwd(false); }
  };

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { toast.error('仅支持图片格式'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('图片大小不能超过 10MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  /** 把选中的裁剪区域绘制成 512×512 的方形 PNG Blob */
  const getCroppedBlob = async (src: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<Blob> => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图片加载失败')); });
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 不可用');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, SIZE, SIZE);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png'));
  };

  const confirmCropAndUpload = async () => {
    if (!cropSrc || !croppedAreaPixels) { toast.error('请先选择头像区域'); return; }
    setUploadingAvatar(true);
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const fd = new FormData();
      fd.append('file', blob, 'avatar.png');
      const res = await apiFetch('/api/account/upload-avatar', { method: 'POST', body: fd });
      const d = await res.json();
      if (!d.success) { toast.error(d.error || '上传失败'); return; }
      setData((prev) => prev ? { ...prev, user: { ...prev.user, avatar_url: d.avatar_url } } : prev);
      setUserAvatar(d.avatar_url); // 同步侧栏/布局头像
      toast.success('头像已更新');
      setCropOpen(false);
      setCropSrc(null);
    } catch { toast.error('网络错误，请重试'); }
    finally { setUploadingAvatar(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const u = data?.user;
  const avatarSrc = u?.avatar_url;
  const statCards = [
    { label: '已完成作业', value: data?.stats?.completedAssignments ?? 0, icon: BookOpen, color: 'from-violet-500 to-fuchsia-500' },
    { label: '平均得分', value: `${data?.stats?.avgScore ?? 0}`, suffix: '分', icon: Target, color: 'from-amber-500 to-orange-500' },
    { label: '错题总数', value: data?.stats?.totalErrors ?? 0, icon: AlertCircle, color: 'from-red-500 to-rose-500' },
    { label: '已掌握错题', value: data?.stats?.masteredErrors ?? 0, icon: CheckCircle2, color: 'from-emerald-500 to-teal-500' },
  ];

  return (
    <div className="space-y-5">
      {/* 基础信息卡 */}
      <Card className="overflow-hidden border-0 shadow-sm py-0">
        <div className="h-24 bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500" />
        <CardContent className="p-5 -mt-12">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-lg">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="头像" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <div className="w-full h-full rounded-xl brand-gradient flex items-center justify-center text-white text-3xl font-bold">
                    {u?.real_name[0] || '?'}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-violet-600 hover:border-violet-300 transition-colors"
                title="更换头像"
              >
                {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickAvatar} />
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-bold text-slate-800">{u?.real_name}</h2>
                {u?.student_level && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border-0 ${
                    u.student_level === 'top' ? 'level-top' : u.student_level === 'medium' ? 'level-medium' : 'level-weak'
                  }`}>
                    {LEVEL_LABEL[u.student_level]}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-0.5">@{u?.username} · {ROLE_LABEL[u?.role || ''] || u?.role} {data?.className ? `· ${data.className}` : ''}</p>
              <p className="text-xs text-slate-300 mt-1">{u?.created_at ? `注册于 ${(u.created_at || '').slice(0, 10)}` : ''}</p>
            </div>
            <div className="flex gap-2 shrink-0 pt-2 sm:pt-0">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="text-xs">
                <User className="w-3.5 h-3.5 mr-1" /> 编辑资料
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPwdOpen(true)} className="text-xs">
                <KeyRound className="w-3.5 h-3.5 mr-1" /> 修改密码
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 学生：学习摘要 */}
      {isStudent && (
        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-violet-600" /> 学习概况
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center text-white shrink-0`}>
                    <s.icon className="w-5 h-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-800 leading-none">{s.value}{s.suffix ? <span className="text-xs font-medium text-slate-400 ml-0.5">{s.suffix}</span> : null}</p>
                    <p className="text-[11px] text-slate-400 mt-1 truncate">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 指导导师 + 账户信息 */}
      <div className="grid lg:grid-cols-2 gap-5">
        {isStudent && (
          <Card className="border-0 shadow-sm py-0">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-violet-600" /> 指导导师
              </h3>
              {data?.advisor && data.advisor.length > 0 ? (
                <div className="space-y-3">
                  {data.advisor.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-violet-50/60 border border-violet-100">
                      <div className="w-11 h-11 rounded-xl brand-gradient flex items-center justify-center text-white font-bold shrink-0">
                        {t.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400">@{t.username}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-violet-600 border border-violet-200 shrink-0">{ROLE_LABEL.teacher}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-slate-400">
                  <UserRound className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">暂无导师信息</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-violet-600" /> 账户信息
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-400">用户名</span>
                <span className="text-slate-700 font-medium">{u?.username}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-400">姓名</span>
                <span className="text-slate-700 font-medium">{u?.real_name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-400">身份</span>
                <span className="text-slate-700 font-medium">{ROLE_LABEL[u?.role || ''] || u?.role}</span>
              </div>
              {isStudent && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-slate-400">学生层级</span>
                  <span className="text-slate-700 font-medium">{LEVEL_LABEL[u?.student_level || ''] || '未分层'}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-400">注册时间</span>
                <span className="text-slate-700 font-medium">{u?.created_at ? (u.created_at || '').slice(0, 10) : '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 低密钥操作：退出 */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-red-500" onClick={() => signOut()}>
          <LogOut className="w-3.5 h-3.5 mr-1" /> 退出登录
        </Button>
      </div>

      {/* 编辑资料对话框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑资料</DialogTitle>
            <DialogDescription>更新你的个人基本信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">姓名</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入姓名" maxLength={20} />
            </div>
            {isStudent && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">学生层级</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['top', 'medium', 'weak'] as const).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLevel(lv)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        level === lv ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {LEVEL_LABEL[lv]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={saveInfo} disabled={savingInfo}>
              {savingInfo && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改密码对话框 */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>修改后将退出登录，请使用新密码重新登录</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">当前密码</label>
              <Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="请输入当前密码" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">新密码</label>
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="至少 6 位" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">确认新密码</label>
              <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>取消</Button>
            <Button onClick={changePassword} disabled={changingPwd}>
              {changingPwd && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} 确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 裁剪头像对话框 */}
      <Dialog open={cropOpen} onOpenChange={(o) => { if (!uploadingAvatar) setCropOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>裁剪头像</DialogTitle>
            <DialogDescription>拖动图片调整位置，滚动/滑条缩放，将以 1:1 方形裁剪</DialogDescription>
          </DialogHeader>
          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
            {cropSrc && (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            )}
          </div>
          <div className="flex items-center gap-3 px-1">
            <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              className="flex-1"
            />
            <RotateCw className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={uploadingAvatar} onClick={() => { setCropOpen(false); setCropSrc(null); }}>取消</Button>
            <Button onClick={confirmCropAndUpload} disabled={uploadingAvatar || !croppedAreaPixels}>
              {uploadingAvatar ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 上传中…</> : '确认上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
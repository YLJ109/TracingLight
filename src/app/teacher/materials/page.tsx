'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { Star, Trash2, BookOpen, Loader2, Save, Library, Plus, Upload, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// 材料类型 → 中文标签（与 schema 注释一致：video / document / slide）
const TYPE_LABEL: Record<string, string> = {
  video: '视频',
  document: '文档',
  slide: '课件',
};

interface Material {
  id: number;
  title: string;
  type: string;
  content: string | null;
  chapter: string | null;
  is_required: boolean;
}

/** 本地可编辑状态：标题 + 必学标记 */
interface EditState {
  title: string;
  is_required: boolean;
  dirty: boolean;
}

export default function TeacherMaterialsPage() {
  const [courses, setCourses] = useState<Array<{ id: number; name: string }>>([]);
  const [courseId, setCourseId] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [saving, setSaving] = useState(false);

  // 新增材料弹窗状态
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addForm, setAddForm] = useState({
    title: '',
    type: 'video',
    chapter: '',
    is_required: false,
    url: '',
  });

  // 加载教师授课课程下拉
  useEffect(() => {
    apiFetch('/api/teacher/courses')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setCourses(json.data);
      })
      .catch(() => toast.error('加载课程列表失败'))
      .finally(() => setLoadingCourses(false));
  }, []);

  // 选择课程后加载该课程材料
  useEffect(() => {
    if (!courseId) { setMaterials([]); setEdits({}); return; }
    setLoadingMaterials(true);
    apiFetch(`/api/teacher/materials?course_id=${courseId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setMaterials(json.data);
          setEdits(Object.fromEntries(
            (json.data as Material[]).map((m) => [m.id, { title: m.title, is_required: m.is_required, dirty: false }]),
          ));
        } else {
          toast.error(json.error || '加载材料失败');
        }
      })
      .catch(() => toast.error('加载材料失败'))
      .finally(() => setLoadingMaterials(false));
  }, [courseId]);

  const selectedCourseName = useMemo(
    () => courses.find((c) => String(c.id) === courseId)?.name ?? '',
    [courses, courseId],
  );

  const hasDirty = Object.values(edits).some((e) => e.dirty);

  // 更新某条材料的本地状态并标记脏
  const updateEdit = (id: number, patch: Partial<Pick<EditState, 'title' | 'is_required'>>) => {
    setEdits((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch, dirty: true } };
    });
  };

  // 「保存」：把当前所有脏数据批量提交到后端
  const handleSave = async () => {
    const items = materials
      .map((m) => ({ m, e: edits[m.id] }))
      .filter(({ e }) => e && e.dirty)
      .map(({ m, e }) => ({ id: m.id, title: e.title, is_required: e.is_required }));

    if (items.length === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/teacher/materials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`已保存 ${items.length} 项修改`);
        setEdits((prev) => {
          const next = { ...prev };
          for (const it of items) {
            const cur = next[it.id];
            if (cur) next[it.id] = { ...cur, dirty: false };
          }
          return next;
        });
      } else {
        toast.error(json.error || '保存失败');
      }
    } catch {
      toast.error('网络异常，保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除单条材料
  const handleDelete = async (id: number) => {
    try {
      const res = await apiFetch(`/api/teacher/materials?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setMaterials((prev) => prev.filter((m) => m.id !== id));
        setEdits((prev) => { const next = { ...prev }; delete next[id]; return next; });
        toast.success('已删除该材料');
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('网络异常，删除失败');
    }
  };

  // 新增材料：可选上传文件，再 POST 创建记录
  const handleAdd = async () => {
    const title = addForm.title.trim();
    if (!title) { toast.error('请输入材料标题'); return; }

    let url = addForm.url.trim() || '';
    setAdding(true);
    try {
      if (!url && addFile) {
        const fd = new FormData();
        fd.append('files', addFile);
        const upRes = await apiFetch('/api/teacher/materials/upload', { method: 'POST', body: fd });
        const upJson = await upRes.json();
        if (upJson.success && upJson.data?.path) {
          url = '/' + String(upJson.data.path);
        } else {
          toast.error(upJson.error || '文件上传失败');
          setAdding(false);
          return;
        }
      }

      const res = await apiFetch('/api/teacher/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: Number(courseId),
          title,
          type: addForm.type,
          chapter: addForm.chapter.trim() || undefined,
          url: url || undefined,
          is_required: addForm.is_required,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMaterials((prev) => [...prev, json.data]);
        setEdits((prev) => ({
          ...prev,
          [json.data.id]: { title: json.data.title, is_required: json.data.is_required, dirty: false },
        }));
        setAddOpen(false);
        setAddForm({ title: '', type: 'video', chapter: '', is_required: false, url: '' });
        setAddFile(null);
        toast.success('材料添加成功');
      } else {
        toast.error(json.error || '添加失败');
      }
    } catch {
      toast.error('网络异常，添加失败');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Library className="w-5 h-5 text-violet-600" /> 学习材料管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            对指定课程的教材清单维护标题，并可标记「必学」章节（学生端按必学重点查看）。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setAddOpen(true)} disabled={!courseId} className="gap-1.5">
            <Plus className="w-4 h-4" /> 添加材料
          </Button>
          <Button onClick={handleSave} disabled={!hasDirty || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存修改
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-600" /> 选择课程
          </CardTitle>
          <CardDescription>仅展示当前教师授课的课程，材料均归属于所选课程。</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={courseId} onValueChange={setCourseId} disabled={loadingCourses}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder={loadingCourses ? '加载课程中...' : '请选择课程'} />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {courseId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selectedCourseName || `课程材料`}</CardTitle>
            <CardDescription>
              {materials.length > 0
                ? `共 ${materials.length} 条材料，切换「必学」标记、编辑标题后点击右上角「保存修改」提交。`
                : '该课程暂无学习材料。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMaterials ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
              </div>
            ) : materials.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">暂无材料，可先在其他流程中发布学习材料。</div>
            ) : (
              <div className="space-y-2.5">
                {materials.map((m) => {
                  const edit = edits[m.id];
                  if (!edit) return null;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
                    >
                      <input
                        value={edit.title}
                        onChange={(e) => updateEdit(m.id, { title: e.target.value })}
                        className="flex-1 min-w-0 text-sm px-2 py-1 rounded-lg border border-border outline-none focus:ring-2 focus:ring-violet-300 bg-slate-50"
                        placeholder="材料标题"
                      />
                      {m.chapter && (
                        <Badge variant="outline" className="shrink-0 text-[11px]">
                          {m.chapter}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="shrink-0 text-[11px]">
                        {TYPE_LABEL[m.type] || m.type}
                      </Badge>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Star className={`w-4 h-4 ${edit.is_required ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                        <span className="text-xs text-slate-500">{edit.is_required ? '必学' : '选学'}</span>
                        <Switch
                          checked={edit.is_required}
                          onCheckedChange={(v) => updateEdit(m.id, { is_required: v })}
                          aria-label="必学标记"
                        />
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            title="删除该材料"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除该材料？</AlertDialogTitle>
                            <AlertDialogDescription>
                              将删除「{edit.title}」及其关联的学生学习记录，此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleDelete(m.id)}
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 新增材料弹窗 */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) setAddOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-violet-600" /> 添加学习材料
            </DialogTitle>
            <DialogDescription>为当前课程新增一条学习材料记录（可选上传文件）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>材料标题</Label>
              <Input
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                placeholder="例如：微视频1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>材料类型</Label>
                <Select value={addForm.type} onValueChange={(v) => setAddForm({ ...addForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">视频</SelectItem>
                    <SelectItem value="document">文档</SelectItem>
                    <SelectItem value="slide">课件</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>章节</Label>
                <Input
                  value={addForm.chapter}
                  onChange={(e) => setAddForm({ ...addForm, chapter: e.target.value })}
                  placeholder="例如：第1章 语法基础"
                />
              </div>
            </div>
            {addForm.type === 'video' && (
              <div className="space-y-1.5">
                <Label>视频链接（推荐哔哩哔哩链接）</Label>
                <Input
                  value={addForm.url}
                  onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
                  placeholder="例如：https://www.bilibili.com/video/BV1c4411e77t"
                />
                <p className="text-xs text-slate-400">粘贴B站视频链接会自动解析为内嵌播放器；留空+上传文件使用站内直链播放</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{addForm.type === 'video' ? '上传本地视频文件（可选）' : '上传文件（可选）'}</Label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500 truncate">
                  {addFile ? addFile.name : '点击选择文件（视频/文档/课件，≤20MB）'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
                />
                {addFile && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setAddFile(null); }}
                    className="text-slate-400 hover:text-red-600 ml-auto shrink-0"
                    aria-label="移除文件"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </label>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Star className={`w-4 h-4 ${addForm.is_required ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                <span className="text-sm text-slate-600">{addForm.is_required ? '必学' : '选学'}</span>
              </div>
              <Switch
                checked={addForm.is_required}
                onCheckedChange={(v) => setAddForm({ ...addForm, is_required: v })}
                aria-label="必学标记"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>取消</Button>
            <Button onClick={handleAdd} disabled={adding} className="gap-1.5">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
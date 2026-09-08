'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { Star, Trash2, BookOpen, Loader2, Save, Library } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
        <Button onClick={handleSave} disabled={!hasDirty || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存修改
        </Button>
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
                          第{m.chapter}章
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
    </div>
  );
}
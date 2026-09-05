'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, FolderOpen, Network, MessageCircle, Loader2 } from 'lucide-react';

/**
 * P2-3：课程学习聚合页（重设计）
 * 学生从首页课程卡片进入，一站直达该课程的材料 / 作业 / 图谱 / AI 答疑。
 */
export default function StudentCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = params?.id;

  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [materialCount, setMaterialCount] = useState(0);
  const [assignmentCount, setAssignmentCount] = useState(0);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    Promise.all([
      apiFetch(`/api/student/materials?course_id=${courseId}`).then((r) => r.json()).catch(() => null),
      apiFetch('/api/student/assignments').then((r) => r.json()).catch(() => null),
    ]).then(([m, a]) => {
      if (cancelled) return;
      const materials = m?.data?.materials ?? m?.data ?? [];
      const list = Array.isArray(materials) ? materials : [];
      setMaterialCount(list.length);
      setCourseName(list[0]?.course_name || '课程');
      const assignments = a?.data ?? [];
      if (Array.isArray(assignments)) {
        setAssignmentCount(assignments.filter((x: { course_id?: number }) => String(x.course_id) === String(courseId)).length);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [courseId]);

  const entries = [
    { href: `/student/materials?course_id=${courseId}`, label: '学习材料', desc: `${materialCount} 份资料`, icon: FolderOpen, tone: 'from-violet-500 to-fuchsia-500' },
    { href: `/student/assignments`, label: '本课作业', desc: `${assignmentCount} 项作业`, icon: BookOpen, tone: 'from-fuchsia-500 to-pink-500' },
    { href: `/student/knowledge-graph?course_id=${courseId}`, label: '知识图谱', desc: '掌握度诊断', icon: Network, tone: 'from-indigo-500 to-violet-500' },
    { href: `/student/assistant`, label: '问 AI 老师', desc: '本课疑问随时问', icon: MessageCircle, tone: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/student')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="page-title">{loading ? <Loader2 className="w-6 h-6 animate-spin inline" /> : courseName}</h1>
          <p className="text-sm text-slate-500 mt-1">课程学习中心 · 材料、作业、图谱、答疑一站直达</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {entries.map((e) => (
          <Card
            key={e.href}
            className="border-0 shadow-sm card-hover cursor-pointer py-0"
            onClick={() => router.push(e.href)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${e.tone} flex items-center justify-center text-white shrink-0`}>
                <e.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{e.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{e.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

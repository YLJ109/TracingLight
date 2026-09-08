'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/auth-helper';
import { apiFetch } from '@/lib/api-fetch';
import { SetActiveNav } from '@/components/app-shell';
import { formatDateTime } from '@/lib/date';
import { Camera, ShieldCheck, Timer, Clock, Calendar, UserCheck, AlertTriangle, FileCheck, Play } from 'lucide-react';

interface Detail {
  exam: { id: number; title: string; description?: string; course_name: string; exam_type: string; time_mode: string; start_at: string; end_at?: string | null; duration: number; total_score?: number; has_subjective: boolean; grades_published: boolean; status: string; randomized: boolean };
  enroll: { allow: boolean; enroll_status: string } | null;
  proctor_config: any;
  can_start: boolean;
  can_start_reason: string | null;
  existing_attempt: { status: string; deadline: string; face_verified: boolean } | null;
}

type FaceState = 'requesting' | 'scanning' | 'verified' | 'error';

/** 极简设备指纹（真实场景应后端结合更多因子） */
function genDeviceFp(): string {
  const ua = navigator.userAgent || '';
  const screenStr = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const tz = new Date().getTimezoneOffset();
  let seed = 0;
  for (const c of (ua + screenStr + tz)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return `fp-${seed.toString(36)}-${Date.now().toString(36)}`;
}

export default function ExamEntryPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [face, setFace] = useState<FaceState>('requesting');
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const verifiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deviceFp = useRef(genDeviceFp());

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'student') { window.location.href = '/'; return; }
    const load = async () => {
      try {
        const res = await apiFetch(`/api/student/exams/${id}`);
        const j = await res.json();
        if (!res.ok || !j?.exam) {
          toast.error(j?.error || '考试加载失败');
          router.push('/student/exams');
          return;
        }
        setData(j);
      } catch { toast.error('加载失败'); router.push('/student/exams'); }
      setLoading(false);
    };
    load();
  }, [id, user, authLoading]);

  useEffect(() => {
    if (!data || !data.can_start) return;
    if (!data.proctor_config?.require_face) { setFace('verified'); return; }
    // 已人脸通过（续进）直接放行
    if (data.existing_attempt?.face_verified) { setFace('verified'); return; }

    let cancelled = false;
    const openCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setFace('scanning');
        startDetection();
      } catch {
        if (!cancelled) setFace('error');
      }
    };
    const startDetection = () => {
      const FD = (window as any).FaceDetector;
      const cfg = data.proctor_config || {};
      const ms = Number(cfg.face_detect_ms) || 1000;
      if (FD) {
        const detector = new FD({ fastMode: true, maxDetectedFaces: 3 });
        let presentSince = 0;
        const tick = async () => {
          if (!videoRef.current || cancelled) return;
          try {
            const faces = await detector.detect(videoRef.current);
            const hasFace = faces && faces.length > 0;
            if (hasFace) {
              if (!presentSince) presentSince = Date.now();
              if (Date.now() - presentSince >= ms) { setFace('verified'); return; }
            } else presentSince = 0;
            if (face !== 'verified' && !cancelled) verifiedTimer.current = setTimeout(tick, 150);
          } catch { if (!cancelled) verifiedTimer.current = setTimeout(tick, 200); }
        };
        verifiedTimer.current = setTimeout(tick, 200);
      } else {
        // 降级：摄像头流中就视为已就绪，按需时长后放行（真实项目应接入检测模型）
        setFace('scanning');
        verifiedTimer.current = setTimeout(() => { if (!cancelled) setFace('verified'); }, ms);
      }
    };
    openCamera();
    return () => { cancelled = true; clearTimeout(verifiedTimer.current); streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data.can_start]);

  // 进入考试即关闭本页摄像头（原页仍挂载，避免回到标签页时摄像头继续占用）
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const enter = async () => {
    if (!data) return;
    setStarting(true);
    // 立即开新标签页再回填，规避弹窗拦截
    const win = window.open('about:blank', '_blank');
    try {
      const res = await apiFetch(`/api/student/exams/${id}/start`, { method: 'POST', body: JSON.stringify({ device_fp: deviceFp.current }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || '无法进入考试'); win?.close(); setStarting(false); return; }
      if (data.proctor_config?.require_face) {
        await apiFetch(`/api/student/exams/${id}/face-verify`, { method: 'POST' }).catch(() => {});
      }
      // 进入成功后关闭本页摄像头（原页仍挂载，避免回到标签页时摄像头继续占用）
      stopCamera();
      if (win) win.location.href = `/student/exams/${id}/take`; else router.push(`/student/exams/${id}/take`);
    } catch { win?.close(); toast.error('网络异常'); setStarting(false); }
  };

  if (loading || !data) return <div className="animate-pulse h-48 bg-slate-100 rounded-2xl" />;

  const ex = data.exam;
  const submitted = data.existing_attempt && ['submitted', 'auto_submitted', 'terminated'].includes(data.existing_attempt.status);
  const inProgress = data.existing_attempt?.status === 'in_progress';

  const canEnter = data.can_start && (submitted ? false : true) && face === 'verified';

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up py-6">
      <SetActiveNav href="/student/exams" />

      <Card className="border-slate-200/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="p-6 bg-gradient-to-br from-violet-50 to-teal-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2"><Badge className="bg-violet-100 text-violet-700">{ex.course_name}</Badge><Badge className="bg-slate-100 text-slate-600">{ex.exam_type === 'final' ? '期末考试' : ex.exam_type === 'midterm' ? '期中考试' : ex.exam_type === 'quiz' ? '随堂测验' : '单元测验'}</Badge></div>
                <h1 className="text-2xl font-bold text-slate-800 mt-2">{ex.title}</h1>
                {ex.description && <p className="text-sm text-slate-500 mt-1">{ex.description}</p>}
              </div>
              <div className="text-right shrink-0"><div className="text-2xl font-bold text-brand-gradient">{ex.total_score ?? 100}</div><div className="text-xs text-slate-400">满分</div></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-sm">
              <div className="flex items-center gap-2 text-slate-600"><Calendar className="w-4 h-4 text-violet-400" />开考：{formatDateTime(ex.start_at)}</div>
              <div className="flex items-center gap-2 text-slate-600"><Clock className="w-4 h-4 text-teal-400" />限时：{ex.duration} 分钟</div>
              <div className="flex items-center gap-2 text-slate-600"><Timer className="w-4 h-4 text-amber-400" />{ex.randomized ? '题目&选项乱序' : '顺序固定'}</div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-10 px-6">
            {data.can_start && !submitted && !inProgress && (
              <div className="w-full max-w-sm text-center space-y-5">
                <div className="flex items-center justify-center gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="w-4 h-4" /><span>本场考试开启防作弊，进入后请保持全屏并诚信作答</span>
                </div>
                {data.proctor_config?.require_face ? (
                  <div className="relative mx-auto w-56 h-40 rounded-2xl overflow-hidden bg-slate-900 ring-4 ring-violet-200">
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    {face === 'scanning' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <div className="w-36 h-28 border-2 border-teal-300 rounded-xl animate-pulse" />
                        <div className="mt-2 text-xs">请正对摄像头…</div>
                      </div>
                    )}
                    {face === 'verified' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                        <UserCheck className="w-10 h-10 text-teal-300" />
                        <div className="mt-1 text-sm font-medium">核验通过</div>
                      </div>
                    )}
                    {face === 'error' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white text-center px-3">
                        <Camera className="w-8 h-8 text-red-300" />
                        <div className="mt-1 text-xs">无法访问摄像头，请授权后重试</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-slate-500"><ShieldCheck className="w-5 h-5 text-teal-500" />本场无需人脸核验，可直接进入</div>
                )}
                <Button
                  className="bg-gradient-to-r from-violet-600 to-teal-600 shadow-lg shadow-violet-200 w-full h-12 text-base"
                  disabled={!canEnter || starting}
                  onClick={enter}
                >
                  {starting ? '进入中…' : (<><ShieldCheck className="w-5 h-5 mr-2" />{data.proctor_config?.require_face ? '身份核验通过 · 进入考试' : '进入考试'}</>)}
                </Button>
              </div>
            )}

            {!data.can_start && (
              <div className="text-center py-4">
                {data.can_start_reason === 'not_started' && (<><AlertTriangle className="w-10 h-10 mx-auto text-amber-400 mb-2" /><p className="text-slate-500">考试尚未开始，开考时间：{formatDateTime(ex.start_at)}</p></>)}
                {(data.can_start_reason === 'closed' && <><Timer className="w-10 h-10 mx-auto text-slate-300 mb-2" /><p className="text-slate-500">考试已过截止时间</p></>)}
                <Button variant="outline" className="mt-4" onClick={() => router.push('/student/exams')}>返回考试列表</Button>
              </div>
            )}

            {inProgress && !submitted && (
              <div className="text-center">
                <Badge className="bg-teal-100 text-teal-700 mb-3">作答中</Badge>
                <p className="text-slate-500 text-sm">你的作答已自动保存，截止时间：{formatDateTime(data.existing_attempt?.deadline)}</p>
                <Button className="bg-gradient-to-r from-violet-600 to-teal-600 mt-4" onClick={() => window.open(`/student/exams/${id}/take`, '_blank')}><Play className="w-4 h-4 mr-1.5" />继续作答</Button>
              </div>
            )}

            {submitted && (
              <div className="text-center">
                <FileCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                <p className="font-medium text-slate-700">你已交卷</p>
                <p className="text-sm text-slate-400 mt-1">{ex.grades_published ? '成绩已公布' : '等待成绩公布'}</p>
                {ex.grades_published && <Button className="bg-gradient-to-r from-violet-600 to-teal-600 mt-4" onClick={() => router.push(`/student/exams/${id}/result`)}>查看成绩</Button>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, PlayCircle, FileText, Clock, RotateCcw,
  CheckCircle2, X, BookOpen, Timer, Brain, Star,
} from 'lucide-react';
import { resolveVideoEmbed } from '@/lib/video-embed';

const typeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  video: { label: '视频', icon: PlayCircle, color: 'text-fuchsia-600 bg-fuchsia-50' },
  document: { label: '文档', icon: FileText, color: 'text-violet-600 bg-violet-50' },
  slide: { label: '课件', icon: FolderOpen, color: 'text-teal-600 bg-teal-50' },
};

function fmtDuration(sec: number) {
  if (!sec) return '0 分钟';
  const min = Math.round(sec / 60);
  return min < 1 ? `${sec} 秒` : `${min} 分钟`;
}

export default function StudentMaterials() {
  const router = useRouter();
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('all');
  const [reading, setReading] = useState<any>(null);
  const startTimeRef = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // 阅读进度/完成态：仅当用户实际翻到材料末尾（或短内容读完足够时长）才算完成，避免秒开即 100%
  const [scrollProgress, setScrollProgress] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  // 视频在线播放：停留秒数与是否手动标记看完
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [videoDone, setVideoDone] = useState(false);

  const fetchMaterials = useCallback(() => {
    apiFetch('/api/student/materials')
      .then((r) => r.json())
      .then((json) => { if (json.success) setMaterials(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  // 当前打开的若为可在线播放的视频 → 解析内嵌地址
  const readingEmb = reading && reading.type === 'video' && reading.url ? resolveVideoEmbed(reading.url) : null;

  // 视频打开时每秒累计停留时长（用于展示 + 按时长判定完成）
  useEffect(() => {
    if (!readingEmb) return;
    const t = setInterval(() => setVideoSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅依赖是否打开可播放视频
  }, [reading?.id]);

  const courses = [...new Set(materials.map((m) => m.course_name).filter(Boolean))] as string[];
  const filtered = filterCourse === 'all' ? materials : materials.filter((m) => m.course_name === filterCourse);

  const totalWatch = materials.reduce((s, m) => s + (m.behavior?.watch_duration || 0), 0);
  const completedCount = materials.filter((m) => m.behavior?.is_completed).length;
  const totalReview = materials.reduce((s, m) => s + (m.behavior?.review_count || 0), 0);

  // 章节任务点（D7）：按章节分组 + 必学标记统计
  const requiredCount = materials.filter((m) => m.is_required).length;
  const requiredCompleted = materials.filter((m) => m.is_required && m.behavior?.is_completed).length;
  const grouped = filtered.reduce<{ chapter: string; items: any[] }[]>((acc, m) => {
    const chapter = m.chapter || '未分章节';
    let group = acc.find((g) => g.chapter === chapter);
    if (!group) { group = { chapter, items: [] }; acc.push(group); }
    group.items.push(m);
    return acc;
  }, []);
  // 章节内先展示必学，再按类型聚合；章节按名称排序
  grouped.sort((a, b) => a.chapter.localeCompare(b.chapter, 'zh'));
  grouped.forEach((g) => g.items.sort((x, y) => Number(y.is_required || 0) - Number(x.is_required || 0)));

  const openMaterial = (m: any) => {
    // eslint-disable-next-line react-hooks/purity -- 事件处理器内记录打开时刻，非渲染期调用
    startTimeRef.current = Date.now();
    setScrollProgress(0);
    setReachedEnd(false);
    setVideoSeconds(0);
    setVideoDone(false);
    setReading(m);
  };

  const handleContentScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.round((Math.max(0, el.scrollTop) / max) * 100);
    setScrollProgress(Math.max(0, Math.min(100, pct)));
    if (max <= 0 || el.scrollTop >= max - 10) setReachedEnd(true);
  };

  const closeMaterial = () => {
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    if (reading) {
      let isDone = false;
      let reportedProgress = 0;
      if (readingEmb) {
        // 视频：看完整时长或手动标记 → 完成；否则按时长折算进度
        const durSec = (reading.duration_minutes || 0) * 60;
        isDone = videoDone || (durSec > 0 && elapsed >= durSec);
        reportedProgress = isDone
          ? 100
          : durSec > 0
            ? Math.min(95, Math.round((elapsed / durSec) * 100))
            : Math.min(95, Math.round((elapsed / 120) * 100));
      } else {
        // 是否真正读完：翻到末尾（短内容无滚动则需至少阅读片刻），避免秒开即视为完成
        const noScroll = (contentRef.current && contentRef.current.scrollHeight <= contentRef.current.clientHeight + 2);
        isDone = reachedEnd && elapsed >= (noScroll ? 5 : 1);
        reportedProgress = isDone ? 100 : Math.max(0, Math.min(95, scrollProgress));
      }
      apiFetch('/api/student/behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: reading.id, watch_duration: elapsed, progress: reportedProgress, is_completed: isDone }),
      }).then(() => fetchMaterials()).catch(() => {});
    }
    setReading(null);
  };

  return (
    <div className="space-y-6">
      {/* 学习投入统计 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200/60 shadow-sm py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-50"><Clock className="w-5 h-5 text-violet-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">累计学习时长</p>
              <p className="text-xl font-bold">{fmtDuration(totalWatch)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-50"><CheckCircle2 className="w-5 h-5 text-teal-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">已完成材料</p>
              <p className="text-xl font-bold">{completedCount}<span className="text-sm text-muted-foreground font-normal"> / {materials.length}</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50"><RotateCcw className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">累计学习次数</p>
              <p className="text-xl font-bold">{totalReview}<span className="text-sm text-muted-foreground font-normal"> 次</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm py-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-orange-50"><Star className="w-5 h-5 text-orange-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">必学任务点</p>
              <p className="text-xl font-bold text-orange-500">{requiredCompleted}<span className="text-sm text-muted-foreground font-normal"> / {requiredCount}</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 学习洞察：停留时长 → 薄弱推断 */}
      {(() => {
        const repeated = materials.filter((m) => (m.behavior?.review_count || 0) >= 3);
        const skipped = materials.filter((m) => m.behavior && (m.behavior.progress || 0) < 50);
        if (repeated.length === 0 && skipped.length === 0) return null;
        return (
          <Card className="border-violet-200 bg-violet-50/40 py-0">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Brain className="w-4 h-4 text-violet-600" />
                <p className="text-sm font-semibold text-foreground">学习洞察</p>
                <span className="text-xs text-muted-foreground">根据停留时长与重看次数推断</span>
              </div>
              {repeated.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {repeated.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                      <RotateCcw className="w-3 h-3" />
                      反复学习《{m.title}》{m.behavior.review_count} 次 · 可能未掌握
                    </span>
                  ))}
                </div>
              )}
              {skipped.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {skipped.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200">
                      <Timer className="w-3 h-3" />
                      学习《{m.title}》进度 {m.behavior.progress}% · 可能未完成
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* 课程筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterCourse('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCourse === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >全部</button>
        {courses.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCourse(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCourse === c ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >{c}</button>
        ))}
      </div>

      {/* 材料列表 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-40 rounded-2xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto opacity-40" />
          <p className="text-sm mt-3">暂无学习材料</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.chapter}>
              {/* 章节任务点（D7）：章节头 = 知识定位 */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-1.5 h-5 rounded-full ${group.chapter === '未分章节' ? 'bg-slate-300' : 'bg-violet-500'}`} />
                <h3 className="text-sm font-semibold text-foreground">{group.chapter}</h3>
                <span className="text-xs text-muted-foreground">· {group.items.length} 份</span>
                {group.items.filter((m) => m.is_required).length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3" /> 必学 {group.items.filter((m) => m.is_required).length} 项
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map((m) => {
                  const cfg = typeConfig[m.type] || typeConfig.document;
                  const Icon = cfg.icon;
                  const b = m.behavior;
                  const emb = m.type === 'video' && m.url ? resolveVideoEmbed(m.url) : null;
                  return (
                    <Card
                      key={m.id}
                      className={`border-slate-200/60 shadow-sm card-hover cursor-pointer py-0 ${m.is_required ? 'ring-1 ring-orange-200' : ''}`}
                      onClick={() => openMaterial(m)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${cfg.color}`}>
                              <Icon className="w-3.5 h-3.5 inline mr-1" />{cfg.label}
                            </span>
                            <Badge variant="outline" className="text-xs">{m.course_name}</Badge>
                            {emb && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-200 px-1.5 py-0.5 rounded">
                                <PlayCircle className="w-3 h-3" /> 在线视频
                              </span>
                            )}
                            {m.is_required && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                                <Star className="w-3 h-3" /> 必学
                              </span>
                            )}
                          </div>
                          {b?.is_completed && <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />}
                        </div>
                        <h3 className="text-sm font-semibold mt-3 line-clamp-1">{m.title}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" />{m.duration_minutes || '—'} 分钟</span>
                          {b?.review_count ? <span className="inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />学 {b.review_count} 次</span> : null}
                        </div>
                        {/* 进度条 */}
                        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${b?.is_completed ? 'bg-teal-500' : 'bg-violet-400'}`}
                            style={{ width: `${b?.progress || 0}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 阅读弹窗 */}
      {reading && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeMaterial}>
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-foreground">{reading.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{reading.course_name} · {typeConfig[reading.type]?.label || '文档'}</p>
              </div>
              <button onClick={closeMaterial} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4" ref={contentRef} onScroll={handleContentScroll}>
              {readingEmb && (
                <div className="mb-4">
                  {readingEmb.kind === 'native' ? (
                    <video src={readingEmb.src} controls playsInline className="w-full aspect-video rounded-xl bg-black" />
                  ) : (
                    <iframe
                      src={readingEmb.src}
                      title={reading.title}
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      scrolling="no"
                      frameBorder="0"
                      className="w-full aspect-video rounded-xl bg-black"
                    />
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-fuchsia-600">
                      <Timer className="w-3.5 h-3.5" /> 已观看 {videoSeconds} 秒
                    </span>
                    <a href={readingEmb.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline shrink-0">新窗口打开原视频</a>
                  </div>
                </div>
              )}
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{reading.content || '暂无内容'}</p>
            </div>
            {/* 学完的下一步：把材料学习接进学习闭环 */}
            <div className="px-5 py-3 border-t border-slate-100">
              {readingEmb && (
                <button
                  onClick={() => setVideoDone(true)}
                  className={`w-full mb-3 py-2 rounded-lg text-sm font-medium transition-colors ${videoDone ? 'bg-teal-500 text-white' : 'bg-violet-600 text-white hover:opacity-90'}`}
                >
                  {videoDone ? '已标记看完 ✓' : '看完啦，标记完成'}
                </button>
              )}
              <p className="text-xs font-medium text-slate-500 mb-2">学完了？接下来：</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => router.push('/student/errors')}
                  className="text-xs py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                >复习错题</button>
                <button
                  onClick={() => router.push('/student/knowledge-graph')}
                  className="text-xs py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                >看知识图谱</button>
                <button
                  onClick={() => router.push('/student/assistant')}
                  className="text-xs py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >问 AI 老师</button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">关闭后将记录本次学习时长，纳入学习投入分析</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

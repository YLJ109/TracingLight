'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api-fetch';
import { getCurrentUser } from '@/lib/auth-helper';
import {
  Search, Download, ZoomIn, ZoomOut, RotateCcw, Target, BookOpen, X, ArrowRight,
  AlertTriangle, Sparkles, PanelLeftClose, PanelLeftOpen, Sun, Moon, Maximize,
  Minimize, LocateFixed,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SetActiveNav } from '@/components/app-shell';

function safeDarker(hex: string, amount: number): string {
  const c = d3.color(hex);
  return c ? c.darker(amount).toString() : '#64748b';
}

interface APINode {
  id: string; dbId: number; name: string; node_level: number;
  is_leaf: boolean; child_count: number; symbolSize: number; color: string; itemStyle: any;
  group_color: string; knowledge_point_id: number | null; course_id: number;
  mastery: number | null; mastery_color: string | null; mastery_label: string | null;
  mastery_detail: { avg: number; total: number; mastered: number; pending: number; level: string } | null;
  description?: string;
}
interface APIEdge { source: string; target: string; type: string; lineStyle: any; description?: string; }
interface ChapterInfo { id: string; name: string; group_color: string; sections: any[]; }
interface GraphData {
  course: { id: number; name: string; short_name: string };
  nodes: APINode[]; edges: APIEdge[];
  totalNodes: number; totalEdges: number;
  chapters: ChapterInfo[];
  masteryStats: { mastered: number; basics: number; weak: number; unlearned: number; total: number };
}
interface TreeNode extends d3.HierarchyNode<any> {
  data: APINode & { children?: TreeNode['data'][] };
  _children?: TreeNode[]; x: number; y: number;
}
interface CourseInfo { id: number; name: string; }

type Filter = 'all' | 'weak' | 'unlearned' | 'mastered';

const THEMES = {
  light: {
    bg: '#fafbfc', panel: '#ffffff', border: '#e2e8f0', text: '#1e293b', sub: '#64748b',
    ring: '#e2e8f0', ringStrong: '#cbd5e1', hintBg: 'rgba(255,255,255,.92)',
  },
  dark: {
    bg: '#0d1420', panel: '#141c2b', border: '#263043', text: '#e2e8f0', sub: '#94a3b8',
    ring: '#233650', ringStrong: '#3b4a63', hintBg: 'rgba(16,24,39,.88)',
  },
};
const FILTER_META: { key: Filter; label: string; color: string; count: keyof GraphData['masteryStats'] | null }[] = [
  { key: 'all', label: '全部', color: '#64748b', count: null },
  { key: 'weak', label: '只看薄弱', color: '#ef4444', count: 'weak' },
  { key: 'unlearned', label: '只看未学', color: '#94a3b8', count: 'unlearned' },
  { key: 'mastered', label: '只看已掌握', color: '#10b981', count: 'mastered' },
];

export default function KnowledgeGraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState(1);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [viewMode, setViewMode] = useState<'radial' | 'tree'>('radial');
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<APINode | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [dark, setDark] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<any>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const leafLabelsRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const posRef = useRef<Map<string, [number, number]>>(new Map());
  const pageRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  const T = (dark ? THEMES.dark : THEMES.light);

  useEffect(() => { getCurrentUser().then((u) => setStudentId(u?.id || 3)); }, []);
  useEffect(() => {
    apiFetch('/api/student/courses').then((r) => r.json()).then((d) => { if (d.success) setCourses(d.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false; setLoading(true); setError(null);
    const p = new URLSearchParams({ course_id: String(courseId) });
    if (studentId) p.set('student_id', String(studentId));
    apiFetch(`/api/student/knowledge-graph?${p}`).then((r) => r.json()).then((d) => {
      if (!cancelled) {
        if (d.success) { setGraphData(d.data); setError(null); }
        else { setError(d.error || '加载失败'); setGraphData(null); }
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) { setError(err.message || '网络错误，请稍后重试'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [courseId, studentId]);

  function rebuildRoot(h: any): any {
    const r: any = { ...h.data, children: undefined };
    const kids = h.children || h._children || [];
    if (kids.length) r.children = kids.map((c: any) => rebuildRoot(c));
    return r;
  }

  // 掌握度分类（null/<30 视为未学，与后端 stats 口径一致）
  const catOf = (m: number | null): 'unlearned' | 'weak' | 'basic' | 'mastered' => {
    if (m === null || m < 30) return 'unlearned';
    if (m < 60) return 'weak';
    if (m < 80) return 'basic';
    return 'mastered';
  };

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !rootRef.current || !graphData || !containerRef.current) return;
    try {
      const svg = d3.select(svgRef.current);
      const W = containerRef.current.clientWidth;
      const H = containerRef.current.clientHeight;
      if (W === 0 || H === 0) return;
      svg.selectAll('*').remove();

      const defs = svg.append('defs');
      defs.append('filter').attr('id', 's').append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 2).attr('flood-opacity', 0.12);
      defs.append('filter').attr('id', 'gl').append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 5).attr('flood-color', '#3b82f6').attr('flood-opacity', 0.55);

      const g = svg.append('g').attr('class', 'main-g');

      const hRoot = d3.hierarchy(rootRef.current) as TreeNode;
      const maxD = (d3.max(hRoot.descendants(), (d: any) => d.depth) || 2) + 1;

      if (viewMode === 'radial') {
        const R = Math.min(W, H) / 2 - 50;
        const ringStep = R / (maxD + 0.3);
        for (let i = 1; i < maxD; i++) {
          g.append('circle').attr('r', ringStep * i).attr('fill', 'none')
            .attr('stroke', i === maxD - 1 ? T.ringStrong : T.ring).attr('stroke-width', i === maxD - 1 ? 1 : 0.5)
            .attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
        }
      }

      const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', (ev) => {
        g.attr('transform', ev.transform);
        // P2 LOD：缩放到足够近才显示知识点叶子标签，避免拥挤重叠
        // leafLabels 为 <g> 标签组，默认 display 即 inline，故用 'inline' 恢复显示（避免 null 联合类型不满足 d3 重载）
        if (leafLabelsRef.current) leafLabelsRef.current.style('display', ev.transform.k >= 0.55 ? 'inline' : 'none');
      });
      svg.call(zoom as any); zoomRef.current = zoom;
      svg.call(zoom.transform as any, viewMode === 'radial'
        ? d3.zoomIdentity.translate(W / 2, H / 2)
        : d3.zoomIdentity.translate(60, 60));

      posRef.current = new Map();
      if (viewMode === 'radial') {
        const R = Math.min(W, H) / 2 - 50;
        d3.cluster<any>().size([2 * Math.PI, R - 10]).separation((a: any, b: any) => {
          const n = (a.parent?.children?.length || 1);
          const base = n <= 6 ? 1.8 : n <= 12 ? 1.5 : n <= 25 ? 1.2 : n <= 50 ? 1.05 : n <= 80 ? 1.0 : 0.95;
          return a.parent === b.parent ? base : base * 2.5;
        })(hRoot);
        hRoot.descendants().forEach((d: any) => posRef.current.set(d.data.id, [
          W / 2 + d.y * Math.cos(d.x - Math.PI / 2), H / 2 + d.y * Math.sin(d.x - Math.PI / 2),
        ]));
        const linkGen = d3.linkRadial<any, any>().angle((d: any) => d.x).radius((d: any) => d.y);
        g.append('g').selectAll('path').data(hRoot.links()).join('path')
          .attr('d', linkGen).attr('fill', 'none')
          .attr('stroke', (d: any) => d.target.data.group_color || '#cbd5e1')
          .attr('stroke-width', (d: any) => d.target.depth <= 2 ? 1.6 : 0.8)
          .attr('stroke-opacity', (d: any) => d.target.depth <= 2 ? 0.45 : 0.25);
      } else {
        d3.cluster<any>().size([H - 120, W - 200]).separation((a: any, b: any) => a.parent === b.parent ? 1.4 : 1.8)(hRoot);
        hRoot.descendants().forEach((d: any) => { const t = d.x; d.x = d.y; d.y = t; posRef.current.set(d.data.id, [d.x, d.y]); });
        g.append('g').selectAll('path').data(hRoot.links()).join('path')
          .attr('d', d3.linkHorizontal<any, any>().x((d: any) => d.x).y((d: any) => d.y) as any).attr('fill', 'none')
          .attr('stroke', (d: any) => d.target.data.group_color || '#cbd5e1')
          .attr('stroke-width', (d: any) => d.target.depth <= 2 ? 1.6 : 0.8)
          .attr('stroke-opacity', (d: any) => d.target.depth <= 2 ? 0.45 : 0.25);
      }

      // P3 掌握度筛选：计算需要保留的节点(命中叶子 + 其全部祖先)
      const keep = new Set<string>();
      if (filter !== 'all') {
        hRoot.descendants().forEach((d: any) => { if (d.data.is_leaf && catOf(d.data.mastery) === filter) keep.add(d.data.id); });
        let changed = true;
        while (changed) {
          changed = false;
          hRoot.descendants().forEach((d: any) => {
            if (keep.has(d.data.id) && d.parent && !keep.has(d.parent.data.id)) { keep.add(d.parent.data.id); changed = true; }
          });
        }
      }

      // Nodes
      const ng = g.append('g').attr('class', 'nodes')
        .selectAll('g').data(hRoot.descendants()).join('g')
        .attr('transform', (d: any) => viewMode === 'radial' ? `rotate(${d.x * 180 / Math.PI - 90})translate(${d.y},0)` : `translate(${d.x},${d.y})`)
        .attr('cursor', 'pointer').attr('filter', 'url(#s)');

      // P3 掌握度筛选：非命中分支整体降暗
      if (filter !== 'all') ng.filter((d: any) => !keep.has(d.data.id)).classed('kg-dim', true);

      ng.each(function (d: any) {
        const el = d3.select(this); const lvl = d.data.node_level;
        const gc = d.data.group_color || '#64748b'; const mc = d.data.mastery_color || undefined;
        const bw = lvl === 3 && mc ? 3 : 0;
        if (lvl === 0) { el.append('circle').attr('r', 18).attr('fill', d.data.color).attr('stroke', '#475569').attr('stroke-width', 3); }
        else if (lvl === 1) { el.append('polygon').attr('points', '0,-13 10,0 0,13 -10,0').attr('fill', gc).attr('stroke', safeDarker(gc, 0.4)).attr('stroke-width', 1.5); }
        else if (lvl === 2) { el.append('rect').attr('x', -12).attr('y', -8).attr('width', 24).attr('height', 16).attr('rx', 4).attr('fill', gc).attr('stroke', safeDarker(gc, 0.3)).attr('stroke-width', 1); }
        else {
          const ns = (d.parent?.children?.length || 1);
          const sx = ns > 60 ? 8 : ns > 40 ? 9.5 : 11; const sy = ns > 60 ? 5 : ns > 40 ? 6 : 7;
          el.append('rect').attr('x', -sx).attr('y', -sy).attr('width', sx * 2).attr('height', sy * 2).attr('rx', sx * 0.6).attr('fill', gc).attr('stroke', mc || safeDarker(gc, 0.3)).attr('stroke-width', bw || 1.2);
        }
        if (d.children || d._children) {
          const col = !d.children;
          el.append('circle').attr('r', 5).attr('fill', 'white').attr('stroke', '#94a3b8').attr('stroke-width', 1);
          el.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 7).attr('fill', '#64748b').attr('pointer-events', 'none').text(col ? '+' : '-');
        }
      });

      // Labels：章节级标签常显，知识点叶子标签进独立组实现 LOD
      const labelsTop = g.append('g').attr('class', 'labels-top');
      const labelsLeaf = g.append('g').attr('class', 'labels-leaf');
      leafLabelsRef.current = labelsLeaf;
      hRoot.descendants().forEach((d: any) => {
        const lvl = d.data.node_level; const angle = d.x; const nR = d.y;
        const off = lvl === 0 ? 24 : lvl === 1 ? 22 : lvl === 2 ? 17 : 18;
        const lR = nR + off;
        let x, y, anchor, textOff: number;
        if (viewMode === 'radial') {
          const si = (d.parent?.children?.indexOf(d) || 0) % 3;
          const staggerY = [-4, 0, 4][si];
          x = lR * Math.cos(angle - Math.PI / 2); y = lR * Math.sin(angle - Math.PI / 2) + staggerY;
          anchor = angle > Math.PI ? 'end' : 'start';
          textOff = angle > Math.PI ? -(6 + si * 1.5) : (6 + si * 1.5);
        } else {
          const tsi = (d.parent?.children?.indexOf(d) || 0) % 3;
          const tdy = [-3, 0, 3][tsi];
          x = d.x + off; y = d.y + tdy; anchor = 'start'; textOff = 6;
        }
        const sibCount = (d.parent?.children?.length || 1);
        const fs = lvl === 0 ? '13px' : lvl === 1 ? '12px' : lvl === 2 ? '10px' : (sibCount > 60 ? '7px' : sibCount > 40 ? '8px' : sibCount > 20 ? '9px' : '10px');
        const fw = lvl <= 1 ? '600' : lvl === 2 ? '500' : '400';
        const fc = lvl <= 2 ? T.text : T.sub;
        const ml = lvl <= 1 ? 20 : lvl === 2 ? 20 : 14;
        const dn = d.data.name.length > ml ? d.data.name.slice(0, ml) + '...' : d.data.name;
        const tip = lvl >= 3 ? labelsLeaf : labelsTop;
        tip.append('text').attr('x', x + textOff).attr('y', y).attr('text-anchor', anchor)
          .attr('dominant-baseline', 'middle').attr('font-size', fs).attr('font-weight', fw)
          .attr('fill', fc).attr('font-family', '"Inter","Noto Sans SC",sans-serif').attr('pointer-events', 'none').text(dn);
      });

      // —— 事件：单击详情 / 展开收起，悬停高亮邻居（P0 去冲突、P0 hover 高亮）——
      ng.on('click', function (ev: any, d: any) {
        ev.stopPropagation();
        const nd = d.data as APINode;
        if (!nd.is_leaf) {
          if (d.children?.length) { d._children = d.children; d.children = undefined; }
          else if (d._children?.length) { d.children = d._children; d._children = undefined; }
          rootRef.current = rebuildRoot(hRoot);
          renderGraph();
          return;
        }
        setSelectedNode(nd); // 单选叶子 = 只在右侧抽屉开详情，不再与缩放冲突
      })
        .on('mouseenter', function (ev: any, d: any) {
          const s = new Set<string>([d.data.id]);
          if (d.parent) s.add(d.parent.data.id);
          (d.children || []).forEach((c: any) => s.add(c.data.id));
          (d._children || []).forEach((c: any) => s.add(c.data.id));
          (d.parent?.children || []).forEach((c: any) => s.add(c.data.id));
          ng.filter((x: any) => !s.has(x.data.id)).classed('kg-dim-hover', true);
          d3.select(this).attr('filter', 'url(#gl)');
        })
        .on('mouseleave', function () {
          ng.classed('kg-dim-hover', false);
          d3.select(this).attr('filter', 'url(#s)');
        });

      // Tooltip 跟随鼠标（P0）
      const moveTT = function (ev: any, d: any) {
        const tt = tooltipRef.current; if (!tt) return;
        const nd = d.data as APINode;
        const lvls = ['课程', '项目', '模块', '知识点'];
        const m = nd.mastery_detail;
        const c = m ? (m.avg >= 80 ? '#10b981' : m.avg >= 60 ? '#f59e0b' : m.avg >= 30 ? '#ef4444' : '#94a3b8') : '#64748b';
        let h = `<div style="display:flex;align-items:center;gap:6px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid ${T.border}">`;
        h += `<span style="font-size:10px;padding:1px 6px;border-radius:6px;font-weight:600;color:#fff;background:${nd.group_color}">${lvls[nd.node_level] || ''}</span>`;
        h += `<span style="font-weight:700;font-size:13px;color:${T.text}">${nd.name}</span></div>`;
        if (nd.description) h += `<div style="max-width:250px;font-size:11px;color:${T.sub};line-height:1.5;margin-bottom:6px">${nd.description}</div>`;
        if (nd.is_leaf && m) {
          h += `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="font-weight:700;color:${c}">${m.avg}%</span><span style="color:${T.sub}">${m.level}</span></div>`;
          h += `<div style="width:100%;height:6px;background:${T.border};border-radius:6px;overflow:hidden;margin-bottom:6px"><div style="width:${m.avg}%;height:100%;background:${c};border-radius:6px"></div></div>`;
          h += `<div style="display:flex;gap:12px;font-size:11px;color:${T.sub}"><span>错题 ${m.total}题</span><span>已掌握 ${m.mastered}题</span><span>待复习 ${m.pending}题</span></div>`;
        } else if (d.children || d._children) {
          h += `<div style="font-size:11px;color:${T.sub};margin-top:6px">点击${d.children ? '收起' : '展开'}子节点</div>`;
        }
        tt.innerHTML = h; tt.style.display = 'block';
        // 跟随光标，靠近右/下边界自动翻转
        let px = ev.offsetX + 14; let py = ev.offsetY + 12;
        const rect = containerRef.current!.getBoundingClientRect();
        const tw = 260; const th = tt.offsetHeight || 160;
        if (px + tw > rect.width) px = ev.offsetX - tw - 10;
        if (py + th > rect.height) py = ev.offsetY - th - 8;
        tt.style.left = `${px}px`; tt.style.top = `${py}px`; tt.style.right = 'auto'; tt.style.bottom = 'auto';
      };
      ng.on('mousemove', moveTT);
    } catch (err: any) {
      console.error('Knowledge graph render error:', err);
      setError('图谱渲染失败，请刷新页面重试');
    }
  }, [graphData, viewMode, filter, dark]);

  const buildRoot = useCallback(() => {
    if (!graphData) return null;
    const { edges } = graphData;
    const cm: Record<string, string[]> = {};
    edges.filter((e) => e.type === 'belong_to').forEach((e) => { if (!cm[e.source]) cm[e.source] = []; cm[e.source].push(e.target); });
    const nm = new Map(graphData.nodes.map((n) => [n.id, n]));
    function build(id: string): any {
      const n = nm.get(id)!;
      const kids = (cm[id] || []).map(build);
      return { ...n, children: kids.length ? kids : undefined };
    }
    const root = graphData.nodes.find((n) => n.node_level === 0);
    return root ? build(root.id) : null;
  }, [graphData]);

  const collapseByDepth = useCallback((root: any, depth: number) => {
    const walk = (node: any, d: number) => {
      if (d >= depth && node.children && node.children.length > 0) {
        node._children = node.children; node.children = undefined;
        if (node._children) node._children.forEach((c: any) => walk(c, d + 1));
        return;
      }
      if (node.children) node.children.forEach((c: any) => walk(c, d + 1));
      if (node._children && d < depth) node._children.forEach((c: any) => walk(c, d + 1));
    };
    walk(root, 0);
  }, []);

  useEffect(() => {
    if (!graphData) return;
    const r = buildRoot(); if (!r) return;
    collapseByDepth(r, maxDepth); rootRef.current = r;
    const t = setTimeout(() => renderGraph(), 120);
    return () => clearTimeout(t);
  }, [graphData, renderGraph, buildRoot, collapseByDepth, maxDepth]);

  // P2 性能：resize 防抖
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = () => { clearTimeout(t); t = setTimeout(() => renderGraph(), 120); };
    window.addEventListener('resize', h);
    return () => { clearTimeout(t); window.removeEventListener('resize', h); };
  }, [renderGraph]);

  // P3 全屏状态跟随
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const exportSVG = () => {
    if (!svgRef.current) return;
    const c = svgRef.current.cloneNode(true) as SVGSVGElement;
    c.setAttribute('width', c.getAttribute('width') || '100%');
    const b = new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' });
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u;
    a.download = `知识图谱_${graphData?.course?.short_name || 'export'}.svg`; a.click(); URL.revokeObjectURL(u);
  };

  const exportPNG = () => {
    if (!svgRef.current || !containerRef.current) return;
    const W = containerRef.current.clientWidth, H = containerRef.current.clientHeight;
    const c = svgRef.current.cloneNode(true) as SVGSVGElement;
    c.setAttribute('width', String(Math.max(W, 1) * 2)); c.setAttribute('height', String(H * 2));
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(W * 2)); bg.setAttribute('height', String(H * 2));
    bg.setAttribute('fill', T.bg); c.insertBefore(bg, c.firstChild);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
      cv.getContext('2d')!.drawImage(img, 0, 0);
      cv.toBlob((b) => {
        if (!b) return; const u = URL.createObjectURL(b);
        const a = document.createElement('a'); a.href = u;
        a.download = `知识图谱_${graphData?.course?.short_name || 'export'}.png`; a.click(); URL.revokeObjectURL(u);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(c))));
  };

  const zi = () => { if (zoomRef.current && svgRef.current) zoomRef.current.scaleBy(d3.select(svgRef.current), 1.35); };
  const zo = () => { if (zoomRef.current && svgRef.current) zoomRef.current.scaleBy(d3.select(svgRef.current), 0.7); };
  const zr = () => {
    if (zoomRef.current && svgRef.current && containerRef.current) {
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      d3.select(svgRef.current).call(zoomRef.current.transform as any,
        viewMode === 'radial' ? d3.zoomIdentity.translate(w / 2, h / 2) : d3.zoomIdentity.translate(60, 60));
    }
  };

  const ensureOpen = (root: any, tid: string): boolean => {
    if (root.data?.id === tid) return true;
    const ks = root.children || root._children || [];
    for (const k of ks) {
      if (ensureOpen(k, tid)) {
        if (root._children) { root.children = root._children; root._children = undefined; }
        return true;
      }
    }
    return false;
  };

  const zoomToNode = (nid: string) => {
    if (!rootRef.current || !containerRef.current) return;
    ensureOpen(rootRef.current, nid);
    rootRef.current = rebuildRoot(d3.hierarchy(rootRef.current));
    renderGraph();
    const pos = posRef.current.get(nid);
    if (!pos || !zoomRef.current) return;
    const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
    const tr = d3.zoomIdentity.translate(w / 2 - pos[0], h / 2 - pos[1]).scale(1.4);
    d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform as any, tr);
  };

  const locateNode = (nid: string) => {
    setSelectedNode(graphData?.nodes.find((n) => n.id === nid) || null);
    zoomToNode(nid);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pageRef.current?.requestFullscreen?.();
    } catch { /* 忽略全屏被拦截 */ }
  };

  const allKps = useMemo(() => graphData?.nodes.filter((n) => n.is_leaf) || [], [graphData]);
  const fKps = searchTerm ? allKps.filter((k) => k.name.includes(searchTerm)).slice(0, 10) : [];

  const stat = graphData?.masteryStats;
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 全屏按键
  const [isFs, setIsFs] = useState(false);

  return (
    <div ref={pageRef} style={{ background: T.bg, color: T.text }} className="flex flex-col h-full transition-colors">
      <SetActiveNav href="/student/knowledge-graph" />
      <style jsx>{`
        .kg-dim { opacity: 0.16; }
        .kg-dim-hover { opacity: 0.4; }
      `}</style>

      {/* 顶部工具条 */}
      <div className="flex-none flex items-center justify-between gap-3 px-4 py-2 border-b" style={{ background: T.panel, borderColor: T.border }}>
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setLeftOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors flex-none" title="展开/收起图例"
            style={{ color: T.sub }}>
            {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          {/* 课程切换（可横向滚动，避免课程多溢出） */}
          <div className="flex gap-1 overflow-x-auto max-w-[52vw]">
            {(courses.length > 0 ? courses : [{ id: 1, name: '课程加载中...' }]).map((c) => (
              <button key={c.id} onClick={() => setCourseId(c.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${courseId === c.id
                  ? 'text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                style={courseId === c.id ? { background: T.bg, color: T.text } : { color: T.sub }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          <div className="relative">
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索知识点..."
              className="w-40 h-8 pl-8 pr-2 text-sm rounded-lg border outline-none focus:ring-1 transition-all"
              style={{ background: T.bg, borderColor: T.border, color: T.text }}
              onKeyDown={(e) => { if (e.key === 'Enter' && fKps[0]) locateNode(fKps[0].id); }} />
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: T.sub }} />
            {searchTerm && fKps.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-64 rounded-xl shadow-xl border z-30 overflow-hidden"
                style={{ background: T.panel, borderColor: T.border }}>
                {fKps.map((k) => (
                  <button key={k.id} onMouseDown={() => { setSearchTerm(k.name); locateNode(k.id); }}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-500/10"
                    style={{ color: T.text }}>
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: k.mastery_color || '#94a3b8' }} />
                    {k.name}
                    {k.mastery !== null && <span className="ml-auto text-[11px]" style={{ color: T.sub }}>{k.mastery}%</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex rounded-lg p-0.5" style={{ background: T.bg }}>
            {(['radial', 'tree'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === m ? 'bg-white shadow-sm' : ''}`}
                style={viewMode === m ? { color: T.text } : { color: T.sub }}>
                {m === 'radial' ? '环图' : '树图'}
              </button>
            ))}
          </div>

          <button onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors flex-none" title={isFs ? '退出全屏' : '全屏'}
            style={{ color: T.sub }}>
            {isFs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button onClick={() => setDark((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors flex-none" title={dark ? '浅色模式' : '深色模式'}
            style={{ color: T.sub }}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => { exportSVG(); }} className="p-1.5 rounded-lg hover:bg-slate-500/10 flex-none" title="导出SVG" style={{ color: T.sub }}>
            <Download className="w-4 h-4" />
          </button>
          <button onClick={exportPNG} className="text-xs px-2 py-1 rounded-md border transition-colors" title="导出PNG" style={{ color: T.sub, borderColor: T.border }}>
            PNG
          </button>
        </div>
      </div>

      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        {/* 左：可折叠图例 + 筛选 */}
        {leftOpen ? (
          <div className="flex-none w-[196px] flex flex-col gap-3 p-3 overflow-y-auto border-r" style={{ background: T.panel, borderColor: T.border }}>
            <div>
              <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: T.sub }}>掌握度统计</div>
              {stat && (
                <div className="space-y-1.5 text-xs">
                  {[['已掌握', stat.mastered, '#10b981'], ['基本掌握', stat.basics, '#f59e0b'], ['薄弱', stat.weak, '#ef4444'], ['未学习', stat.unlearned, '#94a3b8']].map(([l, c, cl]) => (
                    <div key={l as string} className="flex items-center gap-2" style={{ color: T.sub }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: cl as string }} />
                      <span>{l}</span>
                      <span className="ml-auto font-bold" style={{ color: T.text }}>{c as number}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-3" style={{ borderColor: T.border }}>
              <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: T.sub }}>掌握度筛选</div>
              <div className="flex flex-col gap-1">
                {FILTER_META.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors ${filter === f.key ? 'ring-1' : 'hover:bg-slate-500/10'}`}
                    style={filter === f.key ? { background: T.bg, color: T.text, borderColor: T.border } : { color: T.sub }}>
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: f.color }} />
                    <span>{f.label}</span>
                    {f.count && stat && (
                      <span className="ml-auto" style={{ color: T.sub }}>{stat[f.count!]}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-3" style={{ borderColor: T.border }}>
              <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: T.sub }}>节点图例</div>
              <div className="space-y-2 text-xs" style={{ color: T.sub }}>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-800" /><span>课程根节点</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rotate-45 bg-teal-600" /><span>项目/章</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2 rounded bg-teal-500" /><span>模块/节</span></div>
                <div className="flex items-center gap-2"><span className="w-2 h-1.5 rounded-full border-2 border-slate-300" /><span>知识点</span></div>
              </div>
            </div>

            {graphData?.chapters && graphData.chapters.length > 0 && (
              <div className="border-t pt-3" style={{ borderColor: T.border }}>
                <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: T.sub }}>章节色系</div>
                <div className="space-y-1">
                  {graphData.chapters.map((ch) => (
                    <div key={ch.id} className="flex items-center gap-2 text-xs" style={{ color: T.sub }}>
                      <span className="w-3 h-3 rounded-sm flex-none" style={{ background: ch.group_color }} />
                      <span className="truncate">{ch.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setLeftOpen(true)}
            className="flex-none w-6 flex items-center justify-center border-r hover:bg-slate-500/10"
            style={{ background: T.panel, borderColor: T.border, color: T.sub }} title="展开图例">
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* 画布 */}
        <div className="flex-1 relative" style={{ minWidth: 0 }} ref={containerRef}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: `${T.bg}cc` }}>
              <div className="flex items-center gap-3" style={{ color: T.sub }}>
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">加载知识图谱...</span>
              </div>
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: `${T.bg}cc` }}>
              <div className="flex flex-col items-center gap-3 max-w-sm text-center" style={{ color: T.sub }}>
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => { setError(null); setCourseId(courseId); }}
                  className="px-4 py-2 text-sm text-white rounded-lg bg-teal-500 hover:bg-teal-600 transition-colors">
                  重试
                </button>
              </div>
            </div>
          )}
          <svg ref={svgRef} className="w-full h-full" />
          <div ref={tooltipRef} className="absolute hidden rounded-xl px-3.5 py-2.5 shadow-xl pointer-events-none z-30"
            style={{ maxWidth: 280, background: T.hintBg, border: `1px solid ${T.border}`, backdropFilter: 'blur(6px)' }} />
          {!loading && graphData && (
            <div className="absolute bottom-4 left-4 text-xs px-3 py-1.5 rounded-lg border shadow-sm"
              style={{ background: T.hintBg, color: T.sub, borderColor: T.border }}>
              {graphData.totalNodes} 节点 · {graphData.totalEdges} 关系
            </div>
          )}

          {/* 缩放控制 + 层级 */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <div className="flex rounded-lg p-0.5 mb-1" style={{ background: T.panel, border: `1px solid ${T.border}` }}>
              {[{ v: 1, l: 'L1' }, { v: 2, l: 'L2' }, { v: 3, l: 'L3' }].map(({ v, l }) => (
                <button key={v} onClick={() => setMaxDepth(v)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${maxDepth === v ? '' : ''}`}
                  style={maxDepth === v ? { color: T.text, background: T.bg } : { color: T.sub }}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={zi} className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-500/10 transition-colors"
              style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.sub }}><ZoomIn className="w-4 h-4" /></button>
            <button onClick={zo} className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-500/10 transition-colors"
              style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.sub }}><ZoomOut className="w-4 h-4" /></button>
            <button onClick={zr} className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-500/10 transition-colors"
              style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.sub }} title="适应画布"><RotateCcw className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* 右：详情抽屉（遮罩 + ESC 关闭，不遮挡画布操作） */}
      {selectedNode && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedNode(null)} style={{ backdropFilter: 'blur(1px)' }} />
          <aside
            className="fixed top-0 right-0 bottom-0 z-50 w-[320px] max-w-[85vw] p-4 overflow-y-auto shadow-2xl flex flex-col gap-4"
            style={{ background: T.panel, borderLeft: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-bold" style={{ color: T.text }}>知识点详情</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => zoomToNode(selectedNode.id)}
                  className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors" title="聚焦该节点" style={{ color: T.sub }}>
                  <LocateFixed className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedNode(null)} className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors" style={{ color: T.sub }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: T.sub }}>知识点</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold" style={{ color: T.text }}>{selectedNode.name}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white" style={{ background: selectedNode.group_color }}>
                  {['课程', '章节', '小节', '知识点'][selectedNode.node_level] || '节点'}
                </span>
              </div>
              {!selectedNode.is_leaf && selectedNode.child_count != null && (
                <div className="text-[11px] mt-1" style={{ color: T.sub }}>包含 {selectedNode.child_count} 个子节点，点击图表节点可展开查看</div>
              )}
            </div>

            {selectedNode.description && (
              <div className="rounded-xl p-3" style={{ background: T.bg }}>
                <div className="text-[11px] mb-1" style={{ color: T.sub }}>简介</div>
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{selectedNode.description}</p>
              </div>
            )}

            {selectedNode.mastery_detail && (function () {
              const m = selectedNode.mastery_detail;
              const c = m.avg >= 80 ? '#10b981' : m.avg >= 60 ? '#f59e0b' : m.avg >= 30 ? '#ef4444' : '#94a3b8';
              return (<>
                <div>
                  <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.sub }}>掌握度</div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl font-bold font-mono" style={{ color: c }}>{m.avg}%</span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ background: c }}>{m.level}</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.bg }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.avg}%`, background: c }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: T.bg }}>
                    <div className="text-2xl font-bold font-mono" style={{ color: T.text }}>{m.total}</div>
                    <div className="text-[11px]" style={{ color: T.sub }}>错题总数</div>
                  </div>
                  <div className="rounded-xl p-3 text-center bg-emerald-50/70">
                    <div className="text-2xl font-bold font-mono text-emerald-600">{m.mastered}</div>
                    <div className="text-[11px] text-emerald-600">已掌握</div>
                  </div>
                  <div className="rounded-xl p-3 text-center col-span-2 bg-amber-50/70">
                    <div className="text-2xl font-bold font-mono text-amber-600">{m.pending}</div>
                    <div className="text-[11px] text-amber-600">待复习错题</div>
                  </div>
                </div>
                <div className="rounded-xl p-3" style={{ background: T.bg }}>
                  <div className="text-[11px] mb-1" style={{ color: T.sub }}>学习建议</div>
                  <div className="text-xs leading-relaxed" style={{ color: T.text }}>
                    {m.avg >= 80 ? '该知识点已熟练掌握，建议定期回顾保持记忆。'
                      : m.avg >= 60 ? '建议重点复习待复习错题的AI解析，巩固薄弱环节。'
                        : m.avg >= 30 ? '该知识点较为薄弱，建议重新学习相关章节并完成对应练习。'
                          : '该知识点尚未学习或掌握度较低，建议从基础开始系统学习。'}
                  </div>
                </div>
                {m.total > 0 && selectedNode.knowledge_point_id && (
                  <button
                    onClick={() => router.push(`/student/errors?knowledge_point_id=${selectedNode.knowledge_point_id}`)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors"
                    style={{ background: 'rgba(245,158,11,.12)', borderColor: 'rgba(245,158,11,.35)', color: '#d97706' }}>
                    <BookOpen className="w-4 h-4" />
                    {m.pending > 0 ? `查看相关错题（${m.pending}题待复习）` : `查看已掌握错题（${m.mastered}题）`}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {selectedNode.knowledge_point_id && (
                  <button
                    onClick={() => router.push(`/student/assistant?q=${encodeURIComponent(`请帮我详细讲解「${selectedNode.name}」这个知识点，解释原理、难点，并给出例子和学习建议`)}`)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'rgba(124,58,237,.12)', border: `1px solid ${T.border}`, color: '#7c3aed' }}>
                    <Sparkles className="w-4 h-4" />
                    去 AI 答疑
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </>);
            })()}
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
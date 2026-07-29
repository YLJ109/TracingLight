'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { apiFetch } from '@/lib/api-fetch';
import { getCurrentUser } from '@/lib/auth-helper';

// ─── Types ───
interface APINode {
  id: string; name: string; description?: string; category: number; node_level: number;
  symbolSize: number; color: string; itemStyle: any; label: any;
  source: string; source_table: string; data_id: number | null;
  chapter_no: string; course_id: number; group_color: string;
  mastery: number | null; mastery_color: string | null;
}
interface APIEdge { source: string; target: string; type: string; lineStyle: any; }
interface ChapterInfo { id: string; name: string; group_color: string; sections: any[]; }
interface GraphData {
  course: { id: number; name: string; short_name: string };
  textbook: string;
  nodes: APINode[];
  edges: APIEdge[];
  totalNodes: number; totalEdges: number;
  chapters: ChapterInfo[];
  masteryStats: { mastered: number; basics: number; weak: number; unlearned: number; total: number };
}

// D3 hierarchy node type
interface TreeNode extends d3.HierarchyNode<any> {
  data: APINode & { children?: TreeNode['data'][] };
  _children?: TreeNode[];
  x: number; y: number;
}

export default function KnowledgeGraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<any>(null);

  const [studentId, setStudentId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    getCurrentUser().then((u) => {
      setStudentId(u?.id || 3);
    });
  }, []);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ course_id: String(courseId) });
    if (studentId) params.set('student_id', String(studentId));
    apiFetch(`/api/student/knowledge-graph?${params}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setGraphData(d.data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, studentId]);

  // ─── Helper: rebuild flat root from hierarchy with collapse state ───
  function rebuildRootFromHierarchy(root: any): any {
    const result: any = { ...root.data, children: undefined };
    const currentChildren = root.children || root._children || [];
    if (currentChildren.length > 0) {
      result.children = currentChildren.map((c: any) => rebuildRootFromHierarchy(c));
    }
    return result;
  }

  // ─── D3 Radial Tree Rendering ───
  const renderRadialTree = useCallback(() => {
    if (!svgRef.current || !rootRef.current || !graphData) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    if (width === 0 || height === 0) return;

    const radius = Math.min(width, height) / 2 - 60;
    svg.selectAll('*').remove();

    // Background with subtle concentric guides
    const defs = svg.append('defs');
    const levels = ['#e2e8f0', '#e2e8f0', '#e2e8f0'];
    levels.forEach((_color, i) => {
      defs.append('filter')
        .attr('id', `shadow-${i}`)
        .append('feDropShadow')
        .attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.5).attr('flood-opacity', 0.12);
    });

    // Glow filter for hover
    const glowFilter = defs.append('filter').attr('id', 'glow');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'blur');
    glowFilter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .join('feMergeNode')
      .attr('in', (d: string) => d);

    const mainG = svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Subtle concentric guide circles
    const guideRings = [radius * 0.25, radius * 0.50, radius * 0.78];
    guideRings.forEach(r => {
      mainG.append('circle')
        .attr('r', r).attr('fill', 'none')
        .attr('stroke', '#e2e8f0').attr('stroke-width', 0.5).attr('stroke-dasharray', '4,4');
    });

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        mainG.attr('transform', event.transform);
      });
    svg.call(zoom as any);
    // Initial transform to center
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2));

    // Tree layout
    const hierarchy = d3.hierarchy(rootRef.current) as TreeNode;
    const treeLayout = d3.tree<any>()
      .size([2 * Math.PI, radius])
      .separation((a: any, b: any) => {
        const siblingCount = (a.parent?.children?.length || a.parent?._children?.length || 3);
        let baseSep: number;
        if (siblingCount <= 4) baseSep = 1.3;
        else if (siblingCount <= 7) baseSep = 1.8;
        else if (siblingCount <= 12) baseSep = 2.2;
        else baseSep = 2.6;
        return (a.parent === b.parent ? baseSep : baseSep * 1.6) / Math.max(a.depth, 1);
      });

    treeLayout(hierarchy);

    // Radial link generator
    const linkGen = d3.linkRadial<any, any>()
      .angle((d: any) => d.x)
      .radius((d: any) => d.y);

    // ── Draw links ──
    mainG.append('g').attr('class', 'links')
      .selectAll('path')
      .data(hierarchy.links())
      .join('path')
      .attr('d', linkGen)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => d.target.data.group_color || '#cbd5e1')
      .attr('stroke-width', (d: any) => d.target.depth <= 2 ? 1.8 : 1)
      .attr('stroke-opacity', (d: any) => d.target.depth <= 2 ? 0.45 : 0.3)
      .attr('stroke-linecap', 'round');

    // ── Draw nodes ──
    const nodeG = mainG.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(hierarchy.descendants())
      .join('g')
      .attr('transform', (d: any) => {
        const angle = d.x * 180 / Math.PI - 90;
        return `rotate(${angle}) translate(${d.y}, 0)`;
      })
      .attr('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        if (d.children && d.children.length > 0) {
          d._children = d.children;
          d.children = undefined;
        } else if (d._children && d._children.length > 0) {
          d.children = d._children;
          d._children = undefined;
        }
        // Rebuild root with updated collapse state
        rootRef.current = rebuildRootFromHierarchy(hierarchy);
        renderRadialTree();
      })
      .on('mouseenter', function (event: any, d: any) {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        const nd = d.data as APINode;
        const levelLabels = ['课程', '章', '节', '知识点'];
        const levelLabel = levelLabels[nd.node_level] || '节点';

        let html = '';
        // Header with level badge
        html += `<div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">`;
        html += `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium text-white" style="background:${nd.group_color || '#64748b'}">${levelLabel}</span>`;
        html += `<span class="font-semibold text-sm text-slate-800">${nd.name}</span>`;
        html += `</div>`;

        // Course level
        if (nd.node_level === 0) {
          html += `<div class="text-xs text-slate-500">${graphData?.textbook || ''}</div>`;
          html += `<div class="text-xs text-slate-400 mt-1">${graphData?.totalNodes || 0} 个节点 · ${graphData?.totalEdges || 0} 条关系</div>`;
        }
        // Chapter level
        if (nd.node_level === 1) {
          const chapterInfo = graphData?.chapters.find(ch => ch.id === nd.id);
          if (chapterInfo) {
            const totalSections = chapterInfo.sections?.length || 0;
            html += `<div class="text-xs text-slate-500">共 ${totalSections} 节</div>`;
          }
        }
        // Section level
        if (nd.node_level === 2) {
          html += `<div class="text-xs text-slate-500">章节编号: ${nd.chapter_no}</div>`;
        }
        // Knowledge point level
        if (nd.node_level === 3) {
          if (nd.description) {
            html += `<div class="text-xs text-slate-600 leading-relaxed mt-1 mb-2">${nd.description}</div>`;
          }
          html += `<div class="text-xs text-slate-400 mt-1">所属章节: ${nd.chapter_no}</div>`;
          if (nd.mastery !== null && nd.mastery !== undefined) {
            const label = nd.mastery >= 80 ? '已掌握' : nd.mastery >= 60 ? '基本掌握' : nd.mastery >= 30 ? '薄弱' : '未学习';
            const barColor = nd.mastery_color || '#94a3b8';
            const labelColor = nd.mastery >= 80 ? '#10b981' : nd.mastery >= 60 ? '#f59e0b' : nd.mastery >= 30 ? '#ef4444' : '#94a3b8';
            html += `<div class="mt-2">`;
            html += `<div class="flex items-center justify-between text-xs mb-1"><span class="text-slate-500">掌握度</span><span style="color:${labelColor}" class="font-medium">${label} ${nd.mastery}%</span></div>`;
            html += `<div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">`;
            html += `<div class="h-full rounded-full transition-all" style="width:${nd.mastery}%;background:${barColor}"></div>`;
            html += `</div></div>`;
          }
        }
        // Click hint
        if (d.children || d._children) {
          html += `<div class="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">🖱️ 点击${d.children ? '收起' : '展开'}子节点</div>`;
        }

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        // Fixed top-right corner — no mousemove tracking needed
        tooltip.style.top = '12px';
        tooltip.style.right = '12px';
        tooltip.style.left = 'auto';
        tooltip.style.bottom = 'auto';

        d3.select(this).selectAll('circle, rect, path, polygon').attr('filter', 'url(#glow)');
      })
      .on('mouseleave', function () {
        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = 'none';
        d3.select(this).selectAll('circle, rect, path, polygon').attr('filter', null);
      });

    // ── Node shapes per level ──
    nodeG.each(function (d: any) {
      const el = d3.select(this);
      const lvl = d.data.node_level;
      const groupColor = d.data.group_color || '#64748b';
      const borderColor = d.data.mastery_color || undefined;
      const borderW = lvl === 3 && borderColor ? 2.5 : 0;

      if (lvl === 0) {
        // Course: large circle
        el.append('circle')
          .attr('r', 16)
          .attr('fill', '#1e293b')
          .attr('stroke', '#475569')
          .attr('stroke-width', 2.5);
      } else if (lvl === 1) {
        // Chapter: diamond
        el.append('polygon')
          .attr('points', '0,-12 9,0 0,12 -9,0')
          .attr('fill', groupColor)
          .attr('stroke', d3.color(groupColor)!.darker(0.3).toString())
          .attr('stroke-width', 1.5);
      } else if (lvl === 2) {
        // Section: rounded rect
        el.append('rect')
          .attr('x', -10).attr('y', -7)
          .attr('width', 20).attr('height', 14)
          .attr('rx', 4).attr('ry', 4)
          .attr('fill', groupColor)
          .attr('stroke', d3.color(groupColor)!.darker(0.2).toString())
          .attr('stroke-width', 1);
      } else {
        // Knowledge point: roundRect with mastery border
        el.append('rect')
          .attr('x', -10).attr('y', -6.5)
          .attr('width', 20).attr('height', 13)
          .attr('rx', 6).attr('ry', 6)
          .attr('fill', groupColor)
          .attr('stroke', borderColor || d3.color(groupColor)!.darker(0.2).toString())
          .attr('stroke-width', borderW || 1);
      }

      // Collapse indicator for parent nodes
      if (d.children || d._children) {
        const isCollapsed = !d.children;
        el.append('circle')
          .attr('r', 5)
          .attr('fill', 'white')
          .attr('stroke', '#94a3b8')
          .attr('stroke-width', 1);
        el.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', 7)
          .attr('fill', '#64748b')
          .attr('pointer-events', 'none')
          .text(isCollapsed ? '+' : '−');
      }
    });

    // ── Labels ──
    const labelG = mainG.append('g').attr('class', 'labels');
    hierarchy.descendants().forEach((d: any) => {
      const lvl = d.data.node_level;
      const angleRad = d.x;
      const nodeRadius = d.y;
      const labelOffset = lvl === 0 ? 22 : lvl === 1 ? 20 : lvl === 2 ? 16 : 17;
      const labelR = nodeRadius + labelOffset;

      const x = labelR * Math.cos(angleRad - Math.PI / 2);
      const y = labelR * Math.sin(angleRad - Math.PI / 2);

      // Determine if label is on the left or right side
      const isLeft = angleRad > Math.PI;
      const anchor = isLeft ? 'end' : 'start';
      const textOffset = isLeft ? -6 : 6;

      const fontSize = lvl === 0 ? '13px' : lvl === 1 ? '12px' : lvl === 2 ? '10px' : '8.5px';
      const fontWeight = lvl <= 1 ? '600' : lvl === 2 ? '500' : '400';
      const fillColor = lvl === 0 ? '#1e293b' : lvl <= 2 ? '#334155' : '#64748b';
      const maxLen = lvl <= 1 ? 16 : lvl === 2 ? 18 : 11;
      const displayName = d.data.name.length > maxLen
        ? d.data.name.slice(0, maxLen) + '…'
        : d.data.name;

      labelG.append('text')
        .attr('x', x + textOffset)
        .attr('y', y)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('font-weight', fontWeight)
        .attr('fill', fillColor)
        .attr('font-family', '"Inter", "Noto Sans SC", sans-serif')
        .attr('pointer-events', 'none')
        .text(displayName);
    });
  }, [graphData]);

  // ─── Initial data processing: build hierarchy root from flat data ───
  const buildRootFromFlat = useCallback(() => {
    if (!graphData) return null;
    const { nodes, edges } = graphData;
    const childrenMap: Record<string, string[]> = {};
    edges.filter(e => e.type === 'belong_to').forEach(e => {
      if (!childrenMap[e.source]) childrenMap[e.source] = [];
      childrenMap[e.source].push(e.target);
    });
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    function build(id: string): any {
      const n = nodeMap.get(id)!;
      const childIds = childrenMap[id] || [];
      const children = childIds.map(build);
      return {
        ...n,
        children: children.length > 0 ? children : undefined,
      };
    }

    const rootNode = nodes.find(n => n.node_level === 0);
    if (!rootNode) return null;
    return build(rootNode.id);
  }, [graphData]);

  // ─── Trigger D3 render when data or view changes ───
  useEffect(() => {
    if (!graphData) return;
    const root = buildRootFromFlat();
    if (!root) return;
    rootRef.current = root;
    // Delay to ensure container has size
    const timer = setTimeout(() => renderRadialTree(), 80);
    return () => clearTimeout(timer);
  }, [graphData, renderRadialTree, buildRootFromFlat]);

  // ─── Resize handler ───
  useEffect(() => {
    const handleResize = () => renderRadialTree();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderRadialTree]);

  // ─── Search & highlight ───
  const highlightAndCenterNode = useCallback((nodeId: string | null) => {
    const svg = d3.select(svgRef.current);
    if (!nodeId) {
      svg.selectAll('.node-group').selectAll('circle').attr('opacity', 1).attr('stroke-width', 2);
      svg.selectAll('.node-group').selectAll('text').attr('opacity', 1);
      svg.selectAll('.edge').attr('opacity', 0.18);
      return;
    }
    svg.selectAll('.node-group').selectAll('circle').attr('opacity', 0.12).attr('stroke-width', 1.5);
    svg.selectAll('.node-group').selectAll('text').attr('opacity', 0.12);
    svg.selectAll('.edge').attr('opacity', 0.04);
    svg.selectAll('.node-group').filter(function () {
      const d = d3.select(this).datum() as any;
      return d?.data?.id === nodeId;
    }).selectAll('circle').attr('opacity', 1).attr('stroke-width', 4).attr('stroke', '#ef4444');
    svg.selectAll('.node-group').filter(function () {
      const d = d3.select(this).datum() as any;
      return d?.data?.id === nodeId;
    }).selectAll('text').attr('opacity', 1);
    const targetG = svg.selectAll('.node-group').filter(function () {
      const d = d3.select(this).datum() as any;
      return d?.data?.id === nodeId;
    });
    if (!targetG.empty()) {
      const bbox = (targetG.node() as SVGGElement).getBBox();
      const w = svgRef.current!.clientWidth, h = svgRef.current!.clientHeight;
      svg.select('.zoom-g').transition().duration(500)
        .attr('transform', `translate(${w/2 - (bbox.x + bbox.width/2)},${h/2 - (bbox.y + bbox.height/2)}) scale(1.5)`);
    }
  }, []);

  // ─── Stats ───
  const stat = graphData?.masteryStats;

  return (
    <div className="flex flex-col h-full p-3 bg-[#f8fafc]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">知识图谱</h1>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
            {graphData?.textbook || ''}
          </span>
        </div>

        {/* Course switch */}
        <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden">
          {[1, 2].map(cid => (
            <button
              key={cid}
              onClick={() => setCourseId(cid)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                courseId === cid ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {cid === 1 ? 'Python程序设计' : '数据结构与算法'}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <SearchBar nodes={graphData?.nodes || []} onLocate={(nodeId) => {
        if (nodeId && rootRef.current) {
          highlightAndCenterNode(nodeId);
        }
      }} onClear={() => {
        highlightAndCenterNode(null);
      }} />

      {/* Stats & legend bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        {stat && (
          <>
            <span className="text-xs text-slate-500 font-medium">掌握度:</span>
            {[
              ['已掌握', stat.mastered, '#10b981'],
              ['基本掌握', stat.basics, '#f59e0b'],
              ['薄弱', stat.weak, '#ef4444'],
              ['未学习', stat.unlearned, '#94a3b8'],
            ].map(([label, count, color]) => (
              <div key={label as string} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: color as string }} />
                <span className="text-xs text-slate-600">{label}: <b>{count as number}</b></span>
              </div>
            ))}
            <span className="w-px h-4 bg-slate-200 mx-1" />
          </>
        )}
        <span className="text-xs text-slate-500 font-medium">章节:</span>
        {graphData?.chapters.map(ch => (
          <div key={ch.id} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: ch.group_color }} />
            <span className="text-xs text-slate-500">{ch.name}</span>
          </div>
        ))}
      </div>

      {/* SVG Chart */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        )}

        <svg ref={svgRef} className="w-full h-full" />

        {/* Node tooltip */}
        <div
          ref={tooltipRef}
          className="absolute hidden bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-xl pointer-events-none z-20 text-slate-700"
          style={{ maxWidth: '280px' }}
        />

        {/* Footer info */}
        {!loading && graphData && (
          <div className="absolute bottom-3 right-3 bg-white/90 text-xs text-slate-400 px-2 py-1 rounded border border-slate-100">
            {graphData.totalNodes} 节点 · 滚轮缩放 · 拖拽平移 · 点击展开/收起
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SearchBar inline component ───
function SearchBar({ nodes, onLocate, onClear }: {
  nodes: { id: string; name: string; category: number }[];
  onLocate: (nodeId: string | null) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const filtered = value.trim() ? nodes.filter(n =>
    n.name.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 8) : [];

  return (
    <div className="relative mb-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="搜索知识点..."
          className="w-64 h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 placeholder:text-slate-400"
        />
        {value && (
          <button onClick={() => { setValue(''); onClear(); }} className="text-xs text-slate-400 hover:text-slate-600">
            清除
          </button>
        )}
      </div>
      {focused && filtered.length > 0 && (
        <div className="absolute top-10 left-0 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-20 overflow-hidden">
          {filtered.map(n => (
            <button
              key={n.id}
              onMouseDown={() => { onLocate(n.id); setValue(n.name); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <span className="text-[10px] text-slate-400">{['课程','章','节','知识点'][n.category] || '节点'}</span>
              {n.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

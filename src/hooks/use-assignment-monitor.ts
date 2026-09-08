'use client';
/**
 * 作业作答监督埋点 hook（阶段3·防作弊）
 * 对象：复制/粘贴（含目标题与内容摘要）、切屏/失焦、总用时。
 * 定位为「监督采集 + 威慑」，提交时将 getMonitor() 快照随答案一并上传，
 * 由服务端做系统判疑并写入 answer_monitor 供教师追溯。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MonitorSnapshot {
  copy_count: number;
  paste_count: number;
  blur_count: number;
  blur_seconds: number;
  time_spent_seconds: number;
  start_at: string;
  paste_records: Array<{ questionId: number | null; preview: string; at: string }>;
}

interface UseAssignmentMonitorOptions {
  /** 起始时刻；不传则在首次渲染时记录 */
  startedAt?: string;
  /** 是否强制禁用复制（老师配置） */
  disableCopy?: boolean;
  /** 是否强制禁用粘贴（老师配置） */
  disablePaste?: boolean;
  /** 是否禁用开发者工具（F12 / Ctrl+Shift+I 等 / 右键菜单）（老师配置） */
  disableDevtools?: boolean;
  /** 单次粘贴内容摘要最长保留字符 */
  previewMaxLen?: number;
}

export function useAssignmentMonitor(options: UseAssignmentMonitorOptions = {}) {
  const {
    startedAt,
    disableCopy = false,
    disablePaste = false,
    disableDevtools = false,
    previewMaxLen = 40,
  } = options;

  const startRef = useRef<string>(startedAt || new Date().toISOString());
  const copyRef = useRef(0);
  const pasteRef = useRef(0);
  const blurRef = useRef(0);
  const blurSecRef = useRef(0);
  const blurStartRef = useRef<number | null>(null);
  const pasteRecordsRef = useRef<Array<{ questionId: number | null; preview: string; at: string }>>([]);
  const [fullscreenWarned, setFullscreenWarned] = useState(false);

  const trackPaste = useCallback((preview: string) => {
    pasteRef.current += 1;
    const text = (preview || '').trim().slice(0, previewMaxLen);
    pasteRecordsRef.current.push({ questionId: null, preview: text, at: new Date().toISOString() });
  }, [previewMaxLen]);

  useEffect(() => {
    // 只读采集，不阻止（除非老师禁用）
    const onCopy = () => { if (disableCopy) { try { document.execCommand('copy'); } catch { /* 兼容 */ } } };
    const onCut = () => {};
    const onPaste = (e: ClipboardEvent) => {
      const preview = e.clipboardData?.getData('text') || '';
      trackPaste(preview);
      if (disablePaste) {
        e.preventDefault();
      }
    };

    // 复制/粘贴计数（仅统计，不阻断全局）
    const counter = (e: ClipboardEvent) => {
      if (e.type === 'copy') copyRef.current += 1;
    };

    if (disableCopy) {
      // 禁用敏感区键盘快捷键复制粘贴（老师端未开启则不干预）
      const onKeydown = (e: KeyboardEvent) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && ((e.key === 'c' && disableCopy) || (e.key === 'v' && disablePaste))) {
          e.preventDefault();
        }
      };
      window.addEventListener('keydown', onKeydown);
      return () => window.removeEventListener('keydown', onKeydown);
    }

    window.addEventListener('copy', counter);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', counter);
      document.removeEventListener('paste', onPaste);
    };
  }, [disableCopy, disablePaste, trackPaste]);

  // 禁用开发者工具（F12 / Ctrl+Shift+I/J/C / Ctrl+U 查看源码 / 右键菜单）——老师配置时启用，仅作威慑拦截
  useEffect(() => {
    if (!disableDevtools) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'F12') { e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && k === 'u') e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    window.addEventListener('keydown', onKeydown);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [disableDevtools]);

  // 切屏/失焦采集
  useEffect(() => {
    const onBlur = () => {
      blurRef.current += 1;
      blurStartRef.current = Date.now();
    };
    const onFocus = () => {
      if (blurStartRef.current != null) {
        blurSecRef.current += Math.round((Date.now() - blurStartRef.current) / 1000);
        blurStartRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
      else onFocus();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /** 老师配置强制全屏：调用浏览器的全屏 API，并给出开发模式(F11)提示 */
  const requestFullscreen = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }
    } catch { /* 用户手动拒绝时忽略 */ }
  }, []);

  const exitFullscreen = useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* 忽略 */ }
  }, []);

  const getMonitor = useCallback((extra?: Partial<MonitorSnapshot>): MonitorSnapshot => {
    const now = Date.now();
    // 若当前失焦，先结算失焦时长
    if (blurStartRef.current != null) {
      blurSecRef.current += Math.round((now - blurStartRef.current) / 1000);
      blurStartRef.current = now;
    }
    const spent = Math.max(0, Math.round((now - new Date(startRef.current).getTime()) / 1000));
    return {
      copy_count: copyRef.current,
      paste_count: pasteRef.current,
      blur_count: blurRef.current,
      blur_seconds: blurSecRef.current,
      time_spent_seconds: spent,
      start_at: startRef.current,
      paste_records: [...pasteRecordsRef.current],
      ...extra,
    };
  }, []);

  return { getMonitor, requestFullscreen, exitFullscreen, fullscreenWarned, setFullscreenWarned };
}
import * as echarts from 'echarts';

/**
 * 安全初始化 ECharts 实例：
 * 若该 DOM 上已有实例（react 严格模式 / Fast Refresh / tab 反复挂载导致），
 * 先 dispose 再重新 init，避免「There is a chart instance already initialized on the dom」告警
 * 与内存泄漏。
 */
export function initChart(el: HTMLElement): echarts.ECharts {
  const existing = echarts.getInstanceByDom(el);
  if (existing) {
    try { existing.dispose(); } catch { /* ignore */ }
  }
  return echarts.init(el);
}
'use client';
/**
 * 屏蔽 Next.js 16 + Turbopack 的已知内部 instrumentation bug：
 * 当 Server Component 同步 `redirect()`（如未登录跳转）时，Next 的
 * `performance.measure('<组件名>', ...)` 会拿到负时间戳，浏览器抛
 *   "Failed to execute 'measure' on 'Performance': 'StudentHome' cannot have a negative time stamp."
 *
 * 该错误仅来自框架的渲染埋点，业务无害，但会触发 Next 全屏错误浮层，
 * 在部署/预览场景（如扣子）被误判为「部署失败」。
 * 此处对「性能埋点」类 DOMException 做吞掉降级，其他真实错误照常抛出。
 */
if (typeof window !== 'undefined' && typeof Performance !== 'undefined') {
  const original = Performance.prototype.measure.bind(Performance.prototype);
  Performance.prototype.measure = function (
    this: Performance,
    ...args: Parameters<Performance['measure']>
  ): PerformanceMeasure {
    try {
      return original.apply(this, args as never) as PerformanceMeasure;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 仅吞掉 Next 埋点的已知时序类错误，避免掩盖真实异常
      if (/negative time stamp|The mark .* does not exist|does not exist/i.test(msg)) {
        return undefined as unknown as PerformanceMeasure;
      }
      throw e;
    }
  };
}
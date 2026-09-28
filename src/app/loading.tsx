/** 全局路由级加载态：消除切页白屏 */
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="加载中">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-[3px] border-violet-200 border-t-violet-600 animate-spin" />
        <p className="text-sm text-slate-400">加载中…</p>
      </div>
    </div>
  );
}

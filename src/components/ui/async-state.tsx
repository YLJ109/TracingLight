"use client";

import { ReactNode } from "react";
import { AlertCircle, ArrowLeft, Loader2, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 统一加载 / 错误 / 空态组件（A4）
 * 收敛各页面手写的 loading / "加载失败" / "暂无数据" 样板，保证视觉一致并可复用。
 *
 * 用法：
 *   {loading && <AsyncState state="loading" />}
 *   {error && <AsyncState state="error" error={msg} onRetry={reload} onBack={...} />}
 *   {!items.length && <AsyncState state="empty" emptyTitle="暂无数据" ... />}
 */
interface AsyncStateProps {
  state: "loading" | "error" | "empty";
  className?: string;
  minHeight?: string;
  /** loading 提示文案，默认「加载中...」 */
  label?: string;
  /** error 提示文案，默认「加载失败，请稍后重试」 */
  error?: string | ReactNode;
  /** error 态重试回调（可选） */
  onRetry?: () => void;
  /** error 态返回回调（可选） */
  onBack?: () => void;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function AsyncState({
  state,
  className,
  minHeight = "min-h-[50vh]",
  label = "加载中...",
  error,
  onRetry,
  onBack,
  emptyIcon,
  emptyTitle = "暂无数据",
  emptyDescription,
}: AsyncStateProps) {
  if (state === "loading") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3", minHeight, className)}>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4", minHeight, className)}>
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">{error ?? "加载失败，请稍后重试"}</p>
          <p className="text-xs text-slate-400 mt-1">可点击重试或返回上级页面</p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> 重试
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回
            </Button>
          )}
        </div>
      </div>
    );
  }

  // empty
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", minHeight, className)}>
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        {emptyIcon ?? <Inbox className="w-7 h-7" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-600">{emptyTitle}</p>
        {emptyDescription && <p className="text-xs text-slate-400 mt-1">{emptyDescription}</p>}
      </div>
    </div>
  );
}

export default AsyncState;
"use client";

import { useEyeCare } from "@/lib/eye-care-store";
import { useState, useRef, useEffect } from "react";

export function EyeCareToggle() {
  const { enabled, warmth, toggle, setWarmth } = useEyeCare();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={enabled ? `护眼模式 · 色温 ${warmth}` : "开启护眼模式"}
        className={`p-2 rounded-lg transition-colors ${
          enabled
            ? "bg-amber-50 text-amber-500"
            : "hover:bg-amber-50 text-slate-400 hover:text-amber-500"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-slate-200/60 shadow-lg p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">护眼模式</span>
            <button
              onClick={toggle}
              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                enabled ? "bg-amber-400" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>❄ 冷</span>
              <span>色温调节</span>
              <span>暖 🔥</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={warmth}
              disabled={!enabled}
              onChange={(e) => setWarmth(Number(e.target.value))}
              className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
                enabled
                  ? "accent-amber-400"
                  : "accent-slate-300"
              }`}
              style={{
                background: enabled
                  ? `linear-gradient(to right, #f8fafc, #fbbf24, #f97316)`
                  : "#e2e8f0",
              }}
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            {enabled
              ? `当前色温 ${warmth} — 降低蓝光，缓解眼疲劳`
              : "开启后降低屏幕蓝光，保护视力"}
          </p>
        </div>
      )}
    </div>
  );
}

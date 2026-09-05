"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface EyeCareContextType {
  enabled: boolean;
  warmth: number;
  toggle: () => void;
  setWarmth: (v: number) => void;
}

const Ctx = createContext<EyeCareContextType>({
  enabled: false,
  warmth: 50,
  toggle: () => {},
  setWarmth: () => {},
});

/**
 * 护眼模式（v2）：CSS 变量换肤，替代旧的全局 filter 方案。
 * filter 会创建 containing block 导致 fixed 弹层/侧栏错位、增加合成层开销、颜色整体失真；
 * 变量换肤只改变颜色值，布局与定位不受影响。
 * warmth 0-100 映射背景冷暖混合比例（--eye-warm），由 globals.css 的 .eye-care 令牌消费。
 */
function applyWarmth(enabled: boolean, w: number) {
  const root = document.documentElement;
  if (!enabled) {
    root.classList.remove("eye-care");
    root.style.removeProperty("--eye-warm");
    return;
  }
  root.style.setProperty("--eye-warm", String(Math.min(100, Math.max(0, w))));
  root.classList.add("eye-care");
}

export function EyeCareProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [warmth, setWarmthState] = useState(50);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("tracinglight_eyecare");
    const storedWarmth = localStorage.getItem("tracinglight_eyecare_warmth");
    const isOn = stored === "true";
    const w = storedWarmth ? parseInt(storedWarmth, 10) : 50;
    setEnabled(isOn);
    setWarmthState(w);
    applyWarmth(isOn, w);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("tracinglight_eyecare", String(next));
      applyWarmth(next, warmth);
      return next;
    });
  }, [warmth]);

  const setWarmth = useCallback((v: number) => {
    setWarmthState(v);
    localStorage.setItem("tracinglight_eyecare_warmth", String(v));
    applyWarmth(enabled, v);
  }, [enabled]);

  if (!mounted) {
    return <Ctx.Provider value={{ enabled: false, warmth: 50, toggle, setWarmth }}>{children}</Ctx.Provider>;
  }

  return <Ctx.Provider value={{ enabled, warmth, toggle, setWarmth }}>{children}</Ctx.Provider>;
}

export function useEyeCare() {
  return useContext(Ctx);
}

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

function applyWarmth(enabled: boolean, w: number) {
  const root = document.documentElement;
  if (!enabled) {
    root.classList.remove("eye-care");
    root.style.removeProperty("--eye-filter");
    return;
  }
  // w: 0=cool(no filter) → 100=warm(max filter)
  const sepia = (w / 100) * 0.30;        // 0 → 0.30
  const saturate = 1 - (w / 100) * 0.20; // 1 → 0.80
  const brightness = 1 - (w / 100) * 0.12; // 1 → 0.88
  const contrast = 1 - (w / 100) * 0.16;   // 1 → 0.84
  root.style.setProperty(
    "--eye-filter",
    `sepia(${sepia.toFixed(3)}) saturate(${saturate.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`
  );
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

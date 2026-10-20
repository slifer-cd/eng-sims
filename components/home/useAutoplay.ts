"use client";

import { useCallback, useEffect, useEffectEvent, useRef } from "react";

/**
 * Calls `step` every `everyMs` so a home page preview plays by itself, until the returned
 * `stop` is called (the visitor touched it). Nothing is remembered between visits. Holds
 * still under `prefers-reduced-motion`.
 */
export function useAutoplay(step: () => void, everyMs: number) {
  // Survives the effect being cleaned up (Strict Mode, or the page hidden under
  // cacheComponents), so a preview the visitor took over doesn't start playing again.
  const stopped = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const onStep = useEffectEvent(step);

  useEffect(() => {
    if (stopped.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = window.setInterval(onStep, everyMs);
    return () => window.clearInterval(timer.current);
  }, [everyMs]);

  return useCallback(() => {
    stopped.current = true;
    window.clearInterval(timer.current);
  }, []);
}

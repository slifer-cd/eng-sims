"use client";

import { useEffect, useId, useRef, useState } from "react";
import { squareWaveIdealPath, squareWavePath } from "@/lib/site/previews";

const BOX = { width: 360, height: 170, periods: 2, samples: 360 };
const MAX_TERMS = 20;
/** The sweep runs between the fundamental and this many harmonics, where the wave looks square. */
const SWEEP_TERMS = 10;
/** One full sweep, up and back down. */
const SWEEP_MS = 9000;

/**
 * A square wave built from its Fourier series. On load the sum keeps sweeping up from the
 * fundamental, one odd harmonic fading in at a time, and back down, until the visitor moves
 * the slider.
 */
export function FourierPreview() {
  const [terms, setTerms] = useState(1);
  const frame = useRef(0);
  // Survives the effect being cleaned up (Strict Mode, or the page hidden under
  // cacheComponents), so an overridden sweep doesn't replay over the slider.
  const stopped = useRef(false);
  const sliderId = useId();

  useEffect(() => {
    if (stopped.current) return;
    // With reduced motion the first frame jumps to a settled wave and stays there.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame.current = requestAnimationFrame(() => setTerms(SWEEP_TERMS));
      return () => cancelAnimationFrame(frame.current);
    }
    const start = performance.now();
    const step = (now: number) => {
      // Cosine ease: lingers at the square end and at the bare sine.
      const p = (1 - Math.cos((2 * Math.PI * (now - start)) / SWEEP_MS)) / 2;
      setTerms(1 + p * (SWEEP_TERMS - 1));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const highest = 2 * Math.round(terms) - 1;
  return (
    <div>
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="w-full"
        role="img"
        aria-label={`Fourier series of a square wave using the odd harmonics up to ${highest}`}
      >
        <line x1={0} x2={BOX.width} y1={BOX.height / 2} y2={BOX.height / 2} className="stroke-plot-axis" strokeWidth={1} />
        <path d={squareWaveIdealPath(BOX)} fill="none" className="stroke-muted" strokeWidth={1.25} strokeDasharray="4 4" opacity={0.6} />
        <path d={squareWavePath(terms, BOX)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted">
        <label htmlFor={sliderId} className="flex items-center gap-3">
          Harmonics
          <input
            id={sliderId}
            type="range"
            min={1}
            max={MAX_TERMS}
            value={Math.round(terms)}
            onChange={(e) => {
              cancelAnimationFrame(frame.current);
              stopped.current = true;
              setTerms(Number(e.target.value));
            }}
            className="w-28 accent-accent"
          />
        </label>
        <output htmlFor={sliderId} className="font-mono">
          k = {highest <= 5 ? [1, 3, 5].filter((k) => k <= highest).join(", ") : `1, 3, …, ${highest}`}
        </output>
      </div>
    </div>
  );
}

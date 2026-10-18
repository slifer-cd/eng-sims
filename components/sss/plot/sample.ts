/*
 * Sampling signals for plots. Exact signals are sampled piece by piece with both one-sided
 * limits at every breakpoint, so a jump draws as a vertical edge instead of a slanted line.
 */

import type { C } from "@/lib/sss/math/complex";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { type Impulse, type Signal, sigBreaks, sigEval, sigEvalLeft } from "@/lib/sss/signal/signal";
import { type SpecialTerm, specialsEval } from "@/lib/sss/signal/special";

export type Part = "re" | "im" | "abs" | "arg";

export function partOf(c: C, part: Part): number {
  switch (part) {
    case "re":
      return c.re;
    case "im":
      return c.im;
    case "abs":
      return Math.hypot(c.re, c.im);
    case "arg":
      return Math.atan2(c.im, c.re);
  }
}

export interface Samples {
  xs: Float64Array;
  ys: Float64Array;
}

/** Sample an exact signal (plus table terms) on [a, b]. */
export function sampleExact(sig: Signal, special: SpecialTerm[], [a, b]: [number, number], n: number, part: Part = "re"): Samples {
  const breaks = sigBreaks(sig).filter((t) => t > a && t < b);
  const cuts = [a, ...breaks, b];
  const xs: number[] = [];
  const ys: number[] = [];
  const value = (t: number, left: boolean) => {
    const v = left ? sigEvalLeft(sig, t) : sigEval(sig, t);
    if (special.length === 0) return partOf(v, part);
    const s = specialsEval(special, t);
    return partOf({ re: v.re + s.re, im: v.im + s.im }, part);
  };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const l = cuts[i];
    const r = cuts[i + 1];
    const m = Math.max(2, Math.round((n * (r - l)) / (b - a)));
    for (let k = 0; k <= m; k++) {
      const t = l + ((r - l) * k) / m;
      // At the right end of each interval use the left limit; the next interval starts with the right value.
      const left = k === m && i + 1 < cuts.length - 1;
      xs.push(t);
      ys.push(value(t, left));
    }
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
}

export function sampleFn(f: (t: number) => number, [a, b]: [number, number], n: number): Samples {
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    xs[i] = t;
    ys[i] = f(t);
  }
  return { xs, ys };
}

/** Sample any analysis result (exact or numeric). */
export function sampleAnalysis(an: Analysis, range: [number, number], n: number, part: Part = "re"): Samples {
  if (an.kind === "exact") return sampleExact(an.signal, an.special, range, n, part);
  if (an.kind === "numeric") return sampleFn((t) => partOf(an.f(t), part), range, n);
  return { xs: new Float64Array(0), ys: new Float64Array(0) };
}

export function impulsesIn(an: Analysis, [a, b]: [number, number]): Impulse[] {
  if (an.kind !== "exact") return [];
  return an.signal.impulses.filter((i) => i.at >= a && i.at <= b);
}

/** Integer samples n in [a, b] of a sequence. */
export function sampleSequence(an: Analysis, [a, b]: [number, number], part: Part = "re"): Samples {
  const lo = Math.ceil(a);
  const hi = Math.floor(b);
  const n = Math.max(0, hi - lo + 1);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = lo + i;
    xs[i] = k;
    if (an.kind === "exact") {
      const v = sigEval(an.signal, k);
      ys[i] = partOf(v, part);
    } else if (an.kind === "numeric") ys[i] = partOf(an.f(k), part);
  }
  return { xs, ys };
}

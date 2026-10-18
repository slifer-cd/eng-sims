/*
 * Discrete convolution y[n] = Σ_k x[k]·h[n − k]. Finite sequences are summed exactly; when
 * both have Z-transforms with overlapping ROCs, the closed form comes from Y = X·H and
 * partial fractions. Values are always available (direct sums over a wide window).
 */

import { nice } from "../math/nice";
import type { Analysis } from "../signal/analyze";
import { texCases } from "../signal/format";
import { type Signal, sigEval } from "../signal/signal";
import type { Step } from "../steps";
import { indexRange } from "./sequence";
import { inverseZ, texZ, zMul, zTransform } from "./ztransform";

export interface DConvResult {
  /** y[n]. */
  at(n: number): number;
  range: [number, number];
  /** Closed form, when there is one. */
  signal: Signal | null;
  tex: string | null;
  steps: Step[];
  note?: string;
}

const finite = (s: Signal) => s.pieces.every((p) => Number.isFinite(p.from) && Number.isFinite(p.to));

export function dconvolve(x: Analysis, h: Analysis): DConvResult {
  const xr = indexRange(x);
  const hr = indexRange(h);
  const range: [number, number] = [xr[0] + hr[0], xr[1] + hr[1]];
  const xv = (n: number) => (x.kind === "exact" ? sigEval(x.signal, n).re : x.kind === "numeric" ? x.f(n).re : 0);
  const hv = (n: number) => (h.kind === "exact" ? sigEval(h.signal, n).re : h.kind === "numeric" ? h.f(n).re : 0);
  // Direct sum over x's window (wide enough that the tails are negligible).
  const [k0, k1] = [xr[0] - 40, xr[1] + 40];
  const direct = (n: number) => {
    let acc = 0;
    for (let k = k0; k <= k1; k++) acc += xv(k) * hv(n - k);
    return acc;
  };
  const steps: Step[] = [{ title: "Flip h and slide it: h[n − k] is h[k] reversed and moved to k = n", lines: ["y[n] = \\sum_{k=-\\infty}^{\\infty} x[k]\\,h[n-k]"] }];
  if (x.kind !== "exact" || h.kind !== "exact") {
    return { at: direct, range, signal: null, tex: null, steps, note: "One of the sequences has no exact form, so y[n] is summed numerically." };
  }
  if (finite(x.signal) && finite(h.signal)) {
    // Exact finite sum: list the values.
    const lo = Math.min(...x.signal.pieces.map((p) => p.from)) + Math.min(...h.signal.pieces.map((p) => p.from));
    const hi = Math.max(...x.signal.pieces.map((p) => p.to - 1)) + Math.max(...h.signal.pieces.map((p) => p.to - 1));
    const vals: number[] = [];
    for (let n = lo; n <= hi; n++) vals.push(direct(n));
    const tex = valuesTex(vals, lo);
    steps.push({ title: "Both sequences are finite, so each y[n] is a finite sum; slide and add", lines: [`y[n] = ${tex}`] });
    return { at: direct, range, signal: null, tex, steps };
  }
  const X = zTransform(x.signal);
  const H = zTransform(h.signal);
  if (X.roc && H.roc) {
    const rmin = Math.max(X.roc.rmin, H.roc.rmin);
    const rmax = Math.min(X.roc.rmax, H.roc.rmax);
    if (rmin < rmax) {
      const Y = zMul(X.terms, H.terms);
      const inv = inverseZ(Y, { rmin, rmax });
      steps.push(
        { title: "Convolution becomes multiplication of Z-transforms", lines: [`Y(z) = X(z)H(z) = \\left(${X.tex}\\right)\\left(${H.tex}\\right)`, `\\phantom{Y(z)} = ${texZ(Y)}`] },
        ...inv.steps,
      );
      // Interval by interval reads best for a convolution (as on the continuous page).
      const tex = texCases(inv.signal, { v: "n", discrete: true });
      steps.push({ title: "Written interval by interval", lines: [`y[n] = ${tex}`] });
      return { at: (n) => sigEval(inv.signal, n).re, range, signal: inv.signal, tex, steps };
    }
  }
  return { at: direct, range, signal: null, tex: null, steps, note: "The Z-transforms have no common ROC, so y[n] is summed numerically (it may not converge)." };
}

/** {…, 1, 3, 5, …} with an arrow under n = 0. */
export function valuesTex(vals: number[], start: number): string {
  const items = vals.map((v, i) => {
    const t = nice(v).tex;
    return start + i === 0 ? `\\underset{\\uparrow}{${t}}` : t;
  });
  const note = start <= 0 && start + vals.length > 0 ? "" : `\\quad (\\text{starting at } n = ${start})`;
  return `\\{${items.join(",\\ ")}\\}${note}`;
}

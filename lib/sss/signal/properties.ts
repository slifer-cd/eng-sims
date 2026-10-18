/*
 * Signal properties shown on the Signal page: energy, average power, even/odd parts,
 * causality, and the time window that frames the interesting part of a signal for plots.
 */

import { cabs } from "../math/complex";
import type { Analysis } from "./analyze";
import { epConj, epIntegral, epMul } from "./exppoly";
import { type Piece, type Signal, sigAdd, sigBreaks, sigCompose, sigIsReal, sigScale } from "./signal";
import { specialSpan } from "./special";

/** ∫|x(t)|² dt: Infinity when it diverges or the signal has impulses. */
export function energy(sig: Signal): number {
  if (sig.impulses.length) return Infinity;
  let total = 0;
  for (const p of sig.pieces) {
    const v = epIntegral(epMul(p.expr, epConj(p.expr)), p.from, p.to);
    if (!Number.isFinite(v.re)) return Infinity;
    total += v.re;
  }
  return total;
}

/**
 * Average power lim (1/2T)∫_{-T}^{T}|x|². Only the tails matter: decaying terms give 0,
 * each undamped sinusoid c·e^{jωt} on a half-line gives |c|²/2, growth gives ∞.
 */
export function power(sig: Signal): number {
  if (sig.impulses.length) return NaN;
  let total = 0;
  const tail = (p: Piece, dir: 1 | -1) => {
    for (const g of p.expr) {
      const re = g.rate.re * dir;
      if (re < -1e-12) continue; // decays
      if (re > 1e-12 || g.poly.length > 1) return Infinity;
      total += cabs(g.poly[0]) ** 2 / 2;
    }
    return 0;
  };
  for (const p of sig.pieces) {
    if (p.to === Infinity && tail(p, 1) === Infinity) return Infinity;
    if (p.from === -Infinity && tail(p, -1) === Infinity) return Infinity;
  }
  return total;
}

export function evenOdd(sig: Signal): { even: Signal; odd: Signal } {
  const rev = sigCompose(sig, -1, 0);
  return { even: sigScale(sigAdd(sig, rev), 0.5), odd: sigScale(sigAdd(sig, sigScale(rev, -1)), 0.5) };
}

export interface Classification {
  causal: boolean;
  anticausal: boolean;
  finiteDuration: boolean;
  real: boolean;
  even: boolean;
  odd: boolean;
}

export function classify(sig: Signal): Classification {
  const starts = [...sig.pieces.map((p) => p.from), ...sig.impulses.map((i) => i.at)];
  const ends = [...sig.pieces.map((p) => p.to), ...sig.impulses.map((i) => i.at)];
  const { even, odd } = evenOdd(sig);
  const zero = (s: Signal) => s.pieces.length === 0 && s.impulses.length === 0;
  return {
    causal: starts.every((t) => t >= -1e-12),
    anticausal: ends.every((t) => t <= 1e-12),
    finiteDuration: starts.every(Number.isFinite) && ends.every(Number.isFinite),
    real: sigIsReal(sig),
    even: zero(odd) && !zero(sig),
    odd: zero(even) && !zero(sig),
  };
}

/** How far a tail has to run before it is negligible (or for a few oscillations). */
function tailLength(p: Piece, dir: 1 | -1): number {
  let len = 0;
  for (const g of p.expr) {
    const re = g.rate.re * dir;
    const w = Math.abs(g.rate.im);
    if (re < -1e-9) {
      // Decaying: until it is negligible (a damped sinusoid needs no extra periods).
      len = Math.max(len, Math.min(20, 7 / -re + ((g.poly.length - 1) * 2) / -re));
    } else if (re > 1e-9) len = Math.max(len, Math.min(8, 3 / re));
    else {
      len = Math.max(len, g.poly.length > 1 ? 5 : 3);
      // Undamped oscillation: show about three periods.
      if (w > 1e-9) len = Math.max(len, Math.min(30, (3 * 2 * Math.PI) / w));
    }
  }
  return len || 3;
}

/** A plotting window [lo, hi] that frames the signal. */
export function timeRange(an: Analysis, discrete = false): [number, number] {
  let lo: number;
  let hi: number;
  if (an.kind === "exact") {
    const { signal, special } = an;
    const pts = sigBreaks(signal);
    for (const s of special) pts.push(...specialSpan(s));
    lo = pts.length ? Math.min(...pts) : 0;
    hi = pts.length ? Math.max(...pts) : 0;
    const first = signal.pieces[0];
    const last = signal.pieces[signal.pieces.length - 1];
    if (first && first.from === -Infinity) lo -= tailLength(first, -1);
    if (last && last.to === Infinity) hi += tailLength(last, 1);
    const span = hi - lo;
    const margin = Math.max(discrete ? 2 : 0.5, span * 0.15);
    if (!(first?.from === -Infinity)) lo -= margin;
    if (!(last?.to === Infinity)) hi += margin;
    // Keep t = 0 in view when the signal is near it.
    if (lo > 0 && lo < 3 * Math.max(1, span)) lo = Math.min(lo, -margin * 0.5);
    if (hi < 0 && -hi < 3 * Math.max(1, span)) hi = Math.max(hi, margin * 0.5);
  } else if (an.kind === "numeric") {
    // Find where the function is significant on a generous window.
    const N = 2000;
    const W = 30;
    let max = 0;
    const vals: number[] = [];
    for (let i = 0; i <= N; i++) {
      const v = cabs(an.f(-W + (2 * W * i) / N));
      vals.push(Number.isFinite(v) ? v : 0);
      if (Number.isFinite(v)) max = Math.max(max, v);
    }
    const sig = vals.map((v) => v > 1e-3 * max);
    const first = sig.indexOf(true);
    const last = sig.lastIndexOf(true);
    if (first < 0 || (first === 0 && last === N)) {
      lo = -5;
      hi = 5;
    } else {
      lo = Math.max(-20, -W + (2 * W * first) / N);
      hi = Math.min(20, -W + (2 * W * last) / N);
      const m = Math.max(0.5, (hi - lo) * 0.1);
      lo -= m;
      hi += m;
    }
  } else {
    lo = -1;
    hi = 5;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-6) {
    lo = -1;
    hi = 5;
  }
  if (discrete) {
    lo = Math.floor(lo);
    hi = Math.ceil(hi);
    if (hi - lo < 8) hi = lo + 8;
  }
  return [lo, hi];
}

/** ∫|f|² over a window by the trapezoid rule (numeric-only signals). */
export function numericEnergy(f: (t: number) => { re: number; im: number }, [a, b]: [number, number], n = 20000): number {
  const h = (b - a) / n;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const v = f(a + i * h);
    const m = v.re * v.re + v.im * v.im;
    if (!Number.isFinite(m)) continue;
    acc += (i === 0 || i === n ? 0.5 : 1) * m;
  }
  return acc * h;
}


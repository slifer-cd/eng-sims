/*
 * Piecewise exp-polynomial signals: sorted, disjoint half-open pieces [from, to) (bounds
 * may be ±∞), each an exp-polynomial, plus impulses area·δ^(order)(t − at). The signal is
 * zero outside its pieces. Discrete sequences use the same type, read at integers only.
 */

import { type C, cabs, cadd, cconj, cisZero, cmul, cneg, cscale, cx, ZERO } from "../math/complex";
import {
  binom,
  epAdd,
  epCompose,
  epConj,
  epConst,
  epDeriv,
  epDerivAt,
  epEval,
  epIsZero,
  epMul,
  epNear,
  epScale,
  type ExpPoly,
} from "./exppoly";

export interface Piece {
  from: number;
  to: number;
  expr: ExpPoly;
}

export interface Impulse {
  at: number;
  area: C;
  order: number;
}

export interface Signal {
  pieces: Piece[];
  impulses: Impulse[];
}

export class SignalError extends Error {}

/** Two breakpoints are the same point (infinities compare exactly). */
export function samePoint(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export const sigZero = (): Signal => ({ pieces: [], impulses: [] });

export function sigPiece(from: number, to: number, expr: ExpPoly): Signal {
  if (!(from < to) || samePoint(from, to)) return sigZero();
  return sigNormalize({ pieces: [{ from, to, expr }], impulses: [] });
}

/** expr on the whole line. */
export const sigEverywhere = (expr: ExpPoly): Signal => sigPiece(-Infinity, Infinity, expr);

export function sigImpulse(at: number, area: C | number = 1, order = 0): Signal {
  const a = typeof area === "number" ? cx(area) : area;
  return sigNormalize({ pieces: [], impulses: [{ at, area: a, order }] });
}

/** Merge touching pieces with equal expressions, drop empty and zero pieces, merge impulses. */
export function sigNormalize(sig: Signal): Signal {
  const pieces = sig.pieces
    .filter((p) => p.from < p.to && !samePoint(p.from, p.to) && !epIsZero(p.expr))
    .sort((a, b) => a.from - b.from);
  const merged: Piece[] = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && samePoint(last.to, p.from) && epNear(last.expr, p.expr)) {
      merged[merged.length - 1] = { from: last.from, to: p.to, expr: last.expr };
    } else {
      merged.push({ ...p });
    }
  }
  const impulses: Impulse[] = [];
  for (const imp of sig.impulses) {
    const same = impulses.find((i) => i.order === imp.order && samePoint(i.at, imp.at));
    if (same) same.area = cadd(same.area, imp.area);
    else impulses.push({ ...imp });
  }
  return {
    pieces: merged,
    impulses: impulses
      .filter((i) => !cisZero(i.area, 1e-12 * Math.max(1, cabs(i.area))))
      .sort((a, b) => a.at - b.at || a.order - b.order),
  };
}

/** Sorted, de-duplicated piece boundaries (including ±∞ where pieces reach them). */
function boundaries(...sigs: Signal[]): number[] {
  const pts = sigs.flatMap((s) => s.pieces.flatMap((p) => [p.from, p.to])).sort((a, b) => a - b);
  const out: number[] = [];
  for (const p of pts) if (!out.length || !samePoint(out[out.length - 1], p)) out.push(p);
  return out;
}

/** The expression on [l, r) if a piece covers it. */
function exprOn(sig: Signal, l: number, r: number): ExpPoly | null {
  for (const p of sig.pieces) {
    const coversL = p.from <= l || samePoint(p.from, l);
    const coversR = p.to >= r || samePoint(p.to, r);
    if (coversL && coversR) return p.expr;
  }
  return null;
}

/** Apply op to the two signals' expressions on every elementary interval. */
function combine(
  a: Signal,
  b: Signal,
  op: (x: ExpPoly | null, y: ExpPoly | null) => ExpPoly | null,
): Piece[] {
  const bps = boundaries(a, b);
  const out: Piece[] = [];
  for (let i = 0; i + 1 < bps.length; i++) {
    const l = bps[i];
    const r = bps[i + 1];
    const e = op(exprOn(a, l, r), exprOn(b, l, r));
    if (e && !epIsZero(e)) out.push({ from: l, to: r, expr: e });
  }
  return out;
}

export function sigAdd(a: Signal, b: Signal): Signal {
  const pieces = combine(a, b, (x, y) => (x && y ? epAdd(x, y) : (x ?? y)));
  return sigNormalize({ pieces, impulses: [...a.impulses, ...b.impulses] });
}

export function sigScale(a: Signal, k: C | number): Signal {
  const c = typeof k === "number" ? cx(k) : k;
  return sigNormalize({
    pieces: a.pieces.map((p) => ({ ...p, expr: epScale(p.expr, c) })),
    impulses: a.impulses.map((i) => ({ ...i, area: cmul(i.area, c) })),
  });
}

export const sigNeg = (a: Signal): Signal => sigScale(a, -1);
export const sigSub = (a: Signal, b: Signal): Signal => sigAdd(a, sigNeg(b));

/** k-th derivative of the smooth part at t; at a boundary, the average of both sides. */
export function derivAt(sig: Signal, t: number, k: number): C {
  let left: C = ZERO;
  let right: C = ZERO;
  for (const p of sig.pieces) {
    const inside = p.from < t && t < p.to && !samePoint(p.from, t) && !samePoint(p.to, t);
    if (inside) return epDerivAt(p.expr, t, k);
    if (samePoint(p.to, t)) left = epDerivAt(p.expr, t, k);
    if (samePoint(p.from, t)) right = epDerivAt(p.expr, t, k);
  }
  return cscale(cadd(left, right), 0.5);
}

/** f·δ^(k)(t−a) = Σ_i (−1)^i C(k,i) f^(i)(a) δ^(k−i)(t−a). */
function sift(f: Signal, imp: Impulse): Impulse[] {
  const out: Impulse[] = [];
  for (let i = 0; i <= imp.order; i++) {
    const d = derivAt(f, imp.at, i);
    const coef = cscale(cmul(imp.area, d), (i % 2 === 0 ? 1 : -1) * binom(imp.order, i));
    out.push({ at: imp.at, area: coef, order: imp.order - i });
  }
  return out;
}

export function sigMul(a: Signal, b: Signal): Signal {
  for (const ia of a.impulses) {
    for (const ib of b.impulses) {
      if (samePoint(ia.at, ib.at)) throw new SignalError("A product of two impulses at the same time is undefined.");
    }
  }
  const pieces = combine(a, b, (x, y) => (x && y ? epMul(x, y) : null));
  const impulses = [...a.impulses.flatMap((i) => sift(b, i)), ...b.impulses.flatMap((i) => sift(a, i))];
  return sigNormalize({ pieces, impulses });
}

/** x(a·t + b), a ≠ 0. */
export function sigCompose(sig: Signal, a: number, b: number): Signal {
  if (a === 0) throw new SignalError("Time scale of zero");
  // + 0 turns -0 into 0, which keeps boundaries comparable with ===.
  const map = (tau: number) => (tau - b) / a + 0;
  const pieces = sig.pieces.map((p) => {
    const x = map(p.from);
    const y = map(p.to);
    return { from: Math.min(x, y), to: Math.max(x, y), expr: epCompose(p.expr, a, b) };
  });
  // δ^(k)(a·s) = δ^(k)(s) / (a^k |a|)
  const impulses = sig.impulses.map((i) => ({
    at: map(i.at),
    area: cscale(i.area, 1 / (Math.pow(a, i.order) * Math.abs(a))),
    order: i.order,
  }));
  return sigNormalize({ pieces, impulses });
}

export const sigShift = (sig: Signal, t0: number): Signal => sigCompose(sig, 1, -t0);

/** Value of the smooth part at t (right-continuous: pieces are [from, to)). */
export function sigEval(sig: Signal, t: number): C {
  for (const p of sig.pieces) if (p.from <= t && t < p.to) return epEval(p.expr, t);
  return ZERO;
}

/** Left limit at t. */
export function sigEvalLeft(sig: Signal, t: number): C {
  for (const p of sig.pieces) if (p.from < t && t <= p.to) return epEval(p.expr, t);
  return ZERO;
}

/** Derivative, with jumps turned into impulses. */
export function sigDeriv(sig: Signal): Signal {
  const pieces = sig.pieces.map((p) => ({ ...p, expr: epDeriv(p.expr) }));
  const jumps: Impulse[] = [];
  for (const t of boundaries(sig)) {
    if (!Number.isFinite(t)) continue;
    let left: C = ZERO;
    let right: C = ZERO;
    for (const p of sig.pieces) {
      if (samePoint(p.to, t)) left = epEval(p.expr, t);
      if (samePoint(p.from, t)) right = epEval(p.expr, t);
    }
    const jump = cadd(right, cneg(left));
    const scale = Math.max(cabs(left), cabs(right));
    if (cabs(jump) > 1e-12 * Math.max(1, scale)) jumps.push({ at: t, area: jump, order: 0 });
  }
  const impulses = [...sig.impulses.map((i) => ({ ...i, order: i.order + 1 })), ...jumps];
  return sigNormalize({ pieces, impulses });
}

/** Finite piece boundaries and impulse locations, sorted. */
export function sigBreaks(sig: Signal): number[] {
  const pts = [...boundaries(sig).filter(Number.isFinite), ...sig.impulses.map((i) => i.at)].sort((a, b) => a - b);
  const out: number[] = [];
  for (const p of pts) if (!out.length || !samePoint(out[out.length - 1], p)) out.push(p);
  return out;
}

export function sigConj(sig: Signal): Signal {
  return {
    pieces: sig.pieces.map((p) => ({ ...p, expr: epConj(p.expr) })),
    impulses: sig.impulses.map((i) => ({ ...i, area: cconj(i.area) })),
  };
}

/** True when the signal is real-valued (conjugate-symmetric terms). */
export function sigIsReal(sig: Signal): boolean {
  return (
    sig.pieces.every((p) => epNear(p.expr, epConj(p.expr), 1e-9)) &&
    sig.impulses.every((i) => Math.abs(i.area.im) <= 1e-12 * Math.max(1, Math.abs(i.area.re)))
  );
}

/** Split the piece that contains t0 in its interior into two. */
export function sigSplitAt(sig: Signal, t0: number): Signal {
  const pieces: Piece[] = [];
  for (const p of sig.pieces) {
    if (p.from < t0 && t0 < p.to && !samePoint(p.from, t0) && !samePoint(p.to, t0)) {
      pieces.push({ from: p.from, to: t0, expr: p.expr }, { from: t0, to: p.to, expr: p.expr });
    } else pieces.push(p);
  }
  return { pieces, impulses: sig.impulses };
}

export const sigIsZero = (sig: Signal): boolean => sig.pieces.length === 0 && sig.impulses.length === 0;

/** Restrict to [a, b). */
export function sigWindow(sig: Signal, a: number, b: number): Signal {
  const pieces = sig.pieces
    .map((p) => ({ from: Math.max(p.from, a), to: Math.min(p.to, b), expr: p.expr }))
    .filter((p) => p.from < p.to && !samePoint(p.from, p.to));
  const impulses = sig.impulses.filter((i) => (i.at >= a || samePoint(i.at, a)) && i.at < b && !samePoint(i.at, b));
  return sigNormalize({ pieces, impulses });
}

/** Constant c on the whole line. */
export const sigConst = (c: C | number): Signal => sigEverywhere(epConst(c));

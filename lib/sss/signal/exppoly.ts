/*
 * Exp-polynomials: Σ_g P_g(t)·e^{λ_g t}, with complex rates λ_g and complex polynomial
 * coefficients (lowest power first). Sinusoids are conjugate pairs of rates. The class is
 * closed under +, ×, affine substitution t → a·t + b, differentiation and integration,
 * which is what makes every transform in the engine exact.
 */

import {
  type C,
  cabs,
  cadd,
  cconj,
  cdiv,
  cexp,
  cisZero,
  cmul,
  cneg,
  cnear,
  cpow,
  cscale,
  csub,
  cx,
  ONE,
  ZERO,
} from "../math/complex";

export interface ExpGroup {
  rate: C;
  poly: C[];
}

export type ExpPoly = ExpGroup[];

/** Rates closer than this are the same rate. */
const RATE_TOL = 1e-10;

/** Sum of two coefficients, snapping exact cancellation (up to rounding) to zero. */
export function addCoef(a: C, b: C): C {
  const s = cadd(a, b);
  const scale = Math.max(cabs(a), cabs(b));
  const re = Math.abs(s.re) <= 1e-12 * scale ? 0 : s.re;
  const im = Math.abs(s.im) <= 1e-12 * scale ? 0 : s.im;
  return re === s.re && im === s.im ? s : cx(re, im);
}

const isZeroCoef = (c: C) => c.re === 0 && c.im === 0;

function trimPoly(p: C[]): C[] {
  let n = p.length;
  while (n > 0 && isZeroCoef(p[n - 1])) n--;
  return n === p.length ? p : p.slice(0, n);
}

export function sameRate(a: C, b: C): boolean {
  return cnear(a, b, RATE_TOL);
}

/** Merge groups with equal rates and drop zero groups. */
export function epNormalize(groups: ExpPoly): ExpPoly {
  const out: ExpGroup[] = [];
  for (const g of groups) {
    const poly = trimPoly(g.poly);
    if (poly.length === 0) continue;
    const existing = out.find((o) => sameRate(o.rate, g.rate));
    if (existing) {
      const merged: C[] = [];
      for (let i = 0; i < Math.max(existing.poly.length, poly.length); i++) {
        merged.push(addCoef(existing.poly[i] ?? ZERO, poly[i] ?? ZERO));
      }
      existing.poly = trimPoly(merged);
    } else {
      out.push({ rate: g.rate, poly: poly.slice() });
    }
  }
  return out.filter((g) => g.poly.length > 0).sort((a, b) => a.rate.re - b.rate.re || a.rate.im - b.rate.im);
}

export const epZero = (): ExpPoly => [];
export const epConst = (c: C | number): ExpPoly => {
  const v = typeof c === "number" ? cx(c) : c;
  return isZeroCoef(v) ? [] : [{ rate: ZERO, poly: [v] }];
};
/** The polynomial t (or c·t). */
export const epVar = (c: C = ONE): ExpPoly => [{ rate: ZERO, poly: [ZERO, c] }];
/** coef·e^{rate·t}. */
export const epExp = (rate: C, coef: C = ONE): ExpPoly => (isZeroCoef(coef) ? [] : [{ rate, poly: [coef] }]);
/** A polynomial in t (coefficients lowest power first). */
export const epPoly = (poly: C[]): ExpPoly => epNormalize([{ rate: ZERO, poly }]);

export function epAdd(a: ExpPoly, b: ExpPoly): ExpPoly {
  return epNormalize([...a, ...b]);
}

export function epScale(a: ExpPoly, k: C | number): ExpPoly {
  const c = typeof k === "number" ? cx(k) : k;
  if (isZeroCoef(c)) return [];
  return epNormalize(a.map((g) => ({ rate: g.rate, poly: g.poly.map((p) => cmul(p, c)) })));
}

export const epNeg = (a: ExpPoly): ExpPoly => epScale(a, -1);
export const epSub = (a: ExpPoly, b: ExpPoly): ExpPoly => epAdd(a, epNeg(b));

function polyMul(a: C[], b: C[]): C[] {
  const out: C[] = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  for (let i = 0; i < a.length; i++) {
    if (isZeroCoef(a[i])) continue;
    for (let k = 0; k < b.length; k++) out[i + k] = addCoef(out[i + k], cmul(a[i], b[k]));
  }
  return out;
}

export function epMul(a: ExpPoly, b: ExpPoly): ExpPoly {
  const out: ExpGroup[] = [];
  for (const ga of a) for (const gb of b) out.push({ rate: cadd(ga.rate, gb.rate), poly: polyMul(ga.poly, gb.poly) });
  return epNormalize(out);
}

export function epPow(a: ExpPoly, n: number): ExpPoly {
  let out = epConst(1);
  for (let i = 0; i < n; i++) out = epMul(out, a);
  return out;
}

const binomials: number[][] = [[1]];
export function binom(n: number, k: number): number {
  while (binomials.length <= n) {
    const prev = binomials[binomials.length - 1];
    const row = [1];
    for (let i = 1; i < prev.length; i++) row.push(prev[i - 1] + prev[i]);
    row.push(1);
    binomials.push(row);
  }
  return binomials[n][k] ?? 0;
}

/** Coefficients of P(a·t + b) for a polynomial P. */
export function polyCompose(p: C[], a: C | number, b: C | number): C[] {
  const ac = typeof a === "number" ? cx(a) : a;
  const bc = typeof b === "number" ? cx(b) : b;
  const out: C[] = Array.from({ length: p.length }, () => ZERO);
  for (let k = 0; k < p.length; k++) {
    if (isZeroCoef(p[k])) continue;
    // (a t + b)^k = Σ_i C(k,i) a^i b^(k-i) t^i
    for (let i = 0; i <= k; i++) {
      const term = cmul(p[k], cmul(cscale(cpow(ac, i), binom(k, i)), cpow(bc, k - i)));
      out[i] = addCoef(out[i], term);
    }
  }
  return trimPoly(out);
}

/** E(a·t + b), with a and b real. */
export function epCompose(e: ExpPoly, a: number, b: number): ExpPoly {
  return epNormalize(
    e.map((g) => {
      // e^{λ(a t + b)} = e^{λ b} · e^{(λ a) t}
      const k = cexp(cscale(g.rate, b));
      return { rate: cscale(g.rate, a), poly: polyCompose(g.poly, a, b).map((c) => cmul(c, k)) };
    }),
  );
}

/** d/dt [P(t) e^{λt}] = (P' + λP) e^{λt}. */
export function epDeriv(e: ExpPoly): ExpPoly {
  return epNormalize(
    e.map((g) => {
      const poly: C[] = [];
      for (let i = 0; i < g.poly.length; i++) {
        const fromDeriv = i + 1 < g.poly.length ? cscale(g.poly[i + 1], i + 1) : ZERO;
        poly.push(addCoef(fromDeriv, cmul(g.rate, g.poly[i])));
      }
      return { rate: g.rate, poly };
    }),
  );
}

export function epEval(e: ExpPoly, t: number): C {
  let acc = ZERO;
  for (const g of e) {
    let p = ZERO;
    for (let i = g.poly.length - 1; i >= 0; i--) p = cadd(cscale(p, t), g.poly[i]);
    acc = cadd(acc, cmul(p, cexp(cscale(g.rate, t))));
  }
  return acc;
}

/** k-th derivative evaluated at t. */
export function epDerivAt(e: ExpPoly, t: number, k: number): C {
  let d = e;
  for (let i = 0; i < k; i++) d = epDeriv(d);
  return epEval(d, t);
}

export const epIsZero = (e: ExpPoly): boolean => e.every((g) => g.poly.every((c) => cisZero(c, 0)));

export function epConj(e: ExpPoly): ExpPoly {
  return epNormalize(e.map((g) => ({ rate: cconj(g.rate), poly: g.poly.map(cconj) })));
}

/** Structural equality within tolerance (relative to the coefficients' size). */
export function epNear(a: ExpPoly, b: ExpPoly, tol = 1e-9): boolean {
  const all = [...a, ...b];
  const scale = Math.max(1e-300, ...all.flatMap((g) => g.poly.map(cabs)));
  const diff = epNormalize([...a, ...b.map((g) => ({ rate: g.rate, poly: g.poly.map(cneg) }))]);
  return diff.every((g) => g.poly.every((c) => cabs(c) <= tol * scale));
}

/** True when every rate is 0 (a plain polynomial). */
export const epIsPoly = (e: ExpPoly): boolean => e.every((g) => cisZero(g.rate, 1e-14));

/** The polynomial coefficients when e is a plain polynomial, else null. */
export function epAsPoly(e: ExpPoly): C[] | null {
  if (!epIsPoly(e)) return null;
  return e[0]?.poly ?? [];
}

/** Highest polynomial degree across groups (-1 for zero). */
export const epDegree = (e: ExpPoly): number => Math.max(-1, ...e.map((g) => g.poly.length - 1));

const factorials: number[] = [1];
export function factorial(n: number): number {
  while (factorials.length <= n) factorials.push(factorials[factorials.length - 1] * factorials.length);
  return factorials[n];
}

/**
 * Antiderivative of t^n e^{γt} as an exp-polynomial:
 *   γ = 0:  t^{n+1}/(n+1)
 *   γ ≠ 0:  e^{γt} Σ_{i=0..n} (-1)^i n!/(n-i)! t^{n-i} / γ^{i+1}
 */
export function antiderivTerm(n: number, gamma: C): ExpPoly {
  if (cisZero(gamma, 1e-14)) {
    const poly: C[] = Array.from({ length: n + 2 }, () => ZERO);
    poly[n + 1] = cx(1 / (n + 1));
    return [{ rate: ZERO, poly }];
  }
  const poly: C[] = Array.from({ length: n + 1 }, () => ZERO);
  for (let i = 0; i <= n; i++) {
    const coef = ((i % 2 === 0 ? 1 : -1) * factorial(n)) / factorial(n - i);
    poly[n - i] = cdiv(cx(coef), cpow(gamma, i + 1));
  }
  return [{ rate: gamma, poly }];
}

/** An antiderivative of the whole exp-polynomial. */
export function epAntideriv(e: ExpPoly): ExpPoly {
  const parts: ExpGroup[] = [];
  for (const g of e) {
    g.poly.forEach((c, n) => {
      if (isZeroCoef(c)) return;
      for (const a of antiderivTerm(n, g.rate)) parts.push({ rate: a.rate, poly: a.poly.map((p) => cmul(p, c)) });
    });
  }
  return epNormalize(parts);
}

/**
 * Limit of e(t) as t → ±∞: 0 when every term decays, NaN when any term grows or keeps
 * oscillating (the integral that produced it diverges).
 */
export function epLimit(e: ExpPoly, dir: 1 | -1): C {
  for (const g of e) {
    if (g.poly.length === 0) continue;
    const re = g.rate.re * dir;
    if (re >= -1e-14) return cx(NaN, NaN);
  }
  return ZERO;
}

/** ∫_a^b t^n e^{γt} dt for finite a, b, accurate also when γ·(b-a) is tiny. */
function termIntegral(n: number, gamma: C, a: number, b: number): C {
  const m = Math.max(Math.abs(a), Math.abs(b));
  if (cabs(gamma) * m < 0.5) {
    // Σ_k γ^k/k! ∫ t^{n+k} dt — no cancellation for small γ.
    let acc = ZERO;
    let gk = ONE;
    for (let k = 0; k < 60; k++) {
      const p = n + k + 1;
      const term = cscale(gk, (Math.pow(b, p) - Math.pow(a, p)) / (p * factorial(k)));
      acc = cadd(acc, term);
      if (k > 2 && cabs(term) < 1e-17 * Math.max(1e-300, cabs(acc))) break;
      gk = cmul(gk, gamma);
    }
    return acc;
  }
  const F = antiderivTerm(n, gamma);
  return csub(epEval(F, b), epEval(F, a));
}

/** ∫_a^b e(t) dt. Bounds may be infinite; returns NaN when the integral diverges. */
export function epIntegral(e: ExpPoly, a: number, b: number): C {
  if (a === b) return ZERO;
  let acc = ZERO;
  for (const g of e) {
    for (let n = 0; n < g.poly.length; n++) {
      const c = g.poly[n];
      if (isZeroCoef(c)) continue;
      let v: C;
      if (Number.isFinite(a) && Number.isFinite(b)) {
        v = termIntegral(n, g.rate, a, b);
      } else {
        const F = antiderivTerm(n, g.rate);
        const fb = Number.isFinite(b) ? epEval(F, b) : epLimit(F, 1);
        const fa = Number.isFinite(a) ? epEval(F, a) : epLimit(F, -1);
        v = csub(fb, fa);
      }
      acc = cadd(acc, cmul(c, v));
    }
  }
  return acc;
}

/** Largest |coefficient| — a scale for tolerances. */
export const epScaleOf = (e: ExpPoly): number => Math.max(0, ...e.flatMap((g) => g.poly.map(cabs)));

/*
 * Polynomials with complex coefficients, lowest power first: [a0, a1, a2] = a0 + a1·z + a2·z².
 * Root finding is Aberth–Ehrlich with Newton polishing; repeated roots are recovered by
 * clustering, since a root of multiplicity m spreads into a small ring of m numeric roots.
 */

import {
  type C,
  cabs,
  cadd,
  cdiv,
  cisZero,
  cmul,
  cneg,
  cscale,
  csub,
  cx,
  ONE,
  ZERO,
} from "./complex";

export type Poly = C[];

export interface Root {
  p: C;
  mult: number;
}

/** Drop high-order coefficients that are zero relative to the largest one. */
export function ptrim(p: Poly, tol = 1e-13): Poly {
  const scale = Math.max(0, ...p.map(cabs));
  let n = p.length;
  while (n > 0 && cabs(p[n - 1]) <= tol * scale) n--;
  return p.slice(0, n);
}

export const pdegree = (p: Poly): number => ptrim(p).length - 1;

export function padd(a: Poly, b: Poly): Poly {
  const out: Poly = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(cadd(a[i] ?? ZERO, b[i] ?? ZERO));
  return out;
}

export const pscale = (a: Poly, k: C): Poly => a.map((c) => cmul(c, k));
export const psub = (a: Poly, b: Poly): Poly => padd(a, b.map(cneg));

export function pmul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return [];
  const out: Poly = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  for (let i = 0; i < a.length; i++) {
    if (a[i].re === 0 && a[i].im === 0) continue;
    for (let k = 0; k < b.length; k++) out[i + k] = cadd(out[i + k], cmul(a[i], b[k]));
  }
  return out;
}

export function ppow(a: Poly, n: number): Poly {
  let out: Poly = [ONE];
  for (let i = 0; i < n; i++) out = pmul(out, a);
  return out;
}

/** Horner evaluation. */
export function peval(p: Poly, z: C): C {
  let acc = ZERO;
  for (let i = p.length - 1; i >= 0; i--) acc = cadd(cmul(acc, z), p[i]);
  return acc;
}

export function pderiv(p: Poly): Poly {
  return p.slice(1).map((c, i) => cscale(c, i + 1));
}

/** Long division: n = q·d + r with deg r < deg d. */
export function pdivmod(n: Poly, d: Poly): { q: Poly; r: Poly } {
  const den = ptrim(d);
  if (den.length === 0) throw new Error("Division by the zero polynomial");
  const r = ptrim(n).slice();
  const dn = den.length - 1;
  if (r.length - 1 < dn) return { q: [], r };
  const q: Poly = Array.from({ length: r.length - dn }, () => ZERO);
  const lead = den[dn];
  for (let k = r.length - 1; k >= dn; k--) {
    const coef = cdiv(r[k], lead);
    q[k - dn] = coef;
    for (let i = 0; i <= dn; i++) r[k - dn + i] = csub(r[k - dn + i], cmul(coef, den[i]));
  }
  return { q, r: ptrim(r.slice(0, dn)) };
}

export function pfromRoots(roots: C[]): Poly {
  let out: Poly = [ONE];
  for (const z of roots) out = pmul(out, [cneg(z), ONE]);
  return out;
}

export function pfromRootList(roots: Root[]): Poly {
  return pfromRoots(roots.flatMap((r) => Array.from({ length: r.mult }, () => r.p)));
}

/**
 * Coefficients of p(z0 + h) as a polynomial in h, up to `order` (inclusive):
 * c_k = p^(k)(z0) / k!. Computed by repeated synthetic division.
 */
export function ptaylor(p: Poly, z0: C, order = p.length - 1): C[] {
  const a = p.slice();
  const out: C[] = [];
  const n = a.length - 1;
  for (let k = 0; k <= Math.min(order, n); k++) {
    // Synthetic division of a[k..n] by (z - z0); the remainder lands in a[k].
    for (let i = n - 1; i >= k; i--) a[i] = cadd(a[i], cmul(z0, a[i + 1]));
    out.push(a[k]);
  }
  while (out.length <= order) out.push(ZERO);
  return out;
}

/** First n coefficients of the power series a(h) / b(h); b[0] must be non-zero. */
export function seriesDiv(a: C[], b: C[], n: number): C[] {
  const out: C[] = [];
  for (let k = 0; k < n; k++) {
    let acc = a[k] ?? ZERO;
    for (let i = 1; i <= k; i++) acc = csub(acc, cmul(b[i] ?? ZERO, out[k - i]));
    out.push(cdiv(acc, b[0]));
  }
  return out;
}

/** All roots of p (with repetition), by Aberth–Ehrlich iteration. */
export function proots(poly: Poly): C[] {
  let p = ptrim(poly);
  const roots: C[] = [];
  // Exact zero roots first: they would otherwise be found only approximately.
  while (p.length > 1 && cisZero(p[0], 0)) {
    roots.push(ZERO);
    p = p.slice(1);
  }
  const n = p.length - 1;
  if (n <= 0) return roots;
  if (n === 1) return [...roots, cneg(cdiv(p[0], p[1]))];

  // Monic, then start on a circle sized by the Cauchy bound (offset to break symmetry).
  const monic = p.map((c) => cdiv(c, p[n]));
  const radius = 1 + Math.max(...monic.slice(0, n).map(cabs));
  const dp = pderiv(monic);
  let z: C[] = Array.from({ length: n }, (_, k) => {
    const angle = (2 * Math.PI * k) / n + 0.4;
    const r = Math.min(radius, Math.max(0.5, Math.pow(cabs(monic[0]), 1 / n)));
    return cx(r * Math.cos(angle), r * Math.sin(angle));
  });

  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    const next = z.slice();
    for (let k = 0; k < n; k++) {
      const pv = peval(monic, z[k]);
      if (cisZero(pv, 0)) continue;
      const ratio = cdiv(pv, peval(dp, z[k]));
      let sum = ZERO;
      for (let j = 0; j < n; j++) if (j !== k) sum = cadd(sum, cdiv(ONE, csub(z[k], z[j])));
      const step = cdiv(ratio, csub(ONE, cmul(ratio, sum)));
      if (!Number.isFinite(step.re) || !Number.isFinite(step.im)) continue;
      next[k] = csub(z[k], step);
      moved = Math.max(moved, cabs(step) / Math.max(1, cabs(z[k])));
    }
    z = next;
    if (moved < 1e-15) break;
  }
  return [...roots, ...z];
}

/**
 * Group numeric roots that are the same root counted several times. The cluster's mean is
 * far more accurate than its members (their errors cancel around the true root).
 */
export function clusterRoots(roots: C[], tol = 2e-4): Root[] {
  const left = roots.slice();
  const out: Root[] = [];
  while (left.length) {
    const seed = left.shift()!;
    const members = [seed];
    for (let i = left.length - 1; i >= 0; i--) {
      if (cabs(csub(left[i], seed)) <= tol * Math.max(1, cabs(seed))) members.push(...left.splice(i, 1));
    }
    let sum = ZERO;
    for (const m of members) sum = cadd(sum, m);
    out.push({ p: cscale(sum, 1 / members.length), mult: members.length });
  }
  return out;
}

/** Roots with multiplicities, with tiny real/imaginary parts snapped to zero. */
export function findRoots(p: Poly): Root[] {
  return clusterRoots(proots(p)).map((r) => ({ p: snapRoot(refineMultiple(p, r)), mult: r.mult }));
}

/**
 * A root of multiplicity m is a simple root of p^(m-1), where Newton converges fast;
 * on p itself Aberth only crawls towards it.
 */
function refineMultiple(p: Poly, r: Root): C {
  if (r.mult === 1) return r.p;
  let d = p;
  for (let i = 0; i < r.mult - 1; i++) d = pderiv(d);
  const dd = pderiv(d);
  let z = r.p;
  for (let i = 0; i < 20; i++) {
    const step = cdiv(peval(d, z), peval(dd, z));
    if (!Number.isFinite(step.re) || !Number.isFinite(step.im)) break;
    z = csub(z, step);
    if (cabs(step) < 1e-16 * Math.max(1, cabs(z))) break;
  }
  return cabs(csub(z, r.p)) < 1e-3 * Math.max(1, cabs(r.p)) ? z : r.p;
}

function snapRoot(z: C): C {
  const scale = Math.max(1, cabs(z));
  let { re, im } = z;
  if (Math.abs(im) < 1e-9 * scale) im = 0;
  if (Math.abs(re) < 1e-9 * scale) re = 0;
  // Values that are within rounding of a short decimal are almost always exactly that.
  const snap = (v: number) => {
    const r = Math.round(v * 1e6) / 1e6;
    return Math.abs(r - v) < 1e-9 * Math.max(1, Math.abs(v)) ? r : v;
  };
  return cx(snap(re), snap(im));
}

/** True when every coefficient is real (within tolerance). */
export function pisReal(p: Poly, tol = 1e-10): boolean {
  const scale = Math.max(1, ...p.map(cabs));
  return p.every((c) => Math.abs(c.im) <= tol * scale);
}

/*
 * s-domain expressions: Σ_groups e^{−s·delay}·( Σ_k poly[k]·s^k + Σ_poles Σ_m c_m/(s − p)^m ).
 * Every Laplace transform of an exact signal has this form (delays come from piece ends,
 * poles from the tails' exponents), and so does every rational X(s) with e^{−sT} factors.
 */

import {
  type C,
  cabs,
  cadd,
  cdiv,
  cexp,
  cisZero,
  cmul,
  cpow,
  cscale,
  csub,
  ONE,
  ZERO,
} from "../math/complex";
import { complexity, nice, niceC } from "../math/nice";
import {
  findRoots,
  padd,
  pdivmod,
  peval,
  pfromRootList,
  pmul,
  type Poly,
  ptaylor,
  ptrim,
  type Root,
  seriesDiv,
} from "../math/poly";
import { addCoef } from "../signal/exppoly";
import { samePoint } from "../signal/signal";

export interface PoleFrac {
  pole: C;
  /** coefs[m − 1] multiplies 1/(s − pole)^m. */
  coefs: C[];
}

export interface DelayGroup {
  delay: number;
  /** Entire part Σ poly[k] s^k (from impulses and their derivatives). */
  poly: C[];
  fracs: PoleFrac[];
}

export type SExpr = DelayGroup[];

/** Strip lo < Re{s} < hi (bounds may be infinite). */
export interface Strip {
  lo: number;
  hi: number;
}

const POLE_TOL = 1e-9;
export const samePole = (a: C, b: C) => cabs(csub(a, b)) <= POLE_TOL * Math.max(1, cabs(a), cabs(b));

function addInto(arr: C[], i: number, v: C) {
  while (arr.length <= i) arr.push(ZERO);
  arr[i] = addCoef(arr[i], v);
}

const trim = (p: C[]) => {
  let n = p.length;
  while (n > 0 && cisZero(p[n - 1], 0)) n--;
  return p.slice(0, n);
};

/** Merge equal delays and equal poles; drop zero terms. */
export function sexprNormalize(X: SExpr): SExpr {
  const out: DelayGroup[] = [];
  for (const g of X) {
    let target = out.find((o) => samePoint(o.delay, g.delay));
    if (!target) {
      target = { delay: g.delay, poly: [], fracs: [] };
      out.push(target);
    }
    g.poly.forEach((c, k) => addInto(target.poly, k, c));
    for (const f of g.fracs) {
      let tf = target.fracs.find((x) => samePole(x.pole, f.pole));
      if (!tf) {
        tf = { pole: f.pole, coefs: [] };
        target.fracs.push(tf);
      }
      f.coefs.forEach((c, m) => addInto(tf.coefs, m, c));
    }
  }
  for (const g of out) {
    g.poly = trim(g.poly.map((c) => snapTiny(c, g.poly)));
    g.fracs = g.fracs.map((f) => ({ pole: f.pole, coefs: trim(f.coefs) })).filter((f) => f.coefs.length > 0);
    g.fracs.sort((a, b) => a.pole.re - b.pole.re || a.pole.im - b.pole.im);
  }
  return out.filter((g) => g.poly.length || g.fracs.length).sort((a, b) => a.delay - b.delay);
}

function snapTiny(c: C, all: C[]): C {
  const scale = Math.max(...all.map(cabs));
  return cabs(c) <= 1e-13 * scale ? ZERO : c;
}

export function sexprEval(X: SExpr, s: C): C {
  let acc = ZERO;
  for (const g of X) {
    let v = peval(g.poly, s);
    for (const f of g.fracs) {
      const d = csub(s, f.pole);
      let dm = ONE;
      for (const c of f.coefs) {
        dm = cmul(dm, d);
        v = cadd(v, cdiv(c, dm));
      }
    }
    acc = cadd(acc, cmul(cexp(cscale(s, -g.delay)), v));
  }
  return acc;
}

/** All poles of the expression (highest multiplicity per pole). */
export function sexprPoles(X: SExpr): Root[] {
  const out: Root[] = [];
  for (const g of X) {
    for (const f of g.fracs) {
      const m = f.coefs.length;
      const e = out.find((r) => samePole(r.p, f.pole));
      if (e) e.mult = Math.max(e.mult, m);
      else out.push({ p: f.pole, mult: m });
    }
  }
  return out.sort((a, b) => a.p.re - b.p.re || a.p.im - b.p.im);
}

/** The group as one rational function num/den with a monic denominator Π(s − p)^m. */
export function groupRational(g: DelayGroup): { num: Poly; den: Poly } {
  const roots: Root[] = g.fracs.map((f) => ({ p: f.pole, mult: f.coefs.length }));
  const den = pfromRootList(roots);
  let num = pmul(g.poly, den);
  for (const f of g.fracs) {
    f.coefs.forEach((c, i) => {
      const m = i + 1;
      // den / (s − p)^m = Π_others · (s − p)^(M − m)
      const rest = pfromRootList([...roots.filter((r) => !samePole(r.p, f.pole)), { p: f.pole, mult: f.coefs.length - m }]);
      num = padd(num, rest.map((x) => cmul(x, c)));
    });
  }
  return { num: ptrim(num), den };
}

/**
 * Partial fractions of num/den. Poles may be given (exact, known multiplicities);
 * otherwise they are found numerically from den.
 */
export function partialFractions(num: Poly, den: Poly, known?: Root[]): { poly: C[]; fracs: PoleFrac[] } {
  const d = ptrim(den);
  const lead = d[d.length - 1];
  const { q, r } = pdivmod(num, d);
  const roots = known ?? findRoots(d);
  const fracs: PoleFrac[] = [];
  for (const root of roots) {
    const m = root.mult;
    // G(s) = r(s) / (lead · Π_{others}(s − q)^k), expanded around p.
    const others = pfromRootList(roots.filter((x) => x !== root)).map((c) => cmul(c, lead));
    const G = seriesDiv(ptaylor(r, root.p, m - 1), ptaylor(others, root.p, m - 1), m);
    // r/den = Σ_k G_k (s − p)^(k − m): coefficient of 1/(s−p)^(m−k) is G_k.
    const coefs: C[] = Array.from({ length: m }, () => ZERO);
    for (let k = 0; k < m; k++) coefs[m - k - 1] = G[k];
    fracs.push({ pole: root.p, coefs: cleanCoefs(coefs) });
  }
  return { poly: trim(q), fracs };
}

function cleanCoefs(cs: C[]): C[] {
  const scale = Math.max(1e-300, ...cs.map(cabs));
  return cs.map((c) => ({
    re: Math.abs(c.re) < 1e-12 * scale ? 0 : c.re,
    im: Math.abs(c.im) < 1e-12 * scale ? 0 : c.im,
  }));
}

/** e^{−sT}·num/den as an s-expression. */
export function sexprFromRational(num: Poly, den: Poly, delay = 0, known?: Root[]): SExpr {
  const pf = partialFractions(num, den, known);
  return sexprNormalize([{ delay, poly: pf.poly, fracs: pf.fracs }]);
}

/** Product of two s-expressions (Y = X·H); poles are known exactly, so no root finding. */
export function sexprMul(A: SExpr, B: SExpr): SExpr {
  const out: DelayGroup[] = [];
  for (const a of A) {
    for (const b of B) {
      const ra = groupRational(a);
      const rb = groupRational(b);
      const roots: Root[] = [];
      for (const f of [...a.fracs, ...b.fracs]) {
        const e = roots.find((r) => samePole(r.p, f.pole));
        if (e) e.mult += f.coefs.length;
        else roots.push({ p: f.pole, mult: f.coefs.length });
      }
      const pf = partialFractions(pmul(ra.num, rb.num), pmul(ra.den, rb.den), roots);
      out.push({ delay: a.delay + b.delay, poly: pf.poly, fracs: pf.fracs });
    }
  }
  return sexprNormalize(out);
}

export function sexprScale(X: SExpr, k: C): SExpr {
  return X.map((g) => ({
    delay: g.delay,
    poly: g.poly.map((c) => cmul(c, k)),
    fracs: g.fracs.map((f) => ({ pole: f.pole, coefs: f.coefs.map((c) => cmul(c, k)) })),
  }));
}

// ---------------------------------------------------------------------------
// LaTeX

const realish = (c: C) => Math.abs(c.im) <= 1e-9 * Math.max(1, cabs(c));

/** A real polynomial in v, highest power first. `v` is "s" or "j\\omega". */
export function texPoly(p: number[], v: string): string {
  const parts: string[] = [];
  const base = v.length > 1 ? `(${v})` : v;
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (Math.abs(c) < 1e-12) continue;
    const n = nice(Math.abs(c));
    const pow = k === 0 ? "" : k === 1 ? v : `${base}^{${k}}`;
    const coef = k === 0 ? n.tex : Math.abs(Math.abs(c) - 1) < 1e-12 ? "" : n.tex;
    const term = `${coef}${pow}`;
    parts.push(parts.length === 0 ? (c < 0 ? `-${term}` : term) : `${c < 0 ? "-" : "+"}${term}`);
  }
  return parts.join("") || "0";
}

/** s − p formatted: s+2, s-1, s+1-2j; with v = jω: j\omega+2. */
export function texSMinus(p: C, v = "s"): string {
  const terms = [v];
  const re = -p.re;
  const im = -p.im;
  if (Math.abs(re) > 1e-12) terms.push(`${re < 0 ? "-" : "+"}${nice(Math.abs(re)).tex}`);
  if (Math.abs(im) > 1e-12) {
    const n = nice(Math.abs(im));
    const j = n.tex === "1" ? "j" : n.den ? `\\frac{${n.num}j}{${n.den}}` : `${n.tex}j`;
    terms.push(`${im < 0 ? "-" : "+"}${j}`);
  }
  return terms.join("");
}

interface Factor {
  /** Real polynomial factor (monic), linear or an irreducible quadratic. */
  poly: number[];
  mult: number;
}

/** Real factorization of Π(s − p)^m: real roots stay linear, conjugate pairs pair up. */
function realFactors(roots: Root[]): Factor[] | null {
  const out: Factor[] = [];
  const used = new Set<number>();
  roots.forEach((r, i) => {
    if (used.has(i)) return;
    used.add(i);
    if (Math.abs(r.p.im) < 1e-12) {
      out.push({ poly: [-r.p.re, 1], mult: r.mult });
      return;
    }
    const j = roots.findIndex((q, k) => !used.has(k) && samePole(q.p, { re: r.p.re, im: -r.p.im }));
    if (j < 0) return;
    used.add(j);
    // (s − p)(s − p̄) = s² − 2Re(p)s + |p|²
    out.push({ poly: [r.p.re * r.p.re + r.p.im * r.p.im, -2 * r.p.re, 1], mult: r.mult });
  });
  const covered = out.reduce((n, f) => n + (f.poly.length - 1) * f.mult, 0);
  const total = roots.reduce((n, r) => n + r.mult, 0);
  return covered === total ? out : null;
}

function texFactors(factors: Factor[], v: string): string {
  const single = factors.length === 1 && factors[0].mult === 1;
  return factors
    .sort((a, b) => a.poly.length - b.poly.length || a.poly[0] - b.poly[0])
    .map((f) => {
      const inner = texPoly(f.poly, v);
      const needParens = !single || f.mult > 1;
      const body = needParens && (f.poly.length > 2 || inner !== v) ? `\\left(${inner}\\right)` : inner;
      return f.mult > 1 ? `${body}^{${f.mult}}` : body;
    })
    .join("");
}

/** e^{-sT} (or e^{-j\omega T}) with a nice T. */
function texDelay(T: number, v: string): string {
  if (Math.abs(T) < 1e-12) return "";
  const n = nice(Math.abs(T));
  const sign = T > 0 ? "-" : "";
  const coef = n.tex === "1" ? "" : n.den ? `\\frac{${n.num}}{${n.den}}` : n.tex;
  if (v === "s") return `e^{${sign}${coef}s}`;
  return `e^{${sign}j${coef}\\omega}`;
}

interface NumTerm {
  coef: C;
  delay: number;
  poly: C[];
}

/** A numerator term (polynomial × delay) as LaTeX with a sign. */
function texNumTerm(t: NumTerm, v: string, poles: Root[]): { sign: 1 | -1; body: string } {
  const p = trim(t.poly);
  const allReal = p.every(realish);
  const delay = texDelay(t.delay, v);
  if (p.length === 1 && allReal) {
    const c = p[0].re;
    const sign: 1 | -1 = c < 0 ? -1 : 1;
    const a = Math.abs(c);
    // e^{-(s+1)} reads better than e^{-1}e^{-s}: absorb a pole's e^{λT} when that makes the coefficient simpler.
    if (t.delay !== 0 && v === "s") {
      for (const r of poles) {
        if (Math.abs(r.p.im) > 1e-12 || Math.abs(r.p.re) < 1e-12) continue;
        const k = a / Math.exp(r.p.re * t.delay);
        if (complexity(k) + 2 < complexity(a)) {
          const n = nice(k);
          const shift = texSMinus(r.p, "s");
          const T = nice(Math.abs(t.delay));
          const arg = T.tex === "1" ? `(${shift})` : `${T.tex}(${shift})`;
          const e = `e^{${t.delay > 0 ? "-" : ""}${arg}}`;
          return { sign, body: n.tex === "1" ? e : `${n.tex}${e}` };
        }
      }
    }
    const n = nice(a);
    if (!delay) return { sign, body: n.tex };
    return { sign, body: n.tex === "1" ? delay : `${n.tex}${delay}` };
  }
  if (allReal) {
    const terms = p.map((c) => c.re);
    // Pull out an overall sign when the leading coefficient is negative.
    const lead = terms[terms.length - 1];
    const sign: 1 | -1 = lead < 0 ? -1 : 1;
    const inner = texPoly(terms.map((c) => c * sign), v);
    const monomial = terms.filter((c) => Math.abs(c) > 1e-12).length === 1;
    if (!delay) return { sign, body: inner };
    return { sign, body: monomial ? `${inner}${delay}` : `\\left(${inner}\\right)${delay}` };
  }
  // Complex coefficients: write them out.
  const parts = p
    .map((c, k) => (cisZero(c, 1e-14) ? null : `\\left(${niceC(c).tex}\\right)${k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`}`))
    .filter(Boolean);
  return { sign: 1, body: `${parts.length > 1 ? `\\left(${parts.join("+")}\\right)` : parts[0]}${delay}` };
}

function joinSigned(terms: { sign: 1 | -1; body: string }[]): string {
  if (!terms.length) return "0";
  const firstPos = terms.findIndex((t) => t.sign > 0);
  const ordered = terms[0].sign < 0 && firstPos > 0 ? [terms[firstPos], ...terms.filter((_, i) => i !== firstPos)] : terms;
  return ordered.map((t, i) => (i === 0 ? (t.sign < 0 ? `-${t.body}` : t.body) : `${t.sign < 0 ? "-" : "+"}${t.body}`)).join("");
}

/**
 * X as one fraction: [Σ_T e^{−sT}·N_T(s)] / D(s), with D the real-factored common
 * denominator. In jω form, e^{±jωa} pairs become cosines and sines.
 */
export function texSExpr(X: SExpr, mode: "s" | "jw" = "s"): string {
  const v = mode === "s" ? "s" : "j\\omega";
  if (X.length === 0) return "0";
  const poles = sexprPoles(X);
  // Common denominator Π(s − p)^M.
  const den = pfromRootList(poles);
  const terms: NumTerm[] = X.map((g) => {
    const { num, den: d } = groupRational(g);
    // num/d = num·(den/d)/den
    const { q } = pdivmod(den, d);
    return { coef: ONE, delay: g.delay, poly: ptrim(pmul(num, q)) };
  }).filter((t) => t.poly.length > 0);
  const factors = realFactors(poles);
  const denTex = poles.length === 0 ? "" : factors ? texFactors(factors, v) : `\\left(${texPolyC(den, v)}\\right)`;

  if (mode === "jw") {
    const trig = trigNumerator(terms, poles);
    if (trig) return trig.den ? `\\frac{${trig.num}}{${trig.den}}` : trig.num;
  }
  const numTex = joinSigned(terms.map((t) => texNumTerm(t, v, poles)));
  if (!denTex) return numTex;
  return `\\frac{${numTex}}{${denTex}}`;
}

function texPolyC(p: Poly, v: string): string {
  if (p.every(realish)) return texPoly(p.map((c) => c.re), v);
  return p
    .map((c, k) => (cisZero(c, 1e-14) ? null : `\\left(${niceC(c).tex}\\right)${k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`}`))
    .filter(Boolean)
    .reverse()
    .join("+");
}

/**
 * In jω form with a denominator that is a power of jω (or none) and constant numerators:
 * pair e^{−jωT} with e^{+jωT} into A cos(ωT) + B sin(ωT) and cancel the powers of j,
 * so rect gives 2 sin(ω/2)/ω.
 */
function trigNumerator(terms: NumTerm[], poles: Root[]): { num: string; den: string | null } | null {
  if (poles.length > 1) return null;
  if (poles.length === 1 && !cisZero(poles[0].p, 1e-12)) return null;
  const k = poles[0]?.mult ?? 0;
  if (!terms.every((t) => t.poly.length === 1)) return null;
  const byDelay = new Map<number, C>();
  for (const t of terms) byDelay.set(t.delay, cadd(byDelay.get(t.delay) ?? ZERO, t.poly[0]));
  const delays = [...byDelay.keys()];
  if (!delays.some((d) => d !== 0 && byDelay.has(-d))) return null;
  // Divide everything by j^k so the denominator becomes ω^k.
  const jk = cpow({ re: 0, im: 1 }, k);
  const out: { coef: C; kind: "1" | "cos" | "sin" | "exp"; T: number }[] = [];
  const done = new Set<number>();
  for (const d of delays.sort((a, b) => a - b)) {
    if (done.has(d)) continue;
    done.add(d);
    const c1 = cdiv(byDelay.get(d)!, jk);
    if (d === 0) {
      out.push({ coef: c1, kind: "1", T: 0 });
      continue;
    }
    if (byDelay.has(-d) && !done.has(-d)) {
      done.add(-d);
      // c1 e^{−jωT} + c2 e^{jωT} = (c1+c2) cos ωT + j(c2−c1) sin ωT, with T = |d|.
      const T = Math.abs(d);
      const cm = d > 0 ? c1 : cdiv(byDelay.get(-d)!, jk); // coefficient of e^{−jωT}
      const cp = d > 0 ? cdiv(byDelay.get(-d)!, jk) : c1; // coefficient of e^{+jωT}
      const A = cadd(cm, cp);
      const B = cmul({ re: 0, im: 1 }, csub(cp, cm));
      if (!cisZero(A, 1e-12)) out.push({ coef: A, kind: "cos", T });
      if (!cisZero(B, 1e-12)) out.push({ coef: B, kind: "sin", T });
    } else out.push({ coef: c1, kind: "exp", T: d });
  }
  if (!out.every((o) => realish(o.coef))) return null;
  const parts = out.map((o) => {
    const c = o.coef.re;
    const sign: 1 | -1 = c < 0 ? -1 : 1;
    const n = nice(Math.abs(c));
    const coef = o.kind !== "1" && n.tex === "1" ? "" : n.tex;
    const arg = (() => {
      const t = nice(o.T);
      if (t.tex === "1") return "\\omega";
      if (t.den) return `\\frac{${t.num === "1" ? "" : t.num}\\omega}{${t.den}}`;
      return `${t.tex}\\omega`;
    })();
    const body =
      o.kind === "1" ? n.tex : o.kind === "cos" ? `${coef}\\cos(${arg})` : o.kind === "sin" ? `${coef}\\sin(${arg})` : `${coef}${texDelay(o.T, "jw")}`;
    return { sign, body };
  });
  const num = joinSigned(parts);
  const den = k === 0 ? null : k === 1 ? "\\omega" : `\\omega^{${k}}`;
  return { num, den };
}

/** Partial-fraction form, group by group: e^{−sT}[ Σ c/(s−p)^m ]. */
export function texPartialFractions(X: SExpr, v = "s"): string {
  const groups = X.map((g) => {
    const terms: { sign: 1 | -1; body: string }[] = [];
    g.poly.forEach((c, k) => {
      if (cisZero(c, 1e-14)) return;
      const pow = k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`;
      terms.push(coefTerm(c, pow || "1"));
    });
    for (const f of g.fracs) {
      f.coefs.forEach((c, i) => {
        if (cisZero(c, 1e-14)) return;
        const m = i + 1;
        const d = texSMinus(f.pole, v);
        const den = m === 1 ? d : `(${d})^{${m}}`;
        terms.push(fracTerm(c, den));
      });
    }
    const body = joinSigned(terms);
    const delay = texDelay(g.delay, v === "s" ? "s" : "jw");
    if (!delay) return { sign: 1 as const, body };
    return { sign: 1 as const, body: terms.length > 1 ? `${delay}\\left[${body}\\right]` : `${delay}${body}` };
  });
  return joinSigned(groups);
}

function coefTerm(c: C, what: string): { sign: 1 | -1; body: string } {
  if (realish(c)) {
    const n = nice(Math.abs(c.re));
    const sign: 1 | -1 = c.re < 0 ? -1 : 1;
    if (what === "1") return { sign, body: n.tex };
    return { sign, body: n.tex === "1" ? what : `${n.tex}${what}` };
  }
  return { sign: 1, body: `\\left(${niceC(c).tex}\\right)${what === "1" ? "" : what}` };
}

function fracTerm(c: C, den: string): { sign: 1 | -1; body: string } {
  if (realish(c)) {
    const n = nice(Math.abs(c.re));
    const sign: 1 | -1 = c.re < 0 ? -1 : 1;
    if (n.den) return { sign, body: `\\frac{${n.num}}{${n.den}(${den})}` };
    return { sign, body: `\\frac{${n.tex}}{${den}}` };
  }
  return { sign: 1, body: `\\frac{${niceC(c).tex}}{${den}}` };
}

/** Region of convergence as LaTeX. */
export function texStrip(roc: Strip | null, v = "s"): string {
  if (!roc) return "\\text{none}";
  const re = `\\operatorname{Re}\\{${v}\\}`;
  const lo = Number.isFinite(roc.lo) ? nice(roc.lo).tex : null;
  const hi = Number.isFinite(roc.hi) ? nice(roc.hi).tex : null;
  if (lo === null && hi === null) return `\\text{all } ${v}`;
  if (hi === null) return `${re} > ${lo}`;
  if (lo === null) return `${re} < ${hi}`;
  return `${lo} < ${re} < ${hi}`;
}

/** Real polynomial coefficients when all are real (else null). */
export function realPoly(p: Poly): number[] | null {
  return p.every(realish) ? p.map((c) => c.re) : null;
}


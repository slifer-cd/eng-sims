/*
 * Z-transform, DTFT and inverse Z of exact sequences.
 *
 * A sequence term c·nᵏ·rⁿ on a right tail n ≥ a is summed with the binomial basis:
 * writing the polynomial in m = n − a as Σ βᵢ·C(m+i−1, i−1) gives
 *   Σ_{m≥0} C(m+i−1, i−1) wᵐ = 1/(1 − w)ⁱ,   w = r·z⁻¹,
 * so X(z) is a sum of terms coef·z^{−shift}/(1 − p·z⁻¹)^order (order 0: a plain power of z⁻¹).
 * Left tails sum the same way in z/r. The ROC is the annulus between the tails' |r|.
 */

import { type C, cabs, cadd, cdiv, cexp, cisZero, clog, cmul, cpow, cscale, csub, cx, ONE, ZERO } from "../math/complex";
import { nice, niceC } from "../math/nice";
import { findRoots, padd, pmul, type Poly, ppow, ptrim, type Root } from "../math/poly";
import { binom, epCompose, epEval, type ExpPoly, factorial, polyCompose } from "../signal/exppoly";
import { texCases, texStepForm } from "../signal/format";
import { type Signal, sigAdd, sigPiece, sigSplitAt, sigZero } from "../signal/signal";
import type { Step } from "../steps";
import { partialFractions, type SExpr } from "../transforms/sdomain";

export interface ZTerm {
  coef: C;
  /** Power of z⁻¹ (may be negative). */
  shift: number;
  pole: C | null;
  order: number;
}

export interface Annulus {
  rmin: number;
  rmax: number;
}

export interface ZResult {
  terms: ZTerm[];
  roc: Annulus | null;
  rocNote?: string;
  poles: Root[];
  zeros: Root[] | null;
  tex: string;
  steps: Step[];
  at(z: C): C;
}

const samePole = (a: C, b: C) => cabs(csub(a, b)) <= 1e-9 * Math.max(1, cabs(a));

/** β with Q(m) = Σ_{i=1}^{d+1} β_i·C(m+i−1, i−1), by solving at m = 0…d. */
export function binomialBasis(Q: C[]): C[] {
  const d = Q.length - 1;
  if (d < 0) return [];
  const n = d + 1;
  // A[m][i] = C(m + i, i) for i = 0…d (basis index i+1).
  const A: C[][] = [];
  const b: C[] = [];
  for (let m = 0; m < n; m++) {
    A.push(Array.from({ length: n }, (_, i) => cx(binom(m + i, i))));
    let v = ZERO;
    for (let k = d; k >= 0; k--) v = cadd(cscale(v, m), Q[k]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (cabs(A[r][col]) > cabs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = cdiv(A[r][col], A[col][col]);
      for (let k = col; k < n; k++) A[r][k] = csub(A[r][k], cmul(f, A[col][k]));
      b[r] = csub(b[r], cmul(f, b[col]));
    }
  }
  return b.map((v, i) => cdiv(v, A[i][i]));
}

/** Terms and ROC bound of one piece of a sequence. */
function pieceZ(from: number, to: number, expr: ExpPoly): { terms: ZTerm[]; rmin: number; rmax: number } {
  const terms: ZTerm[] = [];
  let rmin = 0;
  let rmax = Infinity;
  if (Number.isFinite(from) && Number.isFinite(to)) {
    if (to - from <= 64) {
      for (let n = from; n < to; n++) {
        const v = epEval(expr, n);
        if (!cisZero(v, 1e-14)) terms.push({ coef: v, shift: n, pole: null, order: 0 });
      }
      return { terms, rmin, rmax };
    }
    // Long finite piece: (right tail at from) − (right tail at to).
    const a = pieceZ(from, Infinity, expr);
    const b = pieceZ(to, Infinity, expr);
    return { terms: [...a.terms, ...b.terms.map((t) => ({ ...t, coef: cscale(t.coef, -1) }))], rmin, rmax };
  }
  for (const g of expr) {
    if (!g.poly.length) continue;
    const r = cexp(g.rate);
    if (to === Infinity) {
      const a = from;
      const Q = polyCompose(g.poly, 1, a); // P(m + a)
      const beta = binomialBasis(Q);
      const ra = cpow(r, a);
      beta.forEach((b, i) => {
        if (!cisZero(b, 1e-14)) terms.push({ coef: cmul(b, ra), shift: a, pole: r, order: i + 1 });
      });
      rmin = Math.max(rmin, cabs(r));
    } else {
      const b1 = to - 1;
      const Q = polyCompose(g.poly, -1, b1); // P(b − 1 − m)
      const beta = binomialBasis(Q);
      const rb = cpow(r, b1);
      beta.forEach((b, i) => {
        const k = i + 1;
        if (!cisZero(b, 1e-14)) terms.push({ coef: cscale(cmul(cmul(b, rb), cpow(r, k)), k % 2 === 0 ? 1 : -1), shift: b1 + k, pole: r, order: k });
      });
      rmax = Math.min(rmax, cabs(r));
    }
  }
  return { terms, rmin, rmax };
}

export function zEval(terms: ZTerm[], z: C): C {
  let acc = ZERO;
  const zi = cdiv(ONE, z);
  for (const t of terms) {
    let v = cmul(t.coef, cpow(zi, t.shift));
    if (t.pole && t.order) v = cdiv(v, cpow(csub(ONE, cmul(t.pole, zi)), t.order));
    acc = cadd(acc, v);
  }
  return acc;
}

/** Combine into one fraction in w = z⁻¹: Σ_k num[k]·w^(k + low) / Π(1 − p w)^M. */
export function zRational(terms: ZTerm[]): { low: number; num: Poly; poles: Root[] } {
  const poles: Root[] = [];
  for (const t of terms) {
    if (!t.pole || !t.order) continue;
    const e = poles.find((p) => samePole(p.p, t.pole!));
    if (e) e.mult = Math.max(e.mult, t.order);
    else poles.push({ p: t.pole, mult: t.order });
  }
  const low = Math.min(0, ...terms.map((t) => t.shift));
  let num: Poly = [];
  for (const t of terms) {
    let p: Poly = [...Array.from({ length: t.shift - low }, () => ZERO), t.coef];
    for (const q of poles) {
      const same = t.pole && samePole(q.p, t.pole);
      const power = same ? q.mult - t.order : q.mult;
      if (power > 0) p = pmul(p, ppow([ONE, cscale(q.p, -1)], power));
    }
    num = padd(num, p);
  }
  return { low, num: ptrim(num), poles };
}

function finitePoles(terms: ZTerm[]): Root[] {
  return zRational(terms).poles.sort((a, b) => cabs(a.p) - cabs(b.p));
}

/** Poles and zeros in the z-plane (including the origin), with cancellations removed. */
export function zPolesZeros(terms: ZTerm[]): { poles: Root[]; zeros: Root[] } {
  const { low, num, poles } = zRational(terms);
  // X = w^low·N(w)/D(w); with w = 1/z: multiply top and bottom by z^{deg}.
  // Zeros in w ↔ zeros in z at 1/w; w = 0 roots (z = ∞) are dropped.
  const degN = num.length - 1;
  const degD = poles.reduce((s, p) => s + p.mult, 0);
  const zeros: Root[] = [];
  let nz0 = 0;
  for (const r of findRoots(num)) {
    if (cabs(r.p) < 1e-12) {
      nz0 += r.mult; // w = 0: zeros at z = ∞
      continue;
    }
    zeros.push({ p: cdiv(ONE, r.p), mult: r.mult });
  }
  // Total power of z at the origin: X(z) = z^{−low}·z^{degD − degN}·(…)
  const originOrder = -low + (degD - (degN - nz0)) - nz0;
  // originOrder > 0 → zeros at z = 0? No: z^{k} in the numerator means zeros at 0.
  const poleList = poles.map((p) => ({ ...p }));
  const zeroList = zeros.map((z) => ({ ...z }));
  if (originOrder > 0) zeroList.push({ p: ZERO, mult: originOrder });
  if (originOrder < 0) poleList.push({ p: ZERO, mult: -originOrder });
  // Cancel common roots.
  for (const z of zeroList) {
    const p = poleList.find((q) => samePole(q.p, z.p));
    if (p) {
      const k = Math.min(p.mult, z.mult);
      p.mult -= k;
      z.mult -= k;
    }
  }
  return { poles: poleList.filter((p) => p.mult > 0), zeros: zeroList.filter((z) => z.mult > 0) };
}

// --- LaTeX ------------------------------------------------------------------------

const realish = (c: C) => Math.abs(c.im) <= 1e-9 * Math.max(1, cabs(c));

/** w^k in z⁻¹ or e^{−jΩ} form. */
function wPow(k: number, mode: "z" | "dtft"): string {
  if (k === 0) return "";
  if (mode === "z") return k === 1 ? "z^{-1}" : k === -1 ? "z" : `z^{${-k}}`;
  return k === 1 ? "e^{-j\\Omega}" : k === -1 ? "e^{j\\Omega}" : `e^{${k > 0 ? "-" : ""}j${Math.abs(k)}\\Omega}`;
}

function texLaurent(num: Poly, low: number, mode: "z" | "dtft"): { tex: string; single: boolean } {
  const parts: { sign: 1 | -1; body: string }[] = [];
  num.forEach((c, i) => {
    if (cisZero(c, 1e-13)) return;
    const pw = wPow(i + low, mode);
    if (realish(c)) {
      const n = nice(Math.abs(c.re));
      parts.push({ sign: c.re < 0 ? -1 : 1, body: pw ? `${n.tex === "1" ? "" : n.tex}${pw}` : n.tex });
    } else parts.push({ sign: 1, body: `\\left(${niceC(c).tex}\\right)${pw}` });
  });
  if (!parts.length) return { tex: "0", single: true };
  return { tex: parts.map((p, i) => (i === 0 ? (p.sign < 0 ? `-${p.body}` : p.body) : `${p.sign < 0 ? "-" : "+"}${p.body}`)).join(""), single: parts.length === 1 };
}

/** Π(1 − p w)^M in real factors: complex pairs become 1 − 2Re(p)w + |p|²w². */
function texDen(poles: Root[], mode: "z" | "dtft"): string {
  const used = new Set<number>();
  const factors: string[] = [];
  const single = poles.length === 1 && poles[0].mult === 1;
  poles.forEach((r, i) => {
    if (used.has(i)) return;
    used.add(i);
    let poly: number[];
    if (Math.abs(r.p.im) < 1e-12) poly = [1, -r.p.re];
    else {
      const j = poles.findIndex((q, k) => !used.has(k) && samePole(q.p, { re: r.p.re, im: -r.p.im }));
      if (j < 0) {
        factors.push(`\\left(1-\\left(${niceC(r.p).tex}\\right)${wPow(1, mode)}\\right)${r.mult > 1 ? `^{${r.mult}}` : ""}`);
        return;
      }
      used.add(j);
      poly = [1, -2 * r.p.re, r.p.re * r.p.re + r.p.im * r.p.im];
    }
    const inner = texLaurent(poly.map((v) => cx(v)), 0, mode).tex;
    const body = single ? inner : `\\left(${inner}\\right)`;
    factors.push(r.mult > 1 ? `${single ? `\\left(${inner}\\right)` : body}^{${r.mult}}` : body);
  });
  return factors.join("");
}

export function texZ(terms: ZTerm[], mode: "z" | "dtft" = "z"): string {
  if (!terms.length) return "0";
  const { low, num, poles } = zRational(terms);
  const n = texLaurent(num, low, mode);
  if (!poles.length) return n.tex;
  return `\\frac{${n.tex}}{${texDen(poles, mode)}}`;
}

export function texAnnulus(roc: Annulus | null): string {
  if (!roc) return "\\text{none}";
  const lo = roc.rmin > 0 ? nice(roc.rmin).tex : null;
  const hi = Number.isFinite(roc.rmax) ? nice(roc.rmax).tex : null;
  if (lo === null && hi === null) return "\\text{all } z \\ne 0";
  if (hi === null) return `|z| > ${lo}`;
  if (lo === null) return `0 < |z| < ${hi}`;
  return `${lo} < |z| < ${hi}`;
}

// --- Forward transform -------------------------------------------------------------

export function zTransform(sig: Signal): ZResult {
  const s = sig.pieces.some((p) => p.from === -Infinity && p.to === Infinity) ? sigSplitAt(sig, 0) : sig;
  const terms: ZTerm[] = [];
  let rmin = 0;
  let rmax = Infinity;
  const steps: Step[] = [{ title: "Start from the definition", lines: ["X(z) = \\sum_{n=-\\infty}^{\\infty} x[n]\\,z^{-n}"] }];
  for (const p of s.pieces) {
    const r = pieceZ(p.from, p.to, p.expr);
    terms.push(...r.terms);
    rmin = Math.max(rmin, r.rmin);
    rmax = Math.min(rmax, r.rmax);
    const lim = (v: number) => (v === Infinity ? "\\infty" : v === -Infinity ? "-\\infty" : nice(v).tex);
    const cond = r.rmin > 0 ? `\\quad (|z| > ${nice(r.rmin).tex})` : Number.isFinite(r.rmax) ? `\\quad (|z| < ${nice(r.rmax).tex})` : "";
    if (steps.length < 8) {
      steps.push({
        title: Number.isFinite(p.from) && Number.isFinite(p.to) ? "A finite stretch: write the terms out" : "A geometric series: it converges where the ratio has magnitude below 1",
        lines: [`\\sum_{n=${lim(p.from)}}^{${lim(p.to === Infinity ? Infinity : p.to - 1)}} ${texCases({ pieces: [{ from: -Infinity, to: Infinity, expr: p.expr }], impulses: [] }, { v: "n", discrete: true })}\\,z^{-n} = ${texZ(r.terms)}${cond}`],
      });
    }
  }
  const roc = rmin < rmax ? { rmin, rmax } : null;
  const rocNote = roc ? undefined : `The right-sided part needs |z| > ${nice(rmin).text} and the left-sided part |z| < ${nice(rmax).text}: no z satisfies both.`;
  const { poles, zeros } = zPolesZeros(terms);
  const tex = texZ(terms);
  steps.push({ title: "Add the pieces", lines: [`X(z) = ${tex}`] });
  steps.push({ title: "Region of convergence: where every series converges", lines: [roc ? `\\text{ROC: } ${texAnnulus(roc)}` : "\\text{no common region}"] });
  return { terms, roc, rocNote, poles, zeros, tex, steps, at: (z) => zEval(terms, z) };
}

// --- DTFT --------------------------------------------------------------------------

export interface DtftImpulse {
  /** Ω₀ in (−π, π]; repeats every 2π. */
  at: number;
  area: C;
}

export type DtftResult =
  | { kind: "exact"; at(W: number): C; tex: string; impulses: DtftImpulse[]; steps: Step[] }
  | { kind: "none"; reason: string };

export function dtft(sig: Signal): DtftResult {
  const s = sig.pieces.some((p) => p.from === -Infinity && p.to === Infinity) ? sigSplitAt(sig, 0) : sig;
  const impulses: DtftImpulse[] = [];
  for (const p of s.pieces) {
    const right = p.to === Infinity;
    const left = p.from === -Infinity;
    if (!right && !left) continue;
    for (const g of p.expr) {
      const mag = Math.exp(g.rate.re);
      const grows = right ? mag > 1 + 1e-12 : mag < 1 - 1e-12;
      if (grows) {
        return { kind: "none", reason: `x[n] grows like ${nice(mag).text}^n as n → ${right ? "∞" : "−∞"}, so Σ x[n]e^{−jΩn} diverges. The Z-transform still exists in a region of the z-plane.` };
      }
      if (Math.abs(mag - 1) <= 1e-12) {
        if (g.poly.length > 1) return { kind: "none", reason: "n·e^{jΩ₀n} terms don't decay; their DTFT contains derivatives of impulses." };
        let w = g.rate.im % (2 * Math.PI);
        if (w > Math.PI) w -= 2 * Math.PI;
        if (w <= -Math.PI) w += 2 * Math.PI;
        impulses.push({ at: w, area: cscale(g.poly[0], Math.PI) });
      }
    }
  }
  const z = zTransform(s);
  const merged: DtftImpulse[] = [];
  for (const i of impulses) {
    const e = merged.find((m) => Math.abs(m.at - i.at) < 1e-9);
    if (e) e.area = cadd(e.area, i.area);
    else merged.push({ ...i });
  }
  const live = merged.filter((m) => cabs(m.area) > 1e-12);
  const imp = live.map((i) => {
    const n = realish(i.area) ? nice(i.area.re) : niceC(i.area);
    const c = n.tex === "1" ? "" : n.tex;
    const arg = Math.abs(i.at) < 1e-12 ? "\\Omega - 2\\pi l" : `\\Omega ${i.at > 0 ? "-" : "+"} ${nice(Math.abs(i.at)).tex} - 2\\pi l`;
    return `${c}\\sum_{l}\\delta(${arg})`;
  });
  const tex = [texZ(z.terms, "dtft"), ...imp].join(" + ");
  const steps: Step[] = [
    ...z.steps.slice(0, -1),
    {
      title: live.length
        ? "Terms that neither grow nor decay add impulses, repeated every 2π"
        : "The ROC contains the unit circle, so the DTFT is X(z) on it: z = e^{jΩ}",
      lines: [`X(e^{j\\Omega}) = ${tex}`],
    },
  ];
  return { kind: "exact", at: (W) => zEval(z.terms, cexp(cx(0, W))), tex, impulses: live, steps };
}

// --- Inverse Z and products ----------------------------------------------------------

/** The possible ROCs: annuli between consecutive distinct pole magnitudes. */
export function rocAnnuli(poles: Root[]): Annulus[] {
  const rs = [...new Set(poles.filter((p) => cabs(p.p) > 1e-12).map((p) => Math.round(cabs(p.p) * 1e9) / 1e9))].sort((a, b) => a - b);
  if (!rs.length) return [{ rmin: 0, rmax: Infinity }];
  const out: Annulus[] = [{ rmin: 0, rmax: rs[0] }];
  for (let i = 0; i + 1 < rs.length; i++) out.push({ rmin: rs[i], rmax: rs[i + 1] });
  out.push({ rmin: rs[rs.length - 1], rmax: Infinity });
  return out;
}

/** C(m + i − 1, i − 1) as a polynomial in m. */
function binomPoly(i: number): C[] {
  let p: C[] = [ONE];
  for (let l = 1; l < i; l++) p = pmul(p, [cx(l), ONE]);
  return p.map((c) => cscale(c, 1 / factorial(i - 1)));
}

export function inverseZ(terms: ZTerm[], roc: Annulus): { signal: Signal; tex: string; steps: Step[] } {
  let signal = sigZero();
  const pairs = new Set<string>();
  for (const t of terms) {
    if (!t.pole || !t.order) {
      signal = sigAdd(signal, sigPiece(t.shift, t.shift + 1, [{ rate: ZERO, poly: [t.coef] }]));
      continue;
    }
    const right = cabs(t.pole) <= roc.rmin + 1e-12;
    const lam = clog(t.pole);
    const expr: ExpPoly = [{ rate: lam, poly: binomPoly(t.order).map((c) => cmul(c, right ? t.coef : cscale(t.coef, -1))) }];
    const shifted = epCompose(expr, 1, -t.shift);
    signal = sigAdd(signal, right ? sigPiece(t.shift, Infinity, shifted) : sigPiece(-Infinity, t.shift, shifted));
    const p = niceC(t.pole).tex;
    const seq = t.order === 1 ? `(${p})^{n}` : `\\binom{n+${t.order - 1}}{${t.order - 1}}(${p})^{n}`;
    pairs.add(`\\frac{1}{(1-${realish(t.pole) ? nice(t.pole.re).tex : `(${p})`}z^{-1})${t.order > 1 ? `^{${t.order}}` : ""}} \\;\\leftrightarrow\\; ${right ? "" : "-"}${seq}\\,${right ? "u[n]" : "u[-n-1]"}`);
  }
  const tex = texStepForm(signal, { v: "n", discrete: true });
  const steps: Step[] = [
    { title: "Partial fractions in z⁻¹", lines: [`X(z) = ${texZTerms(terms)}`] },
    { title: "Table pairs (poles inside the ROC's inner edge give right-sided terms, outside give left-sided ones)", lines: [...pairs] },
    { title: "A factor z^{−k} delays a term by k samples", lines: ["z^{-k}F(z) \\;\\leftrightarrow\\; f[n-k]"] },
    { title: "Add the terms", lines: [`x[n] = ${tex}`] },
  ];
  return { signal, tex, steps };
}

/** Partial-fraction listing of the terms. */
export function texZTerms(terms: ZTerm[]): string {
  const parts = terms.map((t) => {
    const c = realish(t.coef) ? nice(t.coef.re) : null;
    const sign = c && c.sign < 0 ? "-" : "+";
    const mag = c ? (nice(Math.abs(t.coef.re)).tex === "1" ? "" : nice(Math.abs(t.coef.re)).tex) : `\\left(${niceC(t.coef).tex}\\right)`;
    const pw = wPow(t.shift, "z");
    if (!t.pole || !t.order) return `${sign}${mag || (pw ? "" : "1")}${pw}`;
    const p = realish(t.pole) ? nice(t.pole.re).tex : `\\left(${niceC(t.pole).tex}\\right)`;
    const den = `(1-${p}z^{-1})${t.order > 1 ? `^{${t.order}}` : ""}`;
    return `${sign}\\frac{${mag || "1"}${pw}}{${den}}`;
  });
  return parts.join("").replace(/^\+/, "") || "0";
}

/** Product Y = X·H through one fraction in w = z⁻¹, then partial fractions again. */
export function zMul(a: ZTerm[], b: ZTerm[]): ZTerm[] {
  const ra = zRational(a);
  const rb = zRational(b);
  const num = pmul(ra.num, rb.num);
  const low = ra.low + rb.low;
  const poles: Root[] = [];
  for (const p of [...ra.poles, ...rb.poles]) {
    const e = poles.find((q) => samePole(q.p, p.p));
    if (e) e.mult += p.mult;
    else poles.push({ ...p });
  }
  return termsFromRational(num, low, poles);
}

/** w^low·num(w)/Π(1 − p w)^M → Z terms (partial fractions in w). */
export function termsFromRational(num: Poly, low: number, poles: Root[]): ZTerm[] {
  // Π(1 − p w)^M = Π(−p)^M·Π(w − 1/p)^M
  let den: Poly = [ONE];
  for (const p of poles) den = pmul(den, ppow([ONE, cscale(p.p, -1)], p.mult));
  const roots: Root[] = poles.map((p) => ({ p: cdiv(ONE, p.p), mult: p.mult }));
  const pf = partialFractions(num, den, roots);
  const out: ZTerm[] = [];
  pf.poly.forEach((c, k) => {
    if (!cisZero(c, 1e-14)) out.push({ coef: c, shift: k + low, pole: null, order: 0 });
  });
  for (const f of pf.fracs) {
    const q = f.pole; // w = q = 1/p
    const p = cdiv(ONE, q);
    f.coefs.forEach((c, i) => {
      const m = i + 1;
      // c/(w − q)^m = c/((−q)^m (1 − p w)^m)
      const coef = cdiv(c, cpow(cscale(q, -1), m));
      if (!cisZero(coef, 1e-14)) out.push({ coef, shift: low, pole: p, order: m });
    });
  }
  return out;
}

/** X(z) typed as a function of z (already in partial fractions in z) → Z terms. */
export function termsFromSExpr(X: SExpr): ZTerm[] | null {
  const out: ZTerm[] = [];
  for (const g of X) {
    if (Math.abs(g.delay) > 1e-12) return null;
    // a_k z^k = a_k z^{−(−k)}
    g.poly.forEach((c, k) => {
      if (!cisZero(c, 1e-14)) out.push({ coef: c, shift: -k, pole: null, order: 0 });
    });
    for (const f of g.fracs) {
      f.coefs.forEach((c, i) => {
        const m = i + 1;
        // c/(z − p)^m = c·z^{−m}/(1 − p z^{−1})^m; a pole at 0 is a plain power.
        if (cabs(f.pole) < 1e-14) out.push({ coef: c, shift: m, pole: null, order: 0 });
        else if (!cisZero(c, 1e-14)) out.push({ coef: c, shift: m, pole: f.pole, order: m });
      });
    }
  }
  return out;
}

export { finitePoles };

/*
 * Exact signals → LaTeX. Conjugate rate pairs are written as real sinusoids, exponentials
 * take whichever shift e^{λ(t−T)} makes the coefficient nicest (so e^{-(t-1)} instead of
 * 2.718e^{-t}), and pieces are shown either as cases or as a sum of shifted steps.
 */

import { type C, cabs, cexp, cmul, cscale, cx } from "../math/complex";
import { complexity, complexityC, nice, niceC } from "../math/nice";
import { epSub, type ExpPoly, polyCompose } from "./exppoly";
import { type Impulse, type Piece, type Signal, samePoint } from "./signal";

export interface FormatOptions {
  /** Variable name: t, n, τ … */
  v?: string;
  /** Candidate shifts T for writing e^{λ(t−T)}. */
  shiftHints?: number[];
  /** Also write polynomials in powers of (t − T) when that is nicer (step form). */
  shiftPoly?: boolean;
  /** Discrete time: e^{λn} is shown as r^n. */
  discrete?: boolean;
}

interface Term {
  sign: 1 | -1;
  body: string;
}

const isReal = (c: C) => Math.abs(c.im) <= 1e-10 * Math.max(1, cabs(c));

/** Coefficient as a prefix: 1 → "", −1 → "-", 2 → "2", ½ → "\frac{1}{2}". */
export function coefPrefix(k: number): string {
  if (Math.abs(k - 1) < 1e-12) return "";
  if (Math.abs(k + 1) < 1e-12) return "-";
  return nice(k).tex;
}

/** v − T, formatted: t, t-1, t+\frac{1}{2}. */
export function shifted(v: string, T: number): string {
  if (Math.abs(T) < 1e-12) return v;
  const n = nice(Math.abs(T));
  return `${v}${T > 0 ? "-" : "+"}${n.tex}`;
}

/** k·(v − T), formatted as a linear expression: 2t, -(t-1), \pi t. */
export function linear(k: number, v: string, T = 0): string {
  const inner = shifted(v, T);
  const pre = coefPrefix(k);
  if (Math.abs(T) < 1e-12) {
    const nk = nice(k);
    // \frac{\pi}{2}t reads better as \frac{\pi t}{2}.
    if (nk.den && nk.exact) return `${nk.sign < 0 ? "-" : ""}\\frac{${nk.num === "1" ? "" : joinFactor(nk.num, v)}${nk.num === "1" ? v : ""}}{${nk.den}}`;
    return joinFactor(pre, v);
  }
  return pre === "" ? inner : `${pre}(${inner})`;
}

/** Juxtapose two LaTeX factors, with a space after a command (\pi t) and a thin space between letters (t\,u). */
export function joinFactor(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (/\\[A-Za-z]+$/.test(a)) return `${a} ${b}`;
  if (/[A-Za-z]$/.test(a) && /^([A-Za-z]|\\[A-Za-z])/.test(b)) return `${a}\\,${b}`;
  return `${a}${b}`;
}

/** Monomials of a real polynomial in (v − T), highest power first: "t^{2}", "-2(t-1)". */
function polyTerms(poly: number[], v: string, T: number): Term[] {
  const base = Math.abs(T) < 1e-12 ? v : `(${shifted(v, T)})`;
  const out: Term[] = [];
  for (let k = poly.length - 1; k >= 0; k--) {
    const c = poly[k];
    if (Math.abs(c) < 1e-14) continue;
    const n = nice(Math.abs(c));
    const power = k === 0 ? "" : k === 1 ? base : `${base}^{${k}}`;
    const coef = k === 0 ? n.tex : Math.abs(Math.abs(c) - 1) < 1e-12 ? "" : n.tex;
    out.push({ sign: c < 0 ? -1 : 1, body: joinFactor(coef, power) });
  }
  return out;
}

function joinTerms(terms: Term[]): string {
  if (terms.length === 0) return "0";
  // Lead with a positive term when there is one: 2 - t rather than -t + 2.
  const firstPos = terms.findIndex((t) => t.sign > 0);
  const ordered = terms[0].sign < 0 && firstPos > 0 ? [terms[firstPos], ...terms.filter((_, i) => i !== firstPos)] : terms;
  return ordered
    .map((t, i) => (i === 0 ? (t.sign < 0 ? `-${t.body}` : t.body) : `${t.sign < 0 ? "-" : "+"}${t.body}`))
    .join("");
}

/** A real polynomial in v (or v − T), possibly in parentheses when it has several terms. */
function polyFactor(poly: number[], v: string, T: number): { sign: 1 | -1; body: string; single: boolean; one: boolean } {
  const terms = polyTerms(poly, v, T);
  if (terms.length === 1) {
    const t = terms[0];
    return { sign: t.sign, body: t.body === "1" ? "" : t.body, single: true, one: t.body === "1" };
  }
  return { sign: 1, body: `\\left(${joinTerms(terms)}\\right)`, single: false, one: false };
}

/** Sum of complexities of the coefficients: lower is nicer. */
const polyCost = (poly: number[]) => poly.reduce((s, c) => s + (Math.abs(c) < 1e-14 ? 0 : complexity(c)), 0);

interface Shifted {
  T: number;
  poly: number[];
}

/**
 * Choose the shift T (from the hints, and 0) that makes c·P(t)·e^{σt} = Q(t−T)·e^{σ(t−T)}
 * nicest. Polynomial shifting only when allowed.
 */
function bestShift(poly: number[], sigma: number, hints: number[], shiftPoly: boolean): Shifted {
  let best: Shifted = { T: 0, poly };
  let bestCost = polyCost(poly) + 0.5;
  for (const T of hints) {
    if (!Number.isFinite(T) || Math.abs(T) < 1e-12) continue;
    if (Math.abs(sigma) < 1e-12 && !shiftPoly) continue;
    const scale = Math.exp(sigma * T);
    // P(t) = Q(t − T) with Q(s) = P(s + T).
    const q = (shiftPoly && poly.length > 1 ? polyCompose(poly.map((c) => cx(c)), 1, T).map((c) => c.re) : poly).map(
      (c) => c * scale,
    );
    if (!shiftPoly && poly.length > 1) continue;
    const cost = polyCost(q) + 1;
    if (cost < bestCost - 1e-9) {
      best = { T, poly: q };
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Write c·e^{σt} as a·e^{σ(t−T₁)} + b·e^{σ(t−T₂)} with nice a and b, for two of the shift
 * hints (convolution results are often exactly that).
 */
function splitAcrossShifts(c: number, sigma: number, hints: number[]): { c: number; T: number }[] | null {
  const Ts = [...new Set([0, ...hints.filter(Number.isFinite)])];
  const smalls = [1, -1, 2, -2, 0.5, -0.5, 3, -3];
  for (const T1 of Ts) {
    for (const a of smalls) {
      const rest = c - a * Math.exp(-sigma * T1);
      for (const T2 of Ts) {
        if (T2 === T1) continue;
        const b = rest / Math.exp(-sigma * T2);
        const nb = nice(b);
        if (nb.exact && Math.abs(b) > 1e-12 && complexity(b) <= 6) {
          return [
            { c: a, T: T1 },
            { c: b, T: T2 },
          ].sort((x, y) => y.T - x.T);
        }
      }
    }
  }
  return null;
}

/** e^{σ(v−T)} factor, or r^{v−T} in discrete time. */
function expFactor(sigma: number, v: string, T: number, discrete: boolean): string {
  if (Math.abs(sigma) < 1e-14) return "";
  if (discrete) {
    const r = Math.exp(sigma);
    const n = nice(r);
    const base = n.den || n.sign < 0 || !n.exact ? `\\left(${n.tex}\\right)` : n.tex;
    return `${base}^{${shifted(v, T)}}`;
  }
  return `e^{${linear(sigma, v, T)}}`;
}

function trigArg(omega: number, v: string, T: number): string {
  return linear(omega, v, T);
}

/** Render a real-valued exp-polynomial (conjugate pairs folded into sin/cos). */
function realTerms(e: ExpPoly, opts: Required<FormatOptions>): Term[] {
  const { v, shiftHints, shiftPoly, discrete } = opts;
  const terms: Term[] = [];
  const used = new Set<number>();
  // Real rates (incl. the polynomial part, rate 0).
  e.forEach((g, i) => {
    if (Math.abs(g.rate.im) > 1e-12) return;
    used.add(i);
    const poly = g.poly.map((c) => c.re);
    const sigma = g.rate.re;
    // Discrete: (−r)^n is a real rate with imaginary part π; handled below with the pairs.
    const { T, poly: q } = bestShift(poly, sigma, shiftHints, shiftPoly);
    // A coefficient like e − 1 has no nice form, but e^{-(t-1)} − e^{-t} does.
    if (q.length === 1 && Math.abs(sigma) > 1e-12 && !discrete && !nice(q[0]).exact) {
      const split = splitAcrossShifts(poly[0], sigma, shiftHints);
      if (split) {
        for (const part of split) {
          const n = nice(Math.abs(part.c));
          terms.push({ sign: part.c < 0 ? -1 : 1, body: joinFactor(n.tex === "1" ? "" : n.tex, expFactor(sigma, v, part.T, false)) });
        }
        return;
      }
    }
    const ef = expFactor(sigma, v, T, discrete);
    if (!ef) {
      terms.push(...polyTerms(q, v, T));
      return;
    }
    const f = polyFactor(q, v, T);
    terms.push({ sign: f.sign, body: joinFactor(f.body, ef) });
  });
  // Complex rates: pair λ with λ̄, giving e^{σt}(A cos ωt + B sin ωt).
  e.forEach((g, i) => {
    if (used.has(i)) return;
    used.add(i);
    const sigma = g.rate.re;
    const omega = g.rate.im;
    if (discrete && Math.abs(Math.abs(omega) - Math.PI) < 1e-12) {
      // (−r)^n: a real sequence with alternating sign.
      const r = -Math.exp(sigma);
      const poly = g.poly.map((c) => c.re);
      const n = nice(r);
      const f = polyFactor(poly, v, 0);
      terms.push({ sign: f.sign, body: `${f.body}\\left(${n.tex}\\right)^{${v}}` });
      return;
    }
    if (omega < 0) return; // folded into its positive partner
    // The partner rate has −ω; its polynomial is the conjugate for a real signal.
    const A = g.poly.map((c) => 2 * c.re);
    const B = g.poly.map((c) => -2 * c.im);
    e.forEach((h, k) => {
      if (Math.abs(h.rate.re - sigma) < 1e-12 && Math.abs(h.rate.im + omega) < 1e-12) used.add(k);
    });
    // Shift: A cos ωt + B sin ωt = A' cos ω(t−T) + B' sin ω(t−T), times e^{σT}.
    let best = { T: 0, A, B };
    let bestCost = polyCost(A) + polyCost(B) + 0.5;
    if (A.length === 1 && B.length <= 1) {
      for (const T of shiftHints) {
        if (!Number.isFinite(T) || Math.abs(T) < 1e-12) continue;
        const k = Math.exp(sigma * T);
        const c = Math.cos(omega * T);
        const s = Math.sin(omega * T);
        const a = A[0] ?? 0;
        const b = B[0] ?? 0;
        // cos ωt = cos(ω(t−T) + ωT) = c·cos − s·sin; sin ωt = s·cos + c·sin.
        const a2 = k * (a * c + b * s);
        const b2 = k * (-a * s + b * c);
        const cost = polyCost([a2]) + polyCost([b2]) + 1;
        if (cost < bestCost - 1e-9) {
          best = { T, A: [a2], B: [b2] };
          bestCost = cost;
        }
      }
    }
    const arg = discrete ? trigArg(omega, v, best.T) : trigArg(omega, v, best.T);
    const ef = expFactor(sigma, v, best.T, discrete);
    const cosF = polyFactor(best.A, v, 0);
    const sinF = polyFactor(best.B, v, 0);
    const parts: (Term & { coef: string; trig: string })[] = [];
    if (best.A.some((c) => Math.abs(c) > 1e-14)) {
      const trig = `\\cos(${arg})`;
      parts.push({ sign: cosF.sign, coef: cosF.body, trig, body: joinFactor(cosF.body, trig) });
    }
    if (best.B.some((c) => Math.abs(c) > 1e-14)) {
      const trig = `\\sin(${arg})`;
      parts.push({ sign: sinF.sign, coef: sinF.body, trig, body: joinFactor(sinF.body, trig) });
    }
    if (!ef || parts.length === 1) {
      // Coefficient, then the exponential, then the sinusoid: 2e^{-t}\sin(2t).
      for (const p of parts) terms.push({ sign: p.sign, body: ef ? joinFactor(joinFactor(p.coef, ef), p.trig) : p.body });
    } else {
      terms.push({ sign: 1, body: `${ef}\\left(${joinTerms(parts)}\\right)` });
    }
  });
  return terms;
}

/** Complex exp-polynomial: each group as P(t)e^{λt} with complex coefficients. */
function complexTerms(e: ExpPoly, v: string, discrete: boolean): Term[] {
  const terms: Term[] = [];
  for (const g of e) {
    const lam = g.rate;
    let ef = "";
    if (cabs(lam) > 1e-14) {
      if (discrete) {
        const r = cexp(lam);
        ef = `\\left(${niceC(r).tex}\\right)^{${v}}`;
      } else if (Math.abs(lam.re) < 1e-14) {
        const n = nice(lam.im);
        ef = `e^{${n.sign < 0 ? "-" : ""}j${n.tex.replace(/^-/, "") === "1" ? "" : n.tex.replace(/^-/, "")}${v}}`;
      } else {
        ef = `e^{\\left(${niceC(lam).tex}\\right)${v}}`;
      }
    }
    for (let k = g.poly.length - 1; k >= 0; k--) {
      const c = g.poly[k];
      if (cabs(c) < 1e-14) continue;
      const power = k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`;
      const real = isReal(c);
      const n = real ? nice(Math.abs(c.re)) : niceC(c);
      const sign: 1 | -1 = real && c.re < 0 ? -1 : 1;
      const isOne = real && Math.abs(Math.abs(c.re) - 1) < 1e-12;
      const coef = isOne && (power || ef) ? "" : real ? n.tex : `\\left(${n.tex}\\right)`;
      terms.push({ sign, body: `${coef}${power}${ef}` || "1" });
    }
  }
  return terms;
}

function isRealExpPoly(e: ExpPoly): boolean {
  // Real when every complex rate has its conjugate partner with conjugate coefficients.
  for (const g of e) {
    if (Math.abs(g.rate.im) < 1e-12) {
      if (!g.poly.every(isReal)) return false;
      continue;
    }
    const partner = e.find((h) => Math.abs(h.rate.re - g.rate.re) < 1e-12 && Math.abs(h.rate.im + g.rate.im) < 1e-12);
    if (!partner) return false;
    const n = Math.max(g.poly.length, partner.poly.length);
    for (let i = 0; i < n; i++) {
      const a = g.poly[i] ?? cx(0);
      const b = partner.poly[i] ?? cx(0);
      const scale = Math.max(1, cabs(a));
      if (Math.abs(a.re - b.re) > 1e-9 * scale || Math.abs(a.im + b.im) > 1e-9 * scale) return false;
    }
  }
  return true;
}

function defaults(opts: FormatOptions): Required<FormatOptions> {
  return { v: opts.v ?? "t", shiftHints: opts.shiftHints ?? [], shiftPoly: opts.shiftPoly ?? false, discrete: opts.discrete ?? false };
}

/** One exp-polynomial as LaTeX. */
export function texExpPoly(e: ExpPoly, options: FormatOptions = {}): string {
  const opts = defaults(options);
  return joinTerms(expPolyTerms(e, opts));
}

function expPolyTerms(e: ExpPoly, opts: Required<FormatOptions>): Term[] {
  if (e.length === 0) return [];
  if (opts.discrete) {
    // (−r)^n has rate ln r + jπ and is real on its own; other complex rates need partners.
    const alternating = (g: ExpPoly[number]) => Math.abs(Math.abs(g.rate.im) - Math.PI) < 1e-12;
    const altReal = e.filter(alternating).every((g) => g.poly.every(isReal));
    return altReal && isRealExpPoly(e.filter((g) => !alternating(g))) ? realTerms(e, opts) : complexTerms(e, opts.v, true);
  }
  return isRealExpPoly(e) ? realTerms(e, opts) : complexTerms(e, opts.v, false);
}

/** Wrap a sum in parentheses when it has more than one term (for use as a factor). */
export function texFactor(e: ExpPoly, options: FormatOptions = {}): { tex: string; single: boolean } {
  const terms = expPolyTerms(e, defaults(options));
  if (terms.length <= 1) return { tex: joinTerms(terms), single: true };
  return { tex: `\\left(${joinTerms(terms)}\\right)`, single: false };
}

/** area·δ^(k)(v − at). */
export function texImpulse(imp: Impulse, options: FormatOptions = {}): { sign: 1 | -1; body: string } {
  const v = options.v ?? "t";
  const real = isReal(imp.area);
  const sign: 1 | -1 = real && imp.area.re < 0 ? -1 : 1;
  const mag = real ? Math.abs(imp.area.re) : 0;
  const coef = real ? (Math.abs(mag - 1) < 1e-12 ? "" : nice(mag).tex) : `\\left(${niceC(imp.area).tex}\\right)`;
  const d = imp.order === 0 ? "\\delta" : imp.order === 1 ? "\\delta'" : imp.order === 2 ? "\\delta''" : `\\delta^{(${imp.order})}`;
  const arg = options.discrete ? `[${shifted(v, imp.at)}]` : `(${shifted(v, imp.at)})`;
  return { sign, body: `${coef}${d}${arg}` };
}

function impulseTerms(imps: Impulse[], options: FormatOptions): Term[] {
  return imps.map((i) => texImpulse(i, options));
}

function condition(p: Piece, v: string, discrete: boolean): string {
  const a = Number.isFinite(p.from) ? nice(p.from).tex : null;
  if (discrete) {
    const lastN = p.to - 1;
    const b = Number.isFinite(p.to) ? nice(lastN).tex : null;
    if (a !== null && b !== null && samePoint(p.from, lastN)) return `${v}=${a}`;
    if (a !== null && b !== null) return `${a}\\le ${v}\\le ${b}`;
    if (a !== null) return `${v}\\ge ${a}`;
    if (b !== null) return `${v}\\le ${b}`;
    return "\\text{all } " + v;
  }
  const b = Number.isFinite(p.to) ? nice(p.to).tex : null;
  if (a !== null && b !== null) return `${a}\\le ${v}<${b}`;
  if (a !== null) return `${v}\\ge ${a}`;
  if (b !== null) return `${v}<${b}`;
  return "\\text{all } " + v;
}

function hintsFor(sig: Signal, extra: number[] = []): number[] {
  return [...sig.pieces.flatMap((p) => [p.from, p.to]), ...sig.impulses.map((i) => i.at), ...extra].filter(Number.isFinite);
}

/** Piecewise "cases" form, plus impulses. */
export function texCases(sig: Signal, options: FormatOptions = {}): string {
  const v = options.v ?? "t";
  const discrete = options.discrete ?? false;
  const hints = options.shiftHints ?? hintsFor(sig);
  const imps = impulseTerms(sig.impulses, options);
  let main = "";
  const { pieces } = sig;
  if (pieces.length === 1 && pieces[0].from === -Infinity && pieces[0].to === Infinity) {
    main = texExpPoly(pieces[0].expr, { ...options, shiftHints: hints });
  } else if (pieces.length > 0) {
    const rows = pieces.map(
      (p) =>
        `${texExpPoly(p.expr, { ...options, shiftHints: [p.from, ...hints] })}, & ${condition(p, v, discrete)}`,
    );
    const covers =
      pieces[0].from === -Infinity &&
      pieces[pieces.length - 1].to === Infinity &&
      pieces.every((p, i) => i === 0 || samePoint(pieces[i - 1].to, p.from));
    if (!covers) rows.push(`0, & \\text{otherwise}`);
    main = `\\begin{cases} ${rows.join(" \\\\ ")} \\end{cases}`;
  }
  if (!main) return joinTerms(imps);
  if (!imps.length) return main;
  return `${main}${joinTerms(imps).replace(/^(?!-)/, "+")}`;
}

/** u(v − b), or u(b − v) for a left-sided step. */
function stepTex(b: number, v: string, left: boolean, discrete: boolean): string {
  const [open, close] = discrete ? ["[", "]"] : ["(", ")"];
  if (!left) return `u${open}${shifted(v, b)}${close}`;
  // u(b − v): for discrete, n ≤ b−1 ⇔ (b−1) − n ≥ 0.
  const edge = discrete ? b - 1 : b;
  if (Math.abs(edge) < 1e-12) return `u${open}-${v}${close}`;
  const n = nice(Math.abs(edge));
  return edge > 0 ? `u${open}${n.tex}-${v}${close}` : `u${open}-${v}-${n.tex}${close}`;
}

/** Sum of shifted steps: Σ D_i(t)·u(t − b_i), plus impulses. */
export function texStepForm(sig: Signal, options: FormatOptions = {}): string {
  const v = options.v ?? "t";
  const discrete = options.discrete ?? false;
  const terms: Term[] = [];
  let prev: ExpPoly = [];
  let prevEnd = -Infinity;
  const pieces = sig.pieces;
  const push = (expr: ExpPoly, step: string, T: number) => {
    const opts = defaults({ ...options, shiftHints: [T], shiftPoly: true });
    const inner = expPolyTerms(expr, opts);
    if (inner.length === 0) return;
    if (inner.length === 1) terms.push({ sign: inner[0].sign, body: joinFactor(inner[0].body === "1" ? "" : inner[0].body, step) });
    else terms.push({ sign: 1, body: `\\left(${joinTerms(inner)}\\right)${step}` });
  };
  const sub = epSub;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.from === -Infinity) {
      if (p.to === Infinity) {
        push(p.expr, "", 0);
        prev = p.expr;
      } else {
        // Left-sided first piece: P·u(b − t), then start from zero at b.
        push(p.expr, stepTex(p.to, v, true, discrete), p.to);
        prev = [];
      }
      prevEnd = p.to;
      continue;
    }
    // A gap before this piece means the previous expression has already been switched off.
    if (!samePoint(prevEnd, p.from) && prev.length) {
      push(sub([], prev), stepTex(prevEnd, v, false, discrete), prevEnd);
      prev = [];
    }
    push(sub(p.expr, prev), stepTex(p.from, v, false, discrete), p.from);
    prev = p.expr;
    prevEnd = p.to;
  }
  if (prev.length && Number.isFinite(prevEnd)) push(sub([], prev), stepTex(prevEnd, v, false, discrete), prevEnd);
  terms.push(...impulseTerms(sig.impulses, options));
  return joinTerms(terms);
}

/** Pretty complex number (for X(s) values, coefficients). */
export function texC(c: C): string {
  return niceC(c).tex;
}

/** Does writing c·e^{λT} instead of c look nicer? Exposed for the s-domain formatter. */
export function nicerWithShift(c: C, lambda: C, T: number): boolean {
  const k = cmul(c, cexp(cscale(lambda, T)));
  return complexityC(k) + 1 < complexityC(c);
}

/*
 * Fourier series of a periodic signal given by one period on [t0, t0 + T):
 *   c_k = (1/T) ∫ x(t) e^{−jkω₀t} dt,  ω₀ = 2π/T.
 * A piece term c·tⁿe^{λt} on [a, b) integrates to terms A·e^{−jkθ}/(λ − jω₀k)^m with
 * θ = ω₀·(end), so c_k is one formula in k: Σ_θ N_θ(k)·e^{−jkθ} / Π(jω₀k − λ)^M, with
 * e^{−jkπ} → (−1)^k and friends. The k where λ = jkω₀ (resonant harmonics, or k = 0 for
 * polynomial pieces) are listed separately.
 */

import { type C, cabs, cadd, cdiv, cexp, cmul, cscale, cx, ZERO } from "../math/complex";
import { nice, niceC, rationalize } from "../math/nice";
import { fft } from "../math/numeric";
import { padd, pmul, type Poly, ppow, pscale } from "../math/poly";
import type { Analysis } from "../signal/analyze";
import { epConj, epExp, epIntegral, epMul, factorial } from "../signal/exppoly";
import { joinFactor, texCases, texFactor as texExpFactor } from "../signal/format";
import type { ExpPoly } from "../signal/exppoly";
import { type Signal, sigIsReal, sigWindow } from "../signal/signal";
import type { Step } from "../steps";

export interface SeriesResult {
  exact: boolean;
  T: number;
  w0: number;
  /** c_k for any integer k. */
  coef(k: number): C;
  tex: {
    ck: string;
    /** Values at the k excluded from the general formula. */
    special: { k: number; tex: string }[];
    trig: { a0: string; ak: string; bk: string } | null;
  } | null;
  steps: Step[];
  /** Average power over a period, (1/T)∫|x|². */
  power: number;
  real: boolean;
  reason?: string;
}

interface Term {
  /** e^{−jkθ} pattern angle, θ = ω₀·end. */
  theta: number;
  lambda: C;
  /** Power of 1/(λ − jω₀k). */
  m: number;
  /** Coefficient (already divided by T). */
  A: C;
}

/** The terms of c_k from one piece of the period. */
function pieceTerms(p: Signal["pieces"][number], T: number, w0: number): Term[] {
  const out: Term[] = [];
  for (const g of p.expr) {
    g.poly.forEach((c, n) => {
      if (cabs(c) === 0) return;
      // ∫ tⁿe^{γt} = e^{γt} Σ_i (−1)^i n!/(n−i)! t^{n−i}/γ^{i+1}, γ = λ − jkω₀.
      for (const [end, sign] of [
        [p.to, 1],
        [p.from, -1],
      ] as const) {
        const e = cexp(cscale(g.rate, end));
        for (let i = 0; i <= n; i++) {
          const k = ((i % 2 === 0 ? 1 : -1) * factorial(n) * Math.pow(end, n - i)) / factorial(n - i);
          out.push({ theta: w0 * end, lambda: g.rate, m: i + 1, A: cscale(cmul(c, e), (sign * k) / T) });
        }
      }
    });
  }
  return out;
}

/** k for which λ = jkω₀: the general formula divides by zero there. */
function resonantKs(sig: Signal, w0: number): number[] {
  const ks = new Set<number>();
  for (const p of sig.pieces) {
    for (const g of p.expr) {
      if (Math.abs(g.rate.re) > 1e-12) continue;
      const k = g.rate.im / w0;
      if (Math.abs(k - Math.round(k)) < 1e-9) ks.add(Math.round(k));
    }
  }
  return [...ks].sort((a, b) => a - b);
}

/** Exact c_k by direct integration of each piece (stable for every k). */
function directCoef(sig: Signal, T: number, w0: number, k: number): C {
  const kernel = epExp(cx(0, -k * w0));
  let acc = ZERO;
  for (const p of sig.pieces) acc = cadd(acc, epIntegral(epMul(p.expr, kernel), p.from, p.to));
  for (const imp of sig.impulses) {
    // ∫ δ^(n)(t − a) e^{−jkω₀t} dt = (jkω₀)^n e^{−jkω₀a}
    let f = cx(1);
    for (let i = 0; i < imp.order; i++) f = cmul(f, cx(0, k * w0));
    acc = cadd(acc, cmul(imp.area, cmul(f, cexp(cx(0, -k * w0 * imp.at)))));
  }
  return cscale(acc, 1 / T);
}

function periodPower(sig: Signal, T: number): number {
  if (sig.impulses.length) return Infinity;
  let acc = 0;
  for (const p of sig.pieces) acc += epIntegral(epMul(p.expr, epConj(p.expr)), p.from, p.to).re;
  return acc / T;
}

export function fourierSeries(an: Analysis, T: number, t0: number): SeriesResult {
  const w0 = (2 * Math.PI) / T;
  if (an.kind === "error") return numericSeries(() => cx(NaN), T, t0, an.message);
  if (an.kind === "numeric" || an.special.length) {
    const f = an.f;
    return numericSeries(f, T, t0, an.kind === "numeric" ? an.reason : "sinc and Gaussian terms are integrated numerically.");
  }
  const sig = sigWindow(an.signal, t0, t0 + T);
  const special = resonantKs(sig, w0);
  const terms = sig.pieces.flatMap((p) => pieceTerms(p, T, w0));
  const impulseTerms: Term[] = sig.impulses
    .filter((i) => i.order === 0)
    .map((i) => ({ theta: w0 * i.at, lambda: cx(0), m: 0, A: cscale(i.area, 1 / T) }));
  const coef = (k: number) => directCoef(sig, T, w0, k);
  const ck = texCk([...terms, ...impulseTerms], w0);
  const specialTex = special.map((k) => ({ k, tex: niceC(coef(k)).tex }));
  const real = sigIsReal(sig);
  const trig = real && sig.pieces.every((p) => p.expr.every((g) => cabs(g.rate) < 1e-14)) && !sig.impulses.some((i) => i.order > 0) ? trigForm([...terms, ...impulseTerms], w0, coef(0)) : null;
  const steps = seriesSteps(sig, T, t0, w0, terms, impulseTerms, ck, specialTex, trig);
  return {
    exact: true,
    T,
    w0,
    coef,
    tex: sig.impulses.some((i) => i.order > 0) ? null : { ck, special: specialTex, trig },
    steps,
    power: periodPower(sig, T),
    real,
  };
}

// --- LaTeX for c_k ---------------------------------------------------------------

/** e^{−jkθ} with θ reduced mod 2π: 1, (−1)^k, (−j)^k, j^k, or e^{−jkθ}. */
function pattern(theta: number): { tex: string; key: string } {
  const twoPi = 2 * Math.PI;
  let t = ((theta % twoPi) + twoPi) % twoPi;
  if (Math.abs(t - twoPi) < 1e-9) t = 0;
  if (Math.abs(t) < 1e-9) return { tex: "", key: "0" };
  if (Math.abs(t - Math.PI) < 1e-9) return { tex: "(-1)^{k}", key: "pi" };
  if (Math.abs(t - Math.PI / 2) < 1e-9) return { tex: "(-j)^{k}", key: "pi/2" };
  if (Math.abs(t - (3 * Math.PI) / 2) < 1e-9) return { tex: "j^{k}", key: "3pi/2" };
  const n = nice(t > Math.PI ? t - twoPi : t);
  const neg = n.sign < 0;
  const body = n.den ? `\\frac{${joinFactor(n.num === "1" ? "" : n.num, "k")}}{${n.den}}` : joinFactor(n.num === "1" ? "" : n.num, "k");
  return { tex: `e^{${neg ? "" : "-"}j${body}}`, key: n.tex };
}

/** jω₀k − λ as a polynomial in k (lowest power first). */
const factorPoly = (lambda: C, w0: number): Poly => [cscale(lambda, -1), cx(0, w0)];

function texFactor(lambda: C, w0: number): string {
  const w = nice(w0);
  const wt = w.den ? `\\frac{${w.num}}{${w.den}}` : w.tex === "1" ? "" : w.tex;
  const jk = joinFactor(`j${wt}`, "k");
  if (cabs(lambda) < 1e-14) return jk;
  // −λ + jω₀k
  const m = cscale(lambda, -1);
  if (Math.abs(m.im) < 1e-12) {
    const r = nice(Math.abs(m.re));
    return m.re > 0 ? `${r.tex}+${jk}` : `${jk}-${r.tex}`;
  }
  if (Math.abs(m.re) < 1e-12) {
    // j(ω₀k − Im λ)
    const r = nice(Math.abs(m.im));
    return `j\\left(${joinFactor(wt, "k")}${m.im > 0 ? "+" : "-"}${r.tex}\\right)`;
  }
  return `\\left(${niceC(m).tex}\\right)+${jk}`;
}

/** c_k = Σ_θ N_θ(k) e^{−jkθ} / Π (jω₀k − λ)^M */
function texCk(terms: Term[], w0: number): string {
  if (terms.length === 0) return "0";
  // Highest power of each λ's factor.
  const lambdas: { lambda: C; M: number }[] = [];
  for (const t of terms) {
    if (t.m === 0) continue;
    const e = lambdas.find((l) => cabs(cadd(l.lambda, cscale(t.lambda, -1))) < 1e-10);
    if (e) e.M = Math.max(e.M, t.m);
    else lambdas.push({ lambda: t.lambda, M: t.m });
  }
  // Numerators per pattern: A/(λ − jω₀k)^m = A(−1)^m/(jω₀k − λ)^m, times the missing factors.
  const nums = new Map<string, { tex: string; poly: Poly; parts: Poly[] }>();
  for (const t of terms) {
    const pat = pattern(t.theta);
    let poly: Poly = [cscale(t.A, t.m % 2 === 0 ? 1 : -1)];
    for (const l of lambdas) {
      const same = cabs(cadd(l.lambda, cscale(t.lambda, -1))) < 1e-10 && t.m > 0;
      const power = same ? l.M - t.m : l.M;
      if (power > 0) poly = pmul(poly, ppow(factorPoly(l.lambda, w0), power));
    }
    const prev = nums.get(pat.key);
    nums.set(pat.key, { tex: pat.tex, poly: prev ? padd(prev.poly, poly) : poly, parts: [...(prev?.parts ?? []), poly] });
  }
  // Clear small denominators from the numerator coefficients.
  const all = [...nums.values()].flatMap((n) => n.poly.flatMap((c) => [c.re, c.im])).filter((v) => Math.abs(v) > 1e-12);
  let scale = 1;
  for (const v of all) {
    const r = rationalize(v, 32);
    if (!r) {
      scale = 1;
      break;
    }
    scale = lcm(scale, r[1]);
    if (scale > 1000) {
      scale = 1;
      break;
    }
  }
  const numParts: { sign: 1 | -1; body: string }[] = [];
  for (const { tex, poly, parts } of nums.values()) {
    const p = pscale(poly, cx(scale));
    const ptex = texKPoly(p, parts.map((q) => pscale(q, cx(scale))));
    if (!ptex) continue;
    if (ptex.single) numParts.push({ sign: ptex.sign, body: joinT(ptex.body === "1" && tex ? "" : ptex.body, tex) || "1" });
    else numParts.push({ sign: 1, body: tex || nums.size > 1 ? joinT(`\\left(${ptex.body}\\right)`, tex) : ptex.body });
  }
  const num = joinSigned(numParts);
  const denFactors = lambdas.map((l) => {
    const f = texFactor(l.lambda, w0);
    const needs = lambdas.length > 1 || l.M > 1 ? !/^j[^+-]*$/.test(f) : false;
    const body = needs ? `\\left(${f}\\right)` : f;
    return l.M > 1 ? `${needs ? body : `\\left(${body}\\right)`}^{${l.M}}` : body;
  });
  const scaleTex = scale === 1 ? "" : String(scale);
  const den = `${scaleTex}${denFactors.join("")}`;
  if (!den) return num;
  return `\\frac{${num}}{${den}}`;
}

function lcm(a: number, b: number): number {
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  return (a * b) / g(a, b);
}

const joinT = (a: string, b: string) => (!a ? b : !b ? a : `${a}${b}`);

/**
 * A polynomial in k with complex coefficients. `contrib` holds the separate contributions
 * that were summed into p: a coefficient like 1 − e^{−1} has no nice form as one number,
 * but its parts do.
 */
function texKPoly(p: Poly, contrib: Poly[] = []): { sign: 1 | -1; body: string; single: boolean } | null {
  const parts: { sign: 1 | -1; body: string }[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (cabs(c) < 1e-12) continue;
    const pow = i === 0 ? "" : i === 1 ? "k" : `k^{${i}}`;
    if (Math.abs(c.im) < 1e-12 * Math.max(1, cabs(c))) {
      const n = nice(Math.abs(c.re));
      const pieces = contrib.map((q) => q[i]).filter((x): x is C => !!x && cabs(x) > 1e-12);
      if (!n.exact && pieces.length > 1 && pieces.every((x) => Math.abs(x.im) < 1e-12 && nice(x.re).exact)) {
        const sum = joinSigned(pieces.map((x) => ({ sign: (x.re < 0 ? -1 : 1) as 1 | -1, body: nice(Math.abs(x.re)).tex })));
        parts.push({ sign: 1, body: pow ? joinFactor(`\\left(${sum}\\right)`, pow) : sum });
        if (!pow && p.filter((x) => cabs(x) > 1e-12).length === 1) return { sign: 1, body: sum, single: false };
        continue;
      }
      parts.push({ sign: c.re < 0 ? -1 : 1, body: pow && n.tex === "1" ? pow : joinFactor(n.tex, pow) });
    } else if (Math.abs(c.re) < 1e-12 * Math.max(1, cabs(c))) {
      parts.push({ sign: c.im < 0 ? -1 : 1, body: joinFactor(niceC(cx(0, Math.abs(c.im))).tex, pow) });
    } else parts.push({ sign: 1, body: `\\left(${niceC(c).tex}\\right)${pow}` });
  }
  if (!parts.length) return null;
  if (parts.length === 1) return { sign: parts[0].sign, body: parts[0].body, single: true };
  return { sign: 1, body: joinSigned(parts), single: false };
}

function joinSigned(terms: { sign: 1 | -1; body: string }[]): string {
  if (!terms.length) return "0";
  const firstPos = terms.findIndex((t) => t.sign > 0);
  const ordered = terms[0].sign < 0 && firstPos > 0 ? [terms[firstPos], ...terms.filter((_, i) => i !== firstPos)] : terms;
  return ordered.map((t, i) => (i === 0 ? (t.sign < 0 ? `-${t.body}` : t.body) : `${t.sign < 0 ? "-" : "+"}${t.body}`)).join("");
}

// --- Trigonometric form (real, piecewise-polynomial periods) ------------------------

interface TrigTerm {
  coef: number;
  trig: string;
  /** Multiplies k^{-q}. */
  q: number;
}

/**
 * With every λ = 0, c_k = Σ A_{θ,m} e^{−jkθ}/(−jω₀k)^m. Then a_k = 2 Re c_k and
 * b_k = −2 Im c_k, term by term: z e^{−jkθ} = (Re z cos kθ + Im z sin kθ) + j(Im z cos kθ − Re z sin kθ).
 */
function trigForm(terms: Term[], w0: number, c0: C): { a0: string; ak: string; bk: string } {
  const a: TrigTerm[] = [];
  const b: TrigTerm[] = [];
  for (const t of terms) {
    // z = A / (−jω₀)^m ; the k^{-m} goes to q.
    const z = t.m === 0 ? t.A : cdiv(t.A, powC(cx(0, -w0), t.m));
    const { cos, sin } = trigOf(t.theta);
    // a_k += 2(Re z cos + Im z sin), b_k += −2(Im z cos − Re z sin)
    addTrig(a, 2 * z.re, cos, t.m);
    addTrig(a, 2 * z.im, sin, t.m);
    addTrig(b, -2 * z.im, cos, t.m);
    addTrig(b, 2 * z.re, sin, t.m);
  }
  return { a0: nice(c0.re).tex, ak: texTrig(a), bk: texTrig(b) };
}

function powC(z: C, n: number): C {
  let out = cx(1);
  for (let i = 0; i < n; i++) out = cmul(out, z);
  return out;
}

function trigOf(theta: number): { cos: string | null; sin: string | null } {
  const twoPi = 2 * Math.PI;
  let t = ((theta % twoPi) + twoPi) % twoPi;
  if (Math.abs(t - twoPi) < 1e-9) t = 0;
  if (Math.abs(t) < 1e-9) return { cos: "1", sin: null };
  if (Math.abs(t - Math.PI) < 1e-9) return { cos: "(-1)^{k}", sin: null };
  const n = nice(t);
  const arg = n.den ? `\\frac{${joinFactor(n.num === "1" ? "" : n.num, "k")}}{${n.den}}` : joinFactor(n.num === "1" ? "" : n.num, "k");
  return { cos: `\\cos\\left(${arg}\\right)`, sin: `\\sin\\left(${arg}\\right)` };
}

function addTrig(list: TrigTerm[], coef: number, trig: string | null, q: number) {
  if (!trig || Math.abs(coef) < 1e-13) return;
  const e = list.find((x) => x.trig === trig && x.q === q);
  if (e) e.coef += coef;
  else list.push({ coef, trig, q });
}

/** Σ coef·trig·k^{−q}, grouped by q, with a common factor pulled out of each group. */
function texTrig(terms: TrigTerm[]): string {
  const live = terms.filter((t) => Math.abs(t.coef) > 1e-12);
  if (!live.length) return "0";
  const qs = [...new Set(live.map((t) => t.q))].sort((x, y) => x - y);
  const groups = qs.map((q) => {
    const g = live.filter((t) => t.q === q);
    const unit = Math.min(...g.map((t) => Math.abs(t.coef)));
    const ints = g.map((t) => t.coef / unit);
    const allInt = ints.every((v) => Math.abs(v - Math.round(v)) < 1e-9);
    const base = allInt ? unit : 1;
    const parts = g.map((t) => {
      const c = t.coef / base;
      const n = nice(Math.abs(c));
      const isOne = Math.abs(Math.abs(c) - 1) < 1e-12;
      return { sign: (c < 0 ? -1 : 1) as 1 | -1, body: t.trig === "1" ? n.tex : `${isOne ? "" : n.tex}${t.trig}` };
    });
    const num = joinSigned(parts);
    const nb = nice(base);
    const kq = q === 0 ? "" : q === 1 ? "k" : `k^{${q}}`;
    const numFactor = nb.num === "1" ? "" : nb.num;
    const denParts = joinFactor(nb.den ?? "", kq);
    const multi = parts.length > 1;
    const top = numFactor ? (multi ? `${numFactor}\\left(${num}\\right)` : joinFactor(numFactor, num === "1" ? "" : num)) : num;
    const sign = nb.sign < 0 ? "-" : "";
    return denParts ? `${sign}\\frac{${top}}{${denParts}}` : `${sign}${multi && numFactor ? top : top}`;
  });
  return groups.reduce((acc, g, i) => (i === 0 ? g : g.startsWith("-") ? `${acc}${g}` : `${acc}+${g}`), "");
}

// --- Steps --------------------------------------------------------------------------

function seriesSteps(
  sig: Signal,
  T: number,
  t0: number,
  w0: number,
  terms: Term[],
  impulseTerms: Term[],
  ck: string,
  special: { k: number; tex: string }[],
  trig: { a0: string; ak: string; bk: string } | null,
): Step[] {
  const Tt = nice(T).tex;
  const steps: Step[] = [
    {
      title: "One period, and the fundamental frequency",
      lines: [`x(t) = ${texCases(sig)}\\quad\\text{on } ${nice(t0).tex}\\le t<${nice(t0 + T).tex}`, `\\omega_0 = \\frac{2\\pi}{T} = ${nice(w0).tex}`],
    },
    {
      title: "The coefficient integral",
      lines: [`c_k = \\frac{1}{${Tt}}\\int_{${nice(t0).tex}}^{${nice(t0 + T).tex}} x(t)\\,e^{-jk\\omega_0 t}\\,dt`],
    },
  ];
  for (const p of sig.pieces.slice(0, 5)) {
    const pt = pieceTerms(p, T, w0);
    steps.push({
      title: `On ${nice(p.from).text} ≤ t < ${nice(p.to).text}`,
      lines: [`\\frac{1}{${Tt}}\\int_{${nice(p.from).tex}}^{${nice(p.to).tex}} ${seriesIntegrand(p.expr)}\\,dt = ${texCk(pt, w0)}`],
    });
  }
  if (impulseTerms.length) {
    steps.push({
      title: "Each impulse in the period contributes its area times e^{−jkω₀t} at its time",
      lines: [texCk(impulseTerms, w0)],
    });
  }
  if (special.length) {
    steps.push({
      title: "The general formula divides by zero at some k; integrate those directly",
      lines: special.map((s) => `c_{${s.k}} = ${s.tex}`),
    });
  }
  steps.push({ title: "Add the pieces", lines: [`c_k = ${ck}${special.length ? `,\\quad k \\ne ${special.join(",")}` : ""}`] });
  if (trig) {
    steps.push({
      title: "Trigonometric form: a₀ = c₀, aₖ = 2 Re cₖ, bₖ = −2 Im cₖ",
      lines: [
        `x(t) = a_0 + \\sum_{k=1}^{\\infty}\\left[a_k\\cos(k\\omega_0 t) + b_k\\sin(k\\omega_0 t)\\right]`,
        `a_0 = ${trig.a0},\\quad a_k = ${trig.ak},\\quad b_k = ${trig.bk}`,
      ],
    });
  }
  void terms;
  return steps;
}

function seriesIntegrand(e: ExpPoly): string {
  const kernel = "e^{-jk\\omega_0 t}";
  const f = texExpFactor(e);
  if (f.tex === "1") return kernel;
  return `${f.tex}\\,${kernel}`;
}

// --- Numeric fallback ---------------------------------------------------------------

/** c_k by FFT of samples at the midpoints of M equal slices of the period. */
export function numericSeries(f: (t: number) => C, T: number, t0: number, reason: string): SeriesResult {
  const M = 4096;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  const h = T / M;
  let pw = 0;
  for (let n = 0; n < M; n++) {
    const v = f(t0 + (n + 0.5) * h);
    re[n] = Number.isFinite(v.re) ? v.re : 0;
    im[n] = Number.isFinite(v.im) ? v.im : 0;
    pw += re[n] * re[n] + im[n] * im[n];
  }
  const R = re.slice();
  const I = im.slice();
  fft(R, I);
  const w0 = (2 * Math.PI) / T;
  const coef = (k: number): C => {
    if (Math.abs(k) >= M / 2) return ZERO;
    const idx = ((k % M) + M) % M;
    const c = cx(R[idx] / M, I[idx] / M);
    // Undo the sampling offset: samples start at t0 + h/2.
    return cmul(c, cexp(cx(0, -k * w0 * (t0 + h / 2))));
  };
  let real = true;
  for (let n = 0; n < M; n += 64) if (Math.abs(im[n]) > 1e-9 * Math.max(1, Math.abs(re[n]))) real = false;
  return {
    exact: false,
    T,
    w0,
    coef,
    tex: null,
    steps: [],
    power: pw / M,
    real,
    reason,
  };
}

/** x_N(t) = Σ_{|k|≤N} c_k e^{jkω₀t}, from precomputed coefficients c[k + N]. */
export function partialSum(coefs: C[], N: number, w0: number, t: number): C {
  let re = 0;
  let im = 0;
  const K = (coefs.length - 1) / 2;
  for (let k = -N; k <= N; k++) {
    const c = coefs[k + K];
    if (!c) continue;
    const a = k * w0 * t;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    re += c.re * cs - c.im * sn;
    im += c.re * sn + c.im * cs;
  }
  return { re, im };
}

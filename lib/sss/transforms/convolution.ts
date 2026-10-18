/*
 * Exact convolution y(t) = ∫ x(τ) h(t − τ) dτ of piecewise exp-polynomial signals.
 * For pieces x_i on [p, q) and h_j on [r, s) the integral runs over
 *   L(t) = max(p, t − s)  to  U(t) = min(q, t − r),
 * each limit being a constant or t − const between the breakpoints p+r, q+r, p+s, q+s.
 * Expanding (t − τ)ⁿ binomially leaves terms τᵈe^{γτ} whose antiderivatives, evaluated at
 * those limits, are again exp-polynomials in t. Impulses shift (and differentiate) the
 * other signal: x * δ⁽ᵏ⁾(t − a) = x⁽ᵏ⁾(t − a).
 */

import { type C, cisFinite, cmul, cscale, csub, ZERO } from "../math/complex";
import { nice } from "../math/nice";
import { antiderivTerm, binom, epAdd, epCompose, epEval, epIsZero, epLimit, epMul, epNormalize, type ExpPoly } from "../signal/exppoly";
import { texCases, texExpPoly } from "../signal/format";
import {
  type Impulse,
  type Piece,
  type Signal,
  samePoint,
  sigAdd,
  sigDeriv,
  sigNormalize,
  sigPiece,
  sigScale,
  sigShift,
  sigZero,
} from "../signal/signal";
import type { Step } from "../steps";

export type Lim = { kind: "const"; value: number } | { kind: "t"; offset: number } | { kind: "inf"; sign: 1 | -1 };

export interface ConvPart {
  /** Which x and h pieces overlap (indices into the signals' pieces). */
  xPiece: number;
  hPiece: number;
  lower: Lim;
  upper: Lim;
  from: number;
  to: number;
  expr: ExpPoly;
}

export interface ImpulsePart {
  /** "x" when x has the impulse (so h is shifted), else "h". */
  of: "x" | "h";
  impulse: Impulse;
  /** The shifted copy it adds. */
  signal: Signal;
}

export interface ConvInterval {
  from: number;
  to: number;
  expr: ExpPoly;
  parts: ConvPart[];
}

export type ConvResult =
  | { ok: true; y: Signal; intervals: ConvInterval[]; impulseParts: ImpulsePart[]; steps: Step[] }
  | { ok: false; message: string };

class Diverges extends Error {}

/** F at a limit: a constant, an exp-poly in t (for t − o), or 0 at ±∞ (else it diverges). */
function atLimit(F: ExpPoly, lim: Lim): ExpPoly {
  if (lim.kind === "const") {
    const v = epEval(F, lim.value);
    return v.re === 0 && v.im === 0 ? [] : [{ rate: ZERO, poly: [v] }];
  }
  if (lim.kind === "t") return epCompose(F, 1, -lim.offset);
  const v = epLimit(F, lim.sign);
  if (!cisFinite(v)) throw new Diverges();
  return [];
}

/** ∫_L^U X(τ) H(t − τ) dτ as an exp-polynomial in t. */
function pairIntegral(X: ExpPoly, H: ExpPoly, lower: Lim, upper: Lim): ExpPoly {
  const out: ExpPoly = [];
  for (const gx of X) {
    for (const gh of H) {
      const gamma = csub(gx.rate, gh.rate);
      gx.poly.forEach((pm, m) => {
        if (pm.re === 0 && pm.im === 0) return;
        gh.poly.forEach((qn, n) => {
          if (qn.re === 0 && qn.im === 0) return;
          for (let k = 0; k <= n; k++) {
            // p_m q_n C(n,k) (−1)^k · t^{n−k} e^{βt} · τ^{m+k} e^{(α−β)τ}
            const coef = cscale(cmul(pm, qn), binom(n, k) * (k % 2 === 0 ? 1 : -1));
            const F = antiderivTerm(m + k, gamma);
            const diff = epAdd(atLimit(F, upper), atLimit(F, lower).map((g) => ({ rate: g.rate, poly: g.poly.map((c) => cscale(c, -1)) })));
            if (epIsZero(diff)) continue;
            const tPart: ExpPoly = [{ rate: gh.rate, poly: [...Array.from({ length: n - k }, () => ZERO), coef] }];
            out.push(...epMul(tPart, diff));
          }
        });
      });
    }
  }
  return epNormalize(out);
}

/** Contributions of one pair of pieces, interval by interval. */
function pairParts(x: Piece, h: Piece, xi: number, hj: number): ConvPart[] {
  const { from: p, to: q } = x;
  const { from: r, to: s } = h;
  const lo = p + r; // support starts (−∞ if either is)
  const hi = q + s;
  if (!(lo < hi)) return [];
  const cuts = [lo, q + r, p + s, hi].filter((v) => Number.isFinite(v) && v >= lo && v <= hi);
  const bps = [...new Set([lo, ...cuts, hi])].sort((a, b) => a - b);
  const out: ConvPart[] = [];
  for (let i = 0; i + 1 < bps.length; i++) {
    const a = bps[i];
    const b = bps[i + 1];
    if (!(a < b) || samePoint(a, b)) continue;
    const tm = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a + 1 : Number.isFinite(b) ? b - 1 : 0;
    // L = max(p, t − s), U = min(q, t − r)
    const lower: Lim =
      s === Infinity ? (p === -Infinity ? { kind: "inf", sign: -1 } : { kind: "const", value: p }) : p !== -Infinity && tm - s <= p ? { kind: "const", value: p } : { kind: "t", offset: s };
    const upper: Lim =
      r === -Infinity ? (q === Infinity ? { kind: "inf", sign: 1 } : { kind: "const", value: q }) : q !== Infinity && tm - r >= q ? { kind: "const", value: q } : { kind: "t", offset: r };
    const expr = pairIntegral(x.expr, h.expr, lower, upper);
    out.push({ xPiece: xi, hPiece: hj, lower, upper, from: a, to: b, expr });
  }
  return out;
}

/** h^(k)(t − a)·A: what an impulse A·δ^(k)(t − a) in the other signal contributes. */
function impulseCopy(other: Signal, imp: Impulse): Signal {
  let d = other;
  for (let i = 0; i < imp.order; i++) d = sigDeriv(d);
  return sigScale(sigShift(d, imp.at), imp.area);
}

export function convolve(x: Signal, h: Signal): ConvResult {
  try {
    const parts: ConvPart[] = [];
    x.pieces.forEach((xp, i) => h.pieces.forEach((hp, j) => parts.push(...pairParts(xp, hp, i, j))));
    let y = sigZero();
    for (const part of parts) y = sigAdd(y, sigPiece(part.from, part.to, part.expr));
    const impulseParts: ImpulsePart[] = [];
    for (const imp of x.impulses) impulseParts.push({ of: "x", impulse: imp, signal: impulseCopy(h, imp) });
    const hPiecesOnly: Signal = { pieces: x.pieces, impulses: [] };
    for (const imp of h.impulses) impulseParts.push({ of: "h", impulse: imp, signal: impulseCopy(hPiecesOnly, imp) });
    for (const ip of impulseParts) y = sigAdd(y, ip.signal);
    y = sigNormalize(y);
    const finite = y.pieces.every((p) => p.expr.every((g) => g.poly.every(cisFinite) && cisFinite(g.rate)));
    if (!finite) return { ok: false, message: "The numbers are too large for an exact result." };
    const intervals = y.pieces.map((p) => ({
      from: p.from,
      to: p.to,
      expr: p.expr,
      parts: parts.filter((c) => c.from <= p.from + 1e-12 && c.to >= p.to - 1e-12 && !epIsZero(c.expr)),
    }));
    return { ok: true, y, intervals, impulseParts, steps: convSteps(x, h, y, intervals, impulseParts) };
  } catch (e) {
    if (e instanceof Diverges) {
      return {
        ok: false,
        message:
          "The convolution integral diverges: x(τ)h(t − τ) doesn't die out as τ → ±∞ (for example u(t) * 1). At least one of the signals has to decay, or both be one-sided in the same direction.",
      };
    }
    throw e;
  }
}

// --- Display -----------------------------------------------------------------------

export function texLim(l: Lim): string {
  if (l.kind === "inf") return l.sign > 0 ? "\\infty" : "-\\infty";
  if (l.kind === "const") return nice(l.value).tex;
  if (Math.abs(l.offset) < 1e-12) return "t";
  return `t${l.offset > 0 ? "-" : "+"}${nice(Math.abs(l.offset)).tex}`;
}

/** The integrand x_i(τ)·h_j(t − τ) as LaTeX. */
export function texIntegrand(X: ExpPoly, H: ExpPoly): string {
  const xs = texExpPoly(X, { v: "\\tau" });
  const hs = texExpPoly(H, { v: "(t-\\tau)" });
  const wrap = (s: string) => (s === "1" ? "" : /[+-]/.test(s.replace(/^-/, "").replace(/\{[^}]*\}|\([^)]*\)/g, "")) ? `\\left(${s}\\right)` : s);
  const a = wrap(xs);
  const b = wrap(hs);
  if (!a && !b) return "1";
  if (!a) return b;
  if (!b) return a;
  return `${a}\\,${b}`;
}

function intervalTitle(from: number, to: number): string {
  const a = Number.isFinite(from) ? nice(from).text : null;
  const b = Number.isFinite(to) ? nice(to).text : null;
  if (a !== null && b !== null) return `For ${a} ≤ t < ${b}`;
  if (a !== null) return `For t ≥ ${a}`;
  if (b !== null) return `For t < ${b}`;
  return "For all t";
}

function impulseTex(ip: ImpulsePart): string {
  const name = ip.of === "x" ? "h" : "x";
  const a = ip.impulse.area;
  const coef = Math.abs(a.im) < 1e-12 ? (Math.abs(a.re - 1) < 1e-12 ? "" : Math.abs(a.re + 1) < 1e-12 ? "-" : nice(a.re).tex) : `(${nice(a.re).tex}+${nice(a.im).tex}j)`;
  const d = ip.impulse.order === 0 ? "" : ip.impulse.order === 1 ? "'" : `^{(${ip.impulse.order})}`;
  const arg = Math.abs(ip.impulse.at) < 1e-12 ? "t" : `t${ip.impulse.at > 0 ? "-" : "+"}${nice(Math.abs(ip.impulse.at)).tex}`;
  return `${coef}${name}${d}(${arg})`;
}

function convSteps(x: Signal, h: Signal, y: Signal, intervals: ConvInterval[], impulseParts: ImpulsePart[]): Step[] {
  const steps: Step[] = [
    {
      title: "Flip h and slide it: h(t − τ) is h(τ) reversed and moved to τ = t",
      lines: ["y(t) = \\int_{-\\infty}^{\\infty} x(\\tau)\\,h(t-\\tau)\\,d\\tau"],
    },
    {
      title: "The two signals, piece by piece",
      lines: [`x(\\tau) = ${texCases(x, { v: "\\tau" })}`, `h(\\tau) = ${texCases(h, { v: "\\tau" })}`],
    },
  ];
  if (impulseParts.length) {
    steps.push({
      title: "Impulses copy the other signal to their location (sifting): x(t) * δ(t − a) = x(t − a)",
      lines: [impulseParts.map(impulseTex).join(" + ")],
    });
  }
  for (const iv of intervals.slice(0, 8)) {
    if (iv.parts.length === 0) continue;
    const integrals = iv.parts.map((p) => `\\int_{${texLim(p.lower)}}^{${texLim(p.upper)}} ${texIntegrand(x.pieces[p.xPiece].expr, h.pieces[p.hPiece].expr)}\\,d\\tau`);
    steps.push({
      title: `${intervalTitle(iv.from, iv.to)}, the pieces overlap from the lower to the upper limit`,
      lines: [`y(t) = ${integrals.join(" + ")}${impulseParts.length ? "+\\cdots" : ""}`, `\\phantom{y(t)} = ${texExpPoly(iv.expr, { shiftHints: [iv.from, iv.to].filter(Number.isFinite) })}`],
    });
  }
  steps.push({ title: "Put the intervals together", lines: [`y(t) = ${texCases(y)}`] });
  return steps;
}

// --- Numeric fallback --------------------------------------------------------------

/** Sampled convolution on a common grid; returns y on [ax + ah, bx + bh]. */
export function convolveNumeric(
  fx: (t: number) => C,
  fh: (t: number) => C,
  [ax, bx]: [number, number],
  [ah, bh]: [number, number],
  n = 1600,
): { t: Float64Array; y: Float64Array } {
  const dt = Math.max(bx - ax, bh - ah) / n;
  const nx = Math.max(2, Math.round((bx - ax) / dt));
  const nh = Math.max(2, Math.round((bh - ah) / dt));
  const xs = new Float64Array(nx);
  const hs = new Float64Array(nh);
  for (let i = 0; i < nx; i++) xs[i] = fx(ax + (i + 0.5) * dt).re;
  for (let i = 0; i < nh; i++) hs[i] = fh(ah + (i + 0.5) * dt).re;
  const ny = nx + nh - 1;
  const t = new Float64Array(ny);
  const y = new Float64Array(ny);
  for (let k = 0; k < ny; k++) {
    let acc = 0;
    const i0 = Math.max(0, k - nh + 1);
    const i1 = Math.min(nx - 1, k);
    for (let i = i0; i <= i1; i++) acc += xs[i] * hs[k - i];
    y[k] = (Number.isFinite(acc) ? acc : 0) * dt;
    t[k] = ax + ah + (k + 1) * dt;
  }
  return { t, y };
}


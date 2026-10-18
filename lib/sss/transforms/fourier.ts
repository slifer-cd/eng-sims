/*
 * Fourier transform. For exact signals it is the Laplace computation on the jω axis:
 * when every tail decays, X(jω) = X(s)|_{s=jω}. A tail term c·tⁿe^{jω₀t} that doesn't
 * decay adds c·π·jⁿ·δ⁽ⁿ⁾(ω − ω₀) (the generalized transform: a constant gives 2πδ(ω),
 * u(t) gives πδ(ω) + 1/(jω)); a growing tail has no Fourier transform at all.
 */

import { type C, cabs, cadd, cexp, cisFinite, cmul, cpow, cscale, cx, J, ZERO } from "../math/complex";
import { nice, niceC } from "../math/nice";
import { fft, nextPow2 } from "../math/numeric";
import type { Analysis } from "../signal/analyze";
import { epAntideriv, epEval, epExp, epIntegral, epMul, type ExpPoly } from "../signal/exppoly";
import { type SpecialTerm, specialFourierAt } from "../signal/special";
import type { Step } from "../steps";
import { impulseTransform, integralSteps, pieceTransform, specialSteps, splitTails } from "./laplace";
import { groupRational, type SExpr, sexprNormalize, sexprPoles, texSExpr } from "./sdomain";

export interface FtImpulse {
  /** ω₀ */
  at: number;
  area: C;
  order: number;
}

export type FourierResult =
  | {
      kind: "exact";
      at(w: number): C;
      impulses: FtImpulse[];
      tex: string;
      magPhase: { mag: string; phase: string | null } | null;
      steps: Step[];
      /** True when the transform needed impulses (the ROC doesn't contain the jω axis). */
      generalized: boolean;
      X: SExpr;
    }
  | { kind: "none"; reason: string }
  | { kind: "numeric"; omega: Float64Array; re: Float64Array; im: Float64Array; note: string; at(w: number): C };

/** ∫ over one piece of one exp-group times e^{−jωt}, regularized when the tail doesn't decay. */
function groupIntegral(group: ExpPoly, from: number, to: number, w: number): C {
  const kernel = epExp(cx(0, -w));
  const integrand = epMul(group, kernel);
  const v = epIntegral(integrand, from, to);
  if (cisFinite(v)) return v;
  // Boundary (undamped) tail: keep the finite end of the antiderivative; the impulse at ω₀ is separate.
  const F = epAntideriv(integrand);
  if (to === Infinity && Number.isFinite(from)) return cscale(epEval(F, from), -1);
  if (from === -Infinity && Number.isFinite(to)) return epEval(F, to);
  return cx(NaN, NaN);
}

export function fourier(an: Analysis): FourierResult {
  if (an.kind === "error") return { kind: "none", reason: an.message };
  if (an.kind === "numeric") return fourierNumericResult(an.f);
  const sig = splitTails(an.signal);
  const impulses: FtImpulse[] = [];
  for (const p of sig.pieces) {
    const right = p.to === Infinity;
    const left = p.from === -Infinity;
    if (!right && !left) continue;
    for (const g of p.expr) {
      const re = g.rate.re;
      const grows = right ? re > 1e-12 : re < -1e-12;
      if (grows) {
        return {
          kind: "none",
          reason: `x(t) grows like e^{${nice(re).text}t} as t → ${right ? "∞" : "−∞"}, so ∫x(t)e^{−jωt}dt diverges for every ω. Try the Laplace transform, which converges in a region of the s-plane.`,
        };
      }
      if (Math.abs(re) <= 1e-12) {
        // Undamped tail: c·tⁿ·e^{jω₀t} contributes c·π·jⁿ·δ⁽ⁿ⁾(ω − ω₀).
        g.poly.forEach((c, n) => {
          if (c.re === 0 && c.im === 0) return;
          impulses.push({ at: g.rate.im, area: cmul(cscale(c, Math.PI), cpow(J, n)), order: n });
        });
      }
    }
  }
  const merged = mergeImpulses(impulses);
  const parts: SExpr = [];
  for (const p of sig.pieces) parts.push(...pieceTransform(p).X);
  for (const imp of sig.impulses) parts.push(...impulseTransform(imp));
  const X = sexprNormalize(parts);
  const special = an.special;

  const at = (w: number): C => {
    let v = ZERO;
    for (const p of sig.pieces) for (const g of p.expr) v = cadd(v, groupIntegral([g], p.from, p.to, w));
    for (const imp of sig.impulses) {
      const jw = cx(0, w);
      v = cadd(v, cmul(imp.area, cmul(cpow(jw, imp.order), cexp(cscale(jw, -imp.at)))));
    }
    for (const t of special) v = cadd(v, specialFourierAt(t, cx(w)));
    return v;
  };

  const texParts: string[] = [];
  if (X.length) texParts.push(texSExpr(X, "jw"));
  for (const imp of merged) texParts.push(texFtImpulse(imp));
  for (const t of special) texParts.push(texSpecialFourier(t));
  const tex = joinPlus(texParts);

  let steps: Step[];
  if (special.length) steps = specialSteps(special, "jw");
  else {
    steps = integralSteps(sig, "j\\omega", X);
    if (merged.length) {
      steps.splice(steps.length - 1, 0, {
        title: "Undamped tails don't make the integral converge; as a generalized function they give impulses",
        lines: [
          "e^{j\\omega_0 t}u(t) \\;\\leftrightarrow\\; \\pi\\delta(\\omega-\\omega_0) + \\frac{1}{j(\\omega-\\omega_0)},\\qquad 1 \\;\\leftrightarrow\\; 2\\pi\\delta(\\omega)",
          `\\text{here: } ${joinPlus(merged.map(texFtImpulse))}`,
        ],
      });
      steps[steps.length - 1] = {
        title: "Add everything",
        lines: [`X(j\\omega) = ${tex}`],
      };
    } else {
      steps.push({
        title: "Check: the Laplace ROC contains the jω axis, so the Fourier transform is X(s) on that axis",
        lines: ["X(j\\omega) = X(s)\\big|_{s=j\\omega}"],
      });
    }
  }
  return {
    kind: "exact",
    at,
    impulses: merged,
    tex,
    magPhase: special.length || merged.length ? null : magPhaseTex(X),
    steps,
    generalized: merged.length > 0,
    X,
  };
}

function mergeImpulses(list: FtImpulse[]): FtImpulse[] {
  const out: FtImpulse[] = [];
  for (const i of list) {
    const e = out.find((o) => o.order === i.order && Math.abs(o.at - i.at) < 1e-9);
    if (e) e.area = cadd(e.area, i.area);
    else out.push({ ...i });
  }
  return out.filter((i) => cabs(i.area) > 1e-12).sort((a, b) => a.at - b.at);
}

function joinPlus(parts: string[]): string {
  return parts.reduce((acc, p, i) => (i === 0 ? p : p.startsWith("-") ? `${acc}${p}` : `${acc}+${p}`), "") || "0";
}

/** area·δ⁽ⁿ⁾(ω − ω₀) with area a multiple of π shown as such. */
export function texFtImpulse(i: FtImpulse): string {
  const real = Math.abs(i.area.im) < 1e-12;
  const coef = real ? nice(i.area.re) : niceC(i.area);
  const c = coef.tex === "1" ? "" : coef.tex === "-1" ? "-" : real ? coef.tex : `\\left(${coef.tex}\\right)`;
  const d = i.order === 0 ? "\\delta" : i.order === 1 ? "\\delta'" : `\\delta^{(${i.order})}`;
  const arg = Math.abs(i.at) < 1e-12 ? "\\omega" : `\\omega${i.at > 0 ? "-" : "+"}${nice(Math.abs(i.at)).tex}`;
  return `${c}${d}(${arg})`;
}

/** Table transforms of sinc/Gaussian terms. */
export function texSpecialFourier(t: SpecialTerm): string {
  const a = t.scale;
  const wm = t.mod.im;
  const w = Math.abs(wm) < 1e-12 ? "\\omega" : `(\\omega${wm > 0 ? "-" : "+"}${nice(Math.abs(wm)).tex})`;
  const wBare = Math.abs(wm) < 1e-12 ? "\\omega" : `\\omega${wm > 0 ? "-" : "+"}${nice(Math.abs(wm)).tex}`;
  const shift = Math.abs(t.shift) < 1e-12 ? "" : `e^{${t.shift > 0 ? "-" : ""}j${nice(Math.abs(t.shift)).tex === "1" ? "" : nice(Math.abs(t.shift)).tex}${w}}`;
  const amp = t.amp.re;
  if (t.kind === "gauss") {
    const k = nice((amp * Math.sqrt(Math.PI)) / a);
    const q = nice(4 * a * a);
    return `${k.tex === "1" ? "" : k.tex}e^{-\\frac{${w}^{2}}{${q.tex}}}${shift}`;
  }
  const k = nice(amp / a);
  const fn = t.kind === "sinc" ? "\\operatorname{rect}" : "\\operatorname{tri}";
  const den = nice(2 * Math.PI * a);
  return `${k.tex === "1" ? "" : k.tex}${fn}\\!\\left(\\frac{${wBare}}{${den.tex}}\\right)${shift}`;
}

/** |X(jω)| and ∠X(jω) as formulas, for a rational X with an optional delay. */
function magPhaseTex(X: SExpr): { mag: string; phase: string | null } | null {
  if (X.length !== 1) return null;
  const g = X[0];
  const { num, den } = groupRational(g);
  if (!num.every((c) => Math.abs(c.im) < 1e-9) || den.length === 0) return null;
  const poles = sexprPoles(X);
  // |N(jω)|: split N(jω) = A(ω) + jB(ω).
  const n = num.map((c) => c.re);
  const A: number[] = [];
  const B: number[] = [];
  n.forEach((c, k) => {
    // (jω)^k = j^k ω^k
    const r = k % 4;
    const sign = r === 0 || r === 1 ? 1 : -1;
    if (k % 2 === 0) A[k] = (A[k] ?? 0) + sign * c;
    else B[k] = (B[k] ?? 0) + sign * c;
  });
  const sq = polySquareSum(A, B);
  const numMag = sq.filter((c) => Math.abs(c) > 1e-12).length === 1 && Math.abs(sq[0] ?? 0) > 1e-12 ? nice(Math.sqrt(sq[0])).tex : `\\sqrt{${texOmegaPoly(sq)}}`;
  const denParts: string[] = [];
  const phaseParts: string[] = [];
  let phaseOk = true;
  const used = new Set<number>();
  poles.forEach((r, i) => {
    if (used.has(i)) return;
    used.add(i);
    if (Math.abs(r.p.im) < 1e-12) {
      const a = -r.p.re;
      const inner = Math.abs(a) < 1e-12 ? "\\omega^{2}" : `\\omega^{2}+${nice(a * a).tex}`;
      denParts.push(Math.abs(a) < 1e-12 ? (r.mult === 1 ? "|\\omega|" : `|\\omega|^{${r.mult}}`) : r.mult === 1 ? `\\sqrt{${inner}}` : r.mult === 2 ? `\\left(${inner}\\right)` : `\\left(${inner}\\right)^{${nice(r.mult / 2).tex}}`);
      if (a > 0) phaseParts.push(`${r.mult > 1 ? r.mult : ""}\\tan^{-1}\\!\\left(\\frac{\\omega}{${nice(a).tex}}\\right)`);
      else phaseOk = false;
      return;
    }
    const j = poles.findIndex((q, k) => !used.has(k) && Math.abs(q.p.re - r.p.re) < 1e-9 && Math.abs(q.p.im + r.p.im) < 1e-9);
    if (j >= 0) used.add(j);
    const b = -2 * r.p.re;
    const c = r.p.re * r.p.re + r.p.im * r.p.im;
    const inner = `\\left(${nice(c).tex}-\\omega^{2}\\right)^{2}+${b === 0 ? "0" : `${nice(b * b).tex}\\omega^{2}`}`;
    denParts.push(r.mult === 1 ? `\\sqrt{${inner}}` : `\\left(${inner}\\right)^{${nice(r.mult / 2).tex}}`);
    if (b > 0) phaseParts.push(`${r.mult > 1 ? r.mult : ""}\\tan^{-1}\\!\\left(\\frac{${nice(b).tex === "1" ? "" : nice(b).tex}\\omega}{${nice(c).tex}-\\omega^{2}}\\right)`);
    else phaseOk = false;
  });
  const mag = denParts.length ? `\\frac{${numMag}}{${denParts.join("")}}` : numMag;
  // Phase: only when the numerator is a positive constant (otherwise its angle adds terms).
  const numConst = n.length === 1;
  let phase: string | null = null;
  if (phaseOk && numConst) {
    const terms = [...(n[0] < 0 ? ["\\pi"] : []), ...phaseParts.map((p) => `-${p}`)];
    if (Math.abs(g.delay) > 1e-12) terms.push(`-${nice(g.delay).tex === "1" ? "" : nice(g.delay).tex}\\omega`);
    phase = terms.join("").replace(/^\+/, "") || "0";
  }
  return { mag, phase };
}

/** A(ω)² + B(ω)² as coefficients in ω. */
function polySquareSum(A: number[], B: number[]): number[] {
  const sq = (p: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < p.length; i++) for (let k = 0; k < p.length; k++) out[i + k] = (out[i + k] ?? 0) + (p[i] ?? 0) * (p[k] ?? 0);
    return out;
  };
  const a = sq(A);
  const b = sq(B);
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function texOmegaPoly(p: number[]): string {
  const parts: string[] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (!c || Math.abs(c) < 1e-12) continue;
    const n = nice(Math.abs(c));
    const pow = k === 0 ? "" : k === 1 ? "\\omega" : `\\omega^{${k}}`;
    const coef = k === 0 ? n.tex : n.tex === "1" ? "" : n.tex;
    parts.push(`${parts.length ? (c < 0 ? "-" : "+") : c < 0 ? "-" : ""}${coef}${pow}`);
  }
  return parts.join("") || "0";
}

/** A frequency window [−W, W] that shows the interesting part of the spectrum. */
export function freqWindow(an: Analysis, ft?: FourierResult): number {
  let W = 10;
  if (an.kind === "exact") {
    for (const p of an.signal.pieces) {
      for (const g of p.expr) W = Math.max(W, 6 * cabs(g.rate), 1.6 * Math.abs(g.rate.im) + 6);
      if (Number.isFinite(p.from) && Number.isFinite(p.to)) W = Math.max(W, (8 * Math.PI) / Math.max(0.05, p.to - p.from));
    }
    for (const s of an.special) W = Math.max(W, 1.6 * (Math.abs(s.mod.im) + (s.kind === "gauss" ? 4 * s.scale : 2 * Math.PI * s.scale)));
    if (ft?.kind === "exact") for (const i of ft.impulses) W = Math.max(W, 1.5 * Math.abs(i.at) + 4);
  } else if (ft?.kind === "numeric") {
    W = ft.omega[ft.omega.length - 1];
  }
  return Math.min(400, W);
}

/** Numeric transform: trapezoid sum of samples on a wide window, evaluated on an ω grid. */
export function fourierNumeric(f: (t: number) => C, [a, b]: [number, number], wMax?: number): { omega: Float64Array; re: Float64Array; im: Float64Array } {
  const N = 4096;
  const dt = (b - a) / (N - 1);
  const xr = new Float64Array(N);
  const xi = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const v = f(a + i * dt);
    xr[i] = Number.isFinite(v.re) ? v.re : 0;
    xi[i] = Number.isFinite(v.im) ? v.im : 0;
  }
  let W = wMax;
  if (!W) {
    // Bandwidth from an FFT: where the spectrum falls below 0.1% of its peak.
    const M = nextPow2(N);
    const re = new Float64Array(M);
    const im = new Float64Array(M);
    re.set(xr);
    im.set(xi);
    fft(re, im);
    const mags = Array.from({ length: M / 2 }, (_, k) => Math.hypot(re[k], im[k]) + Math.hypot(re[(M - k) % M], im[(M - k) % M]));
    const peak = Math.max(...mags);
    let last = 1;
    mags.forEach((m, k) => {
      if (m > 1e-3 * peak) last = k;
    });
    W = Math.min(Math.PI / dt, Math.max(5, ((1.3 * last) * 2 * Math.PI) / (M * dt)));
  }
  const K = 801;
  const omega = new Float64Array(K);
  const outRe = new Float64Array(K);
  const outIm = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    const w = -W + (2 * W * k) / (K - 1);
    omega[k] = w;
    // Σ x(t)e^{−jωt}dt with a recurrence for e^{−jω t_i}.
    let cr = Math.cos(w * a);
    let ci = -Math.sin(w * a);
    const sr = Math.cos(w * dt);
    const si = -Math.sin(w * dt);
    let accR = 0;
    let accI = 0;
    for (let i = 0; i < N; i++) {
      const wgt = i === 0 || i === N - 1 ? 0.5 : 1;
      accR += wgt * (xr[i] * cr - xi[i] * ci);
      accI += wgt * (xr[i] * ci + xi[i] * cr);
      const nr = cr * sr - ci * si;
      ci = cr * si + ci * sr;
      cr = nr;
    }
    outRe[k] = accR * dt;
    outIm[k] = accI * dt;
  }
  return { omega, re: outRe, im: outIm };
}

function fourierNumericResult(f: (t: number) => C): FourierResult {
  // Window: where the signal is significant, with margin.
  const probe = 4000;
  const R = 60;
  let maxV = 0;
  let first = -1;
  let last = -1;
  const vals: number[] = [];
  for (let i = 0; i <= probe; i++) {
    const v = cabs(f(-R + (2 * R * i) / probe));
    vals.push(Number.isFinite(v) ? v : 0);
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }
  vals.forEach((v, i) => {
    if (v > 1e-4 * maxV) {
      if (first < 0) first = i;
      last = i;
    }
  });
  const decays = vals[0] < 1e-3 * maxV && vals[probe] < 1e-3 * maxV;
  const a = first < 0 ? -10 : -R + (2 * R * first) / probe;
  const b = last < 0 ? 10 : -R + (2 * R * last) / probe;
  const pad = (b - a) * 0.5 + 1;
  const res = fourierNumeric(f, [a - pad, b + pad]);
  const note = decays
    ? "Computed numerically: the integral of x(t)e^{−jωt} over the window where x(t) is non-negligible."
    : "Computed numerically over a finite window: x(t) doesn't die out, so its true transform may not exist (or may contain impulses).";
  const at = (w: number): C => {
    const { omega, re, im } = res;
    if (w <= omega[0] || w >= omega[omega.length - 1]) return cx(NaN, NaN);
    const k = Math.min(omega.length - 2, Math.floor(((w - omega[0]) / (omega[omega.length - 1] - omega[0])) * (omega.length - 1)));
    const u = (w - omega[k]) / (omega[k + 1] - omega[k]);
    return cx(re[k] + u * (re[k + 1] - re[k]), im[k] + u * (im[k + 1] - im[k]));
  };
  return { kind: "numeric", ...res, note, at };
}


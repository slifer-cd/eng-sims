/*
 * A causal LTI system given by H(s): impulse and step responses, stability, the frequency
 * response for Bode plots, and the output for an input with a Laplace transform
 * (Y = X·H, then partial fractions; the pole sets are known exactly).
 */

import { type C, cabs, cx, ZERO } from "../math/complex";
import { nice } from "../math/nice";
import { findRoots, type Root } from "../math/poly";
import type { Step } from "../steps";
import { type InverseResult, inverseLaplace } from "./inverse";
import type { LaplaceResult } from "./laplace";
import { groupRational, type SExpr, sexprEval, sexprMul, sexprPoles, type Strip, texSExpr } from "./sdomain";

export interface SystemResult {
  H: SExpr;
  poles: Root[];
  zeros: Root[] | null;
  /** All poles strictly in the left half-plane. */
  stable: boolean;
  /** A pole on the jω axis (and none to the right). */
  marginal: boolean;
  /** Causal ROC: right of the rightmost pole. */
  roc: Strip;
  /** Leading gain K in H(s) = K·Π(s − z)/Π(s − p) (single delay group only). */
  gain: C | null;
  impulse: InverseResult;
  step: InverseResult;
  at(w: number): C;
  /** H(0), when finite. */
  dcGain: number | null;
}

export function analyzeSystem(H: SExpr): SystemResult {
  const poles = sexprPoles(H);
  const maxRe = poles.length ? Math.max(...poles.map((p) => p.p.re)) : -Infinity;
  const roc: Strip = { lo: maxRe, hi: Infinity };
  const stable = poles.every((p) => p.p.re < -1e-12);
  const marginal = !stable && poles.every((p) => p.p.re < 1e-12);
  let zeros: Root[] | null = null;
  let gain: C | null = null;
  if (H.length === 1) {
    const { num } = groupRational(H[0]);
    zeros = num.length > 1 ? findRoots(num) : [];
    gain = num[num.length - 1] ?? ZERO;
  } else if (H.length === 0) zeros = [];
  const impulse = inverseLaplace(H, roc);
  const integrator: SExpr = [{ delay: 0, poly: [], fracs: [{ pole: ZERO, coefs: [cx(1)] }] }];
  const stepH = sexprMul(H, integrator);
  const step = inverseLaplace(stepH, { lo: Math.max(maxRe, 0), hi: Infinity });
  step.steps.unshift({ title: "The step response is the inverse transform of H(s)/s", lines: [`\\frac{H(s)}{s} = ${texSExpr(stepH)}`] });
  const at = (w: number) => sexprEval(H, cx(0, w));
  const h0 = sexprEval(H, cx(1e-12, 0));
  const dcGain = Number.isFinite(h0.re) && Math.abs(h0.re) < 1e9 && !poles.some((p) => cabs(p.p) < 1e-12) ? h0.re : null;
  return { H, poles, zeros, stable, marginal, roc, gain, impulse, step, at, dcGain };
}

/** The output for an input with a Laplace transform X (ROC intersected with the system's). */
export function systemOutput(sys: SystemResult, X: LaplaceResult): (InverseResult & { Y: SExpr }) | { error: string } {
  if (!X.roc) return { error: "The input has no Laplace transform." };
  if (X.special.length) return { error: "The input contains sinc or Gaussian terms; use the convolution page." };
  const lo = Math.max(X.roc.lo, sys.roc.lo);
  const hi = Math.min(X.roc.hi, sys.roc.hi);
  if (!(lo < hi)) {
    return { error: "The input's ROC and the system's don't overlap, so Y(s) = X(s)H(s) has no region of convergence." };
  }
  const Y = sexprMul(X.X, sys.H);
  const inv = inverseLaplace(Y, { lo, hi });
  const steps: Step[] = [
    { title: "Multiply in the s-domain: convolution becomes a product", lines: [`Y(s) = X(s)H(s) = \\left(${X.tex}\\right)\\left(${texSExpr(sys.H)}\\right)`] },
    ...inv.steps,
  ];
  return { ...inv, steps, Y };
}

/** |H(jω)| in dB and the phase in radians, unwrapped along the grid. */
export function bode(sys: SystemResult, ws: number[]): { db: number[]; phase: number[] } {
  const db: number[] = [];
  const phase: number[] = [];
  let prev = NaN;
  let offset = 0;
  for (const w of ws) {
    const v = sys.at(w);
    db.push(20 * Math.log10(cabs(v)));
    let p = Math.atan2(v.im, v.re);
    if (Number.isFinite(prev)) {
      while (p + offset - prev > Math.PI) offset -= 2 * Math.PI;
      while (p + offset - prev < -Math.PI) offset += 2 * Math.PI;
    }
    p += offset;
    phase.push(p);
    prev = p;
  }
  return { db, phase };
}

/** Steady-state output for cos(ω₀t): |H(jω₀)|·cos(ω₀t + ∠H(jω₀)). */
export function steadyStateTex(sys: SystemResult, w0: number): string {
  const v = sys.at(w0);
  const m = cabs(v);
  const ph = Math.atan2(v.im, v.re);
  const n = nice(m);
  const p = nice(Math.abs(ph));
  const w = nice(w0).tex === "1" ? "" : nice(w0).tex;
  const phase = Math.abs(ph) < 1e-12 ? "" : `${ph < 0 ? "-" : "+"}${p.tex}`;
  return `${n.tex === "1" ? "" : n.tex}\\cos(${w}t${phase})`;
}


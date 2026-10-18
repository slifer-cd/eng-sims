/*
 * Signals outside the exp-polynomial class that still have table transforms:
 * amp · f(scale·(t − shift)) · e^{mod·t} with f = sinc, sinc² or the Gaussian e^{−x²}.
 * (The modulation covers sinc(t)·cos(10t) and Gaussian pulses.)
 */

import { type C, cadd, cdiv, cexp, cmul, cscale, csub, cx, J, ZERO } from "../math/complex";

export interface SpecialTerm {
  kind: "sinc" | "sinc2" | "gauss";
  amp: C;
  scale: number;
  shift: number;
  /** Multiplies the term by e^{mod·t}; pure imaginary for sinc. */
  mod: C;
}

function f(kind: SpecialTerm["kind"], x: number): number {
  if (kind === "gauss") return Math.exp(-x * x);
  const s = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  return kind === "sinc" ? s : s * s;
}

export function specialEval(term: SpecialTerm, t: number): C {
  const v = f(term.kind, term.scale * (t - term.shift));
  return cmul(cscale(term.amp, v), cexp(cscale(term.mod, t)));
}

export const specialsEval = (terms: SpecialTerm[], t: number): C =>
  terms.reduce((acc, term) => cadd(acc, specialEval(term, t)), ZERO);

/**
 * Fourier transform of the base shape g(x) = f(x):
 *   sinc  ↔ rect(ω/2π),  sinc² ↔ tri(ω/2π),  e^{−x²} ↔ √π e^{−ω²/4}
 * Then scaling, the time shift and the modulation (frequency shift) are applied.
 */
function baseFT(kind: SpecialTerm["kind"], w: C): C {
  if (kind === "gauss") return cscale(cexp(cscale(cmul(w, w), -0.25)), Math.sqrt(Math.PI));
  const x = Math.abs(w.re) / (2 * Math.PI);
  if (kind === "sinc") return cx(x < 0.5 ? 1 : x === 0.5 ? 0.5 : 0);
  return cx(x < 1 ? 1 - x : 0);
}

/** X(ω) of the term; ω complex only for the Gaussian's analytic continuation. */
export function specialFourierAt(term: SpecialTerm, w: C): C {
  // e^{mod t} shifts the spectrum: X(ω) → X(ω − mod/j).
  const shifted = csub(w, cdiv(term.mod, J));
  const a = term.scale;
  // g(a(t − t0)) ↔ (1/|a|) G(ω/a) e^{−jω t0}
  const g = baseFT(term.kind, cscale(shifted, 1 / a));
  const phase = cexp(cmul(cx(0, -term.shift), shifted));
  return cmul(cscale(cmul(term.amp, g), 1 / Math.abs(a)), phase);
}

/** Bilateral Laplace transform: only the Gaussian has one (an entire function). */
export function specialLaplaceAt(term: SpecialTerm, s: C): C | null {
  if (term.kind !== "gauss") return null;
  // X(s) = X_F(ω) at jω = s, i.e. ω = s/j.
  return specialFourierAt(term, cdiv(s, J));
}

export const hasLaplace = (terms: SpecialTerm[]): boolean => terms.every((t) => t.kind === "gauss");

/** Support for plotting: where the term is non-negligible. */
export function specialSpan(term: SpecialTerm): [number, number] {
  const w = term.kind === "gauss" ? 3 / term.scale : 6 / term.scale;
  return [term.shift - w, term.shift + w];
}

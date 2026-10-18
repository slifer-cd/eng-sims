/* Helpers for the signals & systems engine tests. */

import { expect } from "vitest";
import { parse } from "./expr/parse";
import { type C, cabs, csub, cx } from "./math/complex";
import { integrate } from "./math/numeric";
import { type Analysis, analyze, type Domain } from "./signal/analyze";

export function an(text: string, params: Record<string, number> = {}, domain: Domain = "ct"): Analysis {
  const r = parse(text, { variable: domain === "dt" ? "n" : "t" });
  if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
  return analyze(r.ast, params, domain);
}

/** The exact analysis of `text`; fails the test when it isn't exact. */
export function sig(text: string, params: Record<string, number> = {}, domain: Domain = "ct") {
  const a = an(text, params, domain);
  if (a.kind !== "exact") throw new Error(`${text} is not exact: ${a.kind === "numeric" ? a.reason : a.message}`);
  return a;
}

const toC = (v: C | number): C => (typeof v === "number" ? cx(v) : v);

/** Assert |a − b| ≤ tol·max(1, |b|). */
export function close(a: C | number, b: C | number, tol = 1e-6, label = ""): void {
  const ac = toC(a);
  const bc = toC(b);
  const err = cabs(csub(ac, bc));
  const ok = err <= tol * Math.max(1, cabs(bc));
  if (!ok) {
    expect.fail(
      `${label ? `${label}: ` : ""}expected ${bc.re}${bc.im ? ` + ${bc.im}j` : ""}, got ${ac.re}${ac.im ? ` + ${ac.im}j` : ""} (error ${err})`,
    );
  }
}

/** Complex quadrature: ∫_a^b f, real and imaginary parts separately. */
export function num(f: (t: number) => C, a: number, b: number): C {
  return cx(
    integrate((t) => f(t).re, a, b, 1e-11),
    integrate((t) => f(t).im, a, b, 1e-11),
  );
}

/** Sample points that avoid the given breakpoints. */
export function samplePoints(lo: number, hi: number, n: number, avoid: number[] = []): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = lo + ((hi - lo) * (i + 0.37)) / n;
    if (avoid.some((b) => Math.abs(b - t) < 1e-6)) continue;
    out.push(t);
  }
  return out;
}

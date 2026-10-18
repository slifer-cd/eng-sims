/*
 * Bilateral Laplace transform of exact signals. Each piece term c·tⁿe^{λt} on [a, b)
 * integrates in closed form,
 *   ∫ₐᵇ tⁿ e^{(λ−s)t} dt = [−e^{−(s−λ)t} Σᵢ n!/(n−i)! t^{n−i}/(s−λ)^{i+1}]ₐᵇ,
 * so every finite end T adds e^{−sT}·(partial fractions at λ), and an infinite end
 * vanishes only for Re s > Re λ (right tail) or Re s < Re λ (left tail): that is the ROC.
 */

import { type C, cabs, cadd, cexp, cisFinite, cmul, cscale, cx, ZERO } from "../math/complex";
import { joinFactor, nice, niceC } from "../math/nice";
import { findRoots, type Root } from "../math/poly";
import type { Analysis } from "../signal/analyze";
import { epExp, epIntegral, epMul, type ExpPoly, factorial } from "../signal/exppoly";
import { texExpPoly } from "../signal/format";
import { type Impulse, type Piece, type Signal, sigSplitAt } from "../signal/signal";
import { type SpecialTerm, specialLaplaceAt } from "../signal/special";
import type { Step } from "../steps";
import {
  type DelayGroup,
  groupRational,
  type SExpr,
  samePole,
  sexprEval,
  sexprNormalize,
  type Strip,
  texDelay,
  texSExpr,
  texSMinus,
  texStrip,
} from "./sdomain";

export interface LaplaceResult {
  X: SExpr;
  special: SpecialTerm[];
  /** null: no region where the integral converges. */
  roc: Strip | null;
  rocNote?: string;
  poles: Root[];
  /** null when X has exponential factors (infinitely many zeros). */
  zeros: Root[] | null;
  tex: string;
  steps: Step[];
  /** X(s), evaluated stably; outside the ROC, the analytic continuation of the formula. */
  at(s: C): C;
}

/** Split pieces that cover the whole line at t = 0, so each tail is one-sided. */
export function splitTails(sig: Signal): Signal {
  return sig.pieces.some((p) => p.from === -Infinity && p.to === Infinity) ? sigSplitAt(sig, 0) : sig;
}

/** The transform of one piece, and the ROC constraint it brings. */
export function pieceTransform(p: Piece): { X: SExpr; lo: number; hi: number } {
  const groups = new Map<number, DelayGroup>();
  const at = (T: number) => {
    let g = groups.get(T);
    if (!g) {
      g = { delay: T, poly: [], fracs: [] };
      groups.set(T, g);
    }
    return g;
  };
  let lo = -Infinity;
  let hi = Infinity;
  for (const g of p.expr) {
    g.poly.forEach((c, n) => {
      if (c.re === 0 && c.im === 0) return;
      const lam = g.rate;
      const end = (T: number, sign: 1 | -1) => {
        const coefs: C[] = [];
        const e = cexp(cscale(lam, T));
        for (let i = 0; i <= n; i++) {
          const k = (factorial(n) / factorial(n - i)) * Math.pow(T, n - i);
          coefs.push(cscale(cmul(c, e), -sign * k));
        }
        at(T).fracs.push({ pole: lam, coefs });
      };
      if (Number.isFinite(p.to)) end(p.to, 1);
      else lo = Math.max(lo, lam.re);
      if (Number.isFinite(p.from)) end(p.from, -1);
      else hi = Math.min(hi, lam.re);
    });
  }
  return { X: sexprNormalize([...groups.values()]), lo, hi };
}

export function impulseTransform(imp: Impulse): SExpr {
  const poly: C[] = Array.from({ length: imp.order + 1 }, () => ZERO);
  poly[imp.order] = imp.area;
  return [{ delay: imp.at, poly, fracs: [] }];
}

/** ∫ x(t) e^{−st} dt over the pieces by direct integration (NaN where it diverges). */
export function directTransform(sig: Signal, s: C): C {
  let acc = ZERO;
  const kernel: ExpPoly = epExp(cscale(s, -1));
  for (const p of sig.pieces) acc = cadd(acc, epIntegral(epMul(p.expr, kernel), p.from, p.to));
  for (const imp of sig.impulses) {
    // ∫ δ^(k)(t − T) e^{−st} dt = s^k e^{−sT}
    let sk = cx(1);
    for (let i = 0; i < imp.order; i++) sk = cmul(sk, s);
    acc = cadd(acc, cmul(imp.area, cmul(sk, cexp(cscale(s, -imp.at)))));
  }
  return acc;
}

const limTex = (v: number) => (v === Infinity ? "\\infty" : v === -Infinity ? "-\\infty" : nice(v).tex);

/** The integrand x(t)·e^{−vt}, merging a single exponential: e^{−(s+2)t}. */
export function texIntegrand(expr: ExpPoly, v: string): string {
  const kernel = v === "s" ? "e^{-st}" : "e^{-j\\omega t}";
  if (expr.length === 1 && expr[0].poly.length === 1) {
    const g = expr[0];
    const c = g.poly[0];
    if (Math.abs(c.im) < 1e-12) {
      const n = nice(c.re);
      const coef = n.tex === "1" ? "" : n.tex === "-1" ? "-" : n.tex;
      if (cabs(g.rate) < 1e-14) return `${coef}${kernel}`;
      return joinFactor(coef, `e^{-(${texSMinus(g.rate, v)})t}`);
    }
  }
  const body = texExpPoly(expr);
  const single = !/[+-]/.test(body.replace(/^-/, "").replace(/\{[^}]*\}/g, ""));
  return single ? `${body}\\,${kernel}` : `\\left(${body}\\right)${kernel}`;
}

/** Working for ∫ x(t) e^{−vt} dt over the pieces (v = s or jω). */
export function integralSteps(sig: Signal, v: "s" | "j\\omega", X: SExpr, opts: { maxPieces?: number } = {}): Step[] {
  const steps: Step[] = [];
  const kernel = v === "s" ? "e^{-st}" : "e^{-j\\omega t}";
  const name = v === "s" ? "X(s)" : "X(j\\omega)";
  steps.push({
    title: "Start from the definition",
    lines: [`${name} = \\int_{-\\infty}^{\\infty} x(t)\\,${kernel}\\,dt`],
  });
  const pieces = sig.pieces;
  if (pieces.length) {
    const split = pieces.map((p) => `\\int_{${limTex(p.from)}}^{${limTex(p.to)}} ${texIntegrand(p.expr, v)}\\,dt`);
    const imps = sig.impulses.map(() => "\\cdots");
    steps.push({
      title: "x(t) is zero outside its pieces, so split the integral over them",
      lines: [`${name} = ${[...split, ...imps].join(" + ")}`],
    });
  }
  const shown = pieces.slice(0, opts.maxPieces ?? 6);
  for (const p of shown) {
    const { X: px, lo, hi } = pieceTransform(p);
    const lines = [`\\int_{${limTex(p.from)}}^{${limTex(p.to)}} ${texIntegrand(p.expr, v)}\\,dt = ${texSExpr(px, v === "s" ? "s" : "jw")}`];
    const conds: string[] = [];
    if (Number.isFinite(lo)) conds.push(`\\operatorname{Re}\\{s\\} > ${nice(lo).tex}`);
    if (Number.isFinite(hi)) conds.push(`\\operatorname{Re}\\{s\\} < ${nice(hi).tex}`);
    const nPow = Math.max(...p.expr.map((g) => g.poly.length - 1));
    steps.push({
      title:
        `On ${Number.isFinite(p.from) && Number.isFinite(p.to) ? `${nice(p.from).text} ≤ t < ${nice(p.to).text}` : Number.isFinite(p.from) ? `t ≥ ${nice(p.from).text}` : `t < ${nice(p.to).text}`}` +
        (nPow > 0 ? " (integrating by parts)" : "") +
        (v === "s" && conds.length ? ": the infinite end vanishes only when the condition below holds" : ""),
      lines: v === "s" && conds.length ? [...lines, `\\text{converges for } ${conds.join(",\\ ")}`] : lines,
    });
  }
  if (pieces.length > shown.length) {
    steps.push({ title: `The other ${pieces.length - shown.length} pieces work the same way`, lines: [] });
  }
  if (sig.impulses.length) {
    steps.push({
      title: "Impulses pick out the kernel at their location (sifting property)",
      lines: sig.impulses.map((imp) => {
        const a = niceC(imp.area);
        const area = a.tex === "1" ? "" : a.tex === "-1" ? "-" : Math.abs(imp.area.re) > 1e-12 && Math.abs(imp.area.im) > 1e-12 ? `\\left(${a.tex}\\right)` : a.tex;
        const d = imp.order === 0 ? "\\delta" : imp.order === 1 ? "\\delta'" : `\\delta^{(${imp.order})}`;
        const k = v === "s" ? "s" : "j\\omega";
        const pow = imp.order === 0 ? "" : imp.order === 1 ? k : `(${k})^{${imp.order}}`;
        const t = Math.abs(imp.at) < 1e-12 ? "t" : `t${imp.at > 0 ? "-" : "+"}${nice(Math.abs(imp.at)).tex}`;
        const rhs = joinFactor(joinFactor(area, pow), texDelay(imp.at, v === "s" ? "s" : "jw"));
        return `\\int ${area}${d}(${t})\\,${kernel}\\,dt = ${rhs === "" ? "1" : rhs === "-" ? "-1" : rhs}`;
      }),
    });
  }
  steps.push({ title: "Add the pieces", lines: [`${name} = ${texSExpr(X, v === "s" ? "s" : "jw")}`] });
  return steps;
}

/** Laplace transform of an exact analysis. */
export function laplace(an: Analysis & { kind: "exact" }): LaplaceResult {
  const sig = splitTails(an.signal);
  const parts: SExpr = [];
  let lo = -Infinity;
  let hi = Infinity;
  for (const p of sig.pieces) {
    const t = pieceTransform(p);
    parts.push(...t.X);
    lo = Math.max(lo, t.lo);
    hi = Math.min(hi, t.hi);
  }
  for (const imp of sig.impulses) parts.push(...impulseTransform(imp));
  const X = sexprNormalize(parts);

  let rocNote: string | undefined;
  const special = an.special;
  if (special.some((s) => s.kind !== "gauss")) {
    rocNote = "sinc pulses have a Fourier transform but no Laplace transform: the integral converges only on the jω axis, not on a strip.";
  }
  const roc = rocNote || !(lo < hi) ? null : { lo, hi };
  if (!rocNote && !roc) {
    rocNote = `The right tail needs Re{s} > ${nice(lo).text} and the left tail needs Re{s} < ${nice(hi).text}: no s satisfies both.`;
  }

  // Poles come only from the tails (finite pieces give entire functions).
  const poles: Root[] = [];
  for (const p of sig.pieces) {
    if (Number.isFinite(p.from) && Number.isFinite(p.to)) continue;
    for (const g of p.expr) {
      if (!g.poly.length) continue;
      const e = poles.find((r) => samePole(r.p, g.rate));
      if (e) e.mult = Math.max(e.mult, g.poly.length);
      else poles.push({ p: g.rate, mult: g.poly.length });
    }
  }
  poles.sort((a, b) => a.p.re - b.p.re || a.p.im - b.p.im);

  let zeros: Root[] | null = null;
  if (X.length === 1 && !special.length) {
    const { num } = groupRational(X[0]);
    zeros = num.length > 1 ? findRoots(num).filter((z) => !poles.some((p) => samePole(p.p, z.p))) : [];
  } else if (X.length === 0 && !special.length) zeros = [];

  const at = (s: C): C => {
    let v = roc && s.re > roc.lo && s.re < roc.hi ? directTransform(sig, s) : sexprEval(X, s);
    if (!cisFinite(v)) v = sexprEval(X, s);
    for (const term of special) {
      const sv = specialLaplaceAt(term, s);
      v = sv ? cadd(v, sv) : cx(NaN, NaN);
    }
    return v;
  };

  const specialTex = special.filter((s) => s.kind === "gauss").map((t) => texSpecialLaplace(t));
  const mainTex = X.length || !specialTex.length ? texSExpr(X, "s") : "";
  const tex = [mainTex, ...specialTex].filter((t) => t && t !== "0").join(" + ") || "0";

  const steps = special.length ? specialSteps(special, "s") : integralSteps(sig, "s", X);
  if (!special.length) {
    const conds: string[] = [];
    if (Number.isFinite(lo)) conds.push(`\\operatorname{Re}\\{s\\} > ${nice(lo).tex}`);
    if (Number.isFinite(hi)) conds.push(`\\operatorname{Re}\\{s\\} < ${nice(hi).tex}`);
    steps.push({
      title: "Region of convergence: where every piece converges",
      lines: [
        conds.length === 0
          ? "\\text{Every piece is finite in time, so the integral converges for all } s."
          : roc
            ? `${conds.join("\\ \\text{and}\\ ")} \\;\\Rightarrow\\; \\text{ROC: } ${texStrip(roc)}`
            : `${conds.join("\\ \\text{and}\\ ")} \\;\\Rightarrow\\; \\text{no } s \\text{ satisfies both}`,
      ],
    });
  }
  return { X, special, roc, rocNote, poles, zeros, tex, steps, at };
}

/** amp·e^{−(a(t−t0))²}·e^{mod·t} ↔ amp·(√π/a)·e^{(s−m)²/(4a²) − (s−m)t0}. */
export function texSpecialLaplace(t: SpecialTerm): string {
  const amp = t.amp.re * (Math.sqrt(Math.PI) / t.scale);
  const sm = texSMinus(t.mod, "s");
  const q = nice(4 * t.scale * t.scale);
  const exp1 = `\\frac{(${sm})^{2}}{${q.tex}}`;
  const exp2 = Math.abs(t.shift) < 1e-12 ? "" : `${t.shift > 0 ? "-" : "+"}${nice(Math.abs(t.shift)).tex}(${sm})`;
  const n = nice(amp);
  return joinFactor(n.tex === "1" ? "" : n.tex, `e^{${exp1}${exp2}}`);
}

export function specialSteps(special: SpecialTerm[], v: "s" | "jw"): Step[] {
  const pairs: Record<SpecialTerm["kind"], string> = {
    sinc: "\\operatorname{sinc}(t) \\;\\leftrightarrow\\; \\operatorname{rect}\\!\\left(\\frac{\\omega}{2\\pi}\\right)",
    sinc2: "\\operatorname{sinc}^2(t) \\;\\leftrightarrow\\; \\operatorname{tri}\\!\\left(\\frac{\\omega}{2\\pi}\\right)",
    gauss: v === "s" ? "e^{-t^2} \\;\\leftrightarrow\\; \\sqrt{\\pi}\\,e^{s^2/4}" : "e^{-t^2} \\;\\leftrightarrow\\; \\sqrt{\\pi}\\,e^{-\\omega^2/4}",
  };
  const kinds = [...new Set(special.map((s) => s.kind))];
  return [
    { title: "Use the table pair", lines: kinds.map((k) => pairs[k]) },
    {
      title: "Then the properties",
      lines: [
        v === "s"
          ? "x(at - b) \\leftrightarrow \\tfrac{1}{|a|}X\\!\\left(\\tfrac{s}{a}\\right)e^{-sb/a},\\qquad e^{s_0 t}x(t) \\leftrightarrow X(s - s_0)"
          : "x(at - b) \\leftrightarrow \\tfrac{1}{|a|}X\\!\\left(\\tfrac{\\omega}{a}\\right)e^{-j\\omega b/a},\\qquad e^{j\\omega_0 t}x(t) \\leftrightarrow X(\\omega - \\omega_0)",
      ],
    },
  ];
}

/*
 * Inverse Laplace transform of X(s) = Σ e^{−sT}·N(s)/D(s): partial fractions (polynomial
 * division first, so improper parts become impulses), then the table pair for each term.
 * The ROC decides each pole's side: poles left of the strip give right-sided terms,
 * poles right of it give left-sided ones.
 */

import type { Node } from "../expr/ast";
import { compile } from "../expr/compile";
import { type C, cabs, cdiv, cisZero, cscale, cx, ONE, ZERO } from "../math/complex";
import { nice, niceC } from "../math/nice";
import { padd, pmul, type Poly, ptrim, type Root } from "../math/poly";
import { epCompose, type ExpPoly, factorial } from "../signal/exppoly";
import { texStepForm } from "../signal/format";
import { type Signal, sigAdd, sigImpulse, sigPiece, sigZero } from "../signal/signal";
import type { Step } from "../steps";
import {
  type SExpr,
  sexprFromRational,
  sexprNormalize,
  sexprPoles,
  type Strip,
  texPartialFractions,
  texSMinus,
} from "./sdomain";

/** A sum of e^{−sT}·num/den terms, while converting the AST. */
type RatSum = { delay: number; num: Poly; den: Poly }[];

class SError extends Error {}

const constant = (c: C): RatSum => [{ delay: 0, num: [c], den: [ONE] }];

function addR(a: RatSum, b: RatSum): RatSum {
  const out = a.map((t) => ({ ...t }));
  for (const t of b) {
    const same = out.find((o) => Math.abs(o.delay - t.delay) < 1e-12);
    if (same) {
      same.num = ptrim(padd(pmul(same.num, t.den), pmul(t.num, same.den)));
      same.den = pmul(same.den, t.den);
    } else out.push({ ...t });
  }
  return out;
}

function mulR(a: RatSum, b: RatSum): RatSum {
  let out: RatSum = [];
  for (const x of a) for (const y of b) out = addR(out, [{ delay: x.delay + y.delay, num: pmul(x.num, y.num), den: pmul(x.den, y.den) }]);
  return out;
}

function invR(a: RatSum): RatSum {
  const terms = a.filter((t) => ptrim(t.num).length > 0);
  if (terms.length !== 1) throw new SError("Only a single term (no sums with different delays) can be in a denominator.");
  const t = terms[0];
  return [{ delay: -t.delay, num: t.den, den: ptrim(t.num) }];
}

/** Affine a·s + b with real a, from a converted expression (for e^{…}). */
function asAffine(r: RatSum): { a: C; b: C } | null {
  if (r.length !== 1 || r[0].delay !== 0) return null;
  const den = ptrim(r[0].den);
  if (den.length !== 1) return null;
  const num = ptrim(r[0].num).map((c) => cdiv(c, den[0]));
  if (num.length > 2) return null;
  return { a: num[1] ?? ZERO, b: num[0] ?? ZERO };
}

function conv(n: Node, params: Record<string, number>): RatSum {
  switch (n.k) {
    case "num":
    case "const":
    case "param":
      return constant(compile(n, params).f(0));
    case "var":
      return [{ delay: 0, num: [ZERO, ONE], den: [ONE] }];
    case "neg":
      return mulR(constant(cx(-1)), conv(n.a, params));
    case "bin": {
      const a = conv(n.a, params);
      if (n.op === "^") {
        const e = conv(n.b, params);
        // e^{as+b}: a delay of −a.
        if (n.a.k === "const" && n.a.name === "e") return expR(e);
        const k = asAffine(e);
        if (!k || !cisZero(k.a) || Math.abs(k.b.im) > 1e-12 || !Number.isInteger(k.b.re)) {
          throw new SError("Powers must be whole numbers, like (s+1)^2.");
        }
        const p = k.b.re;
        if (Math.abs(p) > 20) throw new SError("That power is too large.");
        let out = constant(ONE);
        for (let i = 0; i < Math.abs(p); i++) out = mulR(out, a);
        return p < 0 ? invR(out) : out;
      }
      const b = conv(n.b, params);
      if (n.op === "+") return addR(a, b);
      if (n.op === "-") return addR(a, mulR(constant(cx(-1)), b));
      if (n.op === "*") return mulR(a, b);
      return mulR(a, invR(b));
    }
    case "call":
      if (n.fn === "exp") return expR(conv(n.args[0], params));
      throw new SError(`${n.fn}(…) isn't supported here: X(s) must be a ratio of polynomials in s, times e^(−sT).`);
  }
}

function expR(e: RatSum): RatSum {
  const k = asAffine(e);
  if (!k || Math.abs(k.a.im) > 1e-12) throw new SError("e^(…) must have a linear exponent in s, like e^(-2s).");
  // e^{a s + b} = e^{b} · e^{−s(−a)}
  const c = { re: Math.exp(k.b.re) * Math.cos(k.b.im), im: Math.exp(k.b.re) * Math.sin(k.b.im) };
  return [{ delay: -k.a.re, num: [c], den: [ONE] }];
}

export type SParse = { ok: true; X: SExpr; poles: Root[] } | { ok: false; message: string };

/** X(s) typed by the user → partial-fraction s-expression. */
export function parseSExpr(ast: Node, params: Record<string, number>): SParse {
  try {
    const sum = conv(ast, params);
    const parts: SExpr = [];
    for (const t of sum) {
      const den = ptrim(t.den);
      if (den.length === 0) throw new SError("Division by zero.");
      if (ptrim(t.num).length === 0) continue;
      parts.push(...sexprFromRational(t.num, den, t.delay));
    }
    const X = sexprNormalize(parts);
    const ok = X.every((g) => g.poly.every(finite) && g.fracs.every((f) => finite(f.pole) && f.coefs.every(finite)));
    if (!ok) return { ok: false, message: "The numbers are too large to expand." };
    return { ok: true, X, poles: sexprPoles(X) };
  } catch (e) {
    if (e instanceof SError) return { ok: false, message: e.message };
    throw e;
  }
}

const finite = (c: C) => Number.isFinite(c.re) && Number.isFinite(c.im);

/** The possible ROCs: strips between consecutive distinct pole real parts. */
export function rocStrips(poles: Root[]): Strip[] {
  const xs = [...new Set(poles.map((p) => Math.round(p.p.re * 1e9) / 1e9))].sort((a, b) => a - b);
  if (xs.length === 0) return [{ lo: -Infinity, hi: Infinity }];
  const out: Strip[] = [{ lo: -Infinity, hi: xs[0] }];
  for (let i = 0; i + 1 < xs.length; i++) out.push({ lo: xs[i], hi: xs[i + 1] });
  out.push({ lo: xs[xs.length - 1], hi: Infinity });
  return out;
}

export interface InverseResult {
  signal: Signal;
  tex: string;
  steps: Step[];
}

/** c·t^{m−1}/(m−1)!·e^{pt} as an exp-polynomial. */
function termExpr(c: C, p: C, m: number): ExpPoly {
  const poly: C[] = Array.from({ length: m }, () => ZERO);
  poly[m - 1] = cscale(c, 1 / factorial(m - 1));
  return [{ rate: p, poly }];
}

export function inverseLaplace(X: SExpr, roc: Strip): InverseResult {
  let signal = sigZero();
  const pairLines: string[] = [];
  for (const g of X) {
    const T = g.delay;
    g.poly.forEach((c, k) => {
      if (cisZero(c, 1e-14)) return;
      signal = sigAdd(signal, sigImpulse(T, c, k));
    });
    for (const f of g.fracs) {
      const right = f.pole.re <= roc.lo + 1e-12;
      f.coefs.forEach((c, i) => {
        if (cisZero(c, 1e-14)) return;
        const m = i + 1;
        const e = epCompose(termExpr(right ? c : cscale(c, -1), f.pole, m), 1, -T);
        signal = sigAdd(signal, right ? sigPiece(T, Infinity, e) : sigPiece(-Infinity, T, e));
      });
      pairLines.push(pairTex(f.pole, f.coefs.length, right));
    }
  }
  const tex = texStepForm(signal);
  const steps: Step[] = [];
  steps.push({ title: "Partial fractions", lines: [`X(s) = ${texPartialFractions(X)}`] });
  const residues = residueLines(X);
  if (residues.length) steps.push({ title: "Each coefficient from the residue formula", lines: residues });
  steps.push({
    title: `Use the table pairs; with ROC ${roc.lo === -Infinity && roc.hi === Infinity ? "everywhere" : "as chosen"}, poles left of the strip give right-sided terms and poles right of it give left-sided ones`,
    lines: [...new Set(pairLines)],
  });
  if (X.some((g) => Math.abs(g.delay) > 1e-12)) {
    steps.push({ title: "A factor e^{−sT} delays its term by T (time shift)", lines: ["e^{-sT}F(s) \\;\\leftrightarrow\\; f(t-T)"] });
  }
  steps.push({ title: "Add the terms", lines: [`x(t) = ${tex}`] });
  return { signal, tex, steps };
}

function pairTex(p: C, m: number, right: boolean): string {
  const d = texSMinus(p);
  const den = m === 1 ? d : `(${d})^{${m}}`;
  const tpow = m === 1 ? "" : m === 2 ? "t\\," : `\\frac{t^{${m - 1}}}{${factorial(m - 1)}}`;
  const pe = cabs(p) < 1e-14 ? "" : Math.abs(p.im) < 1e-12 ? `e^{${nice(p.re).tex === "1" ? "" : nice(p.re).tex === "-1" ? "-" : nice(p.re).tex}t}` : `e^{(${niceC(p).tex})t}`;
  const time = `${tpow}${pe}`;
  const step = right ? "u(t)" : "u(-t)";
  return `\\frac{1}{${den}} \\;\\leftrightarrow\\; ${right ? "" : "-"}${time}${step}`;
}

/** Residues c = (s − p)X(s)|_{s=p} for the simple poles, written out. */
function residueLines(X: SExpr): string[] {
  const out: string[] = [];
  for (const g of X) {
    for (const f of g.fracs) {
      if (f.coefs.length !== 1) {
        out.push(`\\text{pole } ${niceC(f.pole).tex} \\text{ (order ${f.coefs.length})}: c_k = \\frac{1}{(${f.coefs.length}-k)!}\\frac{d^{${f.coefs.length}-k}}{ds^{${f.coefs.length}-k}}\\left[(${texSMinus(f.pole)})^{${f.coefs.length}}X(s)\\right]_{s=${niceC(f.pole).tex}}`);
        continue;
      }
      out.push(`(${texSMinus(f.pole)})X(s)\\big|_{s=${niceC(f.pole).tex}} = ${niceC(f.coefs[0]).tex}`);
    }
  }
  return out.slice(0, 8);
}


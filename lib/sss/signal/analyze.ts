/*
 * AST → exact signal. Maps a typed expression onto the piecewise exp-polynomial class
 * (plus sinc/Gaussian table terms) whenever it can; anything else falls back to numeric
 * evaluation, with the reason shown to the user.
 */

import { type Node, usesVar } from "../expr/ast";
import { compile, type Evaluator } from "../expr/compile";
import { lookupFunction } from "../expr/names";
import {
  type C,
  cabs,
  cadd,
  cdiv,
  cexp,
  cisFinite,
  cisZero,
  clog,
  cmul,
  cneg,
  cscale,
  cx,
  J,
  ONE,
} from "../math/complex";
import { epAsPoly, epConst, epExp, epPoly, epScale, epVar, type ExpPoly } from "./exppoly";
import {
  type Piece,
  type Signal,
  SignalError,
  sigAdd,
  sigConst,
  sigEverywhere,
  sigImpulse,
  sigMul,
  sigNormalize,
  sigPiece,
  sigScale,
} from "./signal";
import type { SpecialTerm } from "./special";

export type Domain = "ct" | "dt";

export type Analysis =
  | { kind: "exact"; signal: Signal; special: SpecialTerm[]; f: Evaluator }
  | { kind: "numeric"; f: Evaluator; reason: string }
  | { kind: "error"; message: string; from?: number; to?: number };

/** Thrown when a sub-expression has no exact form; carries the reason for the UI. */
class NotExact extends Error {}
/** Thrown for expressions that make no sense at all (δ·δ, δ of a constant). */
class Invalid extends Error {
  constructor(
    message: string,
    public node?: Node,
  ) {
    super(message);
  }
}

interface Value {
  sig: Signal;
  special: SpecialTerm[];
}

const exactOf = (sig: Signal): Value => ({ sig, special: [] });

function asConst(v: Value): C | null {
  if (v.special.length || v.sig.impulses.length) return null;
  const { pieces } = v.sig;
  if (pieces.length === 0) return cx(0);
  if (pieces.length !== 1) return null;
  const p = pieces[0];
  if (p.from !== -Infinity || p.to !== Infinity) return null;
  const poly = epAsPoly(p.expr);
  if (!poly || poly.length > 1) return null;
  return poly[0] ?? cx(0);
}

/** a·t + b with real a, b, defined on the whole line. */
function asAffine(v: Value): { a: number; b: number } | null {
  if (v.special.length || v.sig.impulses.length) return null;
  const { pieces } = v.sig;
  if (pieces.length === 0) return { a: 0, b: 0 };
  if (pieces.length !== 1 || pieces[0].from !== -Infinity || pieces[0].to !== Infinity) return null;
  const poly = epAsPoly(pieces[0].expr);
  if (!poly || poly.length > 2) return null;
  const b = poly[0] ?? cx(0);
  const a = poly[1] ?? cx(0);
  if (Math.abs(a.im) > 1e-12 || Math.abs(b.im) > 1e-12) return null;
  return { a: a.re, b: b.re };
}

/** Pieces covering the whole line, with the gaps filled by explicit zero pieces. */
function fullCover(sig: Signal): Piece[] {
  const out: Piece[] = [];
  let at = -Infinity;
  for (const p of sig.pieces) {
    if (p.from > at) out.push({ from: at, to: p.from, expr: [] });
    out.push(p);
    at = p.to;
  }
  if (at < Infinity) out.push({ from: at, to: Infinity, expr: [] });
  return out;
}

interface Bound {
  value: number;
  /** True for a strict inequality (the bound itself is excluded). */
  strict: boolean;
}

export class Analyzer {
  constructor(
    private params: Record<string, number>,
    private domain: Domain,
  ) {}

  /**
   * The t-interval where lo ≤ a·t + b ≤ hi (each side strict or not), as a half-open
   * piece. In discrete time, closedness matters: the bounds become integers.
   */
  private interval(aff: { a: number; b: number }, lo: Bound | null, hi: Bound | null): [number, number] {
    const { a, b } = aff;
    // a·t + b ≥ lo.value  ⇔  t ≥ (lo − b)/a when a > 0, t ≤ (lo − b)/a when a < 0.
    let from: Bound = { value: -Infinity, strict: false };
    let to: Bound = { value: Infinity, strict: false };
    const apply = (bound: Bound | null, isLower: boolean) => {
      if (!bound) return;
      const t = (bound.value - b) / a;
      const lowerInT = isLower === a > 0;
      if (lowerInT) from = { value: t, strict: bound.strict };
      else to = { value: t, strict: bound.strict };
    };
    apply(lo, true);
    apply(hi, false);
    if (this.domain === "ct") return [from.value, to.value];
    const eps = 1e-9;
    const f = !Number.isFinite(from.value)
      ? from.value
      : from.strict
        ? Math.floor(from.value + eps) + 1
        : Math.ceil(from.value - eps);
    const tt = !Number.isFinite(to.value)
      ? to.value
      : to.strict
        ? Math.ceil(to.value - eps)
        : Math.floor(to.value + eps) + 1;
    return [f, tt];
  }

  /** A piece of expr on the interval where the bounds hold. */
  private onInterval(aff: { a: number; b: number }, lo: Bound | null, hi: Bound | null, expr: ExpPoly): Signal {
    const [from, to] = this.interval(aff, lo, hi);
    return sigPiece(from, to, expr);
  }

  /** e^{v} for a piecewise-affine exponent v (zero gaps give e^0 = 1). */
  private expOf(v: Value): Value {
    if (v.special.length || v.sig.impulses.length) throw new NotExact("The exponent has no exact form here.");
    const c = asConst(v);
    if (c) return exactOf(sigConst(cexp(c)));
    // Gaussian: e^{−α t² + β t + γ} on the whole line.
    if (v.sig.pieces.length === 1 && v.sig.pieces[0].from === -Infinity && v.sig.pieces[0].to === Infinity) {
      const poly = epAsPoly(v.sig.pieces[0].expr);
      if (poly && poly.length === 3) {
        const alpha = -poly[2].re;
        if (alpha > 0 && Math.abs(poly[2].im) < 1e-12) {
          const beta = poly[1];
          const gamma = poly[0];
          const t0 = beta.re / (2 * alpha);
          const amp = cexp(cadd(gamma, cx(alpha * t0 * t0)));
          return {
            sig: { pieces: [], impulses: [] },
            special: [{ kind: "gauss", amp, scale: Math.sqrt(alpha), shift: t0, mod: cx(0, beta.im) }],
          };
        }
      }
    }
    const pieces: Piece[] = [];
    for (const p of fullCover(v.sig)) {
      const poly = epAsPoly(p.expr);
      if (!poly || poly.length > 2) throw new NotExact("e^(…) is exact only when the exponent is linear in t (piecewise).");
      const c0 = poly[0] ?? cx(0);
      const c1 = poly[1] ?? cx(0);
      pieces.push({ from: p.from, to: p.to, expr: epExp(c1, cexp(c0)) });
    }
    return exactOf(sigNormalize({ pieces, impulses: [] }));
  }

  private add(a: Value, b: Value): Value {
    return { sig: sigAdd(a.sig, b.sig), special: [...a.special, ...b.special] };
  }

  private scale(a: Value, k: C): Value {
    return {
      sig: sigScale(a.sig, k),
      special: a.special.map((s) => ({ ...s, amp: cmul(s.amp, k) })).filter((s) => !cisZero(s.amp)),
    };
  }

  /** Pure exponentials Σ c·e^{λt} on the whole line, as (rate, coef) pairs, or null. */
  private asExponentials(v: Value): { rate: C; coef: C }[] | null {
    if (v.special.length || v.sig.impulses.length) return null;
    const { pieces } = v.sig;
    if (pieces.length !== 1 || pieces[0].from !== -Infinity || pieces[0].to !== Infinity) return null;
    const out: { rate: C; coef: C }[] = [];
    for (const g of pieces[0].expr) {
      if (g.poly.length > 1) return null;
      out.push({ rate: g.rate, coef: g.poly[0] });
    }
    return out;
  }

  private mul(a: Value, b: Value): Value {
    const ca = asConst(a);
    if (ca) return this.scale(b, ca);
    const cb = asConst(b);
    if (cb) return this.scale(a, cb);
    if (!a.special.length && !b.special.length) return exactOf(sigMul(a.sig, b.sig));
    // sinc·sinc with the same argument is sinc².
    if (
      a.special.length === 1 &&
      b.special.length === 1 &&
      !a.sig.pieces.length &&
      !b.sig.pieces.length &&
      !a.sig.impulses.length &&
      !b.sig.impulses.length
    ) {
      const [x, y] = [a.special[0], b.special[0]];
      if (x.kind === "sinc" && y.kind === "sinc" && x.scale === y.scale && x.shift === y.shift) {
        return {
          sig: { pieces: [], impulses: [] },
          special: [{ kind: "sinc2", amp: cmul(x.amp, y.amp), scale: x.scale, shift: x.shift, mod: cadd(x.mod, y.mod) }],
        };
      }
    }
    // Special terms times pure exponentials: modulation.
    const modulate = (sp: Value, ex: Value): Value | null => {
      if (sp.sig.pieces.length || sp.sig.impulses.length) return null;
      const exps = this.asExponentials(ex);
      if (!exps) return null;
      const special: SpecialTerm[] = [];
      for (const term of sp.special) {
        for (const e of exps) {
          if (term.kind !== "gauss" && Math.abs(e.rate.re) > 1e-12) return null;
          special.push({ ...term, amp: cmul(term.amp, e.coef), mod: cadd(term.mod, e.rate) });
        }
      }
      return { sig: { pieces: [], impulses: [] }, special };
    };
    const m = (a.special.length ? modulate(a, b) : null) ?? (b.special.length ? modulate(b, a) : null);
    if (m) return m;
    throw new NotExact("This product of sinc/Gaussian terms has no table transform.");
  }

  private pow(base: Value, exp: Value): Value {
    const ce = asConst(exp);
    const cb = asConst(base);
    if (cb && ce) return exactOf(sigConst(powConst(cb, ce)));
    if (ce && Math.abs(ce.im) < 1e-12 && Number.isInteger(ce.re)) {
      const n = ce.re;
      if (n >= 0 && n <= 16) {
        if (n === 2 && base.special.length === 1 && !base.sig.pieces.length && !base.sig.impulses.length) {
          const s = base.special[0];
          if (s.kind === "sinc") {
            return { sig: { pieces: [], impulses: [] }, special: [{ ...s, kind: "sinc2", amp: cmul(s.amp, s.amp), mod: cscale(s.mod, 2) }] };
          }
        }
        let out: Value = exactOf(sigConst(1));
        for (let i = 0; i < n; i++) out = this.mul(out, base);
        return out;
      }
      if (n < 0 && n >= -16) {
        const exps = this.asExponentials(base);
        if (exps && exps.length === 1) {
          const { rate, coef } = exps[0];
          const k = -n;
          return exactOf(sigEverywhere(epExp(cscale(rate, -k), powConst(coef, cx(-k)))));
        }
        throw new NotExact("Dividing by a function of t only has an exact form for a single exponential.");
      }
    }
    if (cb) {
      // b^x = e^{x ln b}; in continuous time b must be positive (else the result is complex).
      if (this.domain === "ct" && (Math.abs(cb.im) > 1e-12 || cb.re <= 0)) {
        throw new NotExact("A negative or complex base to a power of t has no exact form in continuous time.");
      }
      if (cisZero(cb)) throw new NotExact("0 to a power of t");
      const lnb = clog(cb);
      return this.expOf(this.scale(exp, lnb));
    }
    throw new NotExact("Powers with t in the exponent are exact only for a constant base.");
  }

  private call(n: Node & { k: "call" }): Value {
    const fn = n.fn;
    const info = lookupFunction(fn);
    const arg = () => this.conv(n.args[0]);
    switch (fn) {
      case "u":
      case "rect":
      case "tri":
      case "sgn":
      case "ramp":
      case "delta": {
        const v = arg();
        const aff = asAffine(v);
        if (!aff) throw new NotExact(`${fnLabel(fn)} is exact only when its argument is linear in t, like ${fnLabel(fn)}(2t − 1).`);
        if (aff.a === 0) {
          if (fn === "delta") throw new Invalid("δ needs t in its argument, like δ(t − 1).", n);
          return exactOf(sigConst(compile(n, this.params).f(0)));
        }
        return exactOf(this.signalFn(fn, aff));
      }
      case "sinc": {
        const v = arg();
        const aff = asAffine(v);
        if (!aff || aff.a === 0) throw new NotExact("sinc is exact only with a linear argument.");
        if (this.domain === "dt") throw new NotExact("sinc of n has no exact form here.");
        return {
          sig: { pieces: [], impulses: [] },
          special: [{ kind: "sinc", amp: ONE, scale: Math.abs(aff.a), shift: -aff.b / aff.a, mod: cx(0) }],
        };
      }
      case "exp":
        return this.expOf(arg());
      case "sin":
      case "cos":
      case "sinh":
      case "cosh": {
        const v = arg();
        if (fn === "sin" || fn === "cos") {
          const p = this.expOf(this.scale(v, J));
          const m = this.expOf(this.scale(v, cx(0, -1)));
          return fn === "cos"
            ? this.scale(this.add(p, m), cx(0.5))
            : this.scale(this.add(p, this.scale(m, cx(-1))), cdiv(ONE, cx(0, 2)));
        }
        const p = this.expOf(v);
        const m = this.expOf(this.scale(v, cx(-1)));
        return fn === "cosh" ? this.scale(this.add(p, m), cx(0.5)) : this.scale(this.add(p, this.scale(m, cx(-1))), cx(0.5));
      }
      case "abs":
        return exactOf(this.absOf(arg()));
      default:
        if (info?.numericOnly) throw new NotExact(`${fn} of t is evaluated numerically (no closed-form transforms).`);
        throw new NotExact(`${fn} of t has no exact form here.`);
    }
  }

  private signalFn(fn: string, aff: { a: number; b: number }): Signal {
    const one = epConst(1);
    // x = a·t + b as an exp-poly in t.
    const xExpr = epPoly([cx(aff.b), cx(aff.a)]);
    switch (fn) {
      case "u":
        return this.onInterval(aff, { value: 0, strict: false }, null, one);
      case "rect":
        return this.onInterval(aff, { value: -0.5, strict: true }, { value: 0.5, strict: true }, one);
      case "tri":
        return sigAdd(
          this.onInterval(aff, { value: -1, strict: true }, { value: 0, strict: true }, epPoly([cx(1 + aff.b), cx(aff.a)])),
          this.onInterval(aff, { value: 0, strict: false }, { value: 1, strict: true }, epPoly([cx(1 - aff.b), cx(-aff.a)])),
        );
      case "sgn":
        return sigAdd(
          this.onInterval(aff, { value: 0, strict: true }, null, one),
          this.onInterval(aff, null, { value: 0, strict: true }, epConst(-1)),
        );
      case "ramp":
        return this.onInterval(aff, { value: 0, strict: false }, null, xExpr);
      case "delta": {
        const at = -aff.b / aff.a;
        if (this.domain === "dt") {
          if (!Number.isInteger(Math.round(at * 1e9) / 1e9)) return { pieces: [], impulses: [] };
          const n0 = Math.round(at);
          return sigPiece(n0, n0 + 1, one);
        }
        return sigImpulse(at, 1 / Math.abs(aff.a));
      }
    }
    throw new Error(`unknown signal function ${fn}`);
  }

  /** |x| for pieces that are real polynomials of degree ≤ 2 (exact sign changes). */
  private absOf(v: Value): Signal {
    if (v.special.length || v.sig.impulses.length) throw new NotExact("|…| has no exact form here.");
    const c = asConst(v);
    if (c) return sigConst(cabs(c));
    const pieces: Piece[] = [];
    for (const p of v.sig.pieces) {
      const poly = epAsPoly(p.expr);
      if (!poly || poly.length > 3 || poly.some((k) => Math.abs(k.im) > 1e-12)) {
        throw new NotExact("|…| is exact only around polynomials of degree ≤ 2 in t.");
      }
      const [c0, c1, c2] = [poly[0]?.re ?? 0, poly[1]?.re ?? 0, poly[2]?.re ?? 0];
      const roots = realRoots(c0, c1, c2).filter((r) => r > p.from && r < p.to);
      const cuts = [p.from, ...roots, p.to];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const l = cuts[i];
        const r = cuts[i + 1];
        const mid = Number.isFinite(l) && Number.isFinite(r) ? (l + r) / 2 : Number.isFinite(l) ? l + 1 : Number.isFinite(r) ? r - 1 : 0;
        const val = c0 + c1 * mid + c2 * mid * mid;
        pieces.push({ from: l, to: r, expr: val < 0 ? epScale(p.expr, -1) : p.expr });
      }
    }
    return sigNormalize({ pieces, impulses: [] });
  }

  conv(n: Node): Value {
    if (!usesVar(n)) {
      if (containsDelta(n)) throw new Invalid("δ needs t in its argument, like δ(t − 1).", n);
      const c = compile(n, this.params).f(0);
      if (!cisFinite(c)) throw new Invalid("This constant is undefined (division by zero?).", n);
      return exactOf(sigConst(c));
    }
    switch (n.k) {
      case "var":
        return exactOf(sigEverywhere(epVar()));
      case "neg":
        return this.scale(this.conv(n.a), cx(-1));
      case "bin": {
        const a = this.conv(n.a);
        if (n.op === "^") return this.pow(a, this.conv(n.b));
        const b = this.conv(n.b);
        switch (n.op) {
          case "+":
            return this.add(a, b);
          case "-":
            return this.add(a, this.scale(b, cx(-1)));
          case "*":
            try {
              return this.mul(a, b);
            } catch (e) {
              if (e instanceof SignalError) throw new Invalid(e.message, n);
              throw e;
            }
          case "/": {
            const cb = asConst(b);
            if (cb) {
              if (cisZero(cb)) throw new Invalid("Division by zero.", n);
              return this.scale(a, cdiv(ONE, cb));
            }
            const exps = this.asExponentials(b);
            if (exps && exps.length === 1) {
              const { rate, coef } = exps[0];
              return this.mul(a, exactOf(sigEverywhere(epExp(cneg(rate), cdiv(ONE, coef)))));
            }
            throw new NotExact("Dividing by a function of t has no exact form (it's evaluated numerically).");
          }
        }
        break;
      }
      case "call":
        return this.call(n);
    }
    throw new NotExact("No exact form.");
  }
}

function realRoots(c0: number, c1: number, c2: number): number[] {
  if (Math.abs(c2) < 1e-14) {
    if (Math.abs(c1) < 1e-14) return [];
    return [-c0 / c1];
  }
  const d = c1 * c1 - 4 * c2 * c0;
  if (d < 0) return [];
  const s = Math.sqrt(d);
  return [(-c1 - s) / (2 * c2), (-c1 + s) / (2 * c2)].sort((a, b) => a - b);
}

function powConst(b: C, e: C): C {
  if (e.im === 0 && Number.isInteger(e.re) && Math.abs(e.re) <= 64) {
    let out = ONE;
    const k = Math.abs(e.re);
    for (let i = 0; i < k; i++) out = cmul(out, b);
    return e.re < 0 ? cdiv(ONE, out) : out;
  }
  if (b.im === 0 && e.im === 0 && b.re >= 0) return cx(Math.pow(b.re, e.re));
  return cexp(cmul(e, clog(b)));
}

function containsDelta(n: Node): boolean {
  if (n.k === "call") return n.fn === "delta" || n.args.some(containsDelta);
  if (n.k === "bin") return containsDelta(n.a) || containsDelta(n.b);
  if (n.k === "neg") return containsDelta(n.a);
  return false;
}

function fnLabel(fn: string): string {
  return fn === "delta" ? "δ" : fn === "ramp" ? "r" : fn;
}

function finiteSignal(sig: Signal, special: SpecialTerm[]): boolean {
  const ok = (c: C) => cisFinite(c);
  return (
    sig.pieces.every((p) => p.expr.every((g) => ok(g.rate) && g.poly.every(ok))) &&
    sig.impulses.every((i) => ok(i.area) && Number.isFinite(i.at)) &&
    special.every((s) => ok(s.amp) && Number.isFinite(s.scale) && Number.isFinite(s.shift))
  );
}

/** Analyse an expression in the given domain, with parameter values substituted. */
export function analyze(ast: Node, params: Record<string, number>, domain: Domain): Analysis {
  const compiled = compile(ast, params);
  try {
    const v = new Analyzer(params, domain).conv(ast);
    if (!finiteSignal(v.sig, v.special)) {
      return { kind: "numeric", f: compiled.f, reason: "The numbers are too large for an exact form." };
    }
    return { kind: "exact", signal: v.sig, special: v.special, f: compiled.f };
  } catch (e) {
    if (e instanceof Invalid) return { kind: "error", message: e.message, from: e.node?.from, to: e.node?.to };
    if (e instanceof NotExact) {
      if (compiled.impulsive) {
        return {
          kind: "error",
          message: `Impulses can only be combined with the standard signals here. ${e.message}`,
        };
      }
      return { kind: "numeric", f: compiled.f, reason: e.message };
    }
    throw e;
  }
}


/*
 * AST → numeric evaluator. Used for numeric-only expressions, for the live value readout,
 * and by tests to check every exact result against straightforward evaluation.
 * Impulses can't be sampled: delta evaluates to 0 and the result is marked `impulsive`.
 */

import type { Node } from "./ast";
import {
  type C,
  cabs,
  cadd,
  cdiv,
  cexp,
  clog,
  cmul,
  cneg,
  cpow,
  csqrt,
  csub,
  cx,
  J,
  ONE,
  ZERO,
} from "../math/complex";

export type Evaluator = (x: number) => C;

export interface Compiled {
  f: Evaluator;
  /** True when the expression contains δ, which numeric evaluation can't represent. */
  impulsive: boolean;
}

const r = (x: number): C => ({ re: x, im: 0 });

function sinC(a: C): C {
  if (a.im === 0) return r(Math.sin(a.re));
  return cx(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
}
function cosC(a: C): C {
  if (a.im === 0) return r(Math.cos(a.re));
  return cx(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));
}
function sinhC(a: C): C {
  return cdiv(csub(cexp(a), cexp(cneg(a))), r(2));
}
function coshC(a: C): C {
  return cdiv(cadd(cexp(a), cexp(cneg(a))), r(2));
}

function powC(a: C, b: C): C {
  if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) return cpow(a, b.re);
  if (a.im === 0 && b.im === 0 && a.re >= 0) return r(Math.pow(a.re, b.re));
  if (a.re === 0 && a.im === 0) return ZERO;
  return cexp(cmul(b, clog(a)));
}

type Fn1 = (a: C) => C;
const FN1: Record<string, Fn1> = {
  u: (a) => r(a.re >= 0 ? 1 : 0),
  delta: () => ZERO,
  rect: (a) => r(a.re >= -0.5 && a.re < 0.5 ? 1 : 0),
  tri: (a) => r(Math.abs(a.re) < 1 ? 1 - Math.abs(a.re) : 0),
  sinc: (a) => (Math.abs(a.re) < 1e-12 ? ONE : r(Math.sin(Math.PI * a.re) / (Math.PI * a.re))),
  sgn: (a) => r(Math.sign(a.re)),
  ramp: (a) => r(Math.max(0, a.re)),
  sin: sinC,
  cos: cosC,
  tan: (a) => cdiv(sinC(a), cosC(a)),
  sinh: sinhC,
  cosh: coshC,
  tanh: (a) => cdiv(sinhC(a), coshC(a)),
  asin: (a) => r(Math.asin(a.re)),
  acos: (a) => r(Math.acos(a.re)),
  atan: (a) => r(Math.atan(a.re)),
  exp: cexp,
  ln: clog,
  log: (a) => cdiv(clog(a), r(Math.LN10)),
  sqrt: csqrt,
  abs: (a) => r(cabs(a)),
  floor: (a) => r(Math.floor(a.re)),
  ceil: (a) => r(Math.ceil(a.re)),
};

const FN2: Record<string, (a: C, b: C) => C> = {
  mod: (a, b) => r(((a.re % b.re) + b.re) % b.re),
  min: (a, b) => r(Math.min(a.re, b.re)),
  max: (a, b) => r(Math.max(a.re, b.re)),
};

/** Compile with parameter values (missing parameters default to 1). */
export function compile(ast: Node, params: Record<string, number> = {}): Compiled {
  let impulsive = false;
  const build = (n: Node): ((x: number) => C) => {
    switch (n.k) {
      case "num": {
        const v = r(n.v);
        return () => v;
      }
      case "var":
        return (x) => r(x);
      case "const": {
        const v = n.name === "pi" ? r(Math.PI) : n.name === "e" ? r(Math.E) : J;
        return () => v;
      }
      case "param": {
        const v = r(params[n.name] ?? 1);
        return () => v;
      }
      case "neg": {
        const a = build(n.a);
        return (x) => cneg(a(x));
      }
      case "bin": {
        const a = build(n.a);
        const b = build(n.b);
        switch (n.op) {
          case "+":
            return (x) => cadd(a(x), b(x));
          case "-":
            return (x) => csub(a(x), b(x));
          case "*":
            return (x) => cmul(a(x), b(x));
          case "/":
            return (x) => cdiv(a(x), b(x));
          case "^":
            return (x) => powC(a(x), b(x));
        }
        break;
      }
      case "call": {
        if (n.fn === "delta") impulsive = true;
        const args = n.args.map(build);
        if (args.length === 2) {
          const f = FN2[n.fn];
          return (x) => f(args[0](x), args[1](x));
        }
        const f = FN1[n.fn];
        const a = args[0];
        return (x) => f(a(x));
      }
    }
    throw new Error("unreachable");
  };
  const f = build(ast);
  return { f, impulsive };
}

/** Evaluate an expression that must not depend on the variable (a constant). */
export function evalConstant(ast: Node, params: Record<string, number> = {}): C {
  return compile(ast, params).f(0);
}

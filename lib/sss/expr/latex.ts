/*
 * AST → LaTeX for the live preview. The preview is rendered from the parsed tree, not the
 * typed text, so it always shows how the input was understood.
 */

import type { Node } from "./ast";
import { paramTex } from "./names";

// Binding strength: higher binds tighter.
const PREC = { sum: 1, product: 2, neg: 3, power: 4, atom: 5 } as const;

function prec(n: Node): number {
  switch (n.k) {
    case "bin":
      return n.op === "+" || n.op === "-" ? PREC.sum : n.op === "^" ? PREC.power : PREC.product;
    case "neg":
      return PREC.neg;
    case "num":
      return n.v < 0 ? PREC.neg : PREC.atom;
    default:
      return PREC.atom;
  }
}

/** Plain parentheses around short content; stretchy ones around fractions and powers. */
const paren = (s: string) => (/\\frac|\^\{|\\left|\\sqrt/.test(s) ? `\\left(${s}\\right)` : `(${s})`);

const FN_TEX: Record<string, string> = {
  u: "u",
  delta: "\\delta",
  rect: "\\operatorname{rect}",
  tri: "\\operatorname{tri}",
  sinc: "\\operatorname{sinc}",
  sgn: "\\operatorname{sgn}",
  ramp: "r",
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  sinh: "\\sinh",
  cosh: "\\cosh",
  tanh: "\\tanh",
  asin: "\\sin^{-1}",
  acos: "\\cos^{-1}",
  atan: "\\tan^{-1}",
  ln: "\\ln",
  log: "\\log_{10}",
  mod: "\\operatorname{mod}",
  min: "\\min",
  max: "\\max",
};

export interface TexOptions {
  /** Discrete time: signal functions take square brackets, u[n]. */
  discrete?: boolean;
}

export function toTex(node: Node, opts: TexOptions = {}): string {
  const go = (n: Node): string => toTex(n, opts);
  const wrap = (n: Node, min: number) => (prec(n) < min ? paren(go(n)) : go(n));

  switch (node.k) {
    case "num":
      return node.raw;
    case "var":
      return node.name;
    case "const":
      return node.name === "pi" ? "\\pi" : node.name;
    case "param":
      return paramTex(node.name);
    case "neg":
      return `-${wrap(node.a, PREC.neg)}`;
    case "bin": {
      const { a, b, op } = node;
      if (op === "+") return b.k === "neg" ? `${go(a)}-${wrap(b.a, PREC.product)}` : `${go(a)}+${go(b)}`;
      if (op === "-") return `${go(a)}-${wrap(b, PREC.product)}`;
      if (op === "/") return `\\frac{${go(a)}}{${go(b)}}`;
      if (op === "^") {
        const base = a.k === "call" && a.fn !== "abs" && a.fn !== "sqrt" ? `{${go(a)}}` : wrap(a, PREC.atom);
        return `${base}^{${go(b)}}`;
      }
      // Multiplication: juxtapose, with \cdot only where digits would run together.
      const left = wrap(a, PREC.product);
      const right = b.k === "neg" || (b.k === "num" && b.v < 0) ? paren(go(b)) : wrap(b, PREC.power);
      const needsDot = /[0-9.]$/.test(left) && /^[0-9.]/.test(right);
      const thin = /[a-z]$/i.test(left) && b.k === "call" ? "\\," : "";
      return needsDot ? `${left}\\cdot ${right}` : `${left}${thin}${right}`;
    }
    case "call": {
      const args = node.args.map(go);
      if (node.fn === "abs") return `\\left|${args[0]}\\right|`;
      if (node.fn === "sqrt") return `\\sqrt{${args[0]}}`;
      if (node.fn === "exp") return `e^{${args[0]}}`;
      if (node.fn === "floor") return `\\left\\lfloor ${args[0]}\\right\\rfloor`;
      if (node.fn === "ceil") return `\\left\\lceil ${args[0]}\\right\\rceil`;
      const name = FN_TEX[node.fn] ?? `\\operatorname{${node.fn}}`;
      const signal = ["u", "delta", "rect", "tri", "sgn", "ramp"].includes(node.fn);
      if (opts.discrete && signal) {
        const inner = args.join(",");
        return /\\frac|\^\{/.test(inner) ? `${name}\\left[${inner}\\right]` : `${name}[${inner}]`;
      }
      return `${name}${paren(args.join(","))}`;
    }
  }
}

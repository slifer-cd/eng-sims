/*
 * Recursive-descent parser for typed signal expressions.
 *
 *   sum     = product (("+" | "-") product)*
 *   product = unary (("*" | "/" | implicit) power)*
 *   unary   = ("-" | "+") unary | power
 *   power   = atom ("^" unary)?            right associative: 2^3^2 = 2^(3^2)
 *   atom    = number | name | name(args) | (sum) | |sum| | \frac{sum}{sum}
 *
 * Implicit multiplication binds like "*": 2t, 2(t+1), e^(-t)u(t), t u(t).
 * Unknown single letters (or a letter plus digits, like w0) become parameters.
 */

import type { Node, ParseResult, Problem } from "./ast";
import { CONSTANTS, GREEK, lookupFunction, type Variable } from "./names";
import { type Tok, tokenize } from "./tokens";

const CLOSER: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

class ParseError extends Error {
  constructor(public problem: Problem) {
    super(problem.message);
  }
}

export interface ParseOptions {
  variable: Variable;
}

export function parse(text: string, opts: ParseOptions): ParseResult {
  if (text.trim() === "") return { ok: false, error: { message: "Type an expression", from: 0, to: 0 } };
  const lexed = tokenize(text);
  if (!lexed.ok) return lexed;
  const p = new Parser(lexed.tokens, opts.variable);
  try {
    const ast = p.sum();
    const tok = p.peek();
    if (tok.t !== "end") {
      if (tok.t === "close") p.fail(`Unmatched "${tok.ch}"`, tok);
      if (tok.t === "bar") p.fail(`Unmatched "|"`, tok);
      if (tok.t === "comma") p.fail("A comma only separates function arguments", tok);
      p.fail("Unexpected input", tok);
    }
    return { ok: true, ast, params: p.params, warnings: p.warnings };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.problem };
    throw e;
  }
}

class Parser {
  private i = 0;
  private absDepth = 0;
  params: string[] = [];
  warnings: Problem[] = [];

  constructor(
    private tokens: Tok[],
    private variable: Variable,
  ) {}

  peek(offset = 0): Tok {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }

  next(): Tok {
    const t = this.peek();
    if (t.t !== "end") this.i++;
    return t;
  }

  fail(message: string, tok: { from: number; to: number }): never {
    throw new ParseError({ message, from: tok.from, to: Math.max(tok.to, tok.from) });
  }

  sum(): Node {
    let left = this.product();
    for (;;) {
      const t = this.peek();
      if (t.t === "op" && (t.op === "+" || t.op === "-")) {
        this.next();
        if (this.peek().t === "end") this.fail(`Missing a term after "${t.op}"`, this.peek());
        const right = this.product();
        left = { k: "bin", op: t.op, a: left, b: right, from: left.from, to: right.to };
      } else return left;
    }
  }

  /** Can the next token start an implicitly multiplied factor? */
  private startsFactor(): boolean {
    const t = this.peek();
    if (t.t === "num" || t.t === "word" || t.t === "frac") return true;
    if (t.t === "open") return true;
    if (t.t === "bar") return this.absDepth === 0;
    return false;
  }

  product(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === "op" && (t.op === "*" || t.op === "/")) {
        this.next();
        if (this.peek().t === "end") this.fail(`Missing a factor after "${t.op}"`, this.peek());
        const right = this.unary();
        left = { k: "bin", op: t.op, a: left, b: right, from: left.from, to: right.to };
      } else if (this.startsFactor()) {
        const right = this.power();
        left = { k: "bin", op: "*", a: left, b: right, from: left.from, to: right.to, implicit: true };
      } else return left;
    }
  }

  unary(): Node {
    const t = this.peek();
    if (t.t === "op" && (t.op === "-" || t.op === "+")) {
      this.next();
      if (this.peek().t === "end") this.fail(`Missing a value after "${t.op}"`, this.peek());
      const a = this.unary();
      return t.op === "-" ? { k: "neg", a, from: t.from, to: a.to } : a;
    }
    return this.power();
  }

  power(): Node {
    const base = this.atom();
    if (this.peek().t === "op" && (this.peek() as { op: string }).op === "^") {
      const caret = this.next();
      const expStart = this.peek();
      if (expStart.t === "end") this.fail('Missing an exponent after "^"', expStart);
      const exp = this.unary();
      // e^-2t reads as e^(-2)·t; flag it, since e^(-2t) was almost certainly meant.
      // (e^-t u(t) is fine: a function after the exponent is clearly a new factor.)
      const nt = this.peek();
      const grouped = expStart.t === "open";
      const looseFactor = nt.t === "num" || (nt.t === "word" && !lookupFunction(nt.w) && nt.w !== "r");
      if (!grouped && base.k === "const" && base.name === "e" && looseFactor) {
        this.warnings.push({
          message: `This reads as e^${exponentText(exp)} times ${nt.t === "word" ? nt.w : "a number"}. For e^{${exponentText(exp)}${nt.t === "word" ? nt.w : "…"}}, type e^(${exponentText(exp)}${nt.t === "word" ? nt.w : "…"}).`,
          from: caret.from,
          to: nt.to,
        });
      }
      return { k: "bin", op: "^", a: base, b: exp, from: base.from, to: exp.to };
    }
    return base;
  }

  private group(open: Tok & { t: "open" }): Node {
    const inner = this.sum();
    const close = this.peek();
    if (close.t !== "close") this.fail(`Missing "${CLOSER[open.ch]}"`, close.t === "end" ? close : open);
    this.next();
    return { ...inner, from: open.from, to: close.to };
  }

  private args(open: Tok & { t: "open" }): Node[] {
    const out: Node[] = [];
    for (;;) {
      if (this.peek().t === "close" && out.length === 0) this.fail("Missing the argument", this.peek());
      out.push(this.sum());
      const t = this.peek();
      if (t.t === "comma") {
        this.next();
        continue;
      }
      if (t.t !== "close") this.fail(`Missing "${CLOSER[open.ch]}"`, t.t === "end" ? t : open);
      this.next();
      return out;
    }
  }

  atom(): Node {
    const t = this.next();
    switch (t.t) {
      case "num":
        return { k: "num", v: t.v, raw: t.raw, from: t.from, to: t.to };
      case "open":
        return this.group(t);
      case "bar": {
        this.absDepth++;
        const inner = this.sum();
        this.absDepth--;
        const close = this.peek();
        if (close.t !== "bar") this.fail('Missing the closing "|"', close.t === "end" ? close : t);
        this.next();
        return { k: "call", fn: "abs", args: [inner], from: t.from, to: close.to };
      }
      case "frac": {
        const a = this.peek();
        if (a.t !== "open") this.fail("\\frac needs {numerator}{denominator}", t);
        this.next();
        const num = this.group(a as Tok & { t: "open" });
        const b = this.peek();
        if (b.t !== "open") this.fail("\\frac needs {numerator}{denominator}", t);
        this.next();
        const den = this.group(b as Tok & { t: "open" });
        return { k: "bin", op: "/", a: num, b: den, from: t.from, to: den.to };
      }
      case "word":
        return this.word(t);
      case "end":
        return this.fail("Expression ends too early", t);
      case "close":
        return this.fail(`Unexpected "${t.ch}"`, t);
      case "comma":
        return this.fail("Unexpected comma", t);
      case "op":
        return this.fail(`Unexpected "${t.op}"`, t);
    }
  }

  private word(t: Tok & { t: "word" }): Node {
    const w = t.w;
    const next = this.peek();
    const fn = lookupFunction(w);
    // r(…) is the ramp; a bare r is a parameter.
    if (w === "r" && next.t === "open") {
      this.next();
      const args = this.args(next);
      return this.call("ramp", args, t);
    }
    if (fn) {
      // sin^2(t) means (sin t)^2.
      let power: Node | null = null;
      if (next.t === "op" && next.op === "^" && this.peek(1).t !== "open") {
        this.next();
        power = this.atom();
      }
      const open = this.peek();
      if (open.t !== "open") this.fail(`${w} needs parentheses: ${w}(${this.variable})`, t);
      this.next();
      const args = this.args(open as Tok & { t: "open" });
      const callNode = this.call(fn.name, args, t);
      return power ? { k: "bin", op: "^", a: callNode, b: power, from: t.from, to: callNode.to } : callNode;
    }
    if (w === this.variable) return { k: "var", name: w, from: t.from, to: t.to };
    if (CONSTANTS[w]) return { k: "const", name: CONSTANTS[w], from: t.from, to: t.to };
    if (/^[A-Za-z][0-9]*$/.test(w) || GREEK[w]) {
      if (!this.params.includes(w)) this.params.push(w);
      return { k: "param", name: w, from: t.from, to: t.to };
    }
    return this.fail(`Unknown name "${w}"`, t);
  }

  private call(fn: string, args: Node[], t: { from: number; to: number }): Node {
    const info = lookupFunction(fn)!;
    const last = args[args.length - 1];
    if (args.length !== info.arity) {
      this.fail(`${fn} takes ${info.arity === 1 ? "one argument" : `${info.arity} arguments`}`, {
        from: t.from,
        to: last?.to ?? t.to,
      });
    }
    return { k: "call", fn: info.name, args, from: t.from, to: (last?.to ?? t.to) + 1 };
  }
}

function exponentText(n: Node): string {
  if (n.k === "num") return n.raw;
  if (n.k === "neg" && n.a.k === "num") return `-${n.a.raw}`;
  return "…";
}

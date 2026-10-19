/*
 * Boolean expressions: tokenizer, parser and LaTeX.
 *
 * Precedence, tightest first: NOT (prefix ! ~ ¬ or postfix '), AND (· * & ∧, or just
 * writing terms next to each other), XOR (^ ⊕), OR (+ | ∨). The words and, or, xor and
 * not work too. Variables are one letter with optional digits (A, b, X1), so AB is A·B.
 */

export type BoolExpr =
  | { k: "var"; name: string }
  | { k: "const"; v: 0 | 1 }
  | { k: "not"; a: BoolExpr }
  | { k: "and" | "or" | "xor"; args: BoolExpr[] };

export type BoolParse = { ok: true; expr: BoolExpr; vars: string[] } | { ok: false; error: string; at: number };

type Tok =
  | { t: "var"; name: string; at: number }
  | { t: "const"; v: 0 | 1; at: number }
  | { t: "op"; op: "and" | "or" | "xor" | "not" | "prime" | "(" | ")"; at: number };

const SYMBOLS: Record<string, "and" | "or" | "xor" | "not" | "prime" | "(" | ")"> = {
  "·": "and", "*": "and", "&": "and", "∧": "and", ".": "and", "⋅": "and",
  "+": "or", "|": "or", "∨": "or",
  "^": "xor", "⊕": "xor",
  "!": "not", "~": "not", "¬": "not",
  "'": "prime", "’": "prime", "′": "prime",
  "(": "(", ")": ")", "[": "(", "]": ")",
};
const WORDS: Record<string, "and" | "or" | "xor" | "not"> = { and: "and", or: "or", xor: "xor", not: "not" };

class ParseError extends Error {
  constructor(message: string, readonly at: number) {
    super(message);
  }
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch in SYMBOLS) {
      out.push({ t: "op", op: SYMBOLS[ch], at: i });
      i++;
    } else if (ch === "0" || ch === "1") {
      out.push({ t: "const", v: ch === "1" ? 1 : 0, at: i });
      i++;
    } else if (/[A-Za-z]/.test(ch)) {
      const word = /^[A-Za-z]+/.exec(text.slice(i))![0];
      const op = WORDS[word.toLowerCase()];
      if (op && word.length > 1) {
        out.push({ t: "op", op, at: i });
        i += word.length;
        continue;
      }
      // Single letters, each with any digits that follow: AB1 → A, B1.
      const m = /^[A-Za-z]\d*/.exec(text.slice(i))!;
      out.push({ t: "var", name: m[0], at: i });
      i += m[0].length;
    } else {
      throw new ParseError(`“${ch}” isn't something I can read here.`, i);
    }
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private toks: Tok[], private end: number) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isOp(op: string): boolean {
    const t = this.peek();
    return t?.t === "op" && t.op === op;
  }

  parse(): BoolExpr {
    if (this.toks.length === 0) throw new ParseError("Type an expression.", 0);
    const e = this.or();
    const t = this.peek();
    if (t) throw new ParseError(t.t === "op" && t.op === ")" ? "This ) has no matching (." : "Unexpected symbol.", t.at);
    return e;
  }

  private nary(kind: "or" | "xor", next: () => BoolExpr): BoolExpr {
    const args = [next()];
    while (this.isOp(kind)) {
      this.i++;
      args.push(next());
    }
    return args.length === 1 ? args[0] : { k: kind, args };
  }

  private or = (): BoolExpr => this.nary("or", this.xor);
  private xor = (): BoolExpr => this.nary("xor", this.and);

  private startsFactor(): boolean {
    const t = this.peek();
    return t !== undefined && (t.t !== "op" || t.op === "(" || t.op === "not");
  }

  private and = (): BoolExpr => {
    const args = [this.unary()];
    for (;;) {
      if (this.isOp("and")) {
        this.i++;
        args.push(this.unary());
      } else if (this.startsFactor()) {
        args.push(this.unary());
      } else break;
    }
    return args.length === 1 ? args[0] : { k: "and", args };
  };

  private unary(): BoolExpr {
    if (this.isOp("not")) {
      this.i++;
      return { k: "not", a: this.unary() };
    }
    let e = this.atom();
    while (this.isOp("prime")) {
      this.i++;
      e = { k: "not", a: e };
    }
    return e;
  }

  private atom(): BoolExpr {
    const t = this.peek();
    if (!t) throw new ParseError("The expression ends too early.", this.end);
    this.i++;
    if (t.t === "var") return { k: "var", name: t.name };
    if (t.t === "const") return { k: "const", v: t.v };
    if (t.op === "(") {
      const e = this.or();
      if (!this.isOp(")")) throw new ParseError("Missing ).", this.peek()?.at ?? this.end);
      this.i++;
      return e;
    }
    throw new ParseError(t.op === ")" ? "Empty brackets or a stray )." : `Something is missing before this operator.`, t.at);
  }
}

/** Variables in the order they're shown: alphabetical, then by number (A, B, X2, X10). */
export function sortVars(names: Iterable<string>): string[] {
  return [...new Set(names)].sort((a, b) => {
    const la = a[0].toUpperCase();
    const lb = b[0].toUpperCase();
    if (la !== lb) return la < lb ? -1 : 1;
    const na = a.length > 1 ? parseInt(a.slice(1), 10) : -1;
    const nb = b.length > 1 ? parseInt(b.slice(1), 10) : -1;
    return na !== nb ? na - nb : a < b ? -1 : a > b ? 1 : 0;
  });
}

export function varsOf(e: BoolExpr, out = new Set<string>()): Set<string> {
  if (e.k === "var") out.add(e.name);
  else if (e.k === "not") varsOf(e.a, out);
  else if (e.k !== "const") for (const a of e.args) varsOf(a, out);
  return out;
}

export function parseBool(text: string): BoolParse {
  try {
    const expr = new Parser(tokenize(text), text.length).parse();
    return { ok: true, expr, vars: sortVars(varsOf(expr)) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, at: e.at };
    throw e;
  }
}

export function evaluate(e: BoolExpr, env: Record<string, boolean>): boolean {
  switch (e.k) {
    case "var":
      return env[e.name];
    case "const":
      return e.v === 1;
    case "not":
      return !evaluate(e.a, env);
    case "and":
      return e.args.every((a) => evaluate(a, env));
    case "or":
      return e.args.some((a) => evaluate(a, env));
    case "xor":
      return e.args.reduce((acc, a) => acc !== evaluate(a, env), false);
  }
}

/** A1 → A_{1}. */
export const varTex = (name: string) => (name.length > 1 ? `${name[0]}_{${name.slice(1)}}` : name);

const PREC = { or: 1, xor: 2, and: 3 } as const;

/** LaTeX with overbars for NOT and the fewest brackets. */
export function boolTex(e: BoolExpr, parent = 0): string {
  switch (e.k) {
    case "var":
      return varTex(e.name);
    case "const":
      return String(e.v);
    case "not":
      return `\\overline{${boolTex(e.a)}}`;
    default: {
      const p = PREC[e.k];
      const sep = e.k === "and" ? "\\," : e.k === "or" ? " + " : " \\oplus ";
      // Juxtaposed single letters read fine; anything longer gets a thin space.
      const inner = e.args.map((a) => boolTex(a, p)).join(e.k === "and" && e.args.every(simpleFactor) ? "" : sep);
      return p < parent ? `\\left(${inner}\\right)` : inner;
    }
  }
}

const simpleFactor = (e: BoolExpr): boolean => e.k === "var" || (e.k === "not" && e.a.k === "var");

/** Plain text for an expression (used to send it to another page). */
export function boolText(e: BoolExpr, parent = 0): string {
  switch (e.k) {
    case "var":
      return e.name;
    case "const":
      return String(e.v);
    case "not":
      return e.a.k === "var" || e.a.k === "const" ? `${boolText(e.a)}'` : `(${boolText(e.a)})'`;
    default: {
      const p = PREC[e.k];
      const inner = e.args.map((a) => boolText(a, p)).join(e.k === "and" ? " " : e.k === "or" ? " + " : " ^ ");
      return p < parent ? `(${inner})` : inner;
    }
  }
}

/** Sub-expressions worth a truth-table column: every operator node, inner ones first, no repeats. */
export function subexpressions(e: BoolExpr): BoolExpr[] {
  const seen = new Set<string>();
  const out: BoolExpr[] = [];
  const walk = (n: BoolExpr) => {
    if (n.k === "var" || n.k === "const") return;
    if (n.k === "not") walk(n.a);
    else n.args.forEach(walk);
    const key = boolTex(n);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  };
  walk(e);
  return out;
}

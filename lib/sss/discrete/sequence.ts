/*
 * Discrete-time input: a formula in n, or a list of values starting at n₀. Both become the
 * same exact Signal (pieces over integers), so every discrete tool works with either.
 */

import { compile } from "../expr/compile";
import { parse } from "../expr/parse";
import { cisFinite } from "../math/complex";
import { type Analysis, analyze } from "../signal/analyze";
import { type Signal, sigAdd, sigEval, sigPiece, sigZero } from "../signal/signal";
import type { SeqInput } from "../store";

export type SeqAnalysis = Analysis | { kind: "error"; message: string };

/** "1, 2, 1/2, -3" → numbers; each item may be a constant expression. */
export function parseValues(text: string): { ok: true; values: number[] } | { ok: false; message: string } {
  const items = text.split(/[,;\s]+/).filter((s) => s.trim() !== "");
  if (!items.length) return { ok: false, message: "Type the values, separated by commas." };
  if (items.length > 400) return { ok: false, message: "That's too many values (400 at most)." };
  const values: number[] = [];
  for (const item of items) {
    const p = parse(item, { variable: "n" });
    if (!p.ok || p.params.length) return { ok: false, message: `"${item}" isn't a number.` };
    const v = compile(p.ast).f(0);
    if (!cisFinite(v) || Math.abs(v.im) > 1e-12) return { ok: false, message: `"${item}" isn't a real number.` };
    values.push(v.re);
  }
  return { ok: true, values };
}

export function valuesSignal(values: number[], start: number): Signal {
  let s = sigZero();
  values.forEach((v, i) => {
    if (v !== 0) s = sigAdd(s, sigPiece(start + i, start + i + 1, [{ rate: { re: 0, im: 0 }, poly: [{ re: v, im: 0 }] }]));
  });
  return s;
}

export function analyzeSeq(input: SeqInput): SeqAnalysis {
  if (input.mode === "values") {
    const r = parseValues(input.values);
    if (!r.ok) return { kind: "error", message: r.message };
    const signal = valuesSignal(r.values, Math.round(input.start));
    return { kind: "exact", signal, special: [], f: (n) => sigEval(signal, n) };
  }
  const p = parse(input.text, { variable: "n" });
  if (!p.ok) return { kind: "error", message: p.error.message };
  return analyze(p.ast, input.params, "dt");
}

/** An index window that frames a sequence. */
export function indexRange(an: Analysis): [number, number] {
  if (an.kind !== "exact") return [-5, 20];
  const ends = an.signal.pieces.flatMap((p) => [p.from, p.to - 1]).filter(Number.isFinite);
  let lo = ends.length ? Math.min(...ends) : 0;
  let hi = ends.length ? Math.max(...ends) : 0;
  const first = an.signal.pieces[0];
  const last = an.signal.pieces[an.signal.pieces.length - 1];
  const tail = (dir: 1 | -1, p: Signal["pieces"][number]) => {
    let len = 10;
    for (const g of p.expr) {
      const m = Math.exp(g.rate.re * dir);
      if (m < 1 - 1e-9) len = Math.max(len, Math.min(40, Math.ceil(Math.log(1e-3) / Math.log(m)) + (g.poly.length - 1) * 5));
      else len = Math.max(len, 15);
      if (Math.abs(g.rate.im) > 1e-9 && Math.abs(Math.abs(g.rate.im) - Math.PI) > 1e-9) len = Math.max(len, Math.min(40, Math.ceil((3 * 2 * Math.PI) / Math.abs(g.rate.im))));
    }
    return len;
  };
  if (last?.to === Infinity) hi = Math.max(hi, lo) + tail(1, last);
  if (first?.from === -Infinity) lo = Math.min(lo, hi) - tail(-1, first);
  lo = Math.min(lo - 3, -3);
  hi = Math.max(hi + 3, 8);
  return [lo, hi];
}

/*
 * Quine–McCluskey minimisation with Petrick's method for the cyclic part, plus the
 * working shown on the K-map page.
 *
 * An implicant is a cube: `bits` are the fixed variable values and `dash` marks the
 * variables it doesn't depend on (bits under the dash are 0). Bit n−1 is the first variable.
 */

import type { Step } from "../../sss/steps";
import { varTex } from "./expr";
import { type Cell, listTex, rowsWhere } from "./truth";

export interface Implicant {
  bits: number;
  dash: number;
}

const popcount = (x: number) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

export const covers = (p: Implicant, m: number) => (m & ~p.dash) === p.bits;
export const literals = (p: Implicant, n: number) => n - popcount(p.dash);
const key = (p: Implicant) => `${p.bits}/${p.dash}`;

/** The minterms a cube covers. */
export function cubeMinterms(p: Implicant, n: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < 1 << n; m++) if (covers(p, m)) out.push(m);
  return out;
}

/** 1-0- style pattern, first variable on the left. */
export function cubePattern(p: Implicant, n: number): string {
  let s = "";
  for (let i = n - 1; i >= 0; i--) s += (p.dash >> i) & 1 ? "-" : (p.bits >> i) & 1 ? "1" : "0";
  return s;
}

/** The cube as a product term: A\overline{C}. "1" if it covers everything. */
export function productTex(p: Implicant, vars: string[]): string {
  const n = vars.length;
  const lits = vars.flatMap((v, i) => {
    const b = n - 1 - i;
    if ((p.dash >> b) & 1) return [];
    return [(p.bits >> b) & 1 ? varTex(v) : `\\overline{${varTex(v)}}`];
  });
  return lits.length ? lits.join("") : "1";
}

/** The cube of F′ as a sum term of F: (\overline{A} + C). "0" if it covers everything. */
export function sumTex(p: Implicant, vars: string[]): string {
  const n = vars.length;
  const lits = vars.flatMap((v, i) => {
    const b = n - 1 - i;
    if ((p.dash >> b) & 1) return [];
    return [(p.bits >> b) & 1 ? `\\overline{${varTex(v)}}` : varTex(v)];
  });
  if (lits.length === 0) return "0";
  return lits.length === 1 ? lits[0] : `(${lits.join(" + ")})`;
}

/** The same, as plain text for the expression box: A C' or (A' + C). */
export function productText(p: Implicant, vars: string[]): string {
  const n = vars.length;
  const lits = vars.flatMap((v, i) => {
    const b = n - 1 - i;
    if ((p.dash >> b) & 1) return [];
    return [(p.bits >> b) & 1 ? v : `${v}'`];
  });
  return lits.length ? lits.join(" ") : "1";
}

export interface Minimised {
  n: number;
  ones: number[];
  dcs: number[];
  /** Each combining pass, starting with the minterms themselves. */
  passes: Implicant[][];
  primes: Implicant[];
  /** Indices into `primes`. */
  essential: number[];
  /** Indices into `primes`, essentials first. */
  cover: number[];
  /** Minterms still uncovered after the essentials. */
  remaining: number[];
  /** How the rest was covered: nothing left, Petrick's method, or greedy when Petrick blows up. */
  method: "none" | "petrick" | "greedy";
  /** Petrick's product of sums over the remaining minterms (indices into `primes`). */
  petrick: number[][];
}

const PETRICK_LIMIT = 4000;

export function minimise(n: number, ones: number[], dcs: number[]): Minimised {
  const base: Minimised = { n, ones, dcs, passes: [], primes: [], essential: [], cover: [], remaining: [], method: "none", petrick: [] };
  const all = [...ones, ...dcs].sort((a, b) => a - b);
  if (ones.length === 0) return base;

  // Combine cubes that differ in one fixed bit until nothing combines.
  let column: Implicant[] = all.map((m) => ({ bits: m, dash: 0 }));
  const primes: Implicant[] = [];
  const passes: Implicant[][] = [];
  while (column.length) {
    passes.push(column);
    const used = new Set<string>();
    const next = new Map<string, Implicant>();
    for (let i = 0; i < column.length; i++) {
      for (let j = i + 1; j < column.length; j++) {
        const a = column[i];
        const b = column[j];
        if (a.dash !== b.dash) continue;
        const diff = a.bits ^ b.bits;
        if (popcount(diff) !== 1) continue;
        const c = { bits: a.bits & b.bits, dash: a.dash | diff };
        next.set(key(c), c);
        used.add(key(a)).add(key(b));
      }
    }
    for (const p of column) if (!used.has(key(p))) primes.push(p);
    column = [...next.values()].sort((a, b) => a.bits - b.bits || a.dash - b.dash);
  }
  // Primes with no real minterm (only don't-cares) never help.
  const useful = primes.filter((p) => ones.some((m) => covers(p, m)));
  useful.sort((a, b) => literals(a, n) - literals(b, n) || firstMinterm(a, n) - firstMinterm(b, n));

  const coveredBy = (m: number) => useful.flatMap((p, i) => (covers(p, m) ? [i] : []));
  const essential = [...new Set(ones.flatMap((m) => (coveredBy(m).length === 1 ? coveredBy(m) : [])))].sort((a, b) => a - b);
  const remaining = ones.filter((m) => !essential.some((i) => covers(useful[i], m)));
  const result: Minimised = { ...base, passes, primes: useful, essential, cover: [...essential], remaining };
  if (remaining.length === 0) return result;

  const petrick = remaining.map(coveredBy);
  result.petrick = petrick;
  const chosen = petrickCover(petrick, useful, n);
  if (chosen) {
    result.method = "petrick";
    result.cover.push(...chosen);
  } else {
    result.method = "greedy";
    result.cover.push(...greedyCover(remaining, useful, n));
  }
  return result;
}

const firstMinterm = (p: Implicant, n: number) => {
  for (let m = 0; m < 1 << n; m++) if (covers(p, m)) return m;
  return 0;
};

/** Expand the product of sums, absorbing as we go; the cheapest product wins. Null if it grows too big. */
function petrickCover(sums: number[][], primes: Implicant[], n: number): number[] | null {
  let products: Set<number>[] = [new Set()];
  for (const sum of sums) {
    const next: Set<number>[] = [];
    for (const prod of products) {
      if (sum.some((i) => prod.has(i))) {
        next.push(prod);
        continue;
      }
      for (const i of sum) next.push(new Set([...prod, i]));
    }
    // Absorption: X + XY = X.
    next.sort((a, b) => a.size - b.size);
    const kept: Set<number>[] = [];
    for (const p of next) if (!kept.some((q) => [...q].every((i) => p.has(i)))) kept.push(p);
    if (kept.length > PETRICK_LIMIT) return null;
    products = kept;
  }
  const cost = (s: Set<number>) => [s.size, [...s].reduce((t, i) => t + literals(primes[i], n), 0)] as const;
  products.sort((a, b) => cost(a)[0] - cost(b)[0] || cost(a)[1] - cost(b)[1]);
  return [...products[0]].sort((a, b) => a - b);
}

function greedyCover(remaining: number[], primes: Implicant[], n: number): number[] {
  const left = new Set(remaining);
  const out: number[] = [];
  while (left.size) {
    let best = -1;
    let bestScore = -1;
    primes.forEach((p, i) => {
      const score = [...left].filter((m) => covers(p, m)).length * 64 - literals(p, n);
      if (score > bestScore) [best, bestScore] = [i, score];
    });
    out.push(best);
    for (const m of [...left]) if (covers(primes[best], m)) left.delete(m);
  }
  return out;
}

/** The minimal sum of products, as LaTeX. */
export function sopTex(r: Minimised, vars: string[]): string {
  if (r.ones.length === 0) return "0";
  return r.cover.map((i) => productTex(r.primes[i], vars)).join(" + ");
}

/** The minimal product of sums, from minimising F′ (pass the result for the zeros). */
export function posTex(rInv: Minimised, vars: string[]): string {
  if (rInv.ones.length === 0) return "1";
  return rInv.cover.map((i) => sumTex(rInv.primes[i], vars)).join("");
}

export function sopText(r: Minimised, vars: string[]): string {
  if (r.ones.length === 0) return "0";
  return r.cover.map((i) => productText(r.primes[i], vars)).join(" + ");
}

/** Minimise F and F′ from a column of cells. */
export function minimiseCells(cells: readonly Cell[], n: number): { sop: Minimised; pos: Minimised } {
  const dcs = rowsWhere(cells, "x");
  return { sop: minimise(n, rowsWhere(cells, "1"), dcs), pos: minimise(n, rowsWhere(cells, "0"), dcs) };
}

const MAX_TABLE_ROWS = 32;

function clip<T>(rows: T[], gap: T): T[] {
  return rows.length > MAX_TABLE_ROWS ? [...rows.slice(0, MAX_TABLE_ROWS - 4), gap, ...rows.slice(-3)] : rows;
}

const P = (i: number) => `P_{${i + 1}}`;
const mlist = (ms: number[]) => (ms.length > 12 ? `${ms.slice(0, 10).join(",")},\\ldots` : ms.join(","));

/**
 * The Quine–McCluskey working for the sum of products. With `complement`, `r` minimises
 * the 0s (F̅) and the last step turns that into the product of sums by De Morgan's law.
 */
export function qmSteps(r: Minimised, vars: string[], complement = false): Step[] {
  const n = r.n;
  const F = complement ? "\\overline{F}" : "F";
  const one = complement ? "0" : "1";
  if (r.ones.length === 0) return [{ title: `No row is ${one}, so the function is ${complement ? 1 : 0}`, lines: [`F = ${complement ? 1 : 0}`] }];
  if (r.ones.length + r.dcs.length === 1 << n && r.primes.length === 1 && r.primes[0].dash === (1 << n) - 1) {
    return [{ title: `Every row is ${one} (or don't care), so the function is ${complement ? 0 : 1}`, lines: [`F = ${complement ? 0 : 1}`] }];
  }
  const what = complement ? "the rows where F = 0: these are the 1s of the complement F̅, minimised the same way" : "the minterms where F = 1";
  const steps: Step[] = [
    {
      title: r.dcs.length ? `List ${what}, and the don't-cares (they may be used to make bigger groups)` : `List ${what}`,
      lines: [`${F} = ${listTex("sum", r.ones, r.dcs)}`],
    },
  ];

  const first = r.passes[0];
  const groups = new Map<number, Implicant[]>();
  for (const p of first) groups.set(popcount(p.bits), [...(groups.get(popcount(p.bits)) ?? []), p]);
  const rows = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([ones, ps]) => ps.map((p, i) => `${i === 0 ? ones : ""} & m_{${p.bits}}${r.dcs.includes(p.bits) ? "^{*}" : ""} & \\mathtt{${cubePattern(p, n)}}`));
  steps.push({
    title: `Group them by the number of 1s in their binary form${r.dcs.length ? " (* marks a don't-care)" : ""}`,
    lines: [`\\begin{array}{c|l|l} \\text{1s} & \\text{minterm} & ${vars.map(varTex).join("")} \\\\ \\hline ${clip(rows, "\\vdots & \\vdots & \\vdots").join(" \\\\ ")} \\end{array}`],
  });

  for (let k = 1; k < r.passes.length; k++) {
    const pass = r.passes[k];
    const prow = pass.map((p) => `m(${mlist(cubeMinterms(p, n))}) & \\mathtt{${cubePattern(p, n)}}`);
    steps.push({
      title:
        k === 1
          ? "Combine minterms in neighbouring groups that differ in exactly one bit; that bit becomes a dash"
          : `Combine again: cubes with the dashes in the same places that differ in one more bit (pass ${k})`,
      lines: [`\\begin{array}{l|l} ${clip(prow, "\\vdots & \\vdots").join(" \\\\ ")} \\end{array}`],
    });
  }

  const primeRows = r.primes.map(
    (p, i) => `${P(i)} & \\mathtt{${cubePattern(p, n)}} & ${productTex(p, vars)} & m(${mlist(cubeMinterms(p, n))})${r.essential.includes(i) ? " & \\text{essential}" : " &"}`,
  );
  steps.push({
    title: "The cubes that never combined are the prime implicants",
    lines: [`\\begin{array}{l|l|l|l|l} ${clip(primeRows, "\\vdots & & & &").join(" \\\\ ")} \\end{array}`],
  });

  const essentialLines = r.essential.map((i) => {
    const only = r.ones.filter((m) => covers(r.primes[i], m) && r.primes.filter((p) => covers(p, m)).length === 1);
    return `m_{${only[0]}} \\text{ is covered only by } ${P(i)} = ${productTex(r.primes[i], vars)}`;
  });
  steps.push({
    title: r.essential.length
      ? "A prime implicant is essential if some minterm is covered by it alone; those must be in the answer"
      : "No minterm is covered by only one prime implicant, so there are no essential ones",
    lines: essentialLines.length ? clip(essentialLines, "\\vdots") : [`\\text{${r.primes.length} prime implicants, none essential}`],
  });

  if (r.remaining.length) {
    const sums = r.petrick.map((s) => (s.length === 1 ? P(s[0]) : `(${s.map(P).join(" + ")})`));
    const extra = r.cover.filter((i) => !r.essential.includes(i));
    steps.push({
      title:
        r.method === "petrick"
          ? `Minterms ${r.remaining.join(", ")} are still uncovered. Petrick's method: each needs one of the primes covering it; multiply out and take the cheapest product`
          : `Minterms ${r.remaining.join(", ")} are still uncovered. There are too many combinations to try them all, so the primes covering the most of them are picked one at a time`,
      lines: [
        `${clip(sums, "\\cdots").join("")} = 1`,
        `\\Rightarrow ${extra.map((i) => `${P(i)} = ${productTex(r.primes[i], vars)}`).join(",\\; ")}`,
      ],
    });
  } else if (r.essential.length) {
    steps.push({ title: "The essential prime implicants already cover every minterm", lines: [`\\{${r.essential.map(P).join(", ")}\\}`] });
  }

  if (complement) {
    steps.push({
      title: "Add up the chosen prime implicants to get F̅, then complement both sides: by De Morgan's law each product becomes a sum with every literal flipped",
      lines: [`\\overline{F} = ${sopTex(r, vars)}`, `F = ${posTex(r, vars)}`],
    });
  } else {
    steps.push({ title: "Add up the chosen prime implicants", lines: [`F = ${sopTex(r, vars)}`] });
  }
  return steps;
}

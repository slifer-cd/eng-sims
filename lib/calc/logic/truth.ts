/*
 * Truth tables. Row r gives the variables the bits of r, the first variable as the most
 * significant bit, so row r is minterm m_r.
 */

import type { Step } from "../../sss/steps";
import { type BoolExpr, boolTex, evaluate, subexpressions, varTex } from "./expr";

/** The most variables a table (and the minimiser) will take: 2^10 rows. */
export const MAX_VARS = 10;

/** Cell values: 0, 1 or x (don't care). */
export type Cell = "0" | "1" | "x";

export function envFor(row: number, vars: string[]): Record<string, boolean> {
  const n = vars.length;
  const env: Record<string, boolean> = {};
  vars.forEach((v, i) => (env[v] = ((row >> (n - 1 - i)) & 1) === 1));
  return env;
}

/** The function's value on every row, as a string of 0/1 cells. */
export function truthTable(e: BoolExpr, vars: string[]): Cell[] {
  const rows = 1 << vars.length;
  const out: Cell[] = [];
  for (let r = 0; r < rows; r++) out.push(evaluate(e, envFor(r, vars)) ? "1" : "0");
  return out;
}

export const rowsWhere = (cells: readonly Cell[], v: Cell) => cells.flatMap((c, i) => (c === v ? [i] : []));

/** Row r's input bits as a string: 5, 3 → "101". */
export const rowBits = (row: number, n: number) => row.toString(2).padStart(n, "0");

/** The minterm for row r: A\overline{B}C. */
export function mintermTex(row: number, vars: string[]): string {
  const n = vars.length;
  return vars.map((v, i) => ((row >> (n - 1 - i)) & 1 ? varTex(v) : `\\overline{${varTex(v)}}`)).join("");
}

/** The maxterm for row r: (\overline{A} + B + \overline{C}). */
export function maxtermTex(row: number, vars: string[]): string {
  const n = vars.length;
  return `(${vars.map((v, i) => ((row >> (n - 1 - i)) & 1 ? `\\overline{${varTex(v)}}` : varTex(v))).join(" + ")})`;
}

/** Σm(1, 3, 7) + d(5), or Πm with M. */
export function listTex(kind: "sum" | "product", rows: number[], dcs: number[]): string {
  const head = kind === "sum" ? "\\sum m" : "\\prod M";
  const main = `${head}(${rows.join(", ")})`;
  return dcs.length ? `${main} + d(${dcs.join(", ")})` : main;
}

/** The canonical sum of products (all minterms written out), or null if it's too long to show. */
export function canonicalSop(cells: readonly Cell[], vars: string[], max = 16): string | null {
  const ones = rowsWhere(cells, "1");
  if (ones.length === 0) return "0";
  if (ones.length > max) return null;
  return ones.map((r) => mintermTex(r, vars)).join(" + ");
}

export function canonicalPos(cells: readonly Cell[], vars: string[], max = 16): string | null {
  const zeros = rowsWhere(cells, "0");
  if (zeros.length === 0) return "1";
  if (zeros.length > max) return null;
  return zeros.map((r) => maxtermTex(r, vars)).join("");
}

export type MintermParse = { ok: true; ones: number[]; dcs: number[] } | { ok: false; error: string };

/**
 * A minterm list: "1, 3, 7", "m(1,3,7) + d(5)", "Σm(1,3,7) + d(5,6)". Every number must be
 * below 2^n.
 */
export function parseMinterms(text: string, n: number): MintermParse {
  const s = text.replace(/[Σ∑]/g, "").trim();
  const dcMatch = /\+?\s*(?:d|dc|x)\s*\(([^)]*)\)\s*$/i.exec(s);
  const mainText = (dcMatch ? s.slice(0, dcMatch.index) : s).replace(/^\s*m\s*\(/i, "").replace(/\)\s*$/, "");
  const nums = (t: string): number[] | string => {
    const parts = t.split(/[\s,]+/).filter(Boolean);
    const out: number[] = [];
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return `“${p}” isn't a minterm number.`;
      const v = parseInt(p, 10);
      if (v >= 1 << n) return `m${v} doesn't exist with ${n} variables (the last one is m${(1 << n) - 1}).`;
      out.push(v);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  };
  const ones = nums(mainText);
  if (typeof ones === "string") return { ok: false, error: ones };
  const dcs = dcMatch ? nums(dcMatch[1]) : [];
  if (typeof dcs === "string") return { ok: false, error: dcs };
  const both = ones.find((m) => dcs.includes(m));
  if (both !== undefined) return { ok: false, error: `m${both} is listed as both a 1 and a don't-care.` };
  return { ok: true, ones, dcs };
}

export function cellsFrom(n: number, ones: number[], dcs: number[]): Cell[] {
  const cells: Cell[] = Array.from({ length: 1 << n }, () => "0");
  for (const m of ones) cells[m] = "1";
  for (const m of dcs) cells[m] = "x";
  return cells;
}

/** Working for the Boolean page: evaluate column by column, then read the canonical forms off the table. */
export function canonicalSteps(e: BoolExpr, vars: string[], cells: readonly Cell[]): Step[] {
  const n = vars.length;
  const ones = rowsWhere(cells, "1");
  const zeros = rowsWhere(cells, "0");
  const subs = subexpressions(e);
  const steps: Step[] = [
    {
      title: `List all ${1 << n} combinations of ${n === 1 ? "the variable" : `the ${n} variables`}, counting up in binary (row r is minterm m_r)`,
      lines: [`${vars.map(varTex).join("")} = ${rowBits(0, n)}, ${rowBits(1, n)}, \\ldots, ${rowBits((1 << n) - 1, n)}`],
    },
  ];
  if (subs.length > 1) {
    steps.push({
      title: "Work out the expression one operation at a time, inner brackets first: each is a column of the table",
      lines: subs.map((s, i) => `\\text{(${i + 1})}\\; ${boolTex(s)}`),
    });
  }
  const sop = canonicalSop(cells, vars);
  steps.push({
    title: ones.length
      ? "Each row where F = 1 gives a minterm: the AND of every variable, barred where it is 0. OR them together"
      : "F is never 1, so there are no minterms",
    lines: ones.length
      ? [
          ...ones.slice(0, 6).map((r) => `m_{${r}}: ${rowBits(r, n)} \\to ${mintermTex(r, vars)}`),
          ...(ones.length > 6 ? ["\\vdots"] : []),
          `F = ${listTex("sum", ones, [])}${sop !== null ? ` = ${sop}` : ""}`,
        ]
      : ["F = 0"],
  });
  const pos = canonicalPos(cells, vars);
  steps.push({
    title: zeros.length
      ? "Each row where F = 0 gives a maxterm: the OR of every variable, barred where it is 1. AND them together"
      : "F is never 0, so there are no maxterms",
    lines: zeros.length
      ? [
          ...zeros.slice(0, 6).map((r) => `M_{${r}}: ${rowBits(r, n)} \\to ${maxtermTex(r, vars)}`),
          ...(zeros.length > 6 ? ["\\vdots"] : []),
          `F = ${listTex("product", zeros, [])}${pos !== null ? ` = ${pos}` : ""}`,
        ]
      : ["F = 1"],
  });
  return steps;
}

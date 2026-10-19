/*
 * Karnaugh map layout for 2–4 variables: rows take the first variables and columns the
 * rest, both in Gray-code order so neighbouring cells differ in one variable.
 */

import { covers, type Implicant } from "./qm";

export const KMAP_MAX = 4;

const GRAY: Record<number, number[]> = { 1: [0, 1], 2: [0, 1, 3, 2] };

export interface KmapLayout {
  n: number;
  rowBits: number;
  colBits: number;
  rowCodes: number[];
  colCodes: number[];
}

export function kmapLayout(n: number): KmapLayout {
  const rowBits = Math.floor(n / 2);
  const colBits = n - rowBits;
  return { n, rowBits, colBits, rowCodes: GRAY[rowBits], colCodes: GRAY[colBits] };
}

/** The minterm in row r, column c. */
export const cellMinterm = (l: KmapLayout, r: number, c: number) => (l.rowCodes[r] << l.colBits) | l.colCodes[c];

/** A row or column code as bits: 3, 2 → "11". */
export const codeBits = (code: number, bits: number) => code.toString(2).padStart(bits, "0");

/** A rectangle of cells; a group that wraps round an edge is split into several. */
export interface KRect {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  /** Edges where the group carries on at the far side of the map. */
  open: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}

/** Indices covered along one axis, as runs; a run touching both ends is the same group wrapping. */
function runs(hit: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < hit.length) {
    if (!hit[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < hit.length && hit[i]) i++;
    out.push([start, i - 1]);
  }
  return out;
}

export function implicantRects(l: KmapLayout, p: Implicant): KRect[] {
  const colMask = (1 << l.colBits) - 1;
  // A cube's rows and columns can be checked separately: split it into row and column parts.
  const rowPart: Implicant = { bits: p.bits >> l.colBits, dash: p.dash >> l.colBits };
  const colPart: Implicant = { bits: p.bits & colMask, dash: p.dash & colMask };
  const rowHit = l.rowCodes.map((code) => covers(rowPart, code));
  const colHit = l.colCodes.map((code) => covers(colPart, code));
  const rr = runs(rowHit);
  const cr = runs(colHit);
  const wrapsRows = rr.length === 2;
  const wrapsCols = cr.length === 2;
  const out: KRect[] = [];
  for (const [r0, r1] of rr) {
    for (const [c0, c1] of cr) {
      out.push({
        r0,
        r1,
        c0,
        c1,
        open: {
          top: wrapsRows && r0 === 0,
          bottom: wrapsRows && r1 === l.rowCodes.length - 1,
          left: wrapsCols && c0 === 0,
          right: wrapsCols && c1 === l.colCodes.length - 1,
        },
      });
    }
  }
  return out;
}

"use client";

import type { CSSProperties } from "react";
import { varTex } from "@/lib/calc/logic/expr";
import { cellMinterm, codeBits, implicantRects, kmapLayout } from "@/lib/calc/logic/kmap";
import type { Implicant } from "@/lib/calc/logic/qm";
import type { Cell } from "@/lib/calc/logic/truth";
import { Tex } from "../sss/Tex";

const NEXT: Record<Cell, Cell> = { "0": "1", "1": "x", x: "0" };

/**
 * A 2–4 variable Karnaugh map. Clicking a cell cycles it 0 → 1 → x. `groups` are drawn
 * as rounded loops, nested a little so overlapping groups stay visible; a group that wraps
 * round an edge is drawn open on that side.
 */
export function KmapGrid(props: {
  names: string[];
  cells: readonly Cell[];
  onChange: (m: number, v: Cell) => void;
  groups: { imp: Implicant; color: string }[];
}) {
  const l = kmapLayout(props.names.length);
  const rowVars = props.names.slice(0, l.rowBits).map(varTex).join("");
  const colVars = props.names.slice(l.rowBits).map(varTex).join("");
  const rows = l.rowCodes.length;
  const cols = l.colCodes.length;

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-0 p-3" style={{ gridTemplateColumns: `auto repeat(${cols}, 3.5rem)`, gridTemplateRows: `auto repeat(${rows}, 3.5rem)` }}>
        <div className="flex items-end justify-end px-2 pb-1 text-sm">
          <Tex tex={`${rowVars}\\,\\backslash\\,${colVars}`} />
        </div>
        {l.colCodes.map((code) => (
          <div key={`c${code}`} className="pb-1 text-center font-mono text-sm text-muted">
            {codeBits(code, l.colBits)}
          </div>
        ))}
        {l.rowCodes.map((rcode, r) => (
          <RowCells key={rcode} r={r} label={codeBits(rcode, l.rowBits)} cols={cols} cell={(c) => cellMinterm(l, r, c)} {...props} />
        ))}
        {/* The loops sit over the cell area: column 2 onwards, row 2 onwards. */}
        <div className="pointer-events-none relative" style={{ gridColumn: `2 / span ${cols}`, gridRow: `2 / span ${rows}` }}>
          {props.groups.flatMap((g, k) =>
            implicantRects(l, g.imp).map((rect, j) => {
              const inset = 4 + (k % 4) * 3;
              const out = -10;
              const style: CSSProperties = {
                left: `calc(${(rect.c0 / cols) * 100}% + ${rect.open.left ? out : inset}px)`,
                right: `calc(${((cols - 1 - rect.c1) / cols) * 100}% + ${rect.open.right ? out : inset}px)`,
                top: `calc(${(rect.r0 / rows) * 100}% + ${rect.open.top ? out : inset}px)`,
                bottom: `calc(${((rows - 1 - rect.r1) / rows) * 100}% + ${rect.open.bottom ? out : inset}px)`,
                borderColor: g.color,
                backgroundColor: `color-mix(in oklab, ${g.color} 10%, transparent)`,
                borderTopStyle: rect.open.top ? "none" : "solid",
                borderBottomStyle: rect.open.bottom ? "none" : "solid",
                borderLeftStyle: rect.open.left ? "none" : "solid",
                borderRightStyle: rect.open.right ? "none" : "solid",
              };
              return <span key={`${k}-${j}`} className="absolute rounded-xl border-[2.5px]" style={style} />;
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function RowCells(props: {
  r: number;
  label: string;
  cols: number;
  cell: (c: number) => number;
  cells: readonly Cell[];
  names: string[];
  onChange: (m: number, v: Cell) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 font-mono text-sm text-muted" style={{ gridRow: props.r + 2 }}>
        {props.label}
      </div>
      {Array.from({ length: props.cols }, (_, c) => {
        const m = props.cell(c);
        const v = props.cells[m];
        return (
          <button
            key={m}
            type="button"
            onClick={() => props.onChange(m, NEXT[v])}
            aria-label={`m${m}: ${v === "x" ? "don't care" : v}. Click to change`}
            className={`relative grid place-items-center border-line bg-panel font-mono text-lg hover:bg-hover ${c === 0 ? "border-l" : ""} ${
              props.r === 0 ? "border-t" : ""
            } border-r border-b ${v === "1" ? "font-semibold text-accent" : v === "x" ? "text-amber-600 dark:text-amber-400" : "text-muted"}`}
            style={{ gridRow: props.r + 2, gridColumn: c + 2 }}
          >
            {v === "x" ? "×" : v}
            <span className="absolute top-0.5 left-1 font-sans text-[10px] text-muted">{m}</span>
          </button>
        );
      })}
    </>
  );
}

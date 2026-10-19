"use client";

import { useMemo, useState } from "react";
import { parseBool, varTex } from "@/lib/calc/logic/expr";
import { KMAP_MAX } from "@/lib/calc/logic/kmap";
import { cubeMinterms, literals, minimiseCells, posTex, productTex, qmSteps, sopTex, sumTex } from "@/lib/calc/logic/qm";
import { type Cell, cellsFrom, listTex, parseMinterms, rowsWhere, truthTable } from "@/lib/calc/logic/truth";
import { defaultNames, KMAP_VARS, useCalc } from "@/lib/calc/store";
import { Tex } from "../../sss/Tex";
import { Formula, Note, PageHeader, Panel, Segmented, StepsPanel } from "../../sss/ui";
import { KmapGrid } from "../KmapGrid";
import { PLOT_COLORS, TextField } from "../ui";

const NEXT: Record<Cell, Cell> = { "0": "1", "1": "x", x: "0" };

/** "Σm(1, 3) + d(5)" for the minterm box. */
function mintermText(cells: readonly Cell[]): string {
  const ones = rowsWhere(cells, "1");
  const dcs = rowsWhere(cells, "x");
  return `m(${ones.join(", ")})${dcs.length ? ` + d(${dcs.join(", ")})` : ""}`;
}

export function KmapView() {
  const input = useCalc((s) => s.inputs.kmap);
  const set = useCalc((s) => s.set);
  const { names } = input;
  const n = names.length;
  const cells = input.cells.split("") as Cell[];
  const [mode, setMode] = useState<"sop" | "pos">("sop");

  const result = useMemo(() => minimiseCells(input.cells.split("") as Cell[], n), [input.cells, n]);
  const shown = mode === "sop" ? result.sop : result.pos;
  const steps = useMemo(() => qmSteps(shown, names, mode === "pos"), [shown, names, mode]);
  const groups = shown.cover.map((i, k) => ({ imp: shown.primes[i], color: PLOT_COLORS[k % PLOT_COLORS.length] }));

  const setCells = (next: readonly Cell[]) => set("kmap", { names, cells: next.join("") });
  const setCell = (m: number, v: Cell) => setCells(cells.map((c, i) => (i === m ? v : c)));

  return (
    <>
      <PageHeader title="K-map minimiser">
        Fill in a Karnaugh map, a minterm list or an expression, and get the simplest sum of products and product of sums, with
        the groups drawn on the map and the Quine–McCluskey working.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Variables</span>
              <Segmented
                label="Number of variables"
                value={String(n)}
                options={Array.from({ length: KMAP_VARS.max - KMAP_VARS.min + 1 }, (_, i) => ({ value: String(i + KMAP_VARS.min), label: i + KMAP_VARS.min }))}
                onChange={(v) => {
                  const k = Number(v);
                  set("kmap", { names: defaultNames(k), cells: "0".repeat(1 << k) });
                }}
              />
            </div>
            <NamesField names={names} onChange={(nm) => set("kmap", { names: nm, cells: input.cells })} />
          </div>
          <MintermField n={n} cells={cells} onChange={setCells} />
          <ExpressionField
            onLoad={(vars, next) => set("kmap", { names: vars, cells: next.join("") })}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCells(cells.map(() => "0"))} className="rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:bg-hover">
              Clear
            </button>
            <button
              type="button"
              onClick={() => setCells(cells.map((c) => (c === "1" ? "0" : c === "0" ? "1" : c)))}
              className="rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:bg-hover"
            >
              Invert
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={n <= KMAP_MAX ? "Karnaugh map" : "Truth table"}
            actions={
              <Segmented
                label="Group the 1s or the 0s"
                value={mode}
                options={[
                  { value: "sop", label: "Group 1s (SOP)" },
                  { value: "pos", label: "Group 0s (POS)" },
                ]}
                onChange={setMode}
              />
            }
          >
            {n <= KMAP_MAX ? (
              <KmapGrid names={names} cells={cells} onChange={setCell} groups={groups} />
            ) : (
              <CellList cells={cells} onChange={setCell} />
            )}
            <p className="mt-3 text-sm text-muted">
              Click a cell to cycle it through 0, 1 and × (don&apos;t care).
              {n > KMAP_MAX && " Maps get hard to read past 4 variables, so the groups are listed instead."}
            </p>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Simplest forms" tone="result">
            <p className="text-sm text-muted">Sum of products ({literalCount(result.sop)} literals)</p>
            <Formula tex={`F = ${sopTex(result.sop, names)}`} />
            <p className="mt-2 text-sm text-muted">Product of sums ({literalCount(result.pos)} literals)</p>
            <Formula tex={`F = ${posTex(result.pos, names)}`} />
            <p className="mt-2 text-sm text-muted">As lists</p>
            <Formula tex={`F = ${listTex("sum", rowsWhere(cells, "1"), rowsWhere(cells, "x"))}`} />
            {result.sop.method === "greedy" && (
              <Note tone="warn">This function has too many equally good covers to try them all, so this answer is small but may not be the smallest.</Note>
            )}
          </Panel>
          {groups.length > 0 && (
            <Panel title={mode === "sop" ? "Groups of 1s" : "Groups of 0s"}>
              <ul className="flex flex-col gap-1.5">
                {groups.map((g, k) => (
                  <li key={k} className="flex items-center gap-3">
                    <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} aria-hidden />
                    <Tex tex={mode === "sop" ? productTex(g.imp, names) : sumTex(g.imp, names)} />
                    <span className="ml-auto font-mono text-xs text-muted">m({cubeMinterms(g.imp, n).join(", ")})</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <StepsPanel steps={steps} />
        </div>
      </div>
    </>
  );
}

function literalCount(r: ReturnType<typeof minimiseCells>["sop"]): number {
  return r.cover.reduce((t, i) => t + literals(r.primes[i], r.n), 0);
}

/** Past 4 variables: every minterm as a button. */
function CellList(props: { cells: readonly Cell[]; onChange: (m: number, v: Cell) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1">
      {props.cells.map((v, m) => (
        <button
          key={m}
          type="button"
          onClick={() => props.onChange(m, NEXT[v])}
          aria-label={`m${m}: ${v === "x" ? "don't care" : v}. Click to change`}
          className={`flex flex-col items-center rounded-md border border-line bg-panel py-1 font-mono hover:bg-hover ${
            v === "1" ? "font-semibold text-accent" : v === "x" ? "text-amber-600 dark:text-amber-400" : "text-muted"
          }`}
        >
          <span className="font-sans text-[10px] text-muted">{m}</span>
          {v === "x" ? "×" : v}
        </button>
      ))}
    </div>
  );
}

function NamesField(props: { names: string[]; onChange: (names: string[]) => void }) {
  const [text, setText] = useState(props.names.join(" "));
  // Names changed elsewhere (the variable count, an expression): show them.
  const joined = props.names.join(" ");
  const [seen, setSeen] = useState(joined);
  if (joined !== seen) {
    setSeen(joined);
    if (text.split(/[\s,]+/).filter(Boolean).join(" ") !== joined) setText(joined);
  }
  const parts = text.split(/[\s,]+/).filter(Boolean);
  let error: string | null = null;
  if (parts.length !== props.names.length) error = `Give ${props.names.length} names.`;
  else if (parts.some((p) => !/^[A-Za-z]\d*$/.test(p))) error = "A name is a letter, optionally followed by digits.";
  else if (new Set(parts).size !== parts.length) error = "The names must be different.";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="text-sm text-muted" htmlFor="kmap-names">
        Names
      </label>
      <input
        id="kmap-names"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const p = e.target.value.split(/[\s,]+/).filter(Boolean);
          if (p.length === props.names.length && p.every((x) => /^[A-Za-z]\d*$/.test(x)) && new Set(p).size === p.length) props.onChange(p);
        }}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        title={error ?? "Variable names, most significant first"}
        className={`w-40 min-w-0 rounded-lg border bg-transparent px-2 py-1 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/40 ${error ? "border-sig-x/60" : "border-line focus:border-accent"}`}
      />
      {error && <span className="text-xs text-sig-x">{error}</span>}
    </div>
  );
}

function MintermField(props: { n: number; cells: readonly Cell[]; onChange: (cells: Cell[]) => void }) {
  const [text, setText] = useState(mintermText(props.cells));
  const parsed = parseMinterms(text, props.n);
  // Cells changed elsewhere (map clicks, an expression): rewrite the list unless it already says the same.
  const joined = props.cells.join("");
  const [seen, setSeen] = useState(joined);
  if (joined !== seen) {
    setSeen(joined);
    if (!parsed.ok || cellsFrom(props.n, parsed.ones, parsed.dcs).join("") !== joined) setText(mintermText(props.cells));
  }
  return (
    <TextField
      label={<Tex tex="\textstyle\sum" />}
      value={text}
      onChange={(t) => {
        setText(t);
        const p = parseMinterms(t, props.n);
        if (p.ok) props.onChange(cellsFrom(props.n, p.ones, p.dcs));
      }}
      error={parsed.ok ? null : parsed.error}
      placeholder="m(1, 3, 7) + d(5)"
      hint={
        <span className="flex flex-col gap-0.5">
          <span>
            Format: <code className="font-mono text-foreground">m(1, 3, 7) + d(5)</code>
          </span>
          <span>
            <code className="font-mono text-foreground">m( )</code> lists the minterms where F = 1;{" "}
            <code className="font-mono text-foreground">d( )</code> lists the don&apos;t-cares (F may be 0 or 1). The d( ) part is
            optional.
          </span>
        </span>
      }
    />
  );
}

function ExpressionField(props: { onLoad: (vars: string[], cells: Cell[]) => void }) {
  const [text, setText] = useState("");
  const parsed = parseBool(text);
  let error: string | null = null;
  if (!parsed.ok) error = parsed.error;
  else if (parsed.vars.length < KMAP_VARS.min || parsed.vars.length > KMAP_VARS.max)
    error = `Use ${KMAP_VARS.min} to ${KMAP_VARS.max} variables (this has ${parsed.vars.length}).`;
  const load = () => {
    if (parsed.ok && !error) props.onLoad(parsed.vars, truthTable(parsed.expr, parsed.vars));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        load();
      }}
    >
      <TextField label={<Tex tex="F =" />} value={text} onChange={setText} error={error} placeholder="or type an expression: A B' + C D">
        <button
          type="submit"
          disabled={!!error || !text.trim()}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:bg-hover disabled:opacity-50"
        >
          Load
        </button>
      </TextField>
      {parsed.ok && !error && (
        <p className="mt-1 text-sm text-muted">
          Variables: <Tex tex={parsed.vars.map(varTex).join(",\\ ")} />
        </p>
      )}
    </form>
  );
}

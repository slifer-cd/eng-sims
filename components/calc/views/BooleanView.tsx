"use client";

import { Grid2x2Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { type BoolExpr, boolTex, evaluate, parseBool, subexpressions, varTex } from "@/lib/calc/logic/expr";
import { minimiseCells, posTex, sopTex } from "@/lib/calc/logic/qm";
import { type Cell, canonicalSteps, envFor, listTex, MAX_VARS, rowsWhere, truthTable } from "@/lib/calc/logic/truth";
import { KMAP_VARS, useCalc } from "@/lib/calc/store";
import { Tex } from "../../sss/Tex";
import { Formula, Note, PageHeader, Panel, StepsPanel } from "../../sss/ui";
import { TextField } from "../ui";

const EXAMPLES = ["A B + A' C + B C", "(A + B)' C", "A ^ B ^ C", "!(A & B) | C & D", "S' I0 + S I1"];
/** Intermediate columns shown in the table; more would crowd it. */
const MAX_COLUMNS = 6;

export function BooleanView() {
  const input = useCalc((s) => s.inputs.boolean);
  const set = useCalc((s) => s.set);
  const router = useRouter();
  const parsed = useMemo(() => parseBool(input.text), [input.text]);
  const tooMany = parsed.ok && parsed.vars.length > MAX_VARS;

  const result = useMemo(() => {
    if (!parsed.ok || parsed.vars.length > MAX_VARS) return null;
    const { expr, vars } = parsed;
    const cells = truthTable(expr, vars);
    const subs = subexpressions(expr).slice(0, -1).slice(-MAX_COLUMNS);
    const min = vars.length ? minimiseCells(cells, vars.length) : null;
    return { expr, vars, cells, subs, min, steps: canonicalSteps(expr, vars, cells) };
  }, [parsed]);

  const openKmap = () => {
    if (!result) return;
    set("kmap", { names: result.vars, cells: result.cells.join("") });
    router.push("/calc/kmap");
  };

  return (
    <>
      <PageHeader title="Truth table">
        Type a Boolean expression to get its truth table, its canonical sum of products and product of sums, and the simplest
        equivalent.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-3">
          <TextField
            label={<Tex tex="F =" className="text-xl" />}
            value={input.text}
            onChange={(text) => set("boolean", { text })}
            error={parsed.ok ? (tooMany ? `At most ${MAX_VARS} variables.` : null) : parsed.error}
            placeholder="A B' + C"
          />
          {parsed.ok && (
            <div className="overflow-x-auto px-1 text-lg">
              <Tex tex={`F = ${boolTex(parsed.expr)}`} display />
            </div>
          )}
          <p className="text-sm text-muted">
            NOT: <code className="font-mono">A&apos;</code>, <code className="font-mono">!A</code>, <code className="font-mono">~A</code>
            {" · "}AND: <code className="font-mono">A B</code>, <code className="font-mono">A·B</code>, <code className="font-mono">A&amp;B</code>
            {" · "}OR: <code className="font-mono">A + B</code>, <code className="font-mono">A|B</code>
            {" · "}XOR: <code className="font-mono">A ^ B</code>. Words work too: <code className="font-mono">a and not b</code>. Each
            letter is its own variable (<code className="font-mono">AB</code> is A·B); add digits for more (
            <code className="font-mono">X1</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => set("boolean", { text: ex })}
                className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs hover:bg-hover"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {result && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Truth table">
              <TruthTable vars={result.vars} subs={result.subs} cells={result.cells} />
            </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <Panel
              title="Simplest form"
              tone="result"
              actions={
                result.vars.length >= KMAP_VARS.min &&
                result.vars.length <= KMAP_VARS.max && (
                  <button
                    type="button"
                    onClick={openKmap}
                    className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:bg-hover"
                  >
                    <Grid2x2Check size={15} aria-hidden />
                    Show on a K-map
                  </button>
                )
              }
            >
              {result.min ? (
                <>
                  <p className="text-sm text-muted">Sum of products</p>
                  <Formula tex={`F = ${sopTex(result.min.sop, result.vars)}`} />
                  <p className="mt-2 text-sm text-muted">Product of sums</p>
                  <Formula tex={`F = ${posTex(result.min.pos, result.vars)}`} />
                </>
              ) : (
                <Formula tex={`F = ${result.cells[0]}`} />
              )}
              {result.vars.length > 0 && (
                <>
                  <p className="mt-2 text-sm text-muted">Minterms and maxterms</p>
                  <Formula tex={`F = ${listTex("sum", rowsWhere(result.cells, "1"), [])} = ${listTex("product", rowsWhere(result.cells, "0"), [])}`} />
                </>
              )}
              {result.cells.every((c) => c === result.cells[0]) && result.vars.length > 0 && (
                <Note>The output never changes: this expression is always {result.cells[0]}.</Note>
              )}
            </Panel>
            <StepsPanel steps={result.steps} open />
          </div>
        </div>
      )}
    </>
  );
}

function TruthTable(props: { vars: string[]; subs: BoolExpr[]; cells: readonly Cell[] }) {
  const { vars, subs, cells } = props;
  return (
    <div className="max-h-[36rem] overflow-auto rounded-lg border border-line">
      <table className="w-full text-center font-mono text-sm tabular-nums">
        <thead className="sticky top-0 bg-panel">
          <tr className="border-b border-line">
            <th className="px-2 py-1.5 font-sans text-xs font-medium text-muted">m</th>
            {vars.map((v) => (
              <th key={v} className="px-2 py-1.5 font-normal">
                <Tex tex={varTex(v)} />
              </th>
            ))}
            {subs.map((s, i) => (
              <th key={i} className={`px-2 py-1.5 font-normal whitespace-nowrap text-muted ${i === 0 ? "border-l border-line" : ""}`}>
                <Tex tex={boolTex(s)} />
              </th>
            ))}
            <th className="border-l border-line px-2 py-1.5 font-normal">
              <Tex tex="F" />
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c, r) => {
            const env = envFor(r, vars);
            return (
              <tr key={r} className={`border-b border-line/50 last:border-0 ${c === "1" ? "bg-accent/6" : ""}`}>
                <td className="px-2 py-1 font-sans text-xs text-muted">{r}</td>
                {vars.map((v) => (
                  <td key={v} className="px-2 py-1">
                    {env[v] ? 1 : 0}
                  </td>
                ))}
                {subs.map((s, i) => (
                  <td key={i} className={`px-2 py-1 text-muted ${i === 0 ? "border-l border-line" : ""}`}>
                    {evaluate(s, env) ? 1 : 0}
                  </td>
                ))}
                <td className={`border-l border-line px-2 py-1 ${c === "1" ? "font-semibold text-accent" : ""}`}>{c}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

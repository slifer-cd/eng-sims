"use client";

/* Shared pieces of the discrete-time pages: the sequence input and stem drawing. */

import { useDeferredValue, useMemo, useState } from "react";
import { analyzeSeq, indexRange, type SeqAnalysis } from "@/lib/sss/discrete/sequence";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { sigEval } from "@/lib/sss/signal/signal";
import type { SeqInput } from "@/lib/sss/store";
import { type Example, MathInput } from "../MathInput";
import type { PlotApi } from "../plot/Plot";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Note, Segmented } from "../ui";

export const SEQ_EXAMPLES: Example[] = [
  { label: "Decaying geometric", text: "0.8^n u(n)" },
  { label: "Alternating", text: "(-0.7)^n u(n)" },
  { label: "Pulse of length 4", text: "u(n) - u(n - 4)" },
  { label: "Unit impulse", text: "δ(n)" },
  { label: "Unit step", text: "u(n)" },
  { label: "Ramp times decay", text: "n 0.7^n u(n)" },
  { label: "Damped cosine", text: "0.9^n cos(pi n/4) u(n)" },
  { label: "Two-sided", text: "0.5^|n|" },
  { label: "Left-sided", text: "-(0.5^n) u(-n - 1)" },
  { label: "With a parameter", text: "a^n u(n)", params: { a: 0.6 } },
];

/** Input for a sequence: a formula in n, or a list of values with a start index. */
export function SeqInputPanel(props: { label: string; value: SeqInput; onChange: (v: SeqInput) => void; examples?: Example[] }) {
  const { value, onChange } = props;
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Input type"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "formula", label: "Formula" },
          { value: "values", label: "List of values" },
        ]}
      />
      {value.mode === "formula" ? (
        <MathInput label={props.label} variable="n" discrete value={value} onChange={(v) => onChange({ ...value, ...v })} examples={props.examples ?? SEQ_EXAMPLES} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Tex tex={`${props.label} =`} className="text-xl" />
          <input
            value={value.values}
            onChange={(e) => onChange({ ...value, values: e.target.value })}
            spellCheck={false}
            aria-label="Values, separated by commas"
            placeholder="1, 2, 3"
            className="min-w-0 flex-1 basis-56 rounded-lg border border-line bg-transparent px-3 py-2 font-mono focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm">
            first value at <Tex tex="n =" />
            <input
              type="number"
              value={value.start}
              onChange={(e) => onChange({ ...value, start: Math.round(Number(e.target.value) || 0) })}
              className="w-20 rounded-md border border-line bg-panel px-2 py-1 tabular-nums"
              aria-label="Index of the first value"
            />
          </label>
        </div>
      )}
    </div>
  );
}

export interface SeqState {
  analysis: SeqAnalysis | null;
  shown: Analysis | null;
  stale: boolean;
}

/** Analyse a sequence input, keeping the last good result while editing. */
export function useSeq(input: SeqInput): SeqState {
  const deferred = useDeferredValue(input);
  const analysis = useMemo(() => analyzeSeq(deferred), [deferred]);
  const usable = analysis.kind !== "error" ? analysis : null;
  const [last, setLast] = useState<Analysis | null>(usable);
  if (usable && usable !== last) setLast(usable);
  const shown = usable ?? last;
  return { analysis, shown, stale: shown !== usable };
}

export function SeqError({ state }: { state: SeqState }) {
  if (state.analysis?.kind !== "error") return null;
  return (
    <div className="mt-3">
      <Note tone="warn">{state.analysis.message}</Note>
    </div>
  );
}

export const seqValue = (an: Analysis, n: number): number => (an.kind === "exact" ? sigEval(an.signal, n).re : an.kind === "numeric" ? an.f(n).re : 0);

/** Stems for integers in the plot window. */
export function drawStems(api: PlotApi, value: (n: number) => number, color: string, opts: { until?: number; hollow?: boolean; alpha?: number } = {}) {
  const lo = Math.ceil(api.x0);
  const hi = Math.floor(api.x1);
  const xs: number[] = [];
  const ys: number[] = [];
  const faintX: number[] = [];
  const faintY: number[] = [];
  for (let n = lo; n <= hi; n++) {
    const v = value(n);
    if (opts.until !== undefined && n > opts.until) {
      faintX.push(n);
      faintY.push(v);
    } else {
      xs.push(n);
      ys.push(v);
    }
  }
  if (faintX.length) api.stems(faintX, faintY, color, { alpha: 0.22, radius: 3 });
  api.stems(xs, ys, color, { hollow: opts.hollow, alpha: opts.alpha });
}

export function seqRange(an: Analysis): { n: [number, number]; y: [number, number] } {
  const n = indexRange(an);
  const vals: number[] = [];
  for (let k = n[0]; k <= n[1]; k++) vals.push(seqValue(an, k));
  return { n: [n[0] - 0.5, n[1] + 0.5], y: autoRange(vals) };
}

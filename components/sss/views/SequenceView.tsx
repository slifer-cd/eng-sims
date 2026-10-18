"use client";

import { useEffect, useMemo, useState } from "react";
import { nice } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { texCases, texStepForm } from "@/lib/sss/signal/format";
import { useSss } from "@/lib/sss/store";
import { useClock } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { fmtReadout, Plot } from "../plot/Plot";
import { Tex } from "../Tex";
import { Fact, Formula, Note, NumericBadge, PageHeader, Panel, Segmented } from "../ui";
import { drawStems, SeqError, SeqInputPanel, seqRange, seqValue, useSeq } from "./discrete";

export function SequenceView() {
  const dx = useSss((s) => s.inputs.dx);
  const set = useSss((s) => s.set);
  const state = useSeq(dx);
  return (
    <>
      <PageHeader title="Sequence">
        A discrete-time signal <Tex tex="x[n]" />, defined only at whole numbers <Tex tex="n" />: typed as a formula or as a list of values.
      </PageHeader>
      <Panel className="mb-5">
        <SeqInputPanel label="x[n]" value={dx} onChange={(v) => set("dx", v)} />
        <SeqError state={state} />
      </Panel>
      {state.shown && <SequenceBody an={state.shown} stale={state.stale} />}
    </>
  );
}

function SequenceBody({ an, stale }: { an: Analysis; stale: boolean }) {
  const r = useMemo(() => seqRange(an), [an]);
  const clock = useClock({ from: r.n[0], to: r.n[1], seconds: 6, initial: r.n[1] });
  useEffect(() => {
    clock.setRange(r.n[0], r.n[1]);
    if (!clock.isPlaying()) clock.set(r.n[1]);
  }, [clock, r]);
  const [form, setForm] = useState<"cases" | "steps">("steps");
  // Σ|x[n]|²: if doubling the window still adds to the sum, it diverges.
  const energy = useMemo(() => {
    let inner = 0;
    let all = 0;
    for (let n = -2000; n <= 2000; n++) {
      const v = seqValue(an, n) ** 2;
      all += v;
      if (Math.abs(n) <= 1000) inner += v;
    }
    return all - inner > 1e-9 * Math.max(1, all) ? Infinity : all;
  }, [an]);
  const table = useMemo(() => {
    const lo = Math.max(Math.ceil(r.n[0]), -5);
    return Array.from({ length: 12 }, (_, i) => lo + i);
  }, [r]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Stem plot" actions={an.kind === "numeric" ? <NumericBadge reason={an.reason} /> : undefined}>
          <Plot
            x={r.n}
            y={r.y}
            height={280}
            clock={clock}
            xLabel="n"
            xName="n"
            ariaLabel="The sequence x[n] as a stem plot"
            readout={(x) => {
              const n = Math.round(x);
              return [{ label: `x[${n}]`, value: fmtReadout(seqValue(an, n)) }];
            }}
            draw={(api) => {
              const t = clock.get();
              const sweeping = clock.isPlaying() || t < r.n[1] - 1e-9;
              drawStems(api, (n) => seqValue(an, n), api.colors.series[0], { until: sweeping ? Math.floor(t) : undefined });
            }}
          />
          <Transport clock={clock} label="n" hotkey format={(v) => String(Math.floor(v))} className="mt-3" />
        </Panel>
        <Panel title="Values">
          <div className="overflow-x-auto">
            <table className="w-full text-center text-sm tabular-nums">
              <tbody>
                <tr className="text-muted">
                  <th className="py-1 pr-2 text-left font-medium">n</th>
                  {table.map((n) => (
                    <td key={n} className={`px-2 py-1 ${n === 0 ? "font-semibold text-foreground" : ""}`}>
                      {n}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-line">
                  <th className="py-1 pr-2 text-left font-medium">
                    <Tex tex="x[n]" />
                  </th>
                  {table.map((n) => (
                    <td key={n} className="px-2 py-1">
                      {fmtReadout(seqValue(an, n))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {an.kind === "exact" ? (
          <Panel
            title="Formula"
            tone="result"
            actions={
              <Segmented
                label="Form"
                value={form}
                onChange={setForm}
                options={[
                  { value: "steps", label: "Steps" },
                  { value: "cases", label: "Cases" },
                ]}
              />
            }
          >
            <Formula tex={`x[n] = ${form === "cases" ? texCases(an.signal, { v: "n", discrete: true }) : texStepForm(an.signal, { v: "n", discrete: true })}`} />
          </Panel>
        ) : (
          <Panel title="Formula" tone="result">
            <Note>{an.kind === "numeric" ? `Evaluated numerically: ${an.reason}` : ""}</Note>
          </Panel>
        )}
        <Panel title="Properties">
          <dl>
            <Fact label={<Tex tex="E=\sum_n |x[n]|^2" />}>{Number.isFinite(energy) ? fmtReadout(energy) : "∞"}</Fact>
            <Fact label="Exact value">{Number.isFinite(energy) && nice(energy).exact ? <Tex tex={nice(energy).tex} /> : "—"}</Fact>
          </dl>
        </Panel>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { dconvolve } from "@/lib/sss/discrete/dconv";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { useSss } from "@/lib/sss/store";
import { useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { fmtReadout, Plot } from "../plot/Plot";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { drawStems, SeqError, SeqInputPanel, seqRange, seqValue, useSeq } from "./discrete";

export function DConvView() {
  const dx = useSss((s) => s.inputs.dx);
  const dh = useSss((s) => s.inputs.dh);
  const set = useSss((s) => s.set);
  const x = useSeq(dx);
  const h = useSeq(dh);
  return (
    <>
      <PageHeader title="Discrete convolution">
        <Tex tex="y[n]=\sum_{k}x[k]\,h[n-k]" />: flip h, slide it to n, multiply sample by sample, and add.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-5">
          <SeqInputPanel label="x[n]" value={dx} onChange={(v) => set("dx", v)} />
          <SeqInputPanel label="h[n]" value={dh} onChange={(v) => set("dh", v)} />
        </div>
        <SeqError state={x} />
        <SeqError state={h} />
      </Panel>
      {x.shown && h.shown && <Body x={x.shown} h={h.shown} stale={x.stale || h.stale} />}
    </>
  );
}

function Body({ x, h, stale }: { x: Analysis; h: Analysis; stale: boolean }) {
  const res = useMemo(() => dconvolve(x, h), [x, h]);
  const [flip, setFlip] = useState<"h" | "x">("h");
  const fixed = flip === "h" ? x : h;
  const sliding = flip === "h" ? h : x;
  const fr = useMemo(() => seqRange(fixed), [fixed]);
  const sr = useMemo(() => seqRange(sliding), [sliding]);
  const out: [number, number] = useMemo(() => [Math.floor(res.range[0]), Math.ceil(res.range[1])], [res.range]);
  const kRange: [number, number] = useMemo(() => [Math.min(fr.n[0], out[0] - sr.n[1]) , Math.max(fr.n[1], out[1] - sr.n[0])], [fr, sr, out]);
  const clock = useClock({ from: out[0], to: out[1] + 0.999, seconds: 10, initial: 0 });
  useEffect(() => clock.setRange(out[0], out[1] + 0.999), [clock, out]);
  const n = useClockValue(clock, (v) => Math.floor(v));
  const yTop = useMemo(() => autoRange([...fr.y, ...sr.y, fr.y[0] * sr.y[1], fr.y[1] * sr.y[1]], { pad: 0.05 }), [fr, sr]);
  const yOut = useMemo(() => {
    const vals: number[] = [];
    for (let k = out[0]; k <= out[1]; k++) vals.push(res.at(k));
    return autoRange(vals);
  }, [res, out]);
  const fixedName = flip === "h" ? "x[k]" : "h[k]";
  const slideName = flip === "h" ? "h[n−k]" : "x[n−k]";
  // The products at the current n, written out (only the non-zero ones).
  const sum = useMemo(() => {
    const terms: string[] = [];
    let total = 0;
    for (let k = Math.ceil(kRange[0]); k <= Math.floor(kRange[1]); k++) {
      const a = seqValue(fixed, k);
      const b = seqValue(sliding, n - k);
      if (a !== 0 && b !== 0) {
        total += a * b;
        if (terms.length < 8) terms.push(`${fmt(a)}\\cdot${fmt(b)}`);
        else if (terms.length === 8) terms.push("\\cdots");
      }
    }
    return { tex: terms.join("+") || "0", total };
  }, [fixed, sliding, n, kRange]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="Flip and slide"
          actions={
            <Segmented
              label="Which sequence slides"
              value={flip}
              onChange={setFlip}
              options={[
                { value: "h", label: "Slide h" },
                { value: "x", label: "Slide x" },
              ]}
            />
          }
        >
          <div className="flex flex-col gap-4">
            <Plot
              x={[kRange[0] - 0.5, kRange[1] + 0.5]}
              y={yTop}
              height={230}
              clock={clock}
              xLabel="k"
              xName="k"
              ariaLabel="The fixed sequence, the flipped and shifted one, and their products"
              legend={[
                { label: fixedName, color: "var(--plot-1)" },
                { label: slideName, color: "var(--plot-2)" },
                { label: "products", color: "var(--plot-3)" },
              ]}
              draw={(api) => {
                const nn = Math.floor(clock.get());
                drawStems(api, (k) => seqValue(fixed, k), api.colors.series[0]);
                drawStems(api, (k) => seqValue(sliding, nn - k), api.colors.series[1], { hollow: true });
                drawStems(api, (k) => seqValue(fixed, k) * seqValue(sliding, nn - k), api.colors.series[2]);
              }}
            />
            <Plot
              x={[out[0] - 0.5, out[1] + 0.5]}
              y={yOut}
              height={200}
              clock={clock}
              xLabel="n"
              xName="n"
              ariaLabel="The output y[n], built sample by sample"
              legend={[{ label: "y[n]", color: "var(--plot-3)" }]}
              readout={(v) => [{ label: `y[${Math.round(v)}]`, value: fmtReadout(res.at(Math.round(v))) }]}
              draw={(api) => drawStems(api, (k) => res.at(k), api.colors.series[2], { until: Math.floor(clock.get()) })}
            />
          </div>
          <Transport clock={clock} label="n" hotkey format={(v) => String(Math.floor(v))} className="mt-3" />
          <div className="mt-2 overflow-x-auto text-sm">
            <Tex tex={`y[${n}] = ${sum.tex} = ${fmt(sum.total)}`} />
          </div>
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          {res.tex ? <Formula tex={`y[n] = ${res.tex}`} /> : <Note>{res.note}</Note>}
        </Panel>
        <StepsPanel steps={res.steps} />
      </div>
    </div>
  );
}

const fmt = (v: number) => fmtReadout(v).replace("−", "-");

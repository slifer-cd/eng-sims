"use client";

import { useEffect, useMemo, useState } from "react";
import { nice } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { texCases, texExpPoly } from "@/lib/sss/signal/format";
import { timeRange } from "@/lib/sss/signal/properties";
import { sigEval } from "@/lib/sss/signal/signal";
import { type ConvResult, convolve, convolveNumeric, texIntegrand, texLim } from "@/lib/sss/transforms/convolution";
import { useSss } from "@/lib/sss/store";
import { type Clock, useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { useAnalysis, valueAt } from "../hooks";
import { type Example, MathInput } from "../MathInput";
import { fmtReadout, Plot, type PlotApi } from "../plot/Plot";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, NumericBadge, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { drawSignal, rangeFor } from "./SignalView";

const X_EXAMPLES: Example[] = [
  { label: "Decaying exponential", text: "e^(-2t)u(t)" },
  { label: "Unit step", text: "u(t)" },
  { label: "Rectangular pulse", text: "rect(t)" },
  { label: "Pulse 0 to 1", text: "u(t) - u(t - 1)" },
  { label: "Triangular pulse", text: "tri(t)" },
  { label: "Ramp segment", text: "t(u(t) - u(t - 2))" },
  { label: "Two-sided exponential", text: "e^(-|t|)" },
  { label: "Two impulses", text: "δ(t) + δ(t - 2)" },
];

const H_EXAMPLES: Example[] = [
  { label: "Pulse 0 to 1", text: "rect(t - 1/2)" },
  { label: "Decaying exponential", text: "e^(-t)u(t)" },
  { label: "Unit step (integrator)", text: "u(t)" },
  { label: "Delay by 2", text: "δ(t - 2)" },
  { label: "Triangular pulse", text: "tri(t)" },
  { label: "RC low-pass", text: "(1/a)e^(-t/a)u(t)", params: { a: 0.5 } },
];

export function ConvolutionView() {
  const x = useSss((s) => s.inputs.x);
  const h = useSss((s) => s.inputs.h);
  const set = useSss((s) => s.set);
  const ax = useAnalysis(x, "ct");
  const ah = useAnalysis(h, "ct");
  return (
    <>
      <PageHeader title="Convolution">
        <Tex tex="y(t)=(x*h)(t)=\int_{-\infty}^{\infty}x(\tau)\,h(t-\tau)\,d\tau" />: flip one signal, slide it across the other, and add up the
        overlap.
      </PageHeader>
      <Panel className="mb-5">
        <div className="flex flex-col gap-4">
          <MathInput label="x(t)" variable="t" value={x} onChange={(v) => set("x", v)} examples={X_EXAMPLES} />
          <MathInput label="h(t)" variable="t" value={h} onChange={(v) => set("h", v)} examples={H_EXAMPLES} />
        </div>
        {(ax.analysis?.kind === "error" || ah.analysis?.kind === "error") && (
          <div className="mt-3">
            <Note tone="warn">{ax.analysis?.kind === "error" ? ax.analysis.message : ah.analysis?.kind === "error" ? ah.analysis.message : ""}</Note>
          </div>
        )}
      </Panel>
      {ax.shown && ah.shown && <ConvBody x={ax.shown} h={ah.shown} stale={ax.stale || ah.stale} />}
    </>
  );
}

interface Output {
  exact: ConvResult | null;
  /** y(t) for any t. */
  y: (t: number) => number;
  range: [number, number];
  reason?: string;
}

function ConvBody({ x, h, stale }: { x: Analysis; h: Analysis; stale: boolean }) {
  const [flip, setFlip] = useState<"h" | "x">("h");
  const xr = useMemo(() => timeRange(x), [x]);
  const hr = useMemo(() => timeRange(h), [h]);
  const out = useMemo((): Output => {
    const range: [number, number] = [xr[0] + hr[0], xr[1] + hr[1]];
    const pad = (range[1] - range[0]) * 0.08;
    const r: [number, number] = [range[0] - pad, range[1] + pad];
    if (x.kind === "exact" && h.kind === "exact" && !x.special.length && !h.special.length) {
      const res = convolve(x.signal, h.signal);
      if (res.ok) return { exact: res, y: (t) => sigEval(res.y, t).re, range: r };
      return { exact: res, y: () => NaN, range: r, reason: res.message };
    }
    const n = convolveNumeric((t) => valueAt(x, t), (t) => valueAt(h, t), xr, hr, 1600);
    const y = (t: number) => {
      if (t < n.t[0] || t > n.t[n.t.length - 1]) return 0;
      const k = Math.min(n.t.length - 2, Math.floor(((t - n.t[0]) / (n.t[n.t.length - 1] - n.t[0])) * (n.t.length - 1)));
      const u = (t - n.t[k]) / (n.t[k + 1] - n.t[k]);
      return n.y[k] + u * (n.y[k + 1] - n.y[k]);
    };
    return { exact: null, y, range: r, reason: "One of the signals has no exact form, so the integral is computed on a grid." };
  }, [x, h, xr, hr]);
  const clock = useClock({ from: out.range[0], to: out.range[1], seconds: 10, initial: out.range[0] + (out.range[1] - out.range[0]) * 0.35 });
  useEffect(() => clock.setRange(out.range[0], out.range[1]), [clock, out.range]);
  const failed = out.exact && !out.exact.ok;

  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        {failed ? (
          <Panel title="Flip and slide">
            <Note tone="warn">{out.reason}</Note>
          </Panel>
        ) : (
          <Panel
            title="Flip and slide"
            actions={
              <div className="flex items-center gap-2">
                {!out.exact && <NumericBadge reason={out.reason ?? ""} />}
                <Segmented
                  label="Which signal slides"
                  value={flip}
                  onChange={setFlip}
                  options={[
                    { value: "h", label: "Slide h" },
                    { value: "x", label: "Slide x" },
                  ]}
                />
              </div>
            }
          >
            <SlidePlots x={x} h={h} xr={xr} hr={hr} out={out} clock={clock} flip={flip} />
            <Transport clock={clock} label="t" hotkey className="mt-3" />
          </Panel>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {out.exact?.ok ? <ExactResult res={out.exact} clock={clock} x={x} h={h} /> : !failed && <Panel title="Result" tone="result"><Note>{out.reason}</Note></Panel>}
        {out.exact?.ok && <StepsPanel steps={out.exact.steps} />}
      </div>
    </div>
  );
}

function SlidePlots(props: { x: Analysis; h: Analysis; xr: [number, number]; hr: [number, number]; out: Output; clock: Clock; flip: "h" | "x" }) {
  const { out, clock, flip } = props;
  // The fixed signal f(τ) and the sliding one g(t − τ).
  const fixed = flip === "h" ? props.x : props.h;
  const sliding = flip === "h" ? props.h : props.x;
  const fr = flip === "h" ? props.xr : props.hr;
  const sr = flip === "h" ? props.hr : props.xr;
  const tauRange = useMemo((): [number, number] => {
    const lo = Math.min(fr[0], out.range[0] - sr[1]);
    const hi = Math.max(fr[1], out.range[1] - sr[0]);
    return [lo, hi];
  }, [fr, sr, out.range]);
  const yTau = useMemo(() => {
    const a = rangeFor(fixed, fr);
    const b = rangeFor(sliding, sr);
    return autoRange([...a, ...b, a[0] * b[1], a[1] * b[1], a[0] * b[0]], { pad: 0.05 });
  }, [fixed, sliding, fr, sr]);
  const yOut = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i <= 600; i++) vals.push(out.y(out.range[0] + ((out.range[1] - out.range[0]) * i) / 600));
    return autoRange(vals);
  }, [out]);
  const fixedName = flip === "h" ? "x(τ)" : "h(τ)";
  const slideName = flip === "h" ? "h(t − τ)" : "x(t − τ)";

  const drawTau = (api: PlotApi) => {
    const t = clock.get();
    drawSignal(api, fixed, api.colors.series[0]);
    // g(t − τ), sampled over τ.
    const n = api.samples;
    const taus = new Float64Array(n + 1);
    const g = new Float64Array(n + 1);
    const prod = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const tau = api.x0 + ((api.x1 - api.x0) * i) / n;
      taus[i] = tau;
      g[i] = valueAt(sliding, t - tau).re;
      prod[i] = valueAt(fixed, tau).re * g[i];
    }
    api.area(taus, prod, api.colors.series[2], 0.35);
    api.curve(taus, prod, { color: api.colors.series[2], width: 1.5 });
    api.curve(taus, g, { color: api.colors.series[1] });
    // Impulses of the sliding signal move with it (flipped in time).
    if (sliding.kind === "exact") {
      api.impulses(
        sliding.signal.impulses.map((imp) => ({ at: t - imp.at, height: imp.area.re, label: nice(imp.area.re).text })),
        api.colors.series[1],
      );
    }
    api.vline(t, { color: api.colors.axis, width: 1, dash: [4, 4] });
    api.label(`τ = t`, t, api.y1, { dx: 4, dy: 10, color: api.colors.muted });
  };

  return (
    <div className="flex flex-col gap-4">
      <Plot
        x={tauRange}
        y={yTau}
        height={240}
        clock={clock}
        xLabel="τ"
        xName="τ"
        ariaLabel="The fixed signal, the flipped and shifted signal, and their product"
        legend={[
          { label: fixedName, color: "var(--plot-1)" },
          { label: slideName, color: "var(--plot-2)" },
          { label: "product (its area is y(t))", color: "var(--plot-3)" },
        ]}
        readout={(tau) => {
          const t = clock.get();
          const a = valueAt(fixed, tau).re;
          const b = valueAt(sliding, t - tau).re;
          return [
            { label: fixedName, value: fmtReadout(a), color: "var(--plot-1)" },
            { label: slideName, value: fmtReadout(b), color: "var(--plot-2)" },
            { label: "product", value: fmtReadout(a * b), color: "var(--plot-3)" },
          ];
        }}
        draw={drawTau}
      />
      <Plot
        x={out.range}
        y={yOut}
        height={200}
        clock={clock}
        xLabel="t"
        ariaLabel="The convolution result y(t), traced as t moves"
        legend={[{ label: "y(t) = area of the product", color: "var(--plot-3)" }]}
        readout={(t) => [{ label: "y(t)", value: fmtReadout(out.y(t)) }]}
        draw={(api) => {
          const t = clock.get();
          const n = api.samples;
          const ts = new Float64Array(n + 1);
          const ys = new Float64Array(n + 1);
          for (let i = 0; i <= n; i++) {
            ts[i] = api.x0 + ((api.x1 - api.x0) * i) / n;
            ys[i] = out.y(ts[i]);
          }
          api.curve(ts, ys, { color: api.colors.series[2], alpha: 0.22 });
          let k = 0;
          while (k < ts.length && ts[k] <= t) k++;
          api.curve(ts.subarray(0, k), ys.subarray(0, k), { color: api.colors.series[2] });
          if (out.exact?.ok) {
            api.impulses(
              out.exact.y.impulses.filter((i) => i.at <= t).map((i) => ({ at: i.at, height: i.area.re, label: nice(i.area.re).text })),
              api.colors.series[2],
            );
          }
          api.vline(t, { color: api.colors.axis, width: 1, dash: [4, 4] });
          api.dot(t, out.y(t), api.colors.series[2]);
        }}
      />
    </div>
  );
}

function ExactResult({ res, clock, x, h }: { res: ConvResult & { ok: true }; clock: Clock; x: Analysis; h: Analysis }) {
  // Which output interval the slider is in (re-renders only when it changes).
  const active = useClockValue(clock, (t) => res.intervals.findIndex((iv) => t >= iv.from && t < iv.to));
  const iv = active >= 0 ? res.intervals[active] : null;
  const xs = x.kind === "exact" ? x.signal : null;
  const hs = h.kind === "exact" ? h.signal : null;
  return (
    <>
      <Panel title="Result" tone="result">
        <Formula tex={`y(t) = ${texCases(res.y)}`} />
      </Panel>
      <Panel title="At the current t">
        {iv && xs && hs ? (
          <>
            <p className="mb-1 text-sm text-muted">
              <Tex tex={intervalTex(iv.from, iv.to)} />: the overlap runs between these limits.
            </p>
            {iv.parts.length > 0 && (
              <Formula
                tex={`y(t) = ${iv.parts
                  .map((p) => `\\int_{${texLim(p.lower)}}^{${texLim(p.upper)}} ${texIntegrand(xs.pieces[p.xPiece].expr, hs.pieces[p.hPiece].expr)}\\,d\\tau`)
                  .join("+")}${res.impulseParts.length ? "+\\cdots" : ""}`}
              />
            )}
            <Formula tex={`y(t) = ${texExpPoly(iv.expr, { shiftHints: [iv.from, iv.to].filter(Number.isFinite) })}`} />
          </>
        ) : (
          <p className="text-sm text-muted">
            The signals don&apos;t overlap here, so <Tex tex="y(t)=0" />
            {res.y.impulses.length ? " (apart from impulses)" : ""}.
          </p>
        )}
      </Panel>
    </>
  );
}

function intervalTex(a: number, b: number): string {
  const A = Number.isFinite(a) ? nice(a).tex : null;
  const B = Number.isFinite(b) ? nice(b).tex : null;
  if (A !== null && B !== null) return `\\text{For } ${A}\\le t<${B}`;
  if (A !== null) return `\\text{For } t\\ge ${A}`;
  if (B !== null) return `\\text{For } t<${B}`;
  return "\\text{For all } t";
}


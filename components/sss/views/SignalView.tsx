"use client";

import { useEffect, useMemo, useState } from "react";
import { joinFactor, nice } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { texCases, texStepForm } from "@/lib/sss/signal/format";
import { classify, energy, evenOdd, numericEnergy, power, timeRange } from "@/lib/sss/signal/properties";
import { type Signal, sigCompose, sigScale } from "@/lib/sss/signal/signal";
import { useSss } from "@/lib/sss/store";
import { type Clock, useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { isComplexValued, useAnalysis, valueAt } from "../hooks";
import { type Example, MathInput } from "../MathInput";
import { fmtReadout, Plot, type PlotApi } from "../plot/Plot";
import { partOf, sampleAnalysis } from "../plot/sample";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Fact, Formula, Note, NumericBadge, PageHeader, Panel, Segmented } from "../ui";

export const SIGNAL_EXAMPLES: Example[] = [
  { label: "Decaying exponential", text: "e^(-2t)u(t)" },
  { label: "Rectangular pulse", text: "rect(t/2)" },
  { label: "Triangular pulse", text: "tri(t - 1)" },
  { label: "Damped sinusoid", text: "e^(-t/2)sin(4t)u(t)" },
  { label: "Two-sided exponential", text: "e^(-|t|)" },
  { label: "Ramp up, then hold", text: "r(t) - r(t - 1)" },
  { label: "Impulses and a step", text: "δ(t) - 2δ(t - 1) + u(t - 2)" },
  { label: "Sinc pulse", text: "sinc(2t)" },
  { label: "Gaussian pulse", text: "e^(-t^2)" },
  { label: "Complex exponential", text: "e^(j 2 pi t)" },
  { label: "With parameters a and ω₀", text: "e^(-a t)cos(w0 t)u(t)", params: { a: 0.5, w0: 6 } },
  { label: "Lorentzian (numerical)", text: "1/(1 + t^2)" },
];

const fmtNum = (v: number) => (Number.isFinite(v) ? nice(v).tex : "\\infty");

/** Draw a signal (curve + impulses) in the plot's visible window. */
export function drawSignal(
  api: PlotApi,
  an: Analysis,
  color: string,
  opts: { part?: "re" | "im"; dash?: number[]; alpha?: number; until?: number; scale?: number; width?: number } = {},
) {
  const part = opts.part ?? "re";
  const s = sampleAnalysis(an, [api.x0, api.x1], api.samples, part);
  const k = opts.scale ?? 1;
  const ys = k === 1 ? s.ys : s.ys.map((v) => v * k);
  if (opts.until === undefined) {
    api.curve(s.xs, ys, { color, dash: opts.dash, alpha: opts.alpha, width: opts.width });
  } else {
    api.curve(s.xs, ys, { color, dash: opts.dash, alpha: 0.22, width: opts.width });
    let n = 0;
    while (n < s.xs.length && s.xs[n] <= opts.until) n++;
    api.curve(s.xs.subarray(0, n), ys.subarray(0, n), { color, dash: opts.dash, width: opts.width });
  }
  if (an.kind === "exact") {
    const items = an.signal.impulses
      .filter((i) => i.at >= api.x0 && i.at <= api.x1 && (opts.until === undefined || i.at <= opts.until))
      .map((i) => {
        const area = partOf(i.area, part) * k;
        return { at: i.at, height: area, label: (i.order ? "δ′ " : "") + nice(area).text, order: i.order };
      })
      .filter((i) => i.height !== 0);
    api.impulses(items, color);
  }
}

/** y-range for an analysis over a window, including impulse heights. */
export function rangeFor(an: Analysis, range: [number, number], parts: ("re" | "im")[] = ["re"], scale = 1): [number, number] {
  const vals: number[] = [];
  for (const p of parts) {
    const s = sampleAnalysis(an, range, 1200, p);
    for (const v of s.ys) vals.push(v * scale);
    if (an.kind === "exact") for (const i of an.signal.impulses) vals.push(partOf(i.area, p) * scale);
  }
  return autoRange(vals);
}

export function SignalView() {
  const input = useSss((s) => s.inputs.x);
  const setInput = useSss((s) => s.set);
  const { analysis, shown, stale } = useAnalysis(input, "ct");

  return (
    <>
      <PageHeader title="Signal">
        Type a signal to see it over time, written piecewise, and what shifting and scaling time does to it.
      </PageHeader>
      <Panel className="mb-5">
        <MathInput label="x(t)" variable="t" value={input} onChange={(v) => setInput("x", v)} examples={SIGNAL_EXAMPLES} />
        {analysis?.kind === "error" && (
          <div className="mt-3">
            <Note tone="warn">{analysis.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <SignalBody an={shown} stale={stale} />}
    </>
  );
}

function SignalBody({ an, stale }: { an: Analysis; stale: boolean }) {
  const range = useMemo(() => timeRange(an), [an]);
  const complex = useMemo(() => isComplexValued(an, range), [an, range]);
  const yRange = useMemo(() => rangeFor(an, range, complex ? ["re", "im"] : ["re"]), [an, range, complex]);
  const clock = useClock({ from: range[0], to: range[1], seconds: 6, initial: range[1] });
  useEffect(() => {
    clock.setRange(range[0], range[1]);
    if (!clock.isPlaying()) clock.set(range[1]);
  }, [clock, range]);

  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Over time" actions={an.kind === "numeric" ? <NumericBadge reason={an.reason} /> : undefined}>
          <TimePlot an={an} range={range} yRange={yRange} complex={complex} clock={clock} />
          <Transport clock={clock} label="t" hotkey className="mt-3" />
        </Panel>
        {complex && (
          <Panel title="In the complex plane">
            <ComplexTrail an={an} range={range} clock={clock} />
          </Panel>
        )}
        <OperationsPanel an={an} range={range} />
        <EvenOddPanel an={an} range={range} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <PiecewisePanel an={an} />
        <PropertiesPanel an={an} range={range} />
      </div>
    </div>
  );
}

function TimePlot(props: { an: Analysis; range: [number, number]; yRange: [number, number]; complex: boolean; clock: Clock }) {
  const { an, complex, clock } = props;
  const [lo, hi] = props.range;
  return (
    <Plot
      x={props.range}
      y={props.yRange}
      height={280}
      clock={clock}
      xLabel="t"
      ariaLabel="The signal x(t) plotted over time"
      legend={
        complex
          ? [
              { label: "Re x(t)", color: "var(--plot-1)" },
              { label: "Im x(t)", color: "var(--plot-2)", dashed: true },
            ]
          : undefined
      }
      readout={(t) => {
        const v = valueAt(an, t);
        return complex
          ? [
              { label: "Re x", value: fmtReadout(v.re), color: "var(--plot-1)" },
              { label: "Im x", value: fmtReadout(v.im), color: "var(--plot-2)" },
            ]
          : [{ label: "x(t)", value: fmtReadout(v.re) }];
      }}
      draw={(api) => {
        const t = clock.get();
        const sweeping = clock.isPlaying() || t < hi - 1e-9;
        const until = sweeping ? t : undefined;
        drawSignal(api, an, api.colors.series[0], { until });
        if (complex) drawSignal(api, an, api.colors.series[1], { part: "im", dash: [6, 4], until });
        if (sweeping && t > lo) {
          const v = valueAt(an, t);
          api.vline(t, { color: api.colors.axis, width: 1, dash: [4, 4] });
          api.dot(t, v.re, api.colors.series[0]);
          if (complex) api.dot(t, v.im, api.colors.series[1]);
        }
      }}
    />
  );
}

function ComplexTrail(props: { an: Analysis; range: [number, number]; clock: Clock }) {
  const { an, clock } = props;
  const [lo, hi] = props.range;
  const trail = useMemo(() => {
    const re = sampleAnalysis(an, props.range, 1500, "re");
    const im = sampleAnalysis(an, props.range, 1500, "im");
    return { t: re.xs, re: re.ys, im: im.ys };
  }, [an, props.range]);
  const box = useMemo(() => {
    const m = Math.max(1e-9, ...Array.from(trail.re, Math.abs), ...Array.from(trail.im, Math.abs)) * 1.15;
    return m;
  }, [trail]);
  return (
    <div className="mx-auto max-w-sm">
      <Plot
        x={[-box, box]}
        y={[-box, box]}
        height={300}
        clock={clock}
        xLabel="Re"
        xName="Re"
        interactive={false}
        ariaLabel="The path of x(t) in the complex plane"
        draw={(api) => {
          const t = clock.get();
          const sweeping = clock.isPlaying() || t < hi - 1e-9;
          let n = trail.t.length;
          if (sweeping) {
            n = 0;
            while (n < trail.t.length && trail.t[n] <= t) n++;
          }
          api.curve(trail.re, trail.im, { color: api.colors.series[0], alpha: 0.2 });
          api.curve(trail.re.subarray(0, n), trail.im.subarray(0, n), { color: api.colors.series[0] });
          if (sweeping && t > lo) {
            const v = valueAt(an, t);
            api.ctx.save();
            api.ctx.strokeStyle = api.colors.series[0];
            api.ctx.lineWidth = 1.5;
            api.ctx.beginPath();
            api.ctx.moveTo(api.px(0), api.py(0));
            api.ctx.lineTo(api.px(v.re), api.py(v.im));
            api.ctx.stroke();
            api.ctx.restore();
            api.dot(v.re, v.im, api.colors.series[0]);
          }
        }}
      />
    </div>
  );
}

/** x(f(t)) with f(t) = α t + β, scaled by k, as a numeric analysis for drawing. */
function transformed(an: Analysis, alpha: number, beta: number, k: number): Analysis {
  if (an.kind === "exact" && an.special.length === 0) {
    return { kind: "exact", signal: sigScale(sigCompose(an.signal, alpha, beta), k), special: [], f: (t) => scaleC(an.f(alpha * t + beta), k) };
  }
  return { kind: "numeric", reason: "", f: (t) => scaleC(valueAt(an, alpha * t + beta), k) };
}

const scaleC = (c: { re: number; im: number }, k: number) => ({ re: c.re * k, im: c.im * k });

/** Animation stage s ∈ [0, 3] → the transformation applied so far. */
function stageParams(s: number, A: number, a: number, b: number, order: "shift-first" | "scale-first") {
  const u = (lo: number) => Math.min(1, Math.max(0, s - lo));
  const amp = 1 + (A - 1) * u(2);
  if (order === "shift-first") {
    // x(t) → x(t − b) → x(a t − b)
    const alpha = 1 + (a - 1) * u(1);
    const beta = -b * (s < 1 ? u(0) : 1);
    return { alpha, beta, amp };
  }
  // x(t) → x(a t) → x(a(t − b/a)) = x(a t − b)
  const alpha = 1 + (a - 1) * u(0);
  const beta = -b * u(1);
  return { alpha, beta, amp };
}

function OperationsPanel(props: { an: Analysis; range: [number, number] }) {
  const { an } = props;
  const ops = useSss((s) => s.inputs.ops);
  const set = useSss((s) => s.set);
  const { A, a, b, order } = ops;
  const clock = useClock({ from: 0, to: 3, seconds: 4.5, initial: 3 });
  const stage = useClockValue(clock, (v) => (v >= 3 ? 3 : Math.floor(v)));

  // Window: the original plus where the transformed signal lands.
  const range = useMemo((): [number, number] => {
    const [lo, hi] = props.range;
    const ends = [lo, hi, (lo + b) / a, (hi + b) / a, lo + b, hi + b, lo / a, hi / a].filter(Number.isFinite);
    const l = Math.max(lo - 20, Math.min(...ends));
    const h = Math.min(hi + 20, Math.max(...ends));
    return [l, h];
  }, [props.range, a, b]);
  const result = useMemo(() => (a !== 0 ? transformed(an, a, -b, A) : null), [an, a, b, A]);
  // Room for the original, the result and every amplitude in between.
  const yRange = useMemo(() => {
    const r1 = rangeFor(an, range);
    const r2 = result ? rangeFor(result, range) : r1;
    return autoRange([...r1, ...r2, r1[0] * A, r1[1] * A], { pad: 0 });
  }, [an, range, A, result]);
  const lin = (k: number, c: number) => {
    // k·t − c as LaTeX
    const kt = Math.abs(k - 1) < 1e-12 ? "t" : Math.abs(k + 1) < 1e-12 ? "-t" : joinFactor(nice(k).tex, "t");
    if (Math.abs(c) < 1e-12) return kt;
    return `${kt}${c > 0 ? "-" : "+"}${nice(Math.abs(c)).tex}`;
  };
  const ampTex = Math.abs(A - 1) < 1e-12 ? "" : Math.abs(A + 1) < 1e-12 ? "-" : nice(A).tex;
  const stages =
    order === "shift-first"
      ? [`x(t)`, `x(${lin(1, b)})`, `x(${lin(a, b)})`, `${ampTex}x(${lin(a, b)})`]
      : [`x(t)`, `x(${lin(a, 0)})`, `x(${lin(a, b)})`, `${ampTex}x(${lin(a, b)})`];
  const stepText =
    order === "shift-first"
      ? ["Shift right by b", "Then replace t by a·t (compress by a)", "Then scale the amplitude by A"]
      : ["Compress time by a", "Then shift right by b/a", "Then scale the amplitude by A"];

  const num = (key: "A" | "a" | "b", label: string, min: number, max: number, step: number) => {
    const v = ops[key];
    return (
      <label className="flex items-center gap-2 text-sm">
        <Tex tex={label} className="w-5 text-right" />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => {
            const x = Number(e.target.value);
            set("ops", { ...ops, [key]: key === "a" && x === 0 ? 0.25 : x });
          }}
          className="min-w-0 flex-1 accent-accent"
          aria-label={`${key}`}
        />
        <span className="w-12 tabular-nums text-muted">{v}</span>
      </label>
    );
  };

  return (
    <Panel title={<span className="flex items-center gap-2">Time operations</span>}>
      <p className="mb-3 text-sm text-muted">
        <Tex tex={`y(t) = A\\,x(a t - b)`} />. A negative <Tex tex="a" /> reverses time.
      </p>
      <div className="mb-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
        {num("A", "A", -3, 3, 0.25)}
        {num("a", "a", -3, 3, 0.25)}
        {num("b", "b", -5, 5, 0.25)}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Order of the steps"
          value={order}
          onChange={(o) => set("ops", { ...ops, order: o })}
          options={[
            { value: "shift-first", label: "Shift, then scale" },
            { value: "scale-first", label: "Scale, then shift" },
          ]}
        />
        <div className="flex items-center gap-2 text-sm">
          <Tex tex={stages[Math.min(stage, 2)]} />
          <span className="text-muted">→</span>
          <Tex tex={stages[Math.min(stage + 1, 3)]} />
        </div>
      </div>
      <Plot
        x={range}
        y={yRange}
        height={240}
        clock={clock}
        xLabel="t"
        ariaLabel="The signal before and after the time operations"
        legend={[
          { label: "x(t)", color: "var(--plot-axis)", dashed: true },
          { label: "y(t)", color: "var(--plot-3)" },
        ]}
        readout={(t) => {
          const p = stageParams(clock.get(), A, a, b, order);
          return [
            { label: "x(t)", value: fmtReadout(valueAt(an, t).re) },
            { label: "y(t)", value: fmtReadout(p.amp * valueAt(an, p.alpha * t + p.beta).re), color: "var(--plot-3)" },
          ];
        }}
        draw={(api) => {
          drawSignal(api, an, api.colors.axis, { dash: [5, 4], width: 1.5 });
          const p = stageParams(clock.get(), A, a, b, order);
          if (Math.abs(p.alpha) < 1e-6) return;
          drawSignal(api, transformed(an, p.alpha, p.beta, p.amp), api.colors.series[2]);
        }}
      />
      <Transport clock={clock} label="step" format={(v) => `${Math.min(3, Math.floor(v) + (v >= 3 ? 0 : 1))} of 3`} className="mt-3" />
      <ol className="mt-3 flex flex-col gap-1 text-sm text-muted">
        {stepText.map((s, i) => (
          <li key={s} className={stage === i ? "font-medium text-foreground" : ""}>
            {i + 1}. {s}: <Tex tex={`${stages[i]} \\;\\to\\; ${stages[i + 1]}`} />
          </li>
        ))}
      </ol>
      {result?.kind === "exact" && (
        <div className="mt-3 border-t border-line pt-3">
          <Formula tex={`y(t) = ${texCases(result.signal)}`} />
        </div>
      )}
    </Panel>
  );
}

function EvenOddPanel(props: { an: Analysis; range: [number, number] }) {
  const { an } = props;
  const parts = useMemo(() => {
    if (an.kind === "exact" && an.special.length === 0) {
      const { even, odd } = evenOdd(an.signal);
      return { even: exactOf(even), odd: exactOf(odd), exact: { even, odd } };
    }
    const f = (t: number) => valueAt(an, t);
    return {
      even: { kind: "numeric", reason: "", f: (t: number) => scaleC(addC(f(t), f(-t)), 0.5) } as Analysis,
      odd: { kind: "numeric", reason: "", f: (t: number) => scaleC(addC(f(t), scaleC(f(-t), -1)), 0.5) } as Analysis,
      exact: null,
    };
  }, [an]);
  const range = useMemo((): [number, number] => {
    const m = Math.max(Math.abs(props.range[0]), Math.abs(props.range[1]));
    return [-m, m];
  }, [props.range]);
  const yRange = useMemo(() => {
    const a = rangeFor(parts.even, range);
    const b = rangeFor(parts.odd, range);
    return autoRange([a[0], a[1], b[0], b[1]], { pad: 0 });
  }, [parts, range]);
  return (
    <Panel title="Even and odd parts">
      <p className="mb-3 text-sm text-muted">
        <Tex tex="x_e(t)=\tfrac12[x(t)+x(-t)]" />, <Tex tex="x_o(t)=\tfrac12[x(t)-x(-t)]" />, and <Tex tex="x = x_e + x_o" />.
      </p>
      <Plot
        x={range}
        y={yRange}
        height={220}
        xLabel="t"
        ariaLabel="Even and odd parts of the signal"
        legend={[
          { label: "even part", color: "var(--plot-1)" },
          { label: "odd part", color: "var(--plot-2)" },
        ]}
        readout={(t) => [
          { label: "xₑ", value: fmtReadout(valueAt(parts.even, t).re), color: "var(--plot-1)" },
          { label: "xₒ", value: fmtReadout(valueAt(parts.odd, t).re), color: "var(--plot-2)" },
        ]}
        draw={(api) => {
          drawSignal(api, parts.even, api.colors.series[0]);
          drawSignal(api, parts.odd, api.colors.series[1]);
        }}
      />
      {parts.exact && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <Formula tex={`x_e(t) = ${texCases(parts.exact.even)}`} />
          <Formula tex={`x_o(t) = ${texCases(parts.exact.odd)}`} />
        </div>
      )}
    </Panel>
  );
}

const addC = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re + b.re, im: a.im + b.im });
const exactOf = (signal: Signal): Analysis => ({ kind: "exact", signal, special: [], f: () => ({ re: 0, im: 0 }) });

function PiecewisePanel({ an }: { an: Analysis }) {
  const [form, setForm] = useState<"cases" | "steps">("cases");
  if (an.kind !== "exact") {
    return (
      <Panel title="Formula" tone="result" actions={an.kind === "numeric" ? <NumericBadge reason={an.reason} /> : undefined}>
        <Note>{an.kind === "numeric" ? `No exact form: ${an.reason}` : an.message}</Note>
      </Panel>
    );
  }
  if (an.special.length) {
    return (
      <Panel title="Formula" tone="result">
        <Note>Sinc and Gaussian terms are kept as written; their transforms come from the table of known pairs.</Note>
      </Panel>
    );
  }
  const tex = form === "cases" ? texCases(an.signal) : texStepForm(an.signal);
  return (
    <Panel
      title="Written piecewise"
      tone="result"
      actions={
        <Segmented
          label="Form"
          value={form}
          onChange={setForm}
          options={[
            { value: "cases", label: "Cases" },
            { value: "steps", label: "Steps" },
          ]}
        />
      }
    >
      <Formula tex={`x(t) = ${tex}`} />
      <p className="mt-2 text-sm text-muted">
        {form === "cases"
          ? "Each row holds on its interval."
          : "A sum of switched-on terms: each u(t − T) turns its term on at t = T."}
      </p>
    </Panel>
  );
}

function PropertiesPanel(props: { an: Analysis; range: [number, number] }) {
  const { an } = props;
  const [t0, setT0] = useState("1");
  const facts = useMemo(() => {
    if (an.kind === "exact") {
      const E = an.special.length ? numericEnergy((t) => valueAt(an, t), [props.range[0] - 30, props.range[1] + 30], 60000) : energy(an.signal);
      const P = power(an.signal);
      const c = classify(an.signal);
      return { E, P, c, exactE: an.special.length === 0 };
    }
    const E = an.kind === "numeric" ? numericEnergy(an.f, [props.range[0] - 30, props.range[1] + 30], 60000) : NaN;
    return { E, P: NaN, c: null, exactE: false };
  }, [an, props.range]);
  const t0v = Number(t0);
  const value = Number.isFinite(t0v) && t0 !== "" ? valueAt(an, t0v) : null;
  const impulseAt = an.kind === "exact" && Number.isFinite(t0v) ? an.signal.impulses.find((i) => Math.abs(i.at - t0v) < 1e-9) : undefined;
  const kind =
    Number.isFinite(facts.E) && facts.E > 0
      ? "Energy signal (finite energy, zero power)"
      : facts.P > 0 && Number.isFinite(facts.P)
        ? "Power signal (finite power, infinite energy)"
        : Number.isNaN(facts.P)
          ? "—"
          : "Neither (energy and power both infinite)";
  return (
    <Panel title="Properties">
      <dl>
        <Fact label="Energy">
          <Tex tex={`E = \\int_{-\\infty}^{\\infty}|x(t)|^2dt = ${facts.exactE ? fmtNum(facts.E) : fmtReadout(facts.E)}`} />
        </Fact>
        <Fact label="Average power">
          {Number.isNaN(facts.P) ? <span className="text-muted">—</span> : <Tex tex={`P = ${fmtNum(facts.P)}`} />}
        </Fact>
        <Fact label="Type">{kind}</Fact>
        {facts.c && (
          <>
            <Fact label="Causal (zero for t < 0)">{facts.c.causal ? "Yes" : "No"}</Fact>
            <Fact label="Finite duration">{facts.c.finiteDuration ? "Yes" : "No"}</Fact>
            <Fact label="Real-valued">{facts.c.real ? "Yes" : "No"}</Fact>
            <Fact label="Symmetry">{facts.c.even ? "Even" : facts.c.odd ? "Odd" : "Neither even nor odd"}</Fact>
          </>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <label htmlFor="sss-t0" className="text-muted">
          Value at
        </label>
        <Tex tex="t_0 =" />
        <input
          id="sss-t0"
          value={t0}
          onChange={(e) => setT0(e.target.value)}
          inputMode="decimal"
          className="w-20 rounded-md border border-line bg-panel px-2 py-1 tabular-nums"
        />
        {value && (
          <Tex
            tex={`x(t_0) = ${fmtComplex(value)}${impulseAt ? `\\;+\\;\\text{an impulse of area } ${nice(impulseAt.area.re).tex}` : ""}`}
          />
        )}
      </div>
    </Panel>
  );
}

function fmtComplex(v: { re: number; im: number }): string {
  const r = (x: number) => fmtReadout(x).replace("−", "-");
  if (Math.abs(v.im) < 1e-12) return r(v.re);
  return `${r(v.re)} ${v.im < 0 ? "-" : "+"} ${r(Math.abs(v.im))}j`;
}


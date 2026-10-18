"use client";

import { useMemo, useState } from "react";
import { toTex } from "@/lib/sss/expr/latex";
import { parse } from "@/lib/sss/expr/parse";
import { type C, cabs, cx } from "@/lib/sss/math/complex";
import { nice, niceC } from "@/lib/sss/math/nice";
import type { Root } from "@/lib/sss/math/poly";
import { type Analysis, analyze } from "@/lib/sss/signal/analyze";
import { timeRange } from "@/lib/sss/signal/properties";
import { type Signal, sigEval } from "@/lib/sss/signal/signal";
import { parseSExpr } from "@/lib/sss/transforms/inverse";
import { laplace } from "@/lib/sss/transforms/laplace";
import { type SExpr, texSExpr } from "@/lib/sss/transforms/sdomain";
import { analyzeSystem, bode, type SystemResult, steadyStateTex, systemOutput } from "@/lib/sss/transforms/system";
import { useSss } from "@/lib/sss/store";
import { useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { useAnalysis } from "../hooks";
import { MathInput, useParsed } from "../MathInput";
import { fmtReadout, Plot } from "../plot/Plot";
import { drawPoleZero, pzWindow } from "../plot/poleZero";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { drawSignal, rangeFor } from "./SignalView";

const EXAMPLES = [
  { label: "First-order low-pass", text: "1/(s + 1)" },
  { label: "Second-order, underdamped", text: "1/(s^2 + 0.6s + 1)" },
  { label: "Second-order with ζ and ω₀", text: "w0^2/(s^2 + 2 z w0 s + w0^2)", params: { w0: 2, z: 0.2 } },
  { label: "High-pass", text: "s/(s + 1)" },
  { label: "Band-pass", text: "s/(s^2 + 0.5s + 4)" },
  { label: "Notch", text: "(s^2 + 4)/(s^2 + s + 4)" },
  { label: "Integrator (marginal)", text: "1/s" },
  { label: "Unstable", text: "1/(s - 1)" },
  { label: "Delay and lag", text: "e^(-s)/(s + 1)" },
];

const exactOf = (signal: Signal): Analysis => ({ kind: "exact", signal, special: [], f: (t) => sigEval(signal, t) });

export function SystemView() {
  const sys = useSss((s) => s.inputs.system);
  const set = useSss((s) => s.set);
  const parsed = useParsed(sys.H.text, "s");
  const res = useMemo(() => (parsed.ok ? parseSExpr(parsed.ast, sys.H.params) : null), [parsed, sys.H.params]);
  const [last, setLast] = useState(res?.ok ? res : null);
  if (res?.ok && res !== last) setLast(res);
  const shown = res?.ok ? res : last;
  return (
    <>
      <PageHeader title="LTI system">
        A causal system with transfer function <Tex tex="H(s)" />: its impulse and step responses, stability, frequency response, and the output
        for an input.
      </PageHeader>
      <Panel className="mb-5">
        <MathInput label="H(s)" variable="s" value={sys.H} onChange={(v) => set("system", { ...sys, H: v })} examples={EXAMPLES} />
        {res && !res.ok && (
          <div className="mt-3">
            <Note tone="warn">{res.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <SystemBody H={shown.X} stale={shown !== res} />}
    </>
  );
}

function SystemBody({ H, stale }: { H: SExpr; stale: boolean }) {
  const sys = useMemo(() => analyzeSystem(H), [H]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <GeometryPanel sys={sys} />
        <BodePanel sys={sys} />
        <ResponsesPanel sys={sys} />
        <OutputPanel sys={sys} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <SummaryPanel sys={sys} />
      </div>
    </div>
  );
}

function stability(sys: SystemResult): { label: string; tone: string; text: string } {
  if (sys.stable) return { label: "Stable", tone: "bg-sig-1/15 text-green-800 dark:text-green-300", text: "Every pole is in the left half-plane, so h(t) dies out and bounded inputs give bounded outputs." };
  if (sys.marginal)
    return { label: "Marginally stable", tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300", text: "A pole on the jω axis: h(t) doesn't die out (but doesn't grow, unless the pole repeats)." };
  return { label: "Unstable", tone: "bg-sig-x/15 text-red-800 dark:text-red-300", text: "A pole in the right half-plane makes h(t) grow without bound." };
}

function SummaryPanel({ sys }: { sys: SystemResult }) {
  const st = stability(sys);
  const list = (rs: Root[]) => rs.map((r) => `${niceC(r.p).tex}${r.mult > 1 ? `\\ (\\times${r.mult})` : ""}`).join(",\\ ");
  return (
    <>
      <Panel title="System" tone="result" actions={<span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>}>
        <Formula tex={`H(s) = ${texSExpr(sys.H)}`} />
        <p className="mt-1 text-sm text-muted">{st.text}</p>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
          <p>
            <span className="text-muted">Poles: </span>
            {sys.poles.length ? <Tex tex={list(sys.poles)} /> : "none"}
          </p>
          <p>
            <span className="text-muted">Zeros: </span>
            {sys.zeros === null ? "infinitely many (a delay factor)" : sys.zeros.length ? <Tex tex={list(sys.zeros)} /> : "none"}
          </p>
          {sys.dcGain !== null && (
            <p>
              <span className="text-muted">DC gain: </span>
              <Tex tex={`H(0) = ${nice(sys.dcGain).tex}`} />
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Responses">
        <Formula tex={`h(t) = ${sys.impulse.tex}`} />
        <Formula tex={`s(t) = ${sys.step.tex}`} />
        <p className="mt-1 text-sm text-muted">
          <Tex tex="h(t)" /> is the response to <Tex tex="\delta(t)" />, <Tex tex="s(t)" /> the response to <Tex tex="u(t)" />.
        </p>
      </Panel>
      <StepsPanel steps={sys.impulse.steps} />
    </>
  );
}

function GeometryPanel({ sys }: { sys: SystemResult }) {
  const W = useMemo(() => Math.max(3, ...sys.poles.map((p) => Math.abs(p.p.im) * 2 + 1), ...(sys.zeros ?? []).map((z) => Math.abs(z.p.im) * 2 + 1)), [sys]);
  const clock = useClock({ from: 0, to: W, seconds: 8, initial: 1 });
  const w = useClockValue(clock, (v) => Math.round(v * 100) / 100);
  const win = useMemo(() => pzWindow([...sys.poles.map((p) => p.p), ...(sys.zeros ?? []).map((z) => z.p), cx(0, W)]), [sys, W]);
  const mag = useMemo(() => {
    const ws: number[] = [];
    const ms: number[] = [];
    for (let i = 0; i <= 400; i++) {
      const x = (W * i) / 400;
      ws.push(x);
      ms.push(cabs(sys.at(x)));
    }
    return { ws: Float64Array.from(ws), ms: Float64Array.from(ms) };
  }, [sys, W]);
  const yMag = useMemo(() => autoRange(mag.ms), [mag]);
  const geometric = sys.gain !== null && sys.zeros !== null;
  const Hw = sys.at(w);
  const zeroLens = (sys.zeros ?? []).flatMap((z) => Array.from({ length: z.mult }, () => cabs({ re: -z.p.re, im: w - z.p.im })));
  const poleLens = sys.poles.flatMap((p) => Array.from({ length: p.mult }, () => cabs({ re: -p.p.re, im: w - p.p.im })));
  return (
    <Panel title="Frequency response from the pole-zero plot">
      <p className="mb-3 text-sm text-muted">
        At <Tex tex="s=j\omega" />, <Tex tex="|H(j\omega)| = |K|\,\frac{\prod |j\omega - z_i|}{\prod |j\omega - p_i|}" />: draw a vector from every zero (blue) and pole
        (orange) to the point on the <Tex tex="j\omega" /> axis. Near a pole its vector is short, so <Tex tex="|H|" /> peaks.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Plot
          x={win}
          y={win}
          equal
          height={300}
          clock={clock}
          interactive={false}
          xLabel="σ"
          ariaLabel="Pole-zero plot with vectors to the point jω"
          draw={(api) => {
            drawPoleZero(api, { poles: sys.poles, zeros: sys.zeros, roc: sys.roc });
            const ww = clock.get();
            const { ctx } = api;
            const vec = (from: C, color: string) => {
              ctx.save();
              ctx.strokeStyle = color;
              ctx.globalAlpha = 0.8;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(api.px(from.re), api.py(from.im));
              ctx.lineTo(api.px(0), api.py(ww));
              ctx.stroke();
              ctx.restore();
            };
            for (const z of sys.zeros ?? []) vec(z.p, api.colors.series[0]);
            for (const p of sys.poles) vec(p.p, api.colors.series[1]);
            api.dot(0, ww, api.colors.text, 5);
          }}
        />
        <Plot
          x={[0, W]}
          y={yMag}
          height={300}
          clock={clock}
          xLabel="ω"
          xName="ω"
          ariaLabel="Magnitude of the frequency response, traced as ω increases"
          legend={[{ label: "|H(jω)|", color: "var(--plot-3)" }]}
          readout={(x) => [{ label: "|H|", value: fmtReadout(cabs(sys.at(x))) }]}
          draw={(api) => {
            const ww = clock.get();
            api.curve(mag.ws, mag.ms, { color: api.colors.series[2], alpha: 0.2 });
            let n = 0;
            while (n < mag.ws.length && mag.ws[n] <= ww) n++;
            api.curve(mag.ws.subarray(0, n), mag.ms.subarray(0, n), { color: api.colors.series[2] });
            api.dot(ww, cabs(sys.at(ww)), api.colors.series[2]);
          }}
        />
      </div>
      <Transport clock={clock} label="ω" hotkey className="mt-3" />
      <div className="mt-2 overflow-x-auto text-sm">
        {geometric && sys.gain ? (
          <Tex
            tex={`|H(j${fmt(w)})| = ${fmt(cabs(sys.gain))}\\cdot\\frac{${zeroLens.map(fmt).join("\\cdot") || "1"}}{${poleLens.map(fmt).join("\\cdot") || "1"}} = ${fmt(cabs(Hw))},\\quad \\angle H = ${fmt(Math.atan2(Hw.im, Hw.re))}\\ \\text{rad}`}
          />
        ) : (
          <Tex tex={`|H(j${fmt(w)})| = ${fmt(cabs(Hw))},\\quad \\angle H = ${fmt(Math.atan2(Hw.im, Hw.re))}\\ \\text{rad}`} />
        )}
      </div>
    </Panel>
  );
}

const fmt = (v: number) => fmtReadout(v).replace("−", "-");

function BodePanel({ sys }: { sys: SystemResult }) {
  const data = useMemo(() => {
    const corners = [...sys.poles, ...(sys.zeros ?? [])].map((r) => cabs(r.p)).filter((v) => v > 1e-9);
    const lo = Math.floor(Math.log10(Math.min(1, ...corners)) - 1.5);
    const hi = Math.ceil(Math.log10(Math.max(1, ...corners)) + 1.5);
    const xs: number[] = [];
    for (let i = 0; i <= 600; i++) xs.push(lo + ((hi - lo) * i) / 600);
    const b = bode(sys, xs.map((x) => Math.pow(10, x)));
    return { xs: Float64Array.from(xs), db: Float64Array.from(b.db), deg: Float64Array.from(b.phase.map((p) => (p * 180) / Math.PI)), lo, hi };
  }, [sys]);
  const decade = (v: number) => {
    const k = Math.round(v);
    if (Math.abs(v - k) > 1e-9) return "";
    return k === 0 ? "1" : k === 1 ? "10" : `10${String(k).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)])}`;
  };
  return (
    <Panel title="Bode plot">
      <div className="flex flex-col gap-3">
        <Plot
          x={[data.lo, data.hi]}
          y={autoRange(data.db, { includeZero: false })}
          height={210}
          xLabel="ω (rad/s, log scale)"
          xName="log₁₀ω"
          xTickFormat={decade}
          ariaLabel="Bode magnitude plot"
          legend={[{ label: "20 log₁₀|H(jω)| (dB)", color: "var(--plot-1)" }]}
          readout={(x) => [
            { label: "ω", value: fmtReadout(Math.pow(10, x)) },
            { label: "|H|", value: `${fmtReadout(20 * Math.log10(cabs(sys.at(Math.pow(10, x)))))} dB` },
          ]}
          draw={(api) => {
            api.hline(-3, { color: api.colors.axis, width: 1, dash: [3, 4], alpha: 0.7 });
            api.curve(data.xs, data.db, { color: api.colors.series[0] });
          }}
        />
        <Plot
          x={[data.lo, data.hi]}
          y={autoRange(data.deg, { includeZero: true })}
          height={180}
          xLabel="ω (rad/s, log scale)"
          xName="log₁₀ω"
          xTickFormat={decade}
          ariaLabel="Bode phase plot"
          legend={[{ label: "∠H(jω) (degrees)", color: "var(--plot-2)" }]}
          readout={(x) => {
            const v = sys.at(Math.pow(10, x));
            return [
              { label: "ω", value: fmtReadout(Math.pow(10, x)) },
              { label: "∠H", value: `${fmtReadout((Math.atan2(v.im, v.re) * 180) / Math.PI)}°` },
            ];
          }}
          draw={(api) => api.curve(data.xs, data.deg, { color: api.colors.series[1] })}
        />
      </div>
    </Panel>
  );
}

function ResponsesPanel({ sys }: { sys: SystemResult }) {
  const hA = useMemo(() => exactOf(sys.impulse.signal), [sys]);
  const sA = useMemo(() => exactOf(sys.step.signal), [sys]);
  const range = useMemo((): [number, number] => {
    const a = timeRange(hA);
    return [Math.min(-0.5, a[0]), Math.min(Math.max(a[1], 5), 40)];
  }, [hA]);
  return (
    <Panel title="Impulse and step responses">
      <div className="grid gap-4 md:grid-cols-2">
        <Plot
          x={range}
          y={rangeFor(hA, range)}
          height={220}
          xLabel="t"
          ariaLabel="Impulse response h(t)"
          legend={[{ label: "h(t)", color: "var(--plot-1)" }]}
          readout={(t) => [{ label: "h(t)", value: fmtReadout(sigEval(sys.impulse.signal, t).re) }]}
          draw={(api) => drawSignal(api, hA, api.colors.series[0])}
        />
        <Plot
          x={range}
          y={rangeFor(sA, range)}
          height={220}
          xLabel="t"
          ariaLabel="Step response s(t)"
          legend={[{ label: "s(t)", color: "var(--plot-3)" }]}
          readout={(t) => [{ label: "s(t)", value: fmtReadout(sigEval(sys.step.signal, t).re) }]}
          draw={(api) => {
            if (sys.dcGain !== null && sys.stable) api.hline(sys.dcGain, { color: api.colors.axis, width: 1, dash: [4, 4] });
            drawSignal(api, sA, api.colors.series[2]);
          }}
        />
      </div>
    </Panel>
  );
}

function OutputPanel({ sys }: { sys: SystemResult }) {
  const state = useSss((s) => s.inputs.system);
  const set = useSss((s) => s.set);
  const xInput = useSss((s) => s.inputs.x);
  const shared = useAnalysis(xInput, "ct");
  const input: Analysis | null = useMemo(() => {
    if (state.input === "x") return shared.shown;
    const text = state.input === "impulse" ? "delta(t)" : state.input === "step" ? "u(t)" : "cos(w t)u(t)";
    const p = parse(text, { variable: "t" });
    return p.ok ? analyze(p.ast, { w: state.w0 }, "ct") : null;
  }, [state.input, state.w0, shared.shown]);
  const out = useMemo(() => {
    if (!input) return null;
    if (input.kind !== "exact") return { error: "The input has no exact form here; use the convolution page for a numerical result." };
    const X = laplace(input);
    return systemOutput(sys, X);
  }, [input, sys]);
  const range = useMemo((): [number, number] => {
    if (!input) return [-1, 10];
    const a = timeRange(input);
    const h = timeRange(exactOf(sys.impulse.signal));
    return [Math.min(-0.5, a[0]), Math.min(40, Math.max(a[1], h[1], state.input === "sine" ? (6 * Math.PI) / Math.max(0.1, state.w0) : 0, 6))];
  }, [input, sys, state.input, state.w0]);
  const yAn = useMemo(() => (out && !("error" in out) ? exactOf(out.signal) : null), [out]);
  const yRange = useMemo(() => {
    const a = input ? rangeFor(input, range) : [-1, 1];
    const b = yAn ? rangeFor(yAn, range) : [-1, 1];
    return autoRange([...a, ...b], { pad: 0.05 });
  }, [input, yAn, range]);
  return (
    <Panel
      title="Output for an input"
      actions={
        <Segmented
          label="Input"
          value={state.input}
          onChange={(v) => set("system", { ...state, input: v })}
          options={[
            { value: "step", label: "Step" },
            { value: "impulse", label: "Impulse" },
            { value: "sine", label: "Sinusoid" },
            { value: "x", label: "x(t)" },
          ]}
        />
      }
    >
      {state.input === "x" && (
        <p className="mb-3 text-sm text-muted">
          The x(t) typed on the other pages{shared.parsed.ok ? <>: <Tex tex={`x(t) = ${toTex(shared.parsed.ast)}`} /></> : null}.
        </p>
      )}
      {state.input === "sine" && (
        <label className="mb-3 flex items-center gap-3 text-sm">
          <Tex tex="x(t)=\cos(\omega_0 t)\,u(t),\quad \omega_0 =" />
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.05}
            value={state.w0}
            onChange={(e) => set("system", { ...state, w0: Number(e.target.value) })}
            className="min-w-24 flex-1 accent-accent"
            aria-label="Input frequency ω₀"
          />
          <span className="w-12 tabular-nums">{state.w0}</span>
        </label>
      )}
      {input && (
        <Plot
          x={range}
          y={yRange}
          height={240}
          xLabel="t"
          ariaLabel="Input and output of the system"
          legend={[
            { label: "input x(t)", color: "var(--plot-axis)", dashed: true },
            { label: "output y(t)", color: "var(--plot-3)" },
          ]}
          readout={(t) => [
            { label: "x", value: fmtReadout(input.kind === "exact" ? sigEval(input.signal, t).re : input.kind === "numeric" ? input.f(t).re : NaN) },
            ...(yAn && yAn.kind === "exact" ? [{ label: "y", value: fmtReadout(sigEval(yAn.signal, t).re), color: "var(--plot-3)" }] : []),
          ]}
          draw={(api) => {
            drawSignal(api, input, api.colors.axis, { dash: [5, 4], width: 1.5 });
            if (yAn) drawSignal(api, yAn, api.colors.series[2]);
          }}
        />
      )}
      {out && "error" in out ? (
        <div className="mt-3">
          <Note tone="warn">{out.error}</Note>
        </div>
      ) : out ? (
        <div className="mt-3 flex flex-col gap-2">
          <Formula tex={`y(t) = ${out.tex}`} />
          {state.input === "sine" && sys.stable && (
            <p className="text-sm text-muted">
              Once the transient dies out, the output is the input scaled by <Tex tex="|H(j\omega_0)|" /> and shifted by{" "}
              <Tex tex="\angle H(j\omega_0)" />: <Tex tex={`y_{ss}(t) = ${steadyStateTex(sys, state.w0)}`} />.
            </p>
          )}
          <StepsPanel steps={out.steps} />
        </div>
      ) : null}
    </Panel>
  );
}

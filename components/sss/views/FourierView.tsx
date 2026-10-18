"use client";

import { useMemo, useState } from "react";
import { cexp, cmul, cx } from "@/lib/sss/math/complex";
import { nice } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { timeRange } from "@/lib/sss/signal/properties";
import { type FourierResult, fourier, freqWindow } from "@/lib/sss/transforms/fourier";
import { useSss } from "@/lib/sss/store";
import { type Clock, useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { useAnalysis, valueAt } from "../hooks";
import { MathInput } from "../MathInput";
import { fmtReadout, Plot, type PlotApi } from "../plot/Plot";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, NumericBadge, PageHeader, Panel, Segmented, StepsPanel } from "../ui";

export const FOURIER_EXAMPLES = [
  { label: "Decaying exponential", text: "e^(-2t)u(t)" },
  { label: "Rectangular pulse", text: "rect(t)" },
  { label: "Triangular pulse", text: "tri(t)" },
  { label: "Two-sided exponential", text: "e^(-|t|)" },
  { label: "Damped sinusoid", text: "e^(-t)cos(5t)u(t)" },
  { label: "Unit step (impulse at ω = 0)", text: "u(t)" },
  { label: "Cosine (two impulses)", text: "cos(3t)" },
  { label: "Shifted pulse", text: "rect(t - 1/2)" },
  { label: "Sinc pulse", text: "sinc(t)" },
  { label: "Modulated Gaussian", text: "e^(-t^2)cos(8t)" },
  { label: "Impulse", text: "δ(t)" },
  { label: "Lorentzian (numerical)", text: "1/(1 + t^2)" },
];

type Display = "magphase" | "reim";

/** Spectrum samples on [−W, W] (skipping exact impulse locations). */
function spectrum(ft: FourierResult, W: number, n = 900) {
  const w = new Float64Array(n + 1);
  const re = new Float64Array(n + 1);
  const im = new Float64Array(n + 1);
  if (ft.kind === "none") return { w, re, im };
  for (let i = 0; i <= n; i++) {
    const x = -W + (2 * W * i) / n;
    w[i] = x;
    const v = ft.at(x + (ft.kind === "exact" && ft.impulses.some((p) => Math.abs(p.at - x) < 1e-9) ? 1e-7 : 0));
    re[i] = v.re;
    im[i] = v.im;
  }
  return { w, re, im };
}

export function FourierView() {
  const input = useSss((s) => s.inputs.x);
  const set = useSss((s) => s.set);
  const { analysis, shown, stale } = useAnalysis(input, "ct");
  return (
    <>
      <PageHeader title="Fourier transform">
        <Tex tex="X(j\omega)=\int_{-\infty}^{\infty}x(t)\,e^{-j\omega t}\,dt" />: how much of each frequency ω the signal contains.
      </PageHeader>
      <Panel className="mb-5">
        <MathInput label="x(t)" variable="t" value={input} onChange={(v) => set("x", v)} examples={FOURIER_EXAMPLES} />
        {analysis?.kind === "error" && (
          <div className="mt-3">
            <Note tone="warn">{analysis.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <FourierBody an={shown} stale={stale} />}
    </>
  );
}

function FourierBody({ an, stale }: { an: Analysis; stale: boolean }) {
  const ft = useMemo(() => fourier(an), [an]);
  const W = useMemo(() => freqWindow(an, ft), [an, ft]);
  const [display, setDisplay] = useState<Display>("magphase");
  const [db, setDb] = useState(false);
  const clock = useClock({ from: -W, to: W, seconds: 10, initial: 0 });
  const spec = useMemo(() => spectrum(ft, W), [ft, W]);

  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        {ft.kind === "none" ? (
          <Panel title="Spectrum">
            <Note tone="warn">{ft.reason}</Note>
          </Panel>
        ) : (
          <Panel
            title="Spectrum"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {ft.kind === "numeric" && <NumericBadge reason={ft.note} />}
                {display === "magphase" && (
                  <Segmented
                    label="Magnitude scale"
                    value={db ? "db" : "lin"}
                    onChange={(v) => setDb(v === "db")}
                    options={[
                      { value: "lin", label: "Linear" },
                      { value: "db", label: "dB" },
                    ]}
                  />
                )}
                <Segmented
                  label="Show"
                  value={display}
                  onChange={setDisplay}
                  options={[
                    { value: "magphase", label: "|X| and ∠X" },
                    { value: "reim", label: "Re and Im" },
                  ]}
                />
              </div>
            }
          >
            <SpectrumPlots ft={ft} spec={spec} W={W} display={display} db={db} clock={clock} />
          </Panel>
        )}
        {ft.kind !== "none" && <AnimationPanel an={an} ft={ft} W={W} clock={clock} spec={spec} />}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <ResultPanel ft={ft} />
        {ft.kind === "exact" && <StepsPanel steps={ft.steps} />}
      </div>
    </div>
  );
}

function ResultPanel({ ft }: { ft: FourierResult }) {
  if (ft.kind === "none") {
    return (
      <Panel title="Result" tone="result">
        <Note tone="warn">No Fourier transform. {ft.reason}</Note>
      </Panel>
    );
  }
  if (ft.kind === "numeric") {
    return (
      <Panel title="Result" tone="result" actions={<NumericBadge reason={ft.note} />}>
        <Note>{ft.note}</Note>
      </Panel>
    );
  }
  return (
    <Panel title="Result" tone="result">
      <Formula tex={`X(j\\omega) = ${ft.tex}`} />
      {ft.magPhase && (
        <div className="mt-2 border-t border-line pt-2">
          <Formula tex={`|X(j\\omega)| = ${ft.magPhase.mag}`} />
          {ft.magPhase.phase && <Formula tex={`\\angle X(j\\omega) = ${ft.magPhase.phase}`} />}
        </div>
      )}
      {ft.generalized && (
        <p className="mt-2 text-sm text-muted">
          The signal doesn&apos;t die out, so the transform contains impulses (drawn as arrows labelled with their area).
        </p>
      )}
    </Panel>
  );
}

function SpectrumPlots(props: {
  ft: FourierResult;
  spec: { w: Float64Array; re: Float64Array; im: Float64Array };
  W: number;
  display: Display;
  db: boolean;
  clock: Clock;
}) {
  const { ft, spec, W, display, db, clock } = props;
  const impulses = useMemo(() => (ft.kind === "exact" ? ft.impulses : []), [ft]);
  const mag = useMemo(() => spec.re.map((r, i) => Math.hypot(r, spec.im[i])), [spec]);
  const maxMag = useMemo(() => Math.max(1e-300, ...Array.from(mag).filter(Number.isFinite)), [mag]);
  const top = useMemo(() => {
    if (display === "reim") return { a: spec.re, b: spec.im };
    return { a: db ? mag.map((m) => 20 * Math.log10(Math.max(m, maxMag * 1e-6))) : mag, b: null };
  }, [display, db, spec, mag, maxMag]);
  const phase = useMemo(() => spec.re.map((r, i) => (mag[i] < maxMag * 1e-7 ? NaN : Math.atan2(spec.im[i], r))), [spec, mag, maxMag]);
  const yTop = useMemo(() => {
    const vals = [...Array.from(top.a), ...(top.b ? Array.from(top.b) : [])];
    if (!db) for (const i of impulses) vals.push(display === "reim" ? i.area.re : Math.hypot(i.area.re, i.area.im), display === "reim" ? i.area.im : 0);
    return autoRange(vals, { includeZero: !db });
  }, [top, impulses, db, display]);
  const pos = (api: PlotApi) => {
    const w = clock.get();
    api.vline(w, { color: api.colors.axis, width: 1, dash: [4, 4] });
  };
  return (
    <div className="flex flex-col gap-4">
      <Plot
        x={[-W, W]}
        y={yTop}
        height={250}
        clock={clock}
        xLabel="ω (rad/s)"
        xName="ω"
        ariaLabel="Magnitude of the Fourier transform"
        legend={
          display === "reim"
            ? [
                { label: "Re X(jω)", color: "var(--plot-1)" },
                { label: "Im X(jω)", color: "var(--plot-2)" },
              ]
            : [{ label: db ? "|X(jω)| in dB" : "|X(jω)|", color: "var(--plot-1)" }]
        }
        readout={(w) => {
          if (ft.kind === "none") return null;
          const v = ft.at(w);
          return display === "reim"
            ? [
                { label: "Re X", value: fmtReadout(v.re), color: "var(--plot-1)" },
                { label: "Im X", value: fmtReadout(v.im), color: "var(--plot-2)" },
              ]
            : [{ label: "|X|", value: db ? `${fmtReadout(20 * Math.log10(Math.hypot(v.re, v.im)))} dB` : fmtReadout(Math.hypot(v.re, v.im)) }];
        }}
        draw={(api) => {
          api.curve(spec.w, top.a, { color: api.colors.series[0] });
          if (top.b) api.curve(spec.w, top.b, { color: api.colors.series[1] });
          if (!db && impulses.length) {
            const items = impulses.map((i) => {
              const h = display === "reim" ? i.area.re : Math.hypot(i.area.re, i.area.im);
              return { at: i.at, height: h || i.area.im, label: piLabel(h || i.area.im), order: i.order };
            });
            api.impulses(items, api.colors.series[0]);
            if (display === "reim") {
              api.impulses(
                impulses.filter((i) => Math.abs(i.area.im) > 1e-12 && Math.abs(i.area.re) > 1e-12).map((i) => ({ at: i.at, height: i.area.im, label: piLabel(i.area.im), order: i.order })),
                api.colors.series[1],
              );
            }
          }
          pos(api);
        }}
      />
      {display === "magphase" && (
        <Plot
          x={[-W, W]}
          y={[-Math.PI * 1.1, Math.PI * 1.1]}
          yPi
          height={170}
          clock={clock}
          xLabel="ω (rad/s)"
          xName="ω"
          ariaLabel="Phase of the Fourier transform"
          legend={[{ label: "∠X(jω) (rad)", color: "var(--plot-2)" }]}
          readout={(w) => {
            if (ft.kind === "none") return null;
            const v = ft.at(w);
            return [{ label: "∠X", value: fmtReadout(Math.atan2(v.im, v.re)) }];
          }}
          draw={(api) => {
            api.curve(spec.w, phase, { color: api.colors.series[1], width: 1.75 });
            pos(api);
          }}
        />
      )}
    </div>
  );
}

function piLabel(v: number): string {
  const k = v / Math.PI;
  if (Math.abs(k - Math.round(k)) < 1e-9 && Math.round(k) !== 0) {
    const r = Math.round(k);
    return r === 1 ? "π" : r === -1 ? "−π" : `${r}π`.replace("-", "−");
  }
  return nice(v).text;
}

function AnimationPanel(props: {
  an: Analysis;
  ft: Exclude<FourierResult, { kind: "none" }>;
  W: number;
  clock: Clock;
  spec: { w: Float64Array; re: Float64Array; im: Float64Array };
}) {
  const { an, ft, clock } = props;
  const [mode, setMode] = useState<"winding" | "correlation">("winding");
  const range = useMemo(() => timeRange(an), [an]);
  // x(t) samples, reused every frame.
  const samples = useMemo(() => {
    const n = 700;
    const t = new Float64Array(n + 1);
    const re = new Float64Array(n + 1);
    const im = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const tt = range[0] + ((range[1] - range[0]) * i) / n;
      const v = valueAt(an, tt);
      t[i] = tt;
      re[i] = v.re;
      im[i] = v.im;
    }
    return { t, re, im };
  }, [an, range]);
  const amp = useMemo(
    () => Math.max(1e-9, ...Array.from(samples.re, Math.abs), ...Array.from(samples.im, Math.abs)),
    [samples],
  );
  const wNow = useClockValue(clock, (w) => Math.round(w * 100) / 100);
  const Xnow = ft.at(wNow);
  // z(t) = x(t)e^{−jωt} for the current ω.
  const wound = (w: number) => {
    const n = samples.t.length;
    const zr = new Float64Array(n);
    const zi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const k = cexp(cx(0, -w * samples.t[i]));
      const z = cmul(cx(samples.re[i], samples.im[i]), k);
      zr[i] = z.re;
      zi[i] = z.im;
    }
    return { zr, zi };
  };
  const L = range[1] - range[0];

  return (
    <Panel
      title="Animation"
      actions={
        <Segmented
          label="Animation"
          value={mode}
          onChange={setMode}
          options={[
            { value: "winding", label: "Winding" },
            { value: "correlation", label: "Correlation" },
          ]}
        />
      }
    >
      <p className="mb-3 text-sm text-muted">
        {mode === "winding" ? (
          <>
            Wrap <Tex tex="x(t)" /> around the origin at rate <Tex tex="\omega" />: the curve is <Tex tex="x(t)e^{-j\omega t}" />. Its centre of
            mass is <Tex tex="X(j\omega)" /> divided by the window length; it moves away from the origin when ω matches a frequency in x(t).
          </>
        ) : (
          <>
            <Tex tex="X(j\omega)" /> is the signed area under <Tex tex="x(t)e^{-j\omega t}" />: its real part is the area under{" "}
            <Tex tex="x(t)\cos\omega t" /> (for real x) and its imaginary part the area under <Tex tex="-x(t)\sin\omega t" />.
          </>
        )}
      </p>
      {mode === "winding" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Plot
            x={[-amp * 1.15, amp * 1.15]}
            y={[-amp * 1.15, amp * 1.15]}
            equal
            height={300}
            clock={clock}
            interactive={false}
            xLabel="Re"
            ariaLabel="x(t) wound around the origin"
            draw={(api) => {
              const w = clock.get();
              const { zr, zi } = wound(w);
              api.curve(zr, zi, { color: api.colors.series[0], width: 1.5, alpha: 0.85 });
              const X = ft.at(w);
              const c = { re: X.re / L, im: X.im / L };
              api.ctx.save();
              api.ctx.strokeStyle = api.colors.series[1];
              api.ctx.lineWidth = 2.5;
              api.ctx.beginPath();
              api.ctx.moveTo(api.px(0), api.py(0));
              api.ctx.lineTo(api.px(c.re), api.py(c.im));
              api.ctx.stroke();
              api.ctx.restore();
              api.dot(c.re, c.im, api.colors.series[1], 6);
            }}
          />
          <Plot
            x={[-props.W, props.W]}
            y={autoRange(Array.from(props.spec.re, (r, i) => Math.hypot(r, props.spec.im[i])))}
            height={300}
            clock={clock}
            xLabel="ω"
            xName="ω"
            ariaLabel="Magnitude traced as ω sweeps"
            legend={[{ label: "|X(jω)| traced so far", color: "var(--plot-1)" }]}
            draw={(api) => {
              const w = clock.get();
              const mags = props.spec.re.map((r, i) => Math.hypot(r, props.spec.im[i]));
              api.curve(props.spec.w, mags, { color: api.colors.series[0], alpha: 0.18 });
              let n = 0;
              while (n < props.spec.w.length && props.spec.w[n] <= w) n++;
              api.curve(props.spec.w.subarray(0, n), mags.subarray(0, n), { color: api.colors.series[0] });
              const X = ft.at(w);
              api.dot(w, Math.hypot(X.re, X.im), api.colors.series[1], 5);
            }}
          />
        </div>
      ) : (
        <CorrelationPlots samples={samples} amp={amp} range={range} clock={clock} />
      )}
      <Transport clock={clock} label="ω" hotkey className="mt-3" />
      <p className="mt-2 text-sm tabular-nums">
        <Tex tex={`X(j\\,${fmtReadout(wNow).replace("−", "-")}) = ${fmtReadout(Xnow.re).replace("−", "-")} ${Xnow.im < 0 ? "-" : "+"} ${fmtReadout(Math.abs(Xnow.im))}j`} />
      </p>
    </Panel>
  );
}

function CorrelationPlots(props: { samples: { t: Float64Array; re: Float64Array; im: Float64Array }; amp: number; range: [number, number]; clock: Clock }) {
  const { samples, amp, range, clock } = props;
  const products = (w: number) => {
    const n = samples.t.length;
    const pr = new Float64Array(n);
    const pi = new Float64Array(n);
    const cosw = new Float64Array(n);
    const sinw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.cos(w * samples.t[i]);
      const s = Math.sin(w * samples.t[i]);
      // x(t)e^{−jωt} = (xr + j xi)(c − j s)
      pr[i] = samples.re[i] * c + samples.im[i] * s;
      pi[i] = samples.im[i] * c - samples.re[i] * s;
      cosw[i] = amp * c;
      sinw[i] = -amp * s;
    }
    return { pr, pi, cosw, sinw };
  };
  const area = (ys: Float64Array) => {
    let a = 0;
    for (let i = 1; i < ys.length; i++) a += ((ys[i] + ys[i - 1]) / 2) * (samples.t[i] - samples.t[i - 1]);
    return a;
  };
  const one = (part: "re" | "im") => (
    <Plot
      x={range}
      y={[-amp * 1.15, amp * 1.15]}
      height={190}
      clock={clock}
      xLabel="t"
      ariaLabel={part === "re" ? "Real part of x(t)e^{-jωt} with its area" : "Imaginary part of x(t)e^{-jωt} with its area"}
      legend={
        part === "re"
          ? [
              { label: "x(t)", color: "var(--plot-axis)" },
              { label: "cos ωt (scaled)", color: "var(--plot-4)", dashed: true },
              { label: "Re[x(t)e^(−jωt)]", color: "var(--plot-1)" },
            ]
          : [
              { label: "x(t)", color: "var(--plot-axis)" },
              { label: "−sin ωt (scaled)", color: "var(--plot-4)", dashed: true },
              { label: "Im[x(t)e^(−jωt)]", color: "var(--plot-2)" },
            ]
      }
      draw={(api) => {
        const p = products(clock.get());
        const ys = part === "re" ? p.pr : p.pi;
        const color = part === "re" ? api.colors.series[0] : api.colors.series[1];
        api.curve(samples.t, samples.re, { color: api.colors.axis, width: 1.25 });
        api.curve(samples.t, part === "re" ? p.cosw : p.sinw, { color: api.colors.series[3], width: 1, dash: [4, 3], alpha: 0.8 });
        api.area(samples.t, ys, color, 0.22);
        api.curve(samples.t, ys, { color });
        api.ctx.save();
        api.ctx.fillStyle = api.colors.text;
        api.ctx.font = "600 12px system-ui, sans-serif";
        api.ctx.fillText(`area = ${fmtReadout(area(ys))}`, api.left + 8, api.top + 16);
        api.ctx.restore();
      }}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      {one("re")}
      {one("im")}
    </div>
  );
}


"use client";

import { useEffect, useMemo } from "react";
import { type C, cabs } from "@/lib/sss/math/complex";
import { nice, niceC } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { partialSum, type SeriesResult, fourierSeries } from "@/lib/sss/transforms/series";
import { useSss } from "@/lib/sss/store";
import { useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { useAnalysis, valueAt } from "../hooks";
import { MathInput } from "../MathInput";
import { fmtReadout, Plot } from "../plot/Plot";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Fact, Formula, Note, NumericBadge, PageHeader, Panel, StepsPanel } from "../ui";

interface Preset {
  label: string;
  text: string;
  T: number;
  t0: number;
  params?: Record<string, number>;
}

const PRESETS: Preset[] = [
  { label: "Square wave", text: "1 - 2u(t - 1)", T: 2, t0: 0 },
  { label: "Triangle wave", text: "1 - 2|t|", T: 2, t0: -1 },
  { label: "Sawtooth", text: "t", T: 1, t0: 0 },
  { label: "Half-wave rectified", text: "sin(pi t)(u(t) - u(t - 1))", T: 2, t0: 0 },
  { label: "Full-wave rectified", text: "sin(pi t)", T: 1, t0: 0 },
  { label: "Pulse train", text: "rect(t/d)", T: 1, t0: -0.5, params: { d: 0.25 } },
  { label: "Impulse train", text: "δ(t)", T: 1, t0: -0.5 },
  { label: "Exponential", text: "e^(-t)", T: 1, t0: 0 },
];

const KMAX = 200;
const NMAX = 50;

export function SeriesView() {
  const series = useSss((s) => s.inputs.series);
  const set = useSss((s) => s.set);
  const { analysis, shown, stale } = useAnalysis(series.x, "ct");
  const update = (patch: Partial<typeof series>) => set("series", { ...series, ...patch });
  const num = (key: "T" | "t0", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Tex tex={label} />
      <input
        type="number"
        step="any"
        defaultValue={series[key]}
        key={`${key}-${series[key]}`}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && (key !== "T" || v > 0)) update({ [key]: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-24 rounded-md border border-line bg-panel px-2 py-1 tabular-nums"
        aria-label={key === "T" ? "Period T" : "Start of the period"}
      />
    </label>
  );
  return (
    <>
      <PageHeader title="Fourier series">
        A periodic signal as a sum of harmonics: <Tex tex="x(t)=\sum_{k=-\infty}^{\infty} c_k\,e^{jk\omega_0 t}" />, with{" "}
        <Tex tex="\omega_0 = 2\pi/T" />.
      </PageHeader>
      <Panel className="mb-5">
        <MathInput label="x(t)" variable="t" value={series.x} onChange={(v) => update({ x: v })} />
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-sm text-muted">One period, repeated:</span>
          {num("T", "T =")}
          {num("t0", "t_0 =")}
          <span className="text-sm text-muted">
            covers <Tex tex={`${nice(series.t0).tex} \\le t < ${nice(series.t0 + series.T).tex}`} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => update({ x: { text: p.text, params: { ...series.x.params, ...p.params } }, T: p.T, t0: p.t0 })}
              className="rounded-full border border-line bg-panel px-3 py-1 text-sm hover:border-accent/50 hover:bg-hover"
            >
              {p.label}
            </button>
          ))}
        </div>
        {analysis?.kind === "error" && (
          <div className="mt-3">
            <Note tone="warn">{analysis.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <SeriesBody an={shown} T={series.T} t0={series.t0} N={series.N} setN={(N) => update({ N })} stale={stale} />}
    </>
  );
}

function SeriesBody(props: { an: Analysis; T: number; t0: number; N: number; setN: (n: number) => void; stale: boolean }) {
  const { an, T, t0, N } = props;
  const fs = useMemo(() => fourierSeries(an, T, t0), [an, T, t0]);
  const coefs = useMemo(() => Array.from({ length: 2 * KMAX + 1 }, (_, i) => fs.coef(i - KMAX)), [fs]);
  const build = useClock({ from: 1, to: NMAX + 0.999, seconds: 10, initial: N });
  // The build-up animation drives N; when it stops, N stays where it ended.
  const animN = useClockValue(build, (v, playing) => (playing ? Math.floor(v) : null));
  const n = animN ?? N;
  useEffect(() => {
    if (!build.isPlaying()) build.set(N);
  }, [build, N]);

  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${props.stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Partial sum" actions={!fs.exact ? <NumericBadge reason={fs.reason ?? ""} /> : undefined}>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <Tex tex={`x_N(t)=\\sum_{k=-N}^{N}c_k e^{jk\\omega_0 t}`} />
            <label className="flex flex-1 items-center gap-2">
              <Tex tex="N =" />
              <input
                type="range"
                min={1}
                max={NMAX}
                value={n}
                onChange={(e) => {
                  build.pause();
                  props.setN(Number(e.target.value));
                }}
                className="min-w-24 flex-1 accent-accent"
                aria-label="Number of harmonics N"
              />
              <span className="w-8 tabular-nums">{n}</span>
            </label>
          </div>
          <Reconstruction an={an} fs={fs} coefs={coefs} N={n} t0={t0} />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-muted">Build up</span>
            <Transport clock={build} label="N" format={(v) => String(Math.floor(v))} className="flex-1" />
          </div>
        </Panel>
        <Panel title="Line spectrum">
          <Spectrum coefs={coefs} N={n} />
        </Panel>
        <Panel title="Rotating phasors">
          <Epicycles fs={fs} coefs={coefs} N={Math.min(n, 30)} />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <ResultPanel fs={fs} coefs={coefs} N={n} />
        <StepsPanel steps={fs.steps} />
      </div>
    </div>
  );
}

function periodic(an: Analysis, T: number, t0: number) {
  return (t: number) => {
    const u = t0 + ((((t - t0) % T) + T) % T);
    return valueAt(an, u);
  };
}

function Reconstruction(props: { an: Analysis; fs: SeriesResult; coefs: C[]; N: number; t0: number }) {
  const { an, fs, coefs, N, t0 } = props;
  const { T } = fs;
  const range: [number, number] = useMemo(() => [-1.5 * T, 1.5 * T], [T]);
  // The typed expression only counts on [t0, t0 + T); repeat that period.
  const x = useMemo(() => periodic(an, T, t0), [an, T, t0]);
  const yRange = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i <= 400; i++) {
      const t = range[0] + ((range[1] - range[0]) * i) / 400;
      vals.push(partialSum(coefs, Math.min(KMAX, 50), fs.w0, t).re);
    }
    return autoRange(vals);
  }, [coefs, fs.w0, range]);
  return (
    <Plot
      x={range}
      y={yRange}
      height={260}
      xLabel="t"
      ariaLabel="The periodic signal and its partial Fourier sum"
      legend={[
        { label: "x(t), repeated", color: "var(--plot-axis)", dashed: true },
        { label: `x_N(t), N = ${N}`, color: "var(--plot-1)" },
      ]}
      readout={(t) => [
        { label: "x", value: fmtReadout(x(t).re) },
        { label: "x_N", value: fmtReadout(partialSum(coefs, N, fs.w0, t).re), color: "var(--plot-1)" },
      ]}
      draw={(api) => {
        const n = api.samples;
        const xs = new Float64Array(n + 1);
        const orig = new Float64Array(n + 1);
        const sum = new Float64Array(n + 1);
        for (let i = 0; i <= n; i++) {
          const t = api.x0 + ((api.x1 - api.x0) * i) / n;
          xs[i] = t;
          orig[i] = x(t).re;
          sum[i] = partialSum(coefs, N, fs.w0, t).re;
        }
        api.curve(xs, orig, { color: api.colors.axis, dash: [5, 4], width: 1.5 });
        api.curve(xs, sum, { color: api.colors.series[0] });
        // Period boundaries.
        for (let k = -2; k <= 2; k++) api.vline(k * fs.T, { color: api.colors.gridMajor, width: 1, dash: [2, 4] });
      }}
    />
  );
}

function Spectrum(props: { coefs: C[]; N: number }) {
  const { coefs, N } = props;
  const K = Math.max(10, Math.min(40, N + 5));
  const ks = useMemo(() => Float64Array.from({ length: 2 * K + 1 }, (_, i) => i - K), [K]);
  const mags = useMemo(() => ks.map((k) => cabs(coefs[k + KMAX])), [ks, coefs]);
  const phases = useMemo(() => ks.map((k, i) => (mags[i] < 1e-9 * Math.max(...mags) ? NaN : Math.atan2(coefs[k + KMAX].im, coefs[k + KMAX].re))), [ks, coefs, mags]);
  const yMag = useMemo(() => autoRange(mags), [mags]);
  const inside = (k: number) => Math.abs(k) <= N;
  return (
    <div className="flex flex-col gap-3">
      <Plot
        x={[-K - 1, K + 1]}
        y={yMag}
        height={190}
        xLabel="k"
        xName="k"
        interactive={false}
        ariaLabel="Magnitudes of the Fourier coefficients"
        legend={[{ label: "|c_k| (solid: used in x_N)", color: "var(--plot-1)" }]}
        readout={(x) => {
          const k = Math.round(x);
          if (Math.abs(k) > K) return null;
          return [{ label: `|c_${k}|`, value: fmtReadout(cabs(coefs[k + KMAX])) }];
        }}
        draw={(api) => {
          const inK = ks.filter((k) => inside(k));
          const outK = ks.filter((k) => !inside(k));
          api.stems(outK, outK.map((k) => cabs(coefs[k + KMAX])), api.colors.series[0], { alpha: 0.35, hollow: true });
          api.stems(inK, inK.map((k) => cabs(coefs[k + KMAX])), api.colors.series[0]);
        }}
      />
      <Plot
        x={[-K - 1, K + 1]}
        y={[-Math.PI * 1.15, Math.PI * 1.15]}
        yPi
        height={150}
        xLabel="k"
        xName="k"
        interactive={false}
        ariaLabel="Phases of the Fourier coefficients"
        legend={[{ label: "∠c_k (rad)", color: "var(--plot-2)" }]}
        draw={(api) => {
          api.stems(ks, phases, api.colors.series[1], { radius: 3 });
        }}
      />
    </div>
  );
}

function Epicycles(props: { fs: SeriesResult; coefs: C[]; N: number }) {
  const { fs, coefs, N } = props;
  const clock = useClock({ from: 0, to: 2 * fs.T, seconds: 8, loop: true, initial: 0 });
  useEffect(() => clock.setRange(0, 2 * fs.T), [clock, fs.T]);
  // Order: c0, c1, c−1, c2, c−2 …
  const order = useMemo(() => {
    const out: number[] = [0];
    for (let k = 1; k <= N; k++) out.push(k, -k);
    return out;
  }, [N]);
  const trace = useMemo(() => {
    const n = 600;
    const ts = new Float64Array(n + 1);
    const ys = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const t = (2 * fs.T * i) / n;
      ts[i] = t;
      ys[i] = partialSum(coefs, N, fs.w0, t).re;
    }
    return { ts, ys };
  }, [coefs, N, fs]);
  // Frame the tip's path (the biggest circles may spill over the edge).
  const R = useMemo(() => {
    let m = cabs(coefs[KMAX]);
    for (const t of trace.ts) m = Math.max(m, cabs(partialSum(coefs, N, fs.w0, t)));
    return Math.max(1e-9, m) * 1.35;
  }, [trace, coefs, N, fs.w0]);
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Each coefficient is a phasor <Tex tex="c_k e^{jk\omega_0 t}" /> turning at <Tex tex="k\omega_0" />. Chained tip to tail, the real part of
        the tip draws <Tex tex="x_N(t)" />.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Plot
          x={[-R, R]}
          y={[-R, R]}
          equal
          height={300}
          clock={clock}
          interactive={false}
          xLabel="Re"
          ariaLabel="Rotating phasors whose sum draws the partial sum"
          draw={(api) => {
            const t = clock.get();
            let x = 0;
            let y = 0;
            const { ctx } = api;
            ctx.save();
            for (const k of order) {
              const c = coefs[k + KMAX];
              const r = cabs(c);
              if (r < 1e-9) continue;
              const ang = Math.atan2(c.im, c.re) + k * fs.w0 * t;
              const nx = x + r * Math.cos(ang);
              const ny = y + r * Math.sin(ang);
              ctx.strokeStyle = api.colors.axis;
              ctx.globalAlpha = 0.45;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(api.px(x), api.py(y), Math.abs(api.px(r) - api.px(0)), 0, Math.PI * 2);
              ctx.stroke();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = api.colors.series[0];
              ctx.lineWidth = 1.75;
              ctx.beginPath();
              ctx.moveTo(api.px(x), api.py(y));
              ctx.lineTo(api.px(nx), api.py(ny));
              ctx.stroke();
              x = nx;
              y = ny;
            }
            ctx.restore();
            api.vline(x, { color: api.colors.series[1], width: 1, dash: [3, 3] });
            api.dot(x, y, api.colors.series[1], 5);
          }}
        />
        <Plot
          x={[0, 2 * fs.T]}
          y={autoRange(trace.ys)}
          height={300}
          clock={clock}
          interactive={false}
          xLabel="t"
          ariaLabel="The partial sum drawn by the phasor tip"
          legend={[{ label: "Re(tip) = x_N(t)", color: "var(--plot-2)" }]}
          draw={(api) => {
            const t = clock.get();
            api.curve(trace.ts, trace.ys, { color: api.colors.series[1], alpha: 0.2 });
            let n = 0;
            while (n < trace.ts.length && trace.ts[n] <= t) n++;
            api.curve(trace.ts.subarray(0, n), trace.ys.subarray(0, n), { color: api.colors.series[1] });
            api.dot(t, partialSum(coefs, N, fs.w0, t).re, api.colors.series[1], 5);
          }}
        />
      </div>
      <Transport clock={clock} label="t" className="mt-3" />
    </>
  );
}

function ResultPanel(props: { fs: SeriesResult; coefs: C[]; N: number }) {
  const { fs, coefs, N } = props;
  const partialPower = useMemo(() => {
    let p = 0;
    for (let k = -N; k <= N; k++) p += cabs(coefs[k + KMAX]) ** 2;
    return p;
  }, [coefs, N]);
  const rows = Math.min(10, Math.max(N, 5));
  return (
    <>
      <Panel title="Coefficients" tone="result" actions={!fs.exact ? <NumericBadge reason={fs.reason ?? ""} /> : undefined}>
        <Formula tex={`\\omega_0 = \\frac{2\\pi}{T} = ${nice(fs.w0).tex}`} />
        {fs.tex ? (
          <>
            <Formula tex={`c_k = ${fs.tex.ck}${fs.tex.special.length ? `,\\quad k\\ne ${fs.tex.special.map((s) => s.k).join(",")}` : ""}`} />
            {fs.tex.special.map((s) => (
              <Formula key={s.k} tex={`c_{${s.k}} = ${s.tex}`} />
            ))}
            {fs.tex.trig && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="text-sm text-muted">Trigonometric form</p>
                <Formula tex={`a_0 = ${fs.tex.trig.a0},\\quad a_k = ${fs.tex.trig.ak},\\quad b_k = ${fs.tex.trig.bk}`} />
              </div>
            )}
          </>
        ) : (
          <Note>{fs.exact ? "The coefficients are listed below." : `Computed numerically (FFT of one period). ${fs.reason ?? ""}`}</Note>
        )}
      </Panel>
      <Panel title="First coefficients">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-3 font-medium">k</th>
                <th className="py-1 pr-3 font-medium">
                  <Tex tex="c_k" />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <Tex tex="|c_k|" />
                </th>
                <th className="py-1 font-medium">
                  <Tex tex="\angle c_k" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows + 1 }, (_, k) => {
                const c = coefs[k + KMAX];
                const m = cabs(c);
                return (
                  <tr key={k} className="border-t border-line/70">
                    <td className="py-1 pr-3">{k}</td>
                    <td className="py-1 pr-3">
                      <Tex tex={niceC(cleanC(c)).tex} />
                    </td>
                    <td className="py-1 pr-3">{fmtReadout(m)}</td>
                    <td className="py-1">{m < 1e-12 ? "—" : fmtReadout(Math.atan2(c.im, c.re))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">For a real signal, c₋ₖ is the complex conjugate of cₖ.</p>
      </Panel>
      <Panel title="Power (Parseval)">
        <dl>
          <Fact label={<Tex tex="P=\frac1T\int_T|x(t)|^2dt" />}>{Number.isFinite(fs.power) ? fmtReadout(fs.power) : "∞ (impulses)"}</Fact>
          <Fact label={<Tex tex={`\\sum_{|k|\\le ${N}}|c_k|^2`} />}>{fmtReadout(partialPower)}</Fact>
          {Number.isFinite(fs.power) && fs.power > 0 && <Fact label="Captured by N harmonics">{`${Math.min(100, (100 * partialPower) / fs.power).toFixed(2)} %`}</Fact>}
        </dl>
      </Panel>
    </>
  );
}

function cleanC(c: C): C {
  const m = cabs(c);
  return { re: Math.abs(c.re) < 1e-12 * Math.max(1, m) ? 0 : c.re, im: Math.abs(c.im) < 1e-12 * Math.max(1, m) ? 0 : c.im };
}


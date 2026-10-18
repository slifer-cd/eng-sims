"use client";

import { useEffect, useMemo, useState } from "react";
import { cabs, cx } from "@/lib/sss/math/complex";
import { niceC } from "@/lib/sss/math/nice";
import { findRoots, type Root } from "@/lib/sss/math/poly";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { timeRange } from "@/lib/sss/signal/properties";
import { sigEval } from "@/lib/sss/signal/signal";
import { inverseLaplace, parseSExpr, rocStrips } from "@/lib/sss/transforms/inverse";
import { type LaplaceResult, laplace } from "@/lib/sss/transforms/laplace";
import { groupRational, type SExpr, sexprEval, type Strip, texSExpr, texStrip } from "@/lib/sss/transforms/sdomain";
import { useSss } from "@/lib/sss/store";
import { type Clock, useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { useAnalysis, valueAt } from "../hooks";
import { MathInput, useParsed } from "../MathInput";
import { fmtReadout, Plot } from "../plot/Plot";
import { drawPoleZero, pzWindow } from "../plot/poleZero";
import { Surface3D } from "../plot/Surface3D";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, NumericBadge, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { drawSignal, rangeFor } from "./SignalView";

const FORWARD_EXAMPLES = [
  { label: "Decaying exponential", text: "e^(-2t)u(t)" },
  { label: "Unit step", text: "u(t)" },
  { label: "Ramp", text: "t u(t)" },
  { label: "Damped sinusoid", text: "e^(-t)sin(3t)u(t)" },
  { label: "Two-sided exponential", text: "e^(-|t|)" },
  { label: "Left-sided exponential", text: "-e^(2t)u(-t)" },
  { label: "Pulse (no poles)", text: "u(t) - u(t - 1)" },
  { label: "Delayed exponential", text: "e^(-(t-1))u(t-1)" },
  { label: "Repeated pole", text: "t^2 e^(-t) u(t)" },
  { label: "Growing exponential", text: "e^(t)u(t)" },
];

const INVERSE_EXAMPLES = [
  { label: "Two real poles", text: "(s + 3)/((s + 1)(s + 2))" },
  { label: "Complex poles", text: "1/(s^2 + 2s + 5)" },
  { label: "Repeated pole", text: "1/(s + 1)^2" },
  { label: "Improper (impulse)", text: "s/(s + 1)" },
  { label: "With a delay", text: "e^(-2s)/(s(s + 1))" },
  { label: "Poles on both sides", text: "1/((s + 1)(s - 2))" },
  { label: "Second-order system", text: "w0^2/(s^2 + 2 z w0 s + w0^2)", params: { w0: 2, z: 0.3 } },
];

export function LaplaceView() {
  const [mode, setMode] = useState<"forward" | "inverse">("forward");
  return (
    <>
      <PageHeader title="Laplace transform">
        <Tex tex="X(s)=\int_{-\infty}^{\infty}x(t)\,e^{-st}\,dt" />, with <Tex tex="s=\sigma+j\omega" />: the Fourier transform of{" "}
        <Tex tex="x(t)e^{-\sigma t}" />, wherever that converges.
      </PageHeader>
      <div className="mb-4">
        <Segmented
          label="Direction"
          value={mode}
          onChange={setMode}
          options={[
            { value: "forward", label: <Tex tex="x(t) \to X(s)" /> },
            { value: "inverse", label: <Tex tex="X(s) \to x(t)" /> },
          ]}
        />
      </div>
      {mode === "forward" ? <Forward /> : <Inverse />}
    </>
  );
}

function Forward() {
  const input = useSss((s) => s.inputs.x);
  const set = useSss((s) => s.set);
  const { analysis, shown, stale } = useAnalysis(input, "ct");
  return (
    <>
      <Panel className="mb-5">
        <MathInput label="x(t)" variable="t" value={input} onChange={(v) => set("x", v)} examples={FORWARD_EXAMPLES} />
        {analysis?.kind === "error" && (
          <div className="mt-3">
            <Note tone="warn">{analysis.message}</Note>
          </div>
        )}
      </Panel>
      {shown?.kind === "exact" && <ForwardBody an={shown} stale={stale} />}
      {shown?.kind === "numeric" && (
        <Panel title="Result" tone="result" actions={<NumericBadge reason={shown.reason} />}>
          <Note>
            No closed form: {shown.reason} The Laplace transform needs an exact x(t) to find its region of convergence. Try the Fourier page
            for a numerical spectrum.
          </Note>
        </Panel>
      )}
    </>
  );
}

/** σ range for the sweep: around the poles and the ROC edges. */
function sigmaRange(poles: Root[], roc: Strip | null): [number, number] {
  const pts = [0, ...poles.map((p) => p.p.re), ...(roc ? [roc.lo, roc.hi].filter(Number.isFinite) : [])];
  let lo = Math.min(...pts) - 1.5;
  let hi = Math.max(...pts) + 1.5;
  if (hi - lo < 4) {
    const m = (hi + lo) / 2;
    lo = m - 2;
    hi = m + 2;
  }
  return [lo, hi];
}

function omegaRange(poles: Root[]): number {
  return Math.max(4, ...poles.map((p) => Math.abs(p.p.im) * 1.6 + 2));
}

function ForwardBody({ an, stale }: { an: Analysis & { kind: "exact" }; stale: boolean }) {
  const L = useMemo(() => laplace(an), [an]);
  const sig = useMemo(() => sigmaRange(L.poles, L.roc), [L]);
  const W = useMemo(() => omegaRange(L.poles), [L]);
  const startSigma = L.roc ? (Number.isFinite(L.roc.lo) ? (Number.isFinite(L.roc.hi) ? (L.roc.lo + L.roc.hi) / 2 : L.roc.lo + 1) : Number.isFinite(L.roc.hi) ? L.roc.hi - 1 : 0) : sig[0];
  const clock = useClock({ from: sig[0], to: sig[1], seconds: 8, initial: startSigma });
  // A new signal: start the sweep inside its ROC again.
  useEffect(() => {
    clock.setRange(sig[0], sig[1]);
    if (!clock.isPlaying()) clock.set(startSigma);
  }, [clock, sig, startSigma]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="s-plane">
          <SPlane poles={L.poles} zeros={L.zeros} roc={L.roc} clock={clock} />
        </Panel>
        {L.roc !== null || L.poles.length ? (
          <Panel title="|X(s)| over the s-plane">
            <p className="mb-3 text-sm text-muted">
              Log scale, clipped at the poles. Blue is the ROC; the green line is the <Tex tex="j\omega" /> axis (the Fourier magnitude, when it lies in
              the ROC) and the orange line follows the σ slider below.
            </p>
            <Surface3D at={L.at} sigma={sig} omega={[-W, W]} roc={L.roc} clock={clock} ariaLabel="Magnitude of X(s) as a surface over the s-plane" />
          </Panel>
        ) : null}
        <SigmaSweep an={an} L={L} W={W} clock={clock} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          {L.roc ? (
            <>
              <Formula tex={`X(s) = ${L.tex}`} />
              <Formula tex={`\\text{ROC: } ${texStrip(L.roc)}`} />
            </>
          ) : (
            <Note tone="warn">No Laplace transform. {L.rocNote}</Note>
          )}
          {L.roc && <PolesZeros poles={L.poles} zeros={L.zeros} roc={L.roc} />}
        </Panel>
        <StepsPanel steps={L.steps} />
      </div>
    </div>
  );
}

function PolesZeros({ poles, zeros, roc }: { poles: Root[]; zeros: Root[] | null; roc: Strip }) {
  const list = (rs: Root[]) => rs.map((r) => `${niceC(r.p).tex}${r.mult > 1 ? `\\ (\\times${r.mult})` : ""}`).join(",\\ ");
  const stable = roc.lo < 0 && roc.hi > 0;
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
      <p>
        <span className="text-muted">Poles: </span>
        {poles.length ? <Tex tex={list(poles)} /> : "none"}
      </p>
      <p>
        <span className="text-muted">Zeros: </span>
        {zeros === null ? "infinitely many (X(s) has exponential factors)" : zeros.length ? <Tex tex={list(zeros)} /> : "none"}
      </p>
      <p className="text-muted">
        {stable
          ? "The ROC contains the jω axis: the Fourier transform exists and equals X(jω)."
          : "The ROC doesn't contain the jω axis: there is no ordinary Fourier transform."}
      </p>
    </div>
  );
}

function SPlane(props: { poles: Root[]; zeros: Root[] | null; roc: Strip | null; clock?: Clock; sweep?: boolean }) {
  const { poles, zeros, roc, clock } = props;
  const win = useMemo(() => pzWindow([...poles.map((p) => p.p), ...(zeros ?? []).map((z) => z.p)], roc ? [roc.lo, roc.hi] : []), [poles, zeros, roc]);
  return (
    <Plot
      x={win}
      y={win}
      equal
      height={300}
      clock={clock}
      interactive={false}
      xLabel="σ"
      ariaLabel="Poles, zeros and region of convergence in the s-plane"
      legend={[
        { label: "× poles", color: "var(--plot-2)" },
        { label: "○ zeros", color: "var(--plot-1)" },
        { label: "ROC (shaded)", color: "var(--accent)" },
      ]}
      draw={(api) => {
        drawPoleZero(api, { poles, zeros, roc });
        if (clock) api.vline(clock.get(), { color: api.colors.series[1], width: 2, dash: [6, 4] });
      }}
    />
  );
}

function SigmaSweep({ an, L, W, clock }: { an: Analysis & { kind: "exact" }; L: LaplaceResult; W: number; clock: Clock }) {
  const range = useMemo(() => timeRange(an), [an]);
  const base = useMemo(() => rangeFor(an, range), [an, range]);
  const sigma = useClockValue(clock, (v) => Math.round(v * 20) / 20);
  const inside = !!L.roc && sigma > L.roc.lo && sigma < L.roc.hi;
  // y-range from the current slice (σ is rounded, so this re-runs only every 0.05).
  const sliceRange = useMemo(() => {
    const vals: number[] = [];
    for (let k = 0; k <= 200; k++) vals.push(cabs(sexprEval(L.X, cx(sigma, -W + (2 * W * k) / 200))));
    return autoRange(vals);
  }, [L, W, sigma]);
  return (
    <Panel title="Sweep σ: the Laplace transform as a Fourier transform">
      <p className="mb-3 text-sm text-muted">
        <Tex tex="X(\sigma+j\omega)" /> is the Fourier transform of <Tex tex="x(t)e^{-\sigma t}" />. Inside the ROC that weighted signal dies out and the
        integral converges; outside it, it blows up.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Plot
          x={range}
          y={[base[0] * 1.5, base[1] * 1.5]}
          height={220}
          clock={clock}
          xLabel="t"
          ariaLabel="The weighted signal x(t)e^{-σt}"
          legend={[{ label: "x(t) weighted by e^(−σt)", color: "var(--plot-2)" }]}
          readout={(t) => [{ label: "x(t)e^(−σt)", value: fmtReadout(valueAt(an, t).re * Math.exp(-clock.get() * t)) }]}
          draw={(api) => {
            drawSignal(api, an, api.colors.axis, { dash: [5, 4], width: 1.25 });
            const s = clock.get();
            const n = api.samples;
            const xs = new Float64Array(n + 1);
            const ys = new Float64Array(n + 1);
            for (let i = 0; i <= n; i++) {
              const t = api.x0 + ((api.x1 - api.x0) * i) / n;
              xs[i] = t;
              ys[i] = sigEval(an.signal, t).re * Math.exp(-s * t);
            }
            api.curve(xs, ys, { color: api.colors.series[1] });
          }}
        />
        <Plot
          x={[-W, W]}
          y={sliceRange}
          height={220}
          clock={clock}
          xLabel="ω"
          xName="ω"
          ariaLabel="Magnitude of X(σ + jω) along the swept line"
          legend={[{ label: "|X(σ + jω)|", color: "var(--plot-2)" }]}
          readout={(w) => [{ label: "|X|", value: fmtReadout(cabs(L.at(cx(clock.get(), w)))) }]}
          draw={(api) => {
            const s = clock.get();
            const n = 500;
            const xs = new Float64Array(n + 1);
            const ys = new Float64Array(n + 1);
            for (let i = 0; i <= n; i++) {
              const w = api.x0 + ((api.x1 - api.x0) * i) / n;
              xs[i] = w;
              ys[i] = cabs(sexprEval(L.X, cx(s, w)));
            }
            api.curve(xs, ys, { color: api.colors.series[1], alpha: inside ? 1 : 0.45, dash: inside ? undefined : [6, 4] });
          }}
        />
      </div>
      <Transport clock={clock} label="σ" hotkey className="mt-3" />
      <p className={`mt-2 text-sm ${inside ? "text-foreground/80" : "text-amber-700 dark:text-amber-400"}`}>
        {inside
          ? "Inside the ROC: the integral converges and the curve is X(σ + jω)."
          : "Outside the ROC: the integral diverges; the dashed curve is the formula's value there (its analytic continuation)."}
      </p>
    </Panel>
  );
}

function Inverse() {
  const input = useSss((s) => s.inputs.inverse);
  const set = useSss((s) => s.set);
  const parsed = useParsed(input.text, "s");
  const result = useMemo(() => (parsed.ok ? parseSExpr(parsed.ast, input.params) : null), [parsed, input.params]);
  const [last, setLast] = useState(result?.ok ? result : null);
  if (result?.ok && result !== last) setLast(result);
  const shown = result?.ok ? result : last;
  return (
    <>
      <Panel className="mb-5">
        <MathInput label="X(s)" variable="s" value={input} onChange={(v) => set("inverse", v)} examples={INVERSE_EXAMPLES} />
        {result && !result.ok && (
          <div className="mt-3">
            <Note tone="warn">{result.message}</Note>
          </div>
        )}
      </Panel>
      {shown && <InverseBody X={shown.X} poles={shown.poles} stale={shown !== result} />}
    </>
  );
}

function InverseBody({ X, poles, stale }: { X: SExpr; poles: Root[]; stale: boolean }) {
  const strips = useMemo(() => rocStrips(poles), [poles]);
  const [pick, setPick] = useState(-1);
  const index = pick >= 0 && pick < strips.length ? pick : strips.length - 1;
  const roc = strips[index];
  const inv = useMemo(() => inverseLaplace(X, roc), [X, roc]);
  const zeros = useMemo(() => {
    if (X.length !== 1) return null;
    const { num } = groupRational(X[0]);
    return num.length > 1 ? findRoots(num) : [];
  }, [X]);
  const an = useMemo((): Analysis => ({ kind: "exact", signal: inv.signal, special: [], f: (t) => sigEval(inv.signal, t) }), [inv]);
  const range = useMemo(() => timeRange(an), [an]);
  const yRange = useMemo(() => rangeFor(an, range), [an, range]);
  const describe = (i: number) =>
    strips.length === 1 ? "all s" : i === strips.length - 1 ? "right-sided (causal)" : i === 0 ? "left-sided (anticausal)" : "two-sided";
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Choose the region of convergence">
          <p className="mb-3 text-sm text-muted">The same X(s) has a different x(t) for each ROC. Most problems mean the causal one.</p>
          <div role="radiogroup" aria-label="Region of convergence" className="flex flex-wrap gap-2">
            {strips.map((s, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={i === index}
                onClick={() => setPick(i)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm ${
                  i === index ? "border-accent bg-accent/10" : "border-line bg-panel hover:bg-hover"
                }`}
              >
                <Tex tex={texStrip(s)} />
                <span className="text-xs text-muted">{describe(i)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <SPlane poles={poles} zeros={zeros} roc={roc} />
          </div>
        </Panel>
        <Panel title="x(t) over time">
          <Plot
            x={range}
            y={yRange}
            height={260}
            xLabel="t"
            ariaLabel="The inverse transform x(t)"
            readout={(t) => [{ label: "x(t)", value: fmtReadout(sigEval(inv.signal, t).re) }]}
            draw={(api) => drawSignal(api, an, api.colors.series[0])}
          />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          <Formula tex={`X(s) = ${texSExpr(X, "s")}`} />
          <Formula tex={`x(t) = ${inv.tex}`} />
          <p className="mt-2 text-sm text-muted">
            ROC <Tex tex={texStrip(roc)} />: {describe(index)}
            {roc.lo < 0 && roc.hi > 0 ? ", and stable (the ROC contains the jω axis)." : ", not stable (the ROC misses the jω axis)."}
          </p>
        </Panel>
        <StepsPanel steps={inv.steps} open />
      </div>
    </div>
  );
}


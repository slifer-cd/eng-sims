"use client";

import { useMemo, useState } from "react";
import { dtft, type DtftResult, zPolesZeros, zTransform } from "@/lib/sss/discrete/ztransform";
import { type C, cabs, cexp, cx } from "@/lib/sss/math/complex";
import { nice } from "@/lib/sss/math/nice";
import type { Analysis } from "@/lib/sss/signal/analyze";
import { useSss } from "@/lib/sss/store";
import { useClock, useClockValue } from "../anim/clock";
import { Transport } from "../anim/Transport";
import { fmtReadout, Plot } from "../plot/Plot";
import { drawPoleZero, pzWindow } from "../plot/poleZero";
import { autoRange } from "../plot/ticks";
import { Tex } from "../Tex";
import { Formula, Note, PageHeader, Panel, Segmented, StepsPanel } from "../ui";
import { SeqError, SeqInputPanel, seqValue, useSeq } from "./discrete";

export function DtftView() {
  const dx = useSss((s) => s.inputs.dx);
  const set = useSss((s) => s.set);
  const state = useSeq(dx);
  return (
    <>
      <PageHeader title="Discrete-time Fourier transform">
        <Tex tex="X(e^{j\Omega})=\sum_{n}x[n]\,e^{-j\Omega n}" />: the spectrum of a sequence. It repeats every <Tex tex="2\pi" />, so{" "}
        <Tex tex="-\pi < \Omega \le \pi" /> shows everything.
      </PageHeader>
      <Panel className="mb-5">
        <SeqInputPanel label="x[n]" value={dx} onChange={(v) => set("dx", v)} />
        <SeqError state={state} />
      </Panel>
      {state.shown && <DtftBody an={state.shown} stale={state.stale} />}
    </>
  );
}

/** Numeric DTFT of a sequence by summing a wide window. */
function numericDtft(an: Analysis): (W: number) => C {
  const vals: [number, number][] = [];
  for (let n = -300; n <= 300; n++) {
    const v = seqValue(an, n);
    if (v !== 0) vals.push([n, v]);
  }
  return (W) => {
    let re = 0;
    let im = 0;
    for (const [n, v] of vals) {
      re += v * Math.cos(W * n);
      im -= v * Math.sin(W * n);
    }
    return cx(re, im);
  };
}

function DtftBody({ an, stale }: { an: Analysis; stale: boolean }) {
  const d: DtftResult | null = useMemo(() => (an.kind === "exact" ? dtft(an.signal) : null), [an]);
  const at = useMemo(() => (d?.kind === "exact" ? d.at : numericDtft(an)), [d, an]);
  const [span, setSpan] = useState<"one" | "three">("one");
  const W = span === "one" ? Math.PI : 3 * Math.PI;
  const spec = useMemo(() => {
    const n = 900;
    const w = new Float64Array(n + 1);
    const mag = new Float64Array(n + 1);
    const ph = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const x = -W + (2 * W * i) / n;
      const onImpulse = d?.kind === "exact" && d.impulses.some((imp) => Math.abs(((x - imp.at + Math.PI) % (2 * Math.PI)) - Math.PI) < 1e-9);
      const v = at(x + (onImpulse ? 1e-7 : 0));
      w[i] = x;
      mag[i] = cabs(v);
      ph[i] = Math.atan2(v.im, v.re);
    }
    const peak = Math.max(...Array.from(mag).filter(Number.isFinite));
    for (let i = 0; i <= n; i++) if (mag[i] < 1e-9 * peak) ph[i] = NaN;
    return { w, mag, ph };
  }, [at, W, d]);
  const yMag = useMemo(() => autoRange([...Array.from(spec.mag), ...(d?.kind === "exact" ? d.impulses.map((i) => cabs(i.area)) : [])]), [spec, d]);
  const impulses = useMemo(() => {
    if (d?.kind !== "exact") return [];
    const out: { at: number; height: number; label: string }[] = [];
    for (const imp of d.impulses) for (let l = -2; l <= 2; l++) out.push({ at: imp.at + 2 * Math.PI * l, height: cabs(imp.area), label: cabs(imp.area) / Math.PI === 1 ? "π" : `${nice(cabs(imp.area) / Math.PI).text}π` });
    return out;
  }, [d]);
  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ${stale ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        {d?.kind === "none" ? (
          <Panel title="Spectrum">
            <Note tone="warn">{d.reason}</Note>
          </Panel>
        ) : (
          <Panel
            title="Spectrum"
            actions={
              <Segmented
                label="Range"
                value={span}
                onChange={setSpan}
                options={[
                  { value: "one", label: "−π to π" },
                  { value: "three", label: "Three periods" },
                ]}
              />
            }
          >
            <div className="flex flex-col gap-4">
              <Plot
                x={[-W, W]}
                y={yMag}
                xPi
                height={240}
                xLabel="Ω (rad/sample)"
                xName="Ω"
                ariaLabel="Magnitude of the DTFT"
                legend={[{ label: "|X(e^{jΩ})|", color: "var(--plot-1)" }]}
                readout={(x) => [{ label: "|X|", value: fmtReadout(cabs(at(x))) }]}
                draw={(api) => {
                  api.curve(spec.w, spec.mag, { color: api.colors.series[0] });
                  api.impulses(impulses.filter((i) => i.at >= api.x0 && i.at <= api.x1), api.colors.series[0]);
                }}
              />
              <Plot
                x={[-W, W]}
                y={[-Math.PI * 1.15, Math.PI * 1.15]}
                xPi
                yPi
                height={160}
                xLabel="Ω (rad/sample)"
                xName="Ω"
                ariaLabel="Phase of the DTFT"
                legend={[{ label: "∠X(e^{jΩ}) (rad)", color: "var(--plot-2)" }]}
                draw={(api) => api.curve(spec.w, spec.ph, { color: api.colors.series[1], width: 1.75 })}
              />
            </div>
          </Panel>
        )}
        {d?.kind !== "none" && an.kind === "exact" && <UnitCircle an={an} at={at} yMag={yMag} />}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Result" tone="result">
          {d?.kind === "exact" ? (
            <Formula tex={`X(e^{j\\Omega}) = ${d.tex}`} />
          ) : d?.kind === "none" ? (
            <Note tone="warn">No DTFT. {d.reason}</Note>
          ) : (
            <Note>Summed numerically over −300 ≤ n ≤ 300.</Note>
          )}
        </Panel>
        {d?.kind === "exact" && <StepsPanel steps={d.steps} />}
      </div>
    </div>
  );
}

/** The DTFT is X(z) on the unit circle: sweep z = e^{jΩ} with vectors from the poles and zeros. */
function UnitCircle({ an, at, yMag }: { an: Analysis & { kind: "exact" }; at: (W: number) => C; yMag: [number, number] }) {
  const pz = useMemo(() => zPolesZeros(zTransform(an.signal).terms), [an]);
  const clock = useClock({ from: -Math.PI, to: Math.PI, seconds: 8, initial: 0 });
  const W = useClockValue(clock, (v) => Math.round(v * 100) / 100);
  const win = useMemo(() => pzWindow([...pz.poles.map((p) => p.p), ...pz.zeros.map((z) => z.p)], [1], 1.2), [pz]);
  const mags = useMemo(() => {
    const ws = new Float64Array(601);
    const ms = new Float64Array(601);
    for (let i = 0; i <= 600; i++) {
      ws[i] = -Math.PI + (2 * Math.PI * i) / 600;
      ms[i] = cabs(at(ws[i]));
    }
    return { ws, ms };
  }, [at]);
  const X = at(W);
  return (
    <Panel title="Around the unit circle">
      <p className="mb-3 text-sm text-muted">
        <Tex tex="X(e^{j\Omega})" /> is <Tex tex="X(z)" /> at <Tex tex="z=e^{j\Omega}" />, a point going around the unit circle. Its distance to the poles
        (orange) and zeros (blue) sets the magnitude: close to a pole, it peaks.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Plot
          x={win}
          y={win}
          equal
          height={300}
          clock={clock}
          interactive={false}
          xLabel="Re z"
          ariaLabel="z-plane with the point e^{jΩ}"
          draw={(api) => {
            drawPoleZero(api, { poles: pz.poles, zeros: pz.zeros, zPlane: true });
            const w = clock.get();
            const pt = cexp(cx(0, w));
            const vec = (from: C, color: string) => {
              api.ctx.save();
              api.ctx.strokeStyle = color;
              api.ctx.globalAlpha = 0.8;
              api.ctx.lineWidth = 1.5;
              api.ctx.beginPath();
              api.ctx.moveTo(api.px(from.re), api.py(from.im));
              api.ctx.lineTo(api.px(pt.re), api.py(pt.im));
              api.ctx.stroke();
              api.ctx.restore();
            };
            for (const z of pz.zeros) vec(z.p, api.colors.series[0]);
            for (const p of pz.poles) vec(p.p, api.colors.series[1]);
            api.dot(pt.re, pt.im, api.colors.text, 5);
          }}
        />
        <Plot
          x={[-Math.PI, Math.PI]}
          y={yMag}
          xPi
          height={300}
          clock={clock}
          xLabel="Ω"
          xName="Ω"
          ariaLabel="Magnitude traced as Ω sweeps"
          legend={[{ label: "|X(e^{jΩ})| traced", color: "var(--plot-3)" }]}
          draw={(api) => {
            const w = clock.get();
            api.curve(mags.ws, mags.ms, { color: api.colors.series[2], alpha: 0.2 });
            let n = 0;
            while (n < mags.ws.length && mags.ws[n] <= w) n++;
            api.curve(mags.ws.subarray(0, n), mags.ms.subarray(0, n), { color: api.colors.series[2] });
            api.dot(w, cabs(at(w)), api.colors.series[2]);
          }}
        />
      </div>
      <Transport clock={clock} label="Ω" hotkey className="mt-3" />
      <p className="mt-2 text-sm">
        <Tex tex={`|X(e^{j${fmtReadout(W).replace("−", "-")}})| = ${fmtReadout(cabs(X))}`} />
      </p>
    </Panel>
  );
}

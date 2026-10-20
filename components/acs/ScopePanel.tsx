"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Plot, readColors } from "@/components/sss/plot/Plot";
import { autoRange } from "@/components/sss/plot/ticks";
import {
  QUANTITY_UNIT,
  type Quantity,
  type Trace,
  WINDOWS,
  activeTraces,
  autoWindow,
  sampleAt,
  traceKey,
  useAcsScope,
} from "@/lib/acs/editor/scope";
import { recorder, useAcsSim } from "@/lib/acs/editor/simStore";
import { useAcsEditor } from "@/lib/acs/editor/store";
import { getPart, partProps } from "@/lib/acs/parts";
import { formatSI, siScale } from "@/lib/acs/units";
import type { Circuit } from "@/lib/model/types";

const QUANTITY_NAME: Record<Quantity, string> = { v: "voltage", i: "current", p: "power" };
const SERIES_VARS = [1, 2, 3, 4, 5].map((i) => `var(--plot-${i})`);

function traceName(circuit: Circuit, t: Trace) {
  const comp = circuit.components.find((c) => c.id === t.compId);
  const spec = comp && getPart(comp.chipId);
  if (!comp || !spec) return "?";
  if (spec.id === "probe") return comp.label || String(partProps(spec, comp.props).name) || "Probe";
  return `${comp.label || spec.name} ${QUANTITY_NAME[t.quantity]}`;
}

/** Recorded values over the last window of simulated time, one plot per unit. */
export function ScopePanel() {
  const circuit = useAcsEditor((s) => s.circuit);
  const manual = useAcsScope((s) => s.traces);
  const windowSetting = useAcsScope((s) => s.window);
  const engine = useAcsSim((s) => s.engine);
  useAcsSim((s) => s.version);
  const [open, setOpen] = useState(true);

  const traces = useMemo(() => activeTraces(circuit, manual), [circuit, manual]);
  const span = windowSetting === "auto" ? autoWindow(circuit) : windowSetting;
  const now = engine?.time ?? 0;
  const x = siScale(span);
  const colorOf = (t: Trace) => traces.findIndex((u) => traceKey(u) === traceKey(t)) % SERIES_VARS.length;

  const remove = (t: Trace) => {
    const comp = circuit.components.find((c) => c.id === t.compId);
    if (comp?.chipId === "probe") useAcsEditor.getState().updateComponent(comp.id, { props: { plot: false } });
    else useAcsScope.getState().remove(t);
  };

  const groups = (["v", "i", "p"] as Quantity[])
    .map((q) => ({ quantity: q, traces: traces.filter((t) => t.quantity === q) }))
    .filter((g) => g.traces.length > 0);

  return (
    <section aria-label="Scope" className="flex shrink-0 flex-col border-t border-line bg-panel text-sm">
      <header className="flex h-9 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold tracking-wide text-accent uppercase hover:bg-hover"
        >
          Scope
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
        </button>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {traces.map((t) => (
            <li
              key={traceKey(t)}
              className="flex shrink-0 items-center gap-1.5 rounded border border-line bg-background py-0.5 pr-0.5 pl-2 text-xs dark:bg-canvas"
            >
              <span className="size-2 rounded-full" style={{ background: SERIES_VARS[colorOf(t)] }} />
              {traceName(circuit, t)}
              <button
                type="button"
                title="Take off the scope"
                aria-label={`Take ${traceName(circuit, t)} off the scope`}
                onClick={() => remove(t)}
                className="rounded p-0.5 text-muted hover:bg-hover hover:text-foreground"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          Window
          <select
            value={String(windowSetting)}
            onChange={(e) => useAcsScope.getState().setWindow(e.target.value === "auto" ? "auto" : (Number(e.target.value) as never))}
            className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-xs text-foreground"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={String(w)}>
                {w === "auto" ? `Auto (${formatSI(autoWindow(circuit), "s")})` : formatSI(w, "s")}
              </option>
            ))}
          </select>
        </label>
      </header>
      {open && (
        <div className="max-h-[38vh] overflow-y-auto px-3 pb-2">
          {groups.length === 0 ? (
            <p className="py-3 text-xs text-muted">
              Place a probe on a node, or select a part and use the V, I and P buttons in the right bar, to plot it here.
            </p>
          ) : (
            groups.map((g) => {
              const series = g.traces.map((t) => ({ t, ...recorder.series(traceKey(t), now - span) }));
              let max = 0;
              for (const s of series) for (const v of s.ys) max = Math.max(max, Math.abs(v));
              const y = siScale(max);
              const unit = `${y.prefix}${QUANTITY_UNIT[g.quantity]}`;
              const range = autoRange(
                series.flatMap((s) => Array.from(s.ys, (v) => v * y.factor)),
                { includeZero: true },
              );
              return (
                <Plot
                  key={g.quantity}
                  x={[-span * x.factor, 0]}
                  y={range}
                  height={150}
                  xLabel={`t − now (${x.prefix}s)`}
                  xName={`t (${x.prefix}s)`}
                  ariaLabel={`Scope: ${QUANTITY_NAME[g.quantity]} over the last ${formatSI(span, "s")}`}
                  readout={(at) => {
                    // The hover box is drawn on the canvas, which can't use CSS vars.
                    const colors = readColors(document.documentElement).series;
                    return series.map((s) => {
                      const v = sampleAt(s.ts, s.ys, now + at / x.factor);
                      return {
                        label: traceName(circuit, s.t),
                        value: v === undefined ? "–" : formatSI(v, QUANTITY_UNIT[g.quantity]),
                        color: colors[colorOf(s.t)],
                      };
                    });
                  }}
                  draw={(api) => {
                    api.label(unit, api.x0, range[1], { align: "left", baseline: "top", dx: 4, dy: 2, color: api.colors.muted });
                    for (const s of series) {
                      const xs = Array.from(s.ts, (t) => (t - now) * x.factor);
                      const ys = Array.from(s.ys, (v) => v * y.factor);
                      api.curve(xs, ys, { color: api.colors.series[colorOf(s.t)], width: 2 });
                    }
                  }}
                />
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

import { create } from "zustand";
import type { Circuit } from "../../model/types";
import { getPart, partProps } from "../parts";
import type { Engine } from "../sim/engine";

/*
 * The scope: values recorded over simulated time for every probe that plots, and for the
 * parts' voltages, currents and powers added from the inspector.
 */

export type Quantity = "v" | "i" | "p";

export interface Trace {
  compId: string;
  quantity: Quantity;
}

export const QUANTITY_UNIT: Record<Quantity, string> = { v: "V", i: "A", p: "W" };
export const traceKey = (t: Trace) => `${t.compId}:${t.quantity}`;

/** Simulated seconds shown across the scope. "auto" fits the circuit (see `autoWindow`). */
export const WINDOWS = ["auto", 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.2, 0.5, 1, 2, 5, 10] as const;
export type ScopeWindow = (typeof WINDOWS)[number];

const AC_SOURCES = new Set(["vac", "vrail-ac", "iac", "irail-ac"]);

/** Probes that plot (in circuit order), then the traces added by hand; only parts that exist. */
export function activeTraces(circuit: Circuit, manual: readonly Trace[]): Trace[] {
  const ids = new Set(circuit.components.map((c) => c.id));
  const out: Trace[] = [];
  const seen = new Set<string>();
  const add = (t: Trace) => {
    if (!ids.has(t.compId) || seen.has(traceKey(t))) return;
    seen.add(traceKey(t));
    out.push(t);
  };
  for (const c of circuit.components) {
    const spec = c.chipId === "probe" ? getPart("probe") : undefined;
    if (spec && partProps(spec, c.props).plot) add({ compId: c.id, quantity: "v" });
  }
  for (const t of manual) add(t);
  return out;
}

/** Two periods of the slowest AC source, or 100 ms when there is none. */
export function autoWindow(circuit: Circuit): number {
  let slowest = Infinity;
  for (const c of circuit.components) {
    const spec = AC_SOURCES.has(c.chipId) ? getPart(c.chipId) : undefined;
    if (spec) slowest = Math.min(slowest, partProps(spec, c.props).frequency as number);
  }
  return Number.isFinite(slowest) ? 2 / slowest : 0.1;
}

/** The value of the sample nearest time `t` (samples sorted by time). */
export function sampleAt(ts: ArrayLike<number>, ys: ArrayLike<number>, t: number): number | undefined {
  if (ts.length === 0) return undefined;
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(ts[lo] - t) <= Math.abs(ts[hi] - t) ? ys[lo] : ys[hi];
}

/** Samples (t, y) in a ring buffer that keeps the newest `capacity`. */
export class TraceBuffer {
  private t: Float64Array;
  private y: Float64Array;
  private start = 0;
  length = 0;

  constructor(readonly capacity: number) {
    this.t = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
  }

  push(t: number, y: number) {
    const i = (this.start + this.length) % this.capacity;
    this.t[i] = t;
    this.y[i] = y;
    if (this.length < this.capacity) this.length++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Samples from time `from` on, plus the one just before, so a line can start at `from`. */
  since(from: number) {
    let first = this.length;
    for (let k = 0; k < this.length; k++) {
      if (this.t[(this.start + k) % this.capacity] >= from) {
        first = k;
        break;
      }
    }
    first = Math.max(0, first - 1);
    const n = this.length - first;
    const ts = new Float64Array(n), ys = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const i = (this.start + first + k) % this.capacity;
      ts[k] = this.t[i];
      ys[k] = this.y[i];
    }
    return { ts, ys };
  }
}

/** Records the traces' values as the simulation steps. */
export class Recorder {
  private buffers = new Map<string, TraceBuffer>();
  private last = -Infinity;
  private engine: Engine | null = null;

  constructor(private capacity = 8192) {}

  /** Record each trace's value now, unless less than `minGap` seconds passed since the last record. */
  record(engine: Engine, traces: readonly Trace[], minGap: number) {
    // Another engine (after an edit) carries the time on; one that isn't ahead is a new run.
    if (engine !== this.engine && engine.time <= this.last) this.clear();
    this.engine = engine;
    if (engine.time - this.last < minGap * (1 - 1e-6)) return;
    this.last = engine.time;
    for (const t of traces) {
      const v = engine.measure(t.compId, t.quantity);
      if (v === undefined) continue;
      const key = traceKey(t);
      if (!this.buffers.has(key)) this.buffers.set(key, new TraceBuffer(this.capacity));
      this.buffers.get(key)!.push(engine.time, v);
    }
  }

  series(key: string, from: number) {
    return this.buffers.get(key)?.since(from) ?? { ts: new Float64Array(0), ys: new Float64Array(0) };
  }

  clear() {
    this.buffers.clear();
    this.last = -Infinity;
    this.engine = null;
  }
}

export interface ScopeSettings {
  /** Traces added by hand; probes plot through their own "Plot" field. */
  traces: Trace[];
  window: ScopeWindow;
}

const QUANTITIES: readonly string[] = ["v", "i", "p"];

/** Scope settings from a draft, without the traces and window it can't read. */
export function repairScope(raw: unknown): ScopeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const traces = (Array.isArray(r.traces) ? r.traces : []).filter(
    (t): t is Trace => !!t && typeof t.compId === "string" && QUANTITIES.includes(t.quantity),
  );
  const window = (WINDOWS as readonly unknown[]).includes(r.window) ? (r.window as ScopeWindow) : "auto";
  return { traces: traces.map((t) => ({ compId: t.compId, quantity: t.quantity })), window };
}

interface ScopeState extends ScopeSettings {
  add(t: Trace): void;
  remove(t: Trace): void;
  setWindow(w: ScopeWindow): void;
  load(s: ScopeSettings): void;
}

export const useAcsScope = create<ScopeState>()((set) => ({
  traces: [],
  window: "auto",
  add: (t) => set((s) => (s.traces.some((x) => traceKey(x) === traceKey(t)) ? s : { traces: [...s.traces, t] })),
  remove: (t) => set((s) => ({ traces: s.traces.filter((x) => traceKey(x) !== traceKey(t)) })),
  setWindow: (window) => set({ window }),
  load: (s) => set(s),
}));

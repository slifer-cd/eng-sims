import type { PrimitiveSpec } from "./builtins";
import { getBuiltin } from "./builtins";
import { type Netlist, pinKey, wireKey } from "./compile";
import { type Value, equals, floating, make, resolveAll, zeros } from "./value";

export interface EngineOptions {
  /** Evaluation budget per settle before the circuit is declared oscillating. */
  maxEvaluations?: number;
  /** Initial top-level input values by component id. */
  inputs?: ReadonlyMap<string, Value>;
  /**
   * Engine for an earlier version of the same circuit. Its time, input values and the
   * outputs of primitives that still exist carry over, so latches keep their state across edits.
   */
  previous?: Engine;
}

/**
 * Event-driven simulator. Primitives whose input nets changed are queued FIFO and
 * evaluated one at a time against current net values until nothing changes.
 * Evaluating one at a time breaks the symmetry of cross-coupled gates, so latches
 * built from gates settle instead of oscillating forever.
 */
export class Engine {
  readonly netlist: Netlist;
  time = 0;
  /** True when the last settle hit the evaluation budget (e.g. a ring oscillator). */
  oscillating = false;

  private specs: PrimitiveSpec[];
  private netValues: Value[];
  private outValues: Value[][];
  /** Each primitive's own state (see PrimitiveSpec.initialState), or undefined. */
  private states: unknown[];
  /** Primitive index by instance key (path + component id). */
  private primByInstance: Map<string, number>;
  private inputValues = new Map<number, Value>();
  private queue: number[] = [];
  private queued: Uint8Array;
  private maxEvaluations: number;

  constructor(netlist: Netlist, options: EngineOptions = {}) {
    this.netlist = netlist;
    const { prims, nets } = netlist;
    this.specs = prims.map((p) => getBuiltin(p.specId)!);
    this.maxEvaluations = options.maxEvaluations ?? Math.max(10_000, prims.length * 100);
    this.queued = new Uint8Array(prims.length);
    this.primByInstance = new Map(prims.map((p, i) => [p.path + p.compId, i]));

    const prev = options.previous?.outputsByInstance();
    this.outValues = prims.map((p, i) => {
      const initial = this.specs[i].initial?.(p.props);
      const old = prev?.get(p.path + p.compId);
      return p.outputs.map((n, k) => {
        const kept = old?.specId === p.specId ? old.values[k] : undefined;
        if (kept && kept.width === nets[n].width) return kept;
        return initial?.[k] ?? zeros(nets[n].width);
      });
    });
    this.states = prims.map((p, i) => {
      const old = prev?.get(p.path + p.compId);
      return old?.specId === p.specId && old.state !== undefined ? old.state : this.specs[i].initialState?.(p.props);
    });
    if (options.previous) this.time = options.previous.time;
    for (const [compId, value] of options.inputs ?? options.previous?.inputSnapshot() ?? []) {
      const idx = netlist.inputs.get(compId);
      if (idx !== undefined) this.inputValues.set(idx, value);
    }
    this.netValues = nets.map((n) => this.resolveNet(n.id));
    prims.forEach((_, i) => this.enqueue(i));
    this.settle();
  }

  setInput(compId: string, value: Value) {
    const idx = this.netlist.inputs.get(compId);
    if (idx === undefined) return;
    this.inputValues.set(idx, value);
    this.enqueue(idx);
    this.settle();
  }

  getInput(compId: string): Value | undefined {
    const idx = this.netlist.inputs.get(compId);
    return idx === undefined ? undefined : this.inputValues.get(idx);
  }

  /** Top-level input values by component id, to carry over into a recompiled engine. */
  inputSnapshot(): Map<string, Value> {
    const out = new Map<string, Value>();
    for (const [compId, idx] of this.netlist.inputs) {
      const v = this.inputValues.get(idx);
      if (v) out.set(compId, v);
    }
    return out;
  }

  /** Advance clocks by `n` ticks, settling after each. */
  tick(n = 1) {
    for (let t = 0; t < n; t++) {
      this.time++;
      for (const c of this.netlist.clocks) this.enqueue(c);
      this.settle();
    }
  }

  netValue(netId: number): Value {
    return this.netValues[netId];
  }

  /** Value on a pin. `path` is the instance path ("" for top level, "adder1/" inside a chip). */
  pinValue(path: string, compId: string, pinId: string): Value | undefined {
    const n = this.netlist.netByKey.get(pinKey(path, compId, pinId));
    return n === undefined ? undefined : this.netValues[n];
  }

  /** State of a primitive with `initialState` (e.g. a screen's ScreenState), at any depth. */
  state(path: string, compId: string): unknown {
    const i = this.primByInstance.get(path + compId);
    return i === undefined ? undefined : this.states[i];
  }

  /** Value on a top-level wire. */
  wireValue(wireId: string): Value | undefined {
    const n = this.netlist.netByKey.get(wireKey("", wireId));
    return n === undefined ? undefined : this.netValues[n];
  }

  /** Value shown by a top-level Output Pin. */
  outputValue(compId: string): Value | undefined {
    return this.pinValue("", compId, "in");
  }

  private outputsByInstance() {
    const out = new Map<string, { specId: string; values: Value[]; state: unknown }>();
    this.netlist.prims.forEach((p, i) =>
      out.set(p.path + p.compId, { specId: p.specId, values: this.outValues[i], state: this.states[i] }),
    );
    return out;
  }

  private enqueue(i: number) {
    if (this.queued[i]) return;
    this.queued[i] = 1;
    this.queue.push(i);
  }

  private resolveNet(netId: number): Value {
    const net = this.netlist.nets[netId];
    if (net.drivers.length === 0) return floating(net.width);
    return resolveAll(
      net.width,
      net.drivers.map((d) => this.outValues[d.prim][d.out]),
    );
  }

  private settle() {
    const { prims, nets } = this.netlist;
    let evaluations = 0;
    let head = 0;
    this.oscillating = false;

    while (head < this.queue.length) {
      if (++evaluations > this.maxEvaluations) {
        this.oscillating = true;
        for (let j = head; j < this.queue.length; j++) this.queued[this.queue[j]] = 0;
        break;
      }
      const i = this.queue[head++];
      this.queued[i] = 0;
      const prim = prims[i];
      const outs = this.specs[i].evaluate(
        prim.inputs.map((n) => this.netValues[n]),
        prim.props,
        { time: this.time, input: this.inputValues.get(i), state: this.states[i] },
      );
      outs.forEach((raw, k) => {
        const netId = prim.outputs[k];
        const width = nets[netId].width;
        const value = raw.width === width ? raw : make(width, raw.v, raw.z, raw.x);
        if (equals(value, this.outValues[i][k])) return;
        this.outValues[i][k] = value;
        const resolved = this.resolveNet(netId);
        if (equals(resolved, this.netValues[netId])) return;
        this.netValues[netId] = resolved;
        for (const r of nets[netId].readers) this.enqueue(r);
      });
    }
    this.queue = [];
  }
}

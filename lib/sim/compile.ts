import type { ChipDef, Circuit, Endpoint, Props } from "../model/types";
import { builtinProps, getBuiltin } from "./builtins";

/** Looks up custom chips by id. Built-ins are resolved separately. */
export interface ChipLibrary {
  get(id: string): ChipDef | undefined;
}

export function chipLibrary(chips: Iterable<ChipDef>): ChipLibrary {
  const byId = new Map([...chips].map((c) => [c.id, c]));
  return { get: (id) => byId.get(id) };
}

export interface Primitive {
  specId: string;
  /** Instance path of the containing circuit, "" at top level, e.g. "adder1/". */
  path: string;
  compId: string;
  props: Props;
  /** Net id per input / output pin, in pin order. */
  inputs: number[];
  outputs: number[];
}

export interface Net {
  id: number;
  width: number;
  drivers: { prim: number; out: number }[];
  /** Primitives reading this net (deduplicated). */
  readers: number[];
}

export interface CompileError {
  path: string;
  message: string;
}

export interface Netlist {
  prims: Primitive[];
  nets: Net[];
  /** Net id for every pin key (see pinKey) and wire key. */
  netByKey: Map<string, number>;
  /** Top-level Input Pin component id → primitive index. */
  inputs: Map<string, number>;
  clocks: number[];
  errors: CompileError[];
}

export const pinKey = (path: string, compId: string, pinId: string) => `${path}${compId}.${pinId}`;
export const wireKey = (path: string, wireId: string) => `${path}~${wireId}`;

class UnionFind {
  private parent = new Map<string, string>();
  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  has(k: string) {
    return this.parent.has(k);
  }
  find(k: string): string {
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    // Path compression.
    while (k !== r) {
      const next = this.parent.get(k)!;
      this.parent.set(k, r);
      k = next;
    }
    return r;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
  keys() {
    return this.parent.keys();
  }
}

interface PendingPrim {
  specId: string;
  path: string;
  compId: string;
  props: Props;
  inKeys: string[];
  outKeys: string[];
}

/**
 * Flatten `top` and every custom chip inside it into primitives connected by nets.
 * Input/Output Pins inside custom chips are not primitives: their nets merge with
 * the parent's nets at the chip's pins.
 */
export function compile(top: Circuit, library: ChipLibrary): Netlist {
  const uf = new UnionFind();
  const widths = new Map<string, number>();
  const pending: PendingPrim[] = [];
  const errors: CompileError[] = [];

  const addPin = (key: string, width: number) => {
    uf.add(key);
    widths.set(key, width);
  };

  function walk(circuit: Circuit, path: string, stack: string[]) {
    const isTop = path === "";

    for (const comp of circuit.components) {
      const spec = getBuiltin(comp.chipId);
      if (spec) {
        const props = builtinProps(spec, comp.props);
        const pins = spec.pins(props);
        for (const p of pins) addPin(pinKey(path, comp.id, p.id), p.width);
        const isBoundary = comp.chipId === "input" || comp.chipId === "output";
        if (comp.chipId === "output" || (isBoundary && !isTop)) continue;
        pending.push({
          specId: spec.id,
          path,
          compId: comp.id,
          props,
          inKeys: pins.filter((p) => p.dir === "in").map((p) => pinKey(path, comp.id, p.id)),
          outKeys: pins.filter((p) => p.dir === "out").map((p) => pinKey(path, comp.id, p.id)),
        });
        continue;
      }

      const chip = library.get(comp.chipId);
      if (!chip) {
        errors.push({ path: path + comp.id, message: `Unknown chip "${comp.chipId}"` });
        continue;
      }
      if (stack.includes(chip.id)) {
        errors.push({ path: path + comp.id, message: `Chip "${chip.name}" contains itself` });
        continue;
      }
      const childPath = `${path}${comp.id}/`;
      walk(chip.circuit, childPath, [...stack, chip.id]);
      for (const p of chip.pins) {
        const outer = pinKey(path, comp.id, p.id);
        const inner = pinKey(childPath, p.id, p.dir === "in" ? "out" : "in");
        addPin(outer, p.width);
        if (uf.has(inner)) uf.union(outer, inner);
        else errors.push({ path: path + comp.id, message: `Pin "${p.name}" of "${chip.name}" no longer exists` });
      }
    }

    for (const w of circuit.wires) uf.add(wireKey(path, w.id));
    const endpointKey = (e: Endpoint) =>
      e.kind === "pin" ? pinKey(path, e.compId, e.pinId) : wireKey(path, e.wireId);
    for (const w of circuit.wires) {
      for (const e of [w.a, w.b]) {
        const k = endpointKey(e);
        if (uf.has(k)) uf.union(wireKey(path, w.id), k);
        else errors.push({ path: path + w.id, message: "Wire is attached to a missing pin" });
      }
    }
  }

  walk(top, "", []);

  // Group keys into nets and check that all pins on a net agree on width.
  const netByRoot = new Map<string, number>();
  const netByKey = new Map<string, number>();
  const nets: Net[] = [];
  for (const k of uf.keys()) {
    const root = uf.find(k);
    let id = netByRoot.get(root);
    if (id === undefined) {
      id = nets.length;
      netByRoot.set(root, id);
      nets.push({ id, width: 0, drivers: [], readers: [] });
    }
    netByKey.set(k, id);
    const w = widths.get(k);
    if (w === undefined) continue;
    const net = nets[id];
    if (net.width === 0) net.width = w;
    else if (net.width !== w) {
      errors.push({ path: k, message: `Width mismatch: ${w}-bit pin on a ${net.width}-bit net` });
    }
  }
  for (const net of nets) if (net.width === 0) net.width = 1;

  const prims: Primitive[] = [];
  const inputs = new Map<string, number>();
  const clocks: number[] = [];
  for (const p of pending) {
    const idx = prims.length;
    const prim: Primitive = {
      specId: p.specId,
      path: p.path,
      compId: p.compId,
      props: p.props,
      inputs: p.inKeys.map((k) => netByKey.get(k)!),
      outputs: p.outKeys.map((k) => netByKey.get(k)!),
    };
    prims.push(prim);
    prim.outputs.forEach((n, out) => nets[n].drivers.push({ prim: idx, out }));
    for (const n of new Set(prim.inputs)) nets[n].readers.push(idx);
    if (p.specId === "input") inputs.set(p.compId, idx);
    if (p.specId === "clock") clocks.push(idx);
  }

  return { prims, nets, netByKey, inputs, clocks, errors };
}

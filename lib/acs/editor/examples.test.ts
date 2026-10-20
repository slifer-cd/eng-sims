import { describe, expect, it } from "vitest";
import { getPart } from "../parts";
import { compileCircuit } from "../sim/compile";
import { Engine } from "../sim/engine";
import { repairCircuit } from "./draft";
import { EXAMPLES } from "./examples";
import { activeTraces } from "./scope";
import { DEFAULT_SETTINGS } from "./settings";

describe("examples", () => {
  it("have unique ids", () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))("%s compiles cleanly with every terminal wired", (_, example) => {
    const { circuit } = example;
    expect(repairCircuit(structuredClone(circuit))).toEqual(circuit);
    const netlist = compileCircuit(circuit);
    expect(netlist.errors).toEqual([]);
    expect(netlist.warnings).toEqual([]);
    const wired = new Set(circuit.wires.flatMap((w) => [w.a, w.b]).flatMap((e) => (e.kind === "pin" ? [`${e.compId}.${e.pinId}`] : [])));
    for (const c of circuit.components) {
      for (const t of getPart(c.chipId)!.terminals) expect(wired.has(`${c.id}.${t.id}`), `${c.id}.${t.id}`).toBe(true);
    }
    const wireIds = new Set(circuit.wires.map((w) => w.id));
    for (const w of circuit.wires) for (const e of [w.a, w.b]) if (e.kind === "wire") expect(wireIds.has(e.wireId)).toBe(true);
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))("%s runs and has something on the scope", (_, example) => {
    const e = new Engine(compileCircuit(example.circuit), { settings: { dt: example.settings?.dt ?? DEFAULT_SETTINGS.dt } });
    for (let i = 0; i < 2000; i++) expect(e.step(), e.error?.message).toBe(true);
    const traces = activeTraces(example.circuit, example.scope?.traces ?? []);
    expect(traces.length).toBeGreaterThan(0);
    for (const t of traces) expect(Number.isFinite(e.measure(t.compId, t.quantity))).toBe(true);
  });
});

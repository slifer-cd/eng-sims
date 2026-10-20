import { describe, expect, it } from "vitest";
import type { Circuit } from "../../model/types";
import { CircuitBuilder } from "../../sim/test-utils";
import { compileCircuit } from "./compile";
import { GROUND } from "./element";
import { Engine } from "./engine";

/** The current into every part at every terminal sums to (almost) zero at each node. */
function expectKcl(circuit: Circuit, steps: number, dt = 1e-5) {
  const netlist = compileCircuit(circuit);
  expect(netlist.errors).toEqual([]);
  const e = new Engine(netlist, { settings: { dt } });
  for (let i = 0; i < steps; i++) expect(e.step(), e.error?.message).toBe(true);
  const sums = new Map<number, number>();
  let largest = 0;
  for (const [compId, nodes] of netlist.terminals) {
    const currents = e.terminalCurrents(compId);
    if (!currents) continue;
    expect(currents).toHaveLength(nodes.length);
    nodes.forEach((n, k) => {
      largest = Math.max(largest, Math.abs(currents[k]));
      if (n !== GROUND) sums.set(n, (sums.get(n) ?? 0) + currents[k]);
    });
  }
  expect(largest).toBeGreaterThan(1e-4);
  for (const total of sums.values()) expect(Math.abs(total)).toBeLessThan(1e-6 * largest + 1e-9);
}

describe("terminal currents", () => {
  it("balance at every node of a transistor amplifier with AC coupling", () => {
    const b = new CircuitBuilder();
    const vcc = b.add("vrail-dc", { v: 12 }), sig = b.add("vac", { amplitude: 0.01, frequency: 1e3 });
    const cin = b.add("capacitor", { c: 1e-6 }), r1 = b.add("resistor", { r: 100e3 }), r2 = b.add("resistor", { r: 22e3 });
    const rc = b.add("resistor", { r: 4.7e3 }), re = b.add("resistor", { r: 1e3 }), q = b.add("npn"), g = b.add("ground");
    b.wire([sig, "p"], [cin, "a"]);
    b.wire([cin, "b"], [q, "b"]);
    b.wire([vcc, "p"], [r1, "a"]);
    b.wire([r1, "b"], [q, "b"]);
    b.wire([q, "b"], [r2, "a"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([vcc, "p"], [rc, "a"]);
    b.wire([rc, "b"], [q, "c"]);
    b.wire([q, "e"], [re, "a"]);
    b.wire([re, "b"], [g, "g"]);
    b.wire([sig, "n"], [g, "g"]);
    expectKcl(b.circuit, 300);
  });

  it("balance around op-amps, FETs, diodes and switches", () => {
    const b = new CircuitBuilder();
    const s = b.add("vac", { amplitude: 2, frequency: 500 }), rin = b.add("resistor"), rf = b.add("resistor", { r: 3e3 });
    const a = b.add("opamp"), d = b.add("diode"), m = b.add("nmos", { beta: 0.002 }), rd = b.add("resistor", { r: 2e3 });
    const vdd = b.add("vdc", { v: 9 }), sw = b.add("switch2"), z = b.add("zener", { vz: 3.3 }), j = b.add("njfet");
    const g = b.add("ground");
    b.wire([s, "p"], [rin, "a"]);
    b.wire([rin, "b"], [a, "minus"]);
    b.wire([a, "minus"], [rf, "a"]);
    b.wire([rf, "b"], [a, "out"]);
    b.wire([a, "plus"], [g, "g"]);
    b.wire([a, "out"], [d, "a"]);
    b.wire([d, "k"], [m, "g"]);
    b.wire([m, "g"], [z, "k"]);
    b.wire([z, "a"], [g, "g"]);
    b.wire([vdd, "p"], [sw, "com"]);
    b.wire([sw, "a"], [rd, "a"]);
    b.wire([rd, "b"], [m, "d"]);
    b.wire([m, "s"], [g, "g"]);
    b.wire([sw, "b"], [j, "d"]);
    b.wire([j, "g"], [g, "g"]);
    b.wire([j, "s"], [g, "g"]);
    b.wire([vdd, "n"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    // 3.25 ms: a peak of the 500 Hz input, not a zero crossing.
    expectKcl(b.circuit, 325);
  });

  it("balance through relays, transformers, inductors and current sources", () => {
    const b = new CircuitBuilder();
    const drive = b.add("vac", { amplitude: 6, frequency: 50 }), k = b.add("relay"), t = b.add("transformer", { ratio: 2 });
    const l = b.add("inductor", { l: 0.1 }), r = b.add("resistor", { r: 100 }), i = b.add("iac", { amplitude: 1e-3, frequency: 200 });
    const ri = b.add("resistor", { r: 1e3 }), load = b.add("resistor", { r: 500 }), btn = b.add("button", { normally: "closed" });
    const g = b.add("ground");
    b.wire([drive, "p"], [k, "c1"]);
    b.wire([k, "c2"], [g, "g"]);
    b.wire([drive, "p"], [k, "com"]);
    b.wire([k, "nc"], [t, "p1"]);
    b.wire([k, "no"], [t, "p1"]);
    b.wire([t, "p2"], [g, "g"]);
    b.wire([t, "s1"], [l, "a"]);
    b.wire([l, "b"], [load, "a"]);
    b.wire([load, "b"], [t, "s2"]);
    b.wire([t, "s2"], [btn, "a"]);
    b.wire([btn, "b"], [g, "g"]);
    b.wire([drive, "n"], [g, "g"]);
    b.wire([i, "p"], [ri, "a"]);
    b.wire([ri, "b"], [r, "a"]);
    b.wire([r, "b"], [i, "n"]);
    b.wire([i, "n"], [g, "g"]);
    expectKcl(b.circuit, 1500);
  });
});

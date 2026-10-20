import { describe, expect, it } from "vitest";
import { CircuitBuilder } from "../../sim/test-utils";
import { type Netlist, compileCircuit } from "./compile";
import { type Element, GROUND } from "./element";
import { Engine } from "./engine";

function engineFor(b: CircuitBuilder, previous?: Engine) {
  const netlist = compileCircuit(b.circuit);
  expect(netlist.errors).toEqual([]);
  return new Engine(netlist, { previous });
}

describe("DC circuits", () => {
  it("divides a voltage", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 10 }), r1 = b.add("resistor", { r: 1000 }), r2 = b.add("resistor", { r: 3000 });
    const g = b.add("ground"), probe = b.add("probe");
    b.wire([v, "p"], [r1, "a"]);
    const mid = b.wire([r1, "b"], [r2, "a"]);
    b.junction(mid, [probe, "in"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b);
    expect(e.pinVoltage(probe, "in")).toBeCloseTo(7.5, 6);
    expect(e.step()).toBe(true);
    expect(e.pinVoltage(probe, "in")).toBeCloseTo(7.5, 6);
  });

  it("reports the largest node voltage, ignoring branch currents", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: -12 }), r = b.add("resistor", { r: 0.001 }), g = b.add("ground");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    expect(engineFor(b).maxVoltage()).toBeCloseTo(12, 6);
  });

  it("solves an unbalanced Wheatstone bridge", () => {
    // Hand solution: A = 80/14.5 V, B = 2.5·A − 10 V. Every node leaks GMIN to ground, so
    // results match to about R·GMIN ≈ 1e-9 relative.
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 10 }), g = b.add("ground");
    const r1 = b.add("resistor", { r: 1e3 }), r2 = b.add("resistor", { r: 2e3 });
    const r3 = b.add("resistor", { r: 3e3 }), r4 = b.add("resistor", { r: 1e3 });
    const rg = b.add("resistor", { r: 1e3 });
    b.wire([v, "p"], [r1, "a"]);
    b.wire([v, "p"], [r3, "a"]);
    b.wire([r1, "b"], [r2, "a"]);
    b.wire([r3, "b"], [r4, "a"]);
    b.wire([r1, "b"], [rg, "a"]);
    b.wire([r3, "b"], [rg, "b"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([r4, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b);
    const a = 80 / 14.5;
    expect(e.pinVoltage(rg, "a")).toBeCloseTo(a, 6);
    expect(e.pinVoltage(rg, "b")).toBeCloseTo(2.5 * a - 10, 6);
    expect(e.readout(rg)!.i! * 1e3).toBeCloseTo(a - (2.5 * a - 10), 6);
  });

  it("pushes a current source's current out of its + terminal", () => {
    const b = new CircuitBuilder();
    const i = b.add("idc", { i: 2e-3 }), r = b.add("resistor", { r: 1e3 }), g = b.add("ground");
    b.wire([i, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([i, "n"], [g, "g"]);
    expect(engineFor(b).pinVoltage(r, "a")).toBeCloseTo(2, 6);
  });

  it("drives nodes from rails", () => {
    const b = new CircuitBuilder();
    const v = b.add("vrail-dc", { v: 5 }), r1 = b.add("resistor"), r2 = b.add("resistor"), g = b.add("ground");
    const i = b.add("irail-dc", { i: 1e-3 }), r3 = b.add("resistor", { r: 2e3 });
    b.wire([v, "p"], [r1, "a"]);
    b.wire([r1, "b"], [r2, "a"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([i, "p"], [r3, "a"]);
    b.wire([r3, "b"], [g, "g"]);
    const e = engineFor(b);
    expect(e.pinVoltage(r1, "b")).toBeCloseTo(2.5, 6);
    expect(e.pinVoltage(r3, "a")).toBeCloseTo(2, 6);
  });

  it("conserves power: sources deliver what resistors absorb", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 12 }), r1 = b.add("resistor", { r: 100 }), r2 = b.add("resistor", { r: 200 }), g = b.add("ground");
    b.wire([v, "p"], [r1, "a"]);
    b.wire([r1, "b"], [r2, "a"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b);
    const [pv, p1, p2] = [v, r1, r2].map((id) => e.readout(id)!.p!);
    expect(p1).toBeCloseTo(0.04 ** 2 * 100, 6);
    // The tiny leak (GMIN) on each node absorbs the rest.
    expect(pv).toBeCloseTo(-(p1 + p2), 6);
    expect(e.readout(v)!.i).toBeCloseTo(-0.04, 6);
  });
});

describe("measure", () => {
  it("measures a part's voltage, current or power, and a probe's node voltage", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 6 }), r = b.add("resistor", { r: 2e3 }), g = b.add("ground"), p = b.add("probe");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    b.wire([p, "in"], [r, "a"]);
    const e = engineFor(b);
    expect(e.measure(r, "v")).toBeCloseTo(6, 6);
    expect(e.measure(r, "i")).toBeCloseTo(3e-3, 9);
    expect(e.measure(r, "p")).toBeCloseTo(18e-3, 9);
    expect(e.measure(p, "v")).toBeCloseTo(6, 6);
    expect(e.measure(p, "i")).toBeUndefined();
    expect(e.measure("gone", "v")).toBeUndefined();
  });
});

describe("switches", () => {
  function lamp(closed: boolean) {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 5 }), s = b.add("switch", { closed }), r = b.add("resistor", { r: 1e3 }), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    return { b, s, r };
  }

  it("conducts only when closed", () => {
    const { b, s, r } = lamp(false);
    const e = engineFor(b);
    expect(e.readout(r)!.i).toBeCloseTo(0, 9);
    e.setSwitch(s, true);
    expect(e.step()).toBe(true);
    expect(e.readout(r)!.i).toBeCloseTo(5e-3, 9);
    expect(e.readout(s)!.i).toBeCloseTo(5e-3, 9);
    expect(e.readout(s)!.v).toBeCloseTo(0, 9);
  });

  it("keeps a flipped switch across edits until its starting position changes", () => {
    const { b, s, r } = lamp(false);
    const e1 = engineFor(b);
    e1.setSwitch(s, true);
    const e2 = engineFor(b, e1);
    expect(e2.readout(r)!.i).toBeCloseTo(5e-3, 9);
    b.circuit.components.find((c) => c.id === s)!.props.closed = true;
    const e3 = engineFor(b, e2);
    expect(e3.readout(r)!.i).toBeCloseTo(5e-3, 9);
    b.circuit.components.find((c) => c.id === s)!.props.closed = false;
    expect(engineFor(b, e3).readout(r)!.i).toBeCloseTo(0, 9);
  });

  it("reports where each switch is", () => {
    const { b, s, r } = lamp(false);
    const e = engineFor(b);
    expect(e.switchValue(s)).toBe(false);
    e.setSwitch(s, true);
    expect(e.switchValue(s)).toBe(true);
    expect(e.switchValue(r)).toBeUndefined();
  });

  it("throws a two-way switch between its outputs", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 5 }), s = b.add("switch2"), ra = b.add("resistor"), rb = b.add("resistor"), g = b.add("ground");
    b.wire([v, "p"], [s, "com"]);
    b.wire([s, "a"], [ra, "a"]);
    b.wire([s, "b"], [rb, "a"]);
    b.wire([ra, "b"], [g, "g"]);
    b.wire([rb, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b);
    expect([e.readout(ra)!.i, e.readout(rb)!.i].map((i) => +i!.toFixed(9))).toEqual([0.005, 0]);
    e.setSwitch(s, "b");
    e.step();
    expect([e.readout(ra)!.i, e.readout(rb)!.i].map((i) => +i!.toFixed(9))).toEqual([0, 0.005]);
  });

  it("runs again once a shorting switch is opened", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc"), s = b.add("switch", { closed: true }), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [v, "n"]);
    b.wire([v, "n"], [g, "g"]);
    const e = new Engine(compileCircuit(b.circuit));
    expect(e.step()).toBe(false);
    e.setSwitch(s, false);
    expect(e.error).toBeNull();
    expect(e.step()).toBe(true);
  });

  it("stops when opening a switch leaves a current source with no path", () => {
    const b = new CircuitBuilder();
    const i = b.add("idc"), s = b.add("switch", { closed: true }), r = b.add("resistor"), g = b.add("ground");
    b.wire([i, "p"], [s, "a"]);
    b.wire([s, "b"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([i, "n"], [g, "g"]);
    const e = engineFor(b);
    e.setSwitch(s, false);
    expect(e.step()).toBe(false);
    expect(e.error?.compIds).toEqual([i]);
  });

  it("stops with a message when closing a switch shorts a source", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc"), s = b.add("switch"), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [v, "n"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b);
    e.setSwitch(s, true);
    expect(e.step()).toBe(false);
    expect(e.error?.compIds.sort()).toEqual([v, s].sort());
  });
});

describe("time", () => {
  function divider() {
    const b = new CircuitBuilder();
    const v = b.add("vdc"), r = b.add("resistor"), g = b.add("ground");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    return b;
  }

  it("advances by the time step", () => {
    const e = new Engine(compileCircuit(divider().circuit), { settings: { dt: 1e-5 } });
    e.step();
    e.step();
    expect(e.time).toBeCloseTo(2e-5, 15);
  });

  it("runs as many steps as fit in the requested time", () => {
    const e = new Engine(compileCircuit(divider().circuit), { settings: { dt: 1e-5 } });
    expect(e.run(1e-3, 1000)).toEqual({ steps: 100, behind: false });
    expect(e.time).toBeCloseTo(1e-3, 12);
  });

  it("calls back after every step it runs", () => {
    const e = new Engine(compileCircuit(divider().circuit), { settings: { dt: 1e-5 } });
    const times: number[] = [];
    e.run(5e-5, 1000, undefined, () => times.push(e.time));
    expect(times.map((t) => Math.round(t * 1e5))).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives up on the rest of a frame when out of time", () => {
    let clock = 0;
    const e = new Engine(compileCircuit(divider().circuit), { settings: { dt: 1e-5 } });
    const r = e.run(1, 10, () => (clock += 1));
    expect(r.behind).toBe(true);
    expect(r.steps).toBeLessThan(20);
  });

  it("carries time over to the next engine", () => {
    const b = divider();
    const e1 = new Engine(compileCircuit(b.circuit), { settings: { dt: 1e-5 } });
    e1.step();
    expect(new Engine(compileCircuit(b.circuit), { previous: e1 }).time).toBeCloseTo(1e-5, 15);
  });

  it("refuses to run a circuit with errors", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc");
    b.wire([v, "p"], [v, "n"]);
    const e = new Engine(compileCircuit(b.circuit));
    expect(e.step()).toBe(false);
    expect(e.error?.compIds).toEqual([v]);
  });
});

describe("hard steps", () => {
  /** One node with 1 S to ground and a part that only converges once the step is at most `okDt`. */
  function stubborn(okDt: number): Netlist {
    let dt = 0;
    const element: Element = {
      compId: "x",
      nodes: [0],
      nonlinear: true,
      stampIter(s, _x, ctx) {
        dt = ctx.dt;
        s.conductance(0, GROUND, 1);
        s.current(GROUND, 0, 1);
      },
      converged: () => dt <= okDt,
    };
    return {
      size: 1,
      isCurrent: new Uint8Array(1),
      elements: [element],
      parts: new Map([["x", "stub"]]),
      terminals: new Map([["x", [0]]]),
      nodeByKey: new Map([["x.a", 0]]),
      nodeOf: () => 0,
      compsAt: () => ["x"],
      errors: [],
      fixedErrors: [],
      warnings: [],
    };
  }

  it("cuts a step in half until Newton's method converges", () => {
    const e = new Engine(stubborn(2.5e-6), { settings: { dt: 1e-5 } });
    expect(e.step()).toBe(true);
    expect(e.time).toBeCloseTo(1e-5, 15);
    expect(e.pinVoltage("x", "a")).toBeCloseTo(1, 9);
  });

  it("gives up with a message when even tiny steps don't converge", () => {
    const e = new Engine(stubborn(0), { settings: { dt: 1e-5 } });
    expect(e.step()).toBe(false);
    expect(e.error?.message).toMatch(/did not settle/);
    expect(e.error?.compIds).toEqual(["x"]);
  });
});

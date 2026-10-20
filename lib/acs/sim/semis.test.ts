import { describe, expect, it } from "vitest";
import type { Props } from "../../model/types";
import { CircuitBuilder } from "../../sim/test-utils";
import { compileCircuit } from "./compile";
import { Engine } from "./engine";

const VT = 0.025852;

function engineFor(b: CircuitBuilder, dt = 1e-5) {
  const netlist = compileCircuit(b.circuit);
  expect(netlist.errors).toEqual([]);
  const e = new Engine(netlist, { settings: { dt } });
  expect(e.error).toBeNull();
  return e;
}

function steps(e: Engine, n: number) {
  for (let i = 0; i < n; i++) expect(e.step(), e.error?.message).toBe(true);
}

/** Supply → resistor → part (a/k or given pins) → ground. */
function supplyThrough(v: number, r: number, part: string, props: Props = {}, pins = ["a", "k"]) {
  const b = new CircuitBuilder();
  const s = b.add("vdc", { v }), rs = b.add("resistor", { r }), d = b.add(part, props), g = b.add("ground");
  b.wire([s, "p"], [rs, "a"]);
  b.wire([rs, "b"], [d, pins[0]]);
  b.wire([d, pins[1]], [g, "g"]);
  b.wire([s, "n"], [g, "g"]);
  return { b, d };
}

describe("diodes", () => {
  it("drops the Shockley voltage when forward biased", () => {
    const { b, d } = supplyThrough(5, 4300, "diode");
    const e = engineFor(b);
    steps(e, 3);
    const { v, i } = e.readout(d)!;
    expect(i).toBeCloseTo((5 - v!) / 4300, 9);
    expect(v).toBeCloseTo(VT * Math.log(i! / 1e-14 + 1), 4);
    expect(v).toBeGreaterThan(0.6);
    expect(v).toBeLessThan(0.7);
  });

  it("blocks when reverse biased", () => {
    const { b, d } = supplyThrough(-5, 1e3, "diode");
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(d)!.i).toBeLessThan(0);
    expect(e.readout(d)!.i).toBeGreaterThan(-1e-9);
  });

  it("clamps at its breakdown voltage when it is a zener", () => {
    // Cathode up: the zener is reverse biased and regulates.
    const { b, d } = supplyThrough(12, 1e3, "zener", { vz: 5.6 }, ["k", "a"]);
    const e = engineFor(b);
    steps(e, 3);
    expect(-e.readout(d)!.v!).toBeCloseTo(5.6, 1);
    expect(-e.readout(d)!.i!).toBeCloseTo((12 + e.readout(d)!.v!) / 1e3, 9);
  });

  it("rectifies half of a sine wave", () => {
    const b = new CircuitBuilder();
    const s = b.add("vac", { amplitude: 10, frequency: 50 }), d = b.add("diode"), load = b.add("resistor", { r: 1e3 });
    const g = b.add("ground");
    b.wire([s, "p"], [d, "a"]);
    b.wire([d, "k"], [load, "a"]);
    b.wire([load, "b"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    const e = engineFor(b, 2e-5);
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < 2000; i++) {
      expect(e.step()).toBe(true);
      const v = e.readout(load)!.v!;
      hi = Math.max(hi, v);
      lo = Math.min(lo, v);
    }
    expect(hi).toBeGreaterThan(9.2);
    expect(hi).toBeLessThan(9.35);
    expect(lo).toBeGreaterThan(-1e-6);
  });

  it("keeps up with the sharp edges of a square wave", () => {
    const b = new CircuitBuilder();
    const s = b.add("vac", { waveform: "square", amplitude: 20, frequency: 1e3 }), d = b.add("diode");
    const c = b.add("capacitor", { c: 1e-6 }), r = b.add("resistor", { r: 10 }), g = b.add("ground");
    b.wire([s, "p"], [r, "a"]);
    b.wire([r, "b"], [d, "a"]);
    b.wire([d, "k"], [c, "a"]);
    b.wire([c, "b"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    const e = engineFor(b, 1e-5);
    steps(e, 1000);
    expect(e.readout(c)!.v).toBeGreaterThan(18.5);
  });
});

describe("bipolar transistors", () => {
  it("amplifies base current by β in the active region", () => {
    const b = new CircuitBuilder();
    const vcc = b.add("vdc", { v: 10 }), rb = b.add("resistor", { r: 470e3 }), rc = b.add("resistor", { r: 1e3 });
    const q = b.add("npn", { beta: 100 }), g = b.add("ground");
    b.wire([vcc, "p"], [rb, "a"]);
    b.wire([vcc, "p"], [rc, "a"]);
    b.wire([rb, "b"], [q, "b"]);
    b.wire([rc, "b"], [q, "c"]);
    b.wire([q, "e"], [g, "g"]);
    b.wire([vcc, "n"], [g, "g"]);
    const e = engineFor(b);
    steps(e, 3);
    const ib = e.readout(rb)!.i!, ic = e.readout(rc)!.i!;
    expect(ic / ib).toBeCloseTo(100, 0);
    const vbe = e.pinVoltage(q, "b")!;
    expect(vbe).toBeGreaterThan(0.55);
    expect(vbe).toBeLessThan(0.7);
    expect(e.readout(q)!.i).toBeCloseTo(ic, 9);
    expect(e.readout(q)!.v).toBeCloseTo(10 - ic * 1e3, 6);
    // The junction voltages it starts the next step from.
    expect(e.netlist.elements.find((x) => x.compId === q)!.save!()).toEqual({
      vbe: expect.closeTo(vbe, 6),
      vbc: expect.closeTo(vbe - (10 - ic * 1e3), 4),
    });
  });

  it("works the other way round as a PNP", () => {
    const b = new CircuitBuilder();
    const vee = b.add("vdc", { v: 10 }), rb = b.add("resistor", { r: 470e3 }), rc = b.add("resistor", { r: 1e3 });
    const q = b.add("pnp", { beta: 100 }), g = b.add("ground");
    b.wire([vee, "p"], [q, "e"]);
    b.wire([q, "b"], [rb, "a"]);
    b.wire([q, "c"], [rc, "a"]);
    b.wire([rb, "b"], [g, "g"]);
    b.wire([rc, "b"], [g, "g"]);
    b.wire([vee, "n"], [g, "g"]);
    const e = engineFor(b);
    steps(e, 3);
    const ib = e.readout(rb)!.i!, ic = e.readout(rc)!.i!;
    expect(ic / ib).toBeCloseTo(100, 0);
    expect(ic).toBeGreaterThan(1.8e-3);
    expect(e.readout(q)!.i).toBeCloseTo(-ic, 9);
  });
});

/** Gate held at `vg` by a source, drain fed from `vdd` through `rd`, source grounded. */
function fetStage(part: string, props: Props, vg: number, vdd: number, rd: number) {
  const b = new CircuitBuilder();
  const gs = b.add("vdc", { v: vg }), dd = b.add("vdc", { v: vdd }), r = b.add("resistor", { r: rd });
  const m = b.add(part, props), g = b.add("ground");
  b.wire([gs, "p"], [m, "g"]);
  b.wire([dd, "p"], [r, "a"]);
  b.wire([r, "b"], [m, "d"]);
  b.wire([m, "s"], [g, "g"]);
  b.wire([gs, "n"], [g, "g"]);
  b.wire([dd, "n"], [g, "g"]);
  return { b, m, r };
}

describe("MOSFETs", () => {
  it("follows the square law in saturation", () => {
    const { b, m } = fetStage("nmos", { vth: 1.5, beta: 0.002 }, 3, 10, 1e3);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(m)!.i).toBeCloseTo(0.001 * 1.5 ** 2, 7);
  });

  it("acts as a resistor in the linear region", () => {
    const { b, m } = fetStage("nmos", { vth: 1.5, beta: 0.002 }, 3, 10, 10e3);
    const e = engineFor(b);
    steps(e, 3);
    const { v: vds, i: id } = e.readout(m)!;
    expect(vds).toBeLessThan(1.5);
    expect(id).toBeCloseTo(0.002 * (1.5 * vds! - vds! ** 2 / 2), 7);
  });

  it("is off below its threshold", () => {
    const { b, m } = fetStage("nmos", { vth: 1.5, beta: 0.002 }, 1, 10, 1e3);
    const e = engineFor(b);
    steps(e, 3);
    expect(Math.abs(e.readout(m)!.i!)).toBeLessThan(1e-9);
  });

  it("mirrors everything as a PMOS", () => {
    const { b, m } = fetStage("pmos", { vth: 1.5, beta: 0.002 }, -3, -10, 1e3);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(m)!.i).toBeCloseTo(-0.001 * 1.5 ** 2, 7);
  });
});

describe("JFETs", () => {
  it("passes Idss with the gate at the source", () => {
    const { b, m } = fetStage("njfet", { idss: 10e-3, vp: 2 }, 0, 10, 100);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(m)!.i).toBeCloseTo(10e-3, 6);
  });

  it("pinches off as the gate goes negative", () => {
    const { b, m } = fetStage("njfet", { idss: 10e-3, vp: 2 }, -1, 10, 100);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(m)!.i).toBeCloseTo(10e-3 * 0.25, 6);
  });

  it("mirrors everything as a P-channel", () => {
    const { b, m } = fetStage("pjfet", { idss: 10e-3, vp: 2 }, 1, -10, 100);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.readout(m)!.i).toBeCloseTo(-10e-3 * 0.25, 6);
  });
});

describe("op-amps", () => {
  function inverting(vin: number, rf: number, props = {}) {
    const b = new CircuitBuilder();
    const s = b.add("vdc", { v: vin }), rin = b.add("resistor", { r: 1e3 }), f = b.add("resistor", { r: rf });
    const a = b.add("opamp", props), g = b.add("ground");
    b.wire([s, "p"], [rin, "a"]);
    b.wire([rin, "b"], [a, "minus"]);
    b.wire([a, "minus"], [f, "a"]);
    b.wire([f, "b"], [a, "out"]);
    b.wire([a, "plus"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    return { b, a };
  }

  it("amplifies by −Rf/Rin with negative feedback", () => {
    const { b, a } = inverting(1, 10e3);
    const e = engineFor(b);
    steps(e, 3);
    expect(e.pinVoltage(a, "out")).toBeCloseTo(-10, 2);
    expect(Math.abs(e.pinVoltage(a, "minus")!)).toBeLessThan(1e-3);
  });

  it("saturates at its output limit", () => {
    const { b, a } = inverting(1, 100e3, { vmin: -12 });
    const e = engineFor(b);
    steps(e, 3);
    expect(e.pinVoltage(a, "out")).toBeCloseTo(-12, 2);
  });

  it("follows an AC input as a voltage follower, in and out of saturation", () => {
    const b = new CircuitBuilder();
    const s = b.add("vac", { amplitude: 20, frequency: 100 }), a = b.add("opamp"), load = b.add("resistor"), g = b.add("ground");
    b.wire([s, "p"], [a, "plus"]);
    b.wire([a, "out"], [a, "minus"]);
    b.wire([a, "out"], [load, "a"]);
    b.wire([load, "b"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    const e = engineFor(b, 2e-5);
    for (let i = 0; i < 1000; i++) {
      expect(e.step(), e.error?.message).toBe(true);
      const vin = e.pinVoltage(s, "p")!, vout = e.pinVoltage(a, "out")!;
      expect(vout).toBeCloseTo(Math.max(-15, Math.min(15, vin)), 1);
    }
    // Saturating should cost a few iterations per step, not a crawl to the rail.
    expect(e.iterations).toBeLessThan(5000);
  });

  it("finds its way out of the wrong rail with feedback", () => {
    // An inverting amp whose input jumps across zero: the first guess has the output on the
    // wrong rail, where the limiter is flat and plain Newton would bounce between rails.
    const b = new CircuitBuilder();
    const s = b.add("vac", { waveform: "square", amplitude: 1, frequency: 50 }), rin = b.add("resistor", { r: 1e3 });
    const f = b.add("resistor", { r: 1e3 }), a = b.add("opamp"), g = b.add("ground");
    b.wire([s, "p"], [rin, "a"]);
    b.wire([rin, "b"], [a, "minus"]);
    b.wire([a, "minus"], [f, "a"]);
    b.wire([f, "b"], [a, "out"]);
    b.wire([a, "plus"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    const e = engineFor(b, 1e-4);
    for (let i = 0; i < 500; i++) {
      expect(e.step(), e.error?.message).toBe(true);
      expect(e.pinVoltage(a, "out")).toBeCloseTo(-e.pinVoltage(s, "p")!, 2);
    }
  });
});

describe("comparators", () => {
  it("switches between its output levels at the thresholds set by its hysteresis", () => {
    const b = new CircuitBuilder();
    const s = b.add("vac", { waveform: "triangle", amplitude: 2.5, offset: 2.5, frequency: 10 });
    const ref = b.add("vdc", { v: 2.5 }), c = b.add("comparator", { hysteresis: 1 }), g = b.add("ground");
    const load = b.add("resistor", { r: 10e3 });
    b.wire([s, "p"], [c, "plus"]);
    b.wire([ref, "p"], [c, "minus"]);
    b.wire([c, "out"], [load, "a"]);
    b.wire([load, "b"], [g, "g"]);
    b.wire([s, "n"], [g, "g"]);
    b.wire([ref, "n"], [g, "g"]);
    const e = engineFor(b, 1e-4);
    const rising: number[] = [], falling: number[] = [];
    let was = e.pinVoltage(c, "out")! > 2.5;
    let between = 0;
    for (let i = 0; i < 3000; i++) {
      expect(e.step()).toBe(true);
      const now = e.pinVoltage(c, "out")! > 2.5;
      if (now !== was) (now ? rising : falling).push(e.pinVoltage(s, "p")!);
      was = now;
      const out = e.pinVoltage(c, "out")!;
      // Only a step that lands on a switching point may be part-way between the levels.
      if (Math.min(Math.abs(out), Math.abs(out - 5)) > 0.01) between++;
    }
    expect(between).toBeLessThanOrEqual(rising.length + falling.length);
    expect(rising.length).toBeGreaterThan(1);
    expect(falling.length).toBeGreaterThan(1);
    for (const v of rising) expect(v).toBeCloseTo(3, 1);
    for (const v of falling) expect(v).toBeCloseTo(2, 1);
  });
});

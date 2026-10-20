import { describe, expect, it } from "vitest";
import type { Props } from "../../model/types";
import { CircuitBuilder } from "../../sim/test-utils";
import { compileCircuit } from "./compile";
import { Engine, type SimSettings } from "./engine";
import { waveform } from "./elements/sources";

function engineFor(b: CircuitBuilder, settings: Partial<SimSettings>) {
  const netlist = compileCircuit(b.circuit);
  expect(netlist.errors).toEqual([]);
  return new Engine(netlist, { settings });
}

/** Step until time `t` (within half a step). */
function runTo(e: Engine, t: number) {
  while (e.time < t - e.settings.dt / 2) expect(e.step()).toBe(true);
}

/** Source → resistor → part → ground, with the part's first terminal probed. */
function series(source: [string, Props], r: number, part: [string, Props]) {
  const b = new CircuitBuilder();
  const v = b.add(...source), rs = b.add("resistor", { r }), x = b.add(...part), g = b.add("ground");
  b.wire([v, "p"], [rs, "a"]);
  b.wire([rs, "b"], [x, "a"]);
  b.wire([x, "b"], [g, "g"]);
  b.wire([v, "n"], [g, "g"]);
  return { b, v, rs, x };
}

describe("waveforms", () => {
  const at = (shape: string, phase = 0) => (t: number) => waveform({ waveform: shape, amplitude: 2, frequency: 10, phase, offset: 1 })(t);

  it("follows a sine with phase and offset", () => {
    expect(at("sine")(0.025)).toBeCloseTo(3, 12);
    expect(at("sine", 90)(0)).toBeCloseTo(3, 12);
    expect(at("sine")(0.075)).toBeCloseTo(-1, 12);
  });

  it("makes square, triangle and sawtooth waves in step with the sine", () => {
    expect([0.01, 0.06].map(at("square"))).toEqual([3, -1]);
    expect([0, 0.025, 0.05, 0.075].map((t) => +at("triangle")(t).toFixed(9))).toEqual([1, 3, 1, -1]);
    expect([0, 0.025, 0.049, 0.051].map((t) => +at("sawtooth")(t).toFixed(2))).toEqual([1, 2, 2.96, -0.96]);
  });
});

describe("capacitors and inductors", () => {
  it("charges a capacitor through a resistor", () => {
    // τ = RC = 1 ms.
    const { b, x } = series(["vdc", { v: 5 }], 1e3, ["capacitor", { c: 1e-6 }]);
    const e = engineFor(b, { dt: 1e-6 });
    runTo(e, 1e-3);
    expect(e.readout(x)!.v).toBeCloseTo(5 * (1 - Math.exp(-1)), 3);
  });

  it("starts a capacitor at its initial voltage", () => {
    const b = new CircuitBuilder();
    const c = b.add("capacitor", { c: 1e-6, v0: 4 }), r = b.add("resistor", { r: 1e3 }), g = b.add("ground");
    b.wire([c, "a"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([c, "b"], [g, "g"]);
    const e = engineFor(b, { dt: 1e-6 });
    runTo(e, 1e-3);
    expect(e.readout(c)!.v).toBeCloseTo(4 * Math.exp(-1), 3);
  });

  it("builds up current in an inductor", () => {
    // τ = L/R = 0.1 ms.
    const { b, x } = series(["vdc", { v: 5 }], 100, ["inductor", { l: 10e-3 }]);
    const e = engineFor(b, { dt: 1e-7 });
    runTo(e, 1e-4);
    expect(e.readout(x)!.i).toBeCloseTo(0.05 * (1 - Math.exp(-1)), 5);
  });

  it("rings an underdamped RLC at the right frequency and overshoot", () => {
    // L = 1 mH, C = 1 µF, R = 10 Ω: α = 5000/s, ωd = √(1/LC − α²).
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 1 }), r = b.add("resistor", { r: 10 }), l = b.add("inductor", { l: 1e-3 });
    const c = b.add("capacitor", { c: 1e-6 }), g = b.add("ground");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [l, "a"]);
    b.wire([l, "b"], [c, "a"]);
    b.wire([c, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b, { dt: 1e-7 });
    let peak = { t: 0, v: 0 };
    while (e.time < 200e-6) {
      e.step();
      const vc = e.readout(c)!.v!;
      if (vc > peak.v) peak = { t: e.time, v: vc };
    }
    const alpha = 5000, wd = Math.sqrt(1 / (1e-3 * 1e-6) - alpha ** 2);
    expect(peak.t).toBeCloseTo(Math.PI / wd, 6);
    expect(peak.v).toBeCloseTo(1 + Math.exp((-alpha * Math.PI) / wd), 3);
  });

  it("lets the current in an inductor decay without flipping sign after a switch opens", () => {
    // The inductor's current must jump to R2 when the switch opens: a stiff step that
    // trapezoidal integration alone would answer with a sign flip.
    const b = new CircuitBuilder();
    const v = b.add("vdc", { v: 1 }), s = b.add("switch", { closed: true }), r1 = b.add("resistor", { r: 1 });
    const l = b.add("inductor", { l: 1e-3 }), r2 = b.add("resistor", { r: 1e3 }), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [r1, "a"]);
    b.wire([r1, "b"], [l, "a"]);
    b.wire([l, "a"], [r2, "a"]);
    b.wire([l, "b"], [g, "g"]);
    b.wire([r2, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const e = engineFor(b, { dt: 5e-6 });
    runTo(e, 10e-3);
    const before = e.readout(l)!.i!;
    expect(before).toBeCloseTo(1, 2);
    e.setSwitch(s, false);
    e.step();
    const after = e.readout(l)!.i!;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });
});

describe("AC sources", () => {
  it("drives the waveform it is set to", () => {
    const { b, rs } = series(["vac", { amplitude: 2, frequency: 1e3, phase: 0, offset: 1 }], 1e3, ["resistor", { r: 1e3 }]);
    const e = engineFor(b, { dt: 1e-6 });
    runTo(e, 0.25e-3);
    expect(e.pinVoltage(rs, "a")).toBeCloseTo(3, 6);
  });

  it("drives a current from a rail", () => {
    const b = new CircuitBuilder();
    const i = b.add("irail-ac", { amplitude: 1e-3, frequency: 50 }), r = b.add("resistor", { r: 2e3 }), g = b.add("ground");
    b.wire([i, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    const e = engineFor(b, { dt: 1e-5 });
    runTo(e, 5e-3);
    expect(e.pinVoltage(r, "a")).toBeCloseTo(2, 4);
  });

  it("is attenuated by 1/√2 by an RC low-pass at its corner frequency", () => {
    // R = 1 kΩ, C = 1 µF: f = 1/(2πRC) ≈ 159 Hz.
    const f = 1 / (2 * Math.PI * 1e-3);
    const { b, x } = series(["vac", { amplitude: 1, frequency: f }], 1e3, ["capacitor", { c: 1e-6 }]);
    const e = engineFor(b, { dt: 2e-6 });
    runTo(e, 20e-3);
    let peak = 0;
    while (e.time < 20e-3 + 2 / f) {
      e.step();
      peak = Math.max(peak, e.readout(x)!.v!);
    }
    expect(peak).toBeCloseTo(Math.SQRT1_2, 2);
  });
});

describe("transformer", () => {
  it("steps the voltage down by the turns ratio into a floating load", () => {
    const b = new CircuitBuilder();
    const v = b.add("vac", { amplitude: 10, frequency: 50 }), t = b.add("transformer", { l1: 10, ratio: 2, k: 0.999 });
    const load = b.add("resistor", { r: 1e3 }), g = b.add("ground");
    b.wire([v, "p"], [t, "p1"]);
    b.wire([v, "n"], [t, "p2"]);
    b.wire([v, "n"], [g, "g"]);
    b.wire([t, "s1"], [load, "a"]);
    b.wire([t, "s2"], [load, "b"]);
    const e = engineFor(b, { dt: 1e-5 });
    runTo(e, 40e-3);
    let peak = 0;
    while (e.time < 60e-3) {
      e.step();
      peak = Math.max(peak, e.readout(load)!.v!);
    }
    expect(peak).toBeGreaterThan(4.9);
    expect(peak).toBeLessThan(5.05);
  });
});

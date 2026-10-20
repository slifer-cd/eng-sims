import { describe, expect, it } from "vitest";
import type { Props } from "../../model/types";
import { CircuitBuilder } from "../test-utils";
import { compileCircuit } from "./compile";
import { Engine } from "./engine";

function lamp(part: string, props: Props = {}) {
  const b = new CircuitBuilder();
  const v = b.add("vdc", { v: 5 }), s = b.add(part, props), r = b.add("resistor", { r: 1e3 }), g = b.add("ground");
  b.wire([v, "p"], [s, "a"]);
  b.wire([s, "b"], [r, "a"]);
  b.wire([r, "b"], [g, "g"]);
  b.wire([v, "n"], [g, "g"]);
  const e = new Engine(compileCircuit(b.circuit));
  return { e, s, r };
}

describe("push buttons", () => {
  it("conducts only while pressed when normally open", () => {
    const { e, s, r } = lamp("button");
    expect(e.readout(r)!.i).toBeCloseTo(0, 9);
    e.setSwitch(s, true);
    e.step();
    expect(e.readout(r)!.i).toBeCloseTo(5e-3, 6);
    expect(e.switchValue(s)).toBe(true);
    e.setSwitch(s, false);
    e.step();
    expect(e.readout(r)!.i).toBeCloseTo(0, 9);
  });

  it("breaks the circuit while pressed when normally closed", () => {
    const { e, s, r } = lamp("button", { normally: "closed" });
    expect(e.readout(r)!.i).toBeCloseTo(5e-3, 6);
    e.setSwitch(s, true);
    e.step();
    expect(e.readout(r)!.i).toBeCloseTo(0, 9);
  });

  it("is released again after an edit", () => {
    const b = new CircuitBuilder();
    const s = b.add("button");
    const e1 = new Engine(compileCircuit(b.circuit));
    e1.setSwitch(s, true);
    expect(new Engine(compileCircuit(b.circuit), { previous: e1 }).switchValue(s)).toBe(false);
  });
});

describe("relays", () => {
  /**
   * A square wave (0 or 5 V, 100 Hz) drives the coil (100 Ω, 0.2 H: τ = 2 ms, 50 mA at most).
   * The contacts switch a 1 kΩ load (normally open side) and a 2 kΩ load (normally closed side).
   */
  function relayRig() {
    const b = new CircuitBuilder();
    const drive = b.add("vac", { waveform: "square", amplitude: 2.5, offset: 2.5, frequency: 100 });
    const k = b.add("relay", { coilR: 100, coilL: 0.2, pullIn: 20e-3, dropOut: 15e-3 });
    const supply = b.add("vdc", { v: 5 }), rNo = b.add("resistor", { r: 1e3 }), rNc = b.add("resistor", { r: 2e3 });
    const g = b.add("ground");
    b.wire([drive, "p"], [k, "c1"]);
    b.wire([k, "c2"], [g, "g"]);
    b.wire([drive, "n"], [g, "g"]);
    b.wire([supply, "p"], [k, "com"]);
    b.wire([k, "no"], [rNo, "a"]);
    b.wire([k, "nc"], [rNc, "a"]);
    b.wire([rNo, "b"], [g, "g"]);
    b.wire([rNc, "b"], [g, "g"]);
    b.wire([supply, "n"], [g, "g"]);
    const netlist = compileCircuit(b.circuit);
    expect(netlist.errors).toEqual([]);
    return { e: new Engine(netlist, { settings: { dt: 1e-5 } }), k, rNo, rNc };
  }

  it("pulls in when the coil current passes the pull-in current", () => {
    const { e, k, rNo, rNc } = relayRig();
    expect(e.readout(rNc)!.i).toBeCloseTo(2.5e-3, 6);
    let pulledAt = NaN;
    while (e.time < 5e-3) {
      expect(e.step()).toBe(true);
      if (Number.isNaN(pulledAt) && e.switchValue(k) === true) pulledAt = e.time;
    }
    // i(t) = 50 mA·(1 − e^(−t/τ)) reaches 20 mA at t = −τ·ln(0.6).
    expect(pulledAt).toBeCloseTo(-2e-3 * Math.log(0.6), 4);
    expect(e.readout(rNo)!.i).toBeCloseTo(5e-3, 6);
    expect(e.readout(rNc)!.i).toBeCloseTo(0, 9);
    expect(e.readout(k)!.i).toBeGreaterThan(0.04);
  });

  it("drops out when the coil current falls below the drop-out current", () => {
    const { e, k } = relayRig();
    while (e.time < 5e-3) e.step();
    const peak = e.readout(k)!.i!;
    let droppedAt = NaN;
    while (e.time < 10e-3) {
      expect(e.step()).toBe(true);
      if (Number.isNaN(droppedAt) && e.switchValue(k) === false) droppedAt = e.time;
    }
    // The coil discharges through the 0 V source: i(t) = peak·e^(−t/τ).
    expect(droppedAt - 5e-3).toBeCloseTo(2e-3 * Math.log(peak / 15e-3), 4);
  });
});

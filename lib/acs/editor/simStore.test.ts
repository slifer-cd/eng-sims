import { beforeEach, describe, expect, it } from "vitest";
import { CircuitBuilder } from "../../sim/test-utils";
import { useAcsSettings } from "./settings";
import { useAcsSim } from "./simStore";

function lamp(closed = false) {
  const b = new CircuitBuilder();
  const v = b.add("vdc"), s = b.add("switch", { closed }), r = b.add("resistor"), g = b.add("ground");
  b.wire([v, "p"], [s, "a"]);
  b.wire([s, "b"], [r, "a"]);
  b.wire([r, "b"], [g, "g"]);
  b.wire([v, "n"], [g, "g"]);
  return { circuit: b.circuit, v, s, r };
}

describe("simulation store", () => {
  beforeEach(() => {
    useAcsSettings.getState().update({ dt: 1e-5, speed: 1e-3 });
    useAcsSim.setState({ engine: null, running: true });
  });

  it("runs speed × elapsed time per frame", () => {
    useAcsSim.getState().rebuild(lamp().circuit);
    useAcsSim.getState().advance(50);
    expect(useAcsSim.getState().engine!.time).toBeCloseTo(5e-5, 12);
  });

  it("toggles a switch without touching the circuit", () => {
    const { circuit, s, r } = lamp();
    useAcsSim.getState().rebuild(circuit);
    const before = useAcsSim.getState().version;
    useAcsSim.getState().toggleSwitch(s);
    const { engine, version } = useAcsSim.getState();
    expect(engine!.switchValue(s)).toBe(true);
    expect(engine!.readout(r)!.i).toBeCloseTo(5e-3, 6);
    expect(version).toBeGreaterThan(before);
  });

  it("stops running when the circuit can't be solved", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc"), s = b.add("switch"), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [v, "n"]);
    b.wire([v, "n"], [g, "g"]);
    useAcsSim.getState().rebuild(b.circuit);
    useAcsSim.getState().toggleSwitch(s);
    useAcsSim.getState().advance(16);
    expect(useAcsSim.getState().running).toBe(false);
    expect(useAcsSim.getState().engine!.error).not.toBeNull();
  });

  it("starts over from time 0 on reset", () => {
    const { circuit, s } = lamp();
    useAcsSim.getState().rebuild(circuit);
    useAcsSim.getState().toggleSwitch(s);
    useAcsSim.getState().advance(50);
    useAcsSim.getState().reset(circuit);
    expect(useAcsSim.getState().engine!.time).toBe(0);
    expect(useAcsSim.getState().engine!.switchValue(s)).toBe(false);
  });
});

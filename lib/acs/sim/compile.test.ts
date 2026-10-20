import { describe, expect, it } from "vitest";
import { CircuitBuilder } from "../test-utils";
import { compileCircuit } from "./compile";
import { GROUND } from "./element";

const node = (n: ReturnType<typeof compileCircuit>, compId: string, pin: string) => n.nodeOf(compId, pin);

describe("compileCircuit nodes", () => {
  it("joins terminals connected by wires and junctions", () => {
    const b = new CircuitBuilder();
    const r1 = b.add("resistor"), r2 = b.add("resistor"), r3 = b.add("resistor"), g = b.add("ground");
    const w = b.wire([r1, "b"], [r2, "a"]);
    b.junction(w, [r3, "a"]);
    b.wire([r2, "b"], [g, "g"]);
    const n = compileCircuit(b.circuit);
    expect(node(n, r1, "b")).toBe(node(n, r2, "a"));
    expect(node(n, r3, "a")).toBe(node(n, r2, "a"));
    expect(node(n, r1, "a")).not.toBe(node(n, r2, "a"));
    expect(node(n, r2, "b")).toBe(GROUND);
  });

  it("joins terminals that sit on the same point, without a wire", () => {
    // r1's B end is at (30, 0) and r2's A end is at (30, 0); r3 is nearby but not touching.
    const b = new CircuitBuilder();
    const r1 = b.add("resistor", {}, undefined, { x: 0, y: 0 });
    const r2 = b.add("resistor", {}, undefined, { x: 60, y: 0 });
    const r3 = b.add("resistor", {}, undefined, { x: 70, y: 40 });
    const n = compileCircuit(b.circuit);
    expect(node(n, r1, "b")).toBe(node(n, r2, "a"));
    expect(node(n, r3, "a")).not.toBe(node(n, r1, "b"));
    expect(node(n, r1, "a")).not.toBe(node(n, r1, "b"));
  });

  it("joins turned and flipped parts by where their terminals end up", () => {
    // A ground right on a resistor's B end, and a resistor turned upright whose top is there too.
    const b = new CircuitBuilder();
    const r = b.add("resistor", {}, undefined, { x: 0, y: 0 });
    const g = b.add("ground", {}, undefined, { x: 30, y: 10 });
    const up = b.add("resistor", {}, undefined, { x: 30, y: 30 });
    b.circuit.components.find((c) => c.id === up)!.rotation = 90;
    const sw = b.add("switch2", {}, undefined, { x: -60, y: -10 });
    b.circuit.components.find((c) => c.id === sw)!.flip = true;
    const n = compileCircuit(b.circuit);
    expect(node(n, r, "b")).toBe(GROUND);
    expect(node(n, up, "a")).toBe(GROUND);
    expect(node(n, g, "g")).toBe(GROUND);
    // Flipped, the switch's B throw is at (−30, −20) and its A throw at (−30, 0): r's A end.
    expect(node(n, sw, "a")).toBe(node(n, r, "a"));
    expect(node(n, sw, "b")).not.toBe(node(n, r, "a"));
  });

  it("joins net labels by name", () => {
    const b = new CircuitBuilder();
    const r1 = b.add("resistor"), r2 = b.add("resistor"), r3 = b.add("resistor");
    const l1 = b.add("netlabel", { name: "out" }), l2 = b.add("netlabel", { name: "out" }), l3 = b.add("netlabel", { name: "in" });
    b.wire([r1, "a"], [l1, "in"]);
    b.wire([r2, "a"], [l2, "in"]);
    b.wire([r3, "a"], [l3, "in"]);
    const n = compileCircuit(b.circuit);
    expect(node(n, r1, "a")).toBe(node(n, r2, "a"));
    expect(node(n, r3, "a")).not.toBe(node(n, r1, "a"));
  });

  it("uses the first source's − terminal as 0 V when there is no ground", () => {
    const b = new CircuitBuilder();
    const r = b.add("resistor"), v = b.add("vdc", {}, "V1");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [v, "n"]);
    const n = compileCircuit(b.circuit);
    expect(node(n, v, "n")).toBe(GROUND);
    expect(n.errors).toEqual([]);
    expect(n.warnings).toEqual([{ message: expect.stringContaining("V1"), compIds: [v] }]);
  });

  it("needs no ground part when a rail sets the reference", () => {
    const b = new CircuitBuilder();
    const rail = b.add("vrail-dc"), r = b.add("resistor");
    b.wire([rail, "p"], [r, "a"]);
    expect(compileCircuit(b.circuit).warnings).toEqual([]);
  });

  it("reports parts it doesn't know", () => {
    const b = new CircuitBuilder();
    const x = b.add("flux-capacitor");
    expect(compileCircuit(b.circuit).errors).toEqual([{ message: expect.stringContaining("flux-capacitor"), compIds: [x] }]);
  });
});

describe("compileCircuit problems", () => {
  it("finds two voltage sources in parallel", () => {
    const b = new CircuitBuilder();
    const v1 = b.add("vdc", { v: 5 }), v2 = b.add("vdc", { v: 3 }), g = b.add("ground");
    b.wire([v1, "p"], [v2, "p"]);
    b.wire([v1, "n"], [g, "g"]);
    b.wire([v2, "n"], [g, "g"]);
    const { errors } = compileCircuit(b.circuit);
    expect(errors).toHaveLength(1);
    expect(errors[0].compIds.sort()).toEqual([v1, v2].sort());
  });

  it("finds a voltage source shorted by a wire", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc");
    b.wire([v, "p"], [v, "n"]);
    expect(compileCircuit(b.circuit).errors[0].compIds).toEqual([v]);
  });

  it("finds a closed switch across a voltage source", () => {
    const b = new CircuitBuilder();
    const v = b.add("vdc"), s = b.add("switch", { closed: true }), g = b.add("ground");
    b.wire([v, "p"], [s, "a"]);
    b.wire([s, "b"], [v, "n"]);
    b.wire([v, "n"], [g, "g"]);
    expect(compileCircuit(b.circuit).errors[0].compIds.sort()).toEqual([v, s].sort());
  });

  it("finds a current source with no path for its current", () => {
    const b = new CircuitBuilder();
    const i = b.add("idc"), s = b.add("switch", { closed: false }), r = b.add("resistor"), g = b.add("ground");
    b.wire([i, "p"], [s, "a"]);
    b.wire([s, "b"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([i, "n"], [g, "g"]);
    expect(compileCircuit(b.circuit).errors).toEqual([{ message: expect.stringContaining("no path"), compIds: [i] }]);
  });

  it("leaves out a current source that isn't wired to anything yet", () => {
    const b = new CircuitBuilder();
    const i = b.add("idc"), rail = b.add("irail-ac"), v = b.add("vdc"), r = b.add("resistor"), g = b.add("ground");
    b.wire([v, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([v, "n"], [g, "g"]);
    const n = compileCircuit(b.circuit);
    expect(n.errors).toEqual([]);
    expect(n.elements.some((e) => e.compId === i || e.compId === rail)).toBe(false);
    expect(n.warnings).toEqual([
      { message: expect.stringContaining("not connected"), compIds: [i] },
      { message: expect.stringContaining("not connected"), compIds: [rail] },
    ]);
  });

  it("accepts a current source driving a resistor", () => {
    const b = new CircuitBuilder();
    const i = b.add("idc"), r = b.add("resistor"), g = b.add("ground");
    b.wire([i, "p"], [r, "a"]);
    b.wire([r, "b"], [g, "g"]);
    b.wire([i, "n"], [g, "g"]);
    expect(compileCircuit(b.circuit).errors).toEqual([]);
  });
});

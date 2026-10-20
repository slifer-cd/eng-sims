import { describe, expect, it } from "vitest";
import { exportCircuit, importCircuit } from "./io";

const circuit = {
  components: [{ id: "r1", chipId: "resistor", x: 0, y: 0, rotation: 0 as const, props: { r: 470 } }],
  wires: [],
};
const scope = { traces: [{ compId: "r1", quantity: "i" as const }], window: 0.02 as const };

describe("circuit files", () => {
  it("round-trips a circuit and its scope", () => {
    expect(importCircuit(exportCircuit(circuit, scope))).toEqual({ circuit, scope });
  });

  it("reads a bare circuit, with the scope left as it is", () => {
    expect(importCircuit(JSON.stringify(circuit))).toEqual({ circuit, scope: undefined });
  });

  it("explains what's wrong with a file it can't read", () => {
    expect(importCircuit("{oops")).toEqual({ error: expect.stringContaining("JSON") });
    expect(importCircuit(JSON.stringify({ hello: 1 }))).toEqual({ error: expect.stringContaining("circuit") });
  });

  it("drops the parts of a file it can't read", () => {
    const text = JSON.stringify({ ...JSON.parse(exportCircuit(circuit, scope)), circuit: { components: [{ id: 1 }], wires: [] } });
    expect(importCircuit(text)).toEqual({ circuit: { components: [], wires: [] }, scope });
  });
});

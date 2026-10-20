import { describe, expect, it } from "vitest";
import { parseDraft, repairCircuit } from "./draft";
import { DEFAULT_SETTINGS } from "./settings";

const resistor = { id: "r1", chipId: "resistor", x: 0, y: 0, rotation: 0, props: { r: 100 } };

describe("repairCircuit", () => {
  it("keeps a good circuit as it is", () => {
    const circuit = {
      components: [resistor, { ...resistor, id: "r2", flip: true, label: "R2" }],
      wires: [{ id: "w1", a: { kind: "pin", compId: "r1", pinId: "b" }, b: { kind: "pin", compId: "r2", pinId: "a" }, points: [{ x: 10, y: 0 }] }],
    };
    expect(repairCircuit(structuredClone(circuit))).toEqual(circuit);
  });

  it("drops parts and wires it can't read", () => {
    const c = repairCircuit({
      components: [resistor, { id: "x" }, { ...resistor, id: "r3", x: "left" }, null],
      wires: [
        { id: "w1", a: { kind: "pin", compId: "r1", pinId: "a" }, b: { kind: "wire", wireId: "w0", x: 1, y: 2 }, points: [] },
        { id: "w2", a: { kind: "pin" }, b: { kind: "pin", compId: "r1", pinId: "a" }, points: [] },
        "w3",
      ],
    })!;
    expect(c.components.map((x) => x.id)).toEqual(["r1"]);
    expect(c.wires.map((x) => x.id)).toEqual(["w1"]);
  });

  it("fixes fields with bad values", () => {
    const c = repairCircuit({
      components: [{ ...resistor, rotation: 45, props: "big", flip: "yes", label: 7 }],
      wires: [{ id: "w1", a: { kind: "pin", compId: "r1", pinId: "a" }, b: { kind: "pin", compId: "r1", pinId: "b" }, points: [{ x: 1 }] }],
    })!;
    expect(c.components[0]).toEqual({ id: "r1", chipId: "resistor", x: 0, y: 0, rotation: 0, props: {} });
    expect(c.wires[0].points).toEqual([]);
  });

  it("rejects something that isn't a circuit", () => {
    expect(repairCircuit(null)).toBeNull();
    expect(repairCircuit({ components: "none" })).toBeNull();
  });
});

describe("parseDraft", () => {
  it("reads a saved draft", () => {
    const draft = { v: 1, circuit: { components: [resistor], wires: [] }, settings: { dt: 1e-6, speed: 0.1 } };
    expect(parseDraft(draft)).toEqual({
      circuit: draft.circuit,
      settings: { ...DEFAULT_SETTINGS, dt: 1e-6, speed: 0.1 },
      scope: { traces: [], window: "auto" },
    });
  });

  it("reads the scope and the integration method", () => {
    const parsed = parseDraft({
      v: 1,
      circuit: { components: [], wires: [] },
      settings: { method: "be" },
      scope: { traces: [{ compId: "r1", quantity: "p" }], window: 0.5 },
    })!;
    expect(parsed.settings.method).toBe("be");
    expect(parsed.scope).toEqual({ traces: [{ compId: "r1", quantity: "p" }], window: 0.5 });
    expect(parseDraft({ v: 1, circuit: { components: [], wires: [] }, settings: { method: "rk4" } })!.settings.method).toBe("trap");
  });

  it("reads the symbol style and whether current dots show", () => {
    const read = (settings: object) => parseDraft({ v: 1, circuit: { components: [], wires: [] }, settings })!.settings;
    expect(read({ symbols: "iec", dots: false })).toMatchObject({ symbols: "iec", dots: false });
    expect(read({ symbols: "din", dots: "yes" })).toMatchObject({ symbols: "ansi", dots: true });
  });

  it("repairs settings one by one", () => {
    const parsed = parseDraft({ v: 1, circuit: { components: [], wires: [] }, settings: { dt: -1, speed: 0.1 } })!;
    expect(parsed.settings).toEqual({ ...DEFAULT_SETTINGS, speed: 0.1 });
    expect(parseDraft({ v: 1, circuit: { components: [], wires: [] } })!.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores drafts from another version", () => {
    expect(parseDraft({ v: 2, circuit: { components: [], wires: [] } })).toBeNull();
    expect(parseDraft("junk")).toBeNull();
  });
});

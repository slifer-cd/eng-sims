import { beforeEach, describe, expect, it } from "vitest";
import { GRID } from "../../editor/layout";
import type { ComponentInst } from "../../model/types";
import { PARTS } from "../parts";
import { buildScene, partItem, terminalWorld } from "./scene";
import { useAcsEditor } from "./store";

const comp = (chipId: string, extra: Partial<ComponentInst> = {}): ComponentInst => ({
  id: "c",
  chipId,
  x: 30,
  y: -50,
  rotation: 0,
  props: {},
  ...extra,
});

describe("scene", () => {
  it.each([...PARTS.keys()])("puts every terminal of %s on the grid in any orientation", (id) => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flip of [false, true]) {
        for (const p of partItem(comp(id, { rotation, flip })).terminals.values()) {
          expect(Math.abs(p.x % GRID)).toBe(0);
          expect(Math.abs(p.y % GRID)).toBe(0);
        }
      }
    }
  });

  it("mirrors across the part's own axis before rotating", () => {
    const c = comp("switch2", { x: 100, y: 100, rotation: 90, flip: true });
    expect(terminalWorld(c, { x: 30, y: -10 })).toEqual({ x: 90, y: 130 });
    expect(partItem(c).terminals.get("a")).toEqual({ x: 90, y: 130 });
  });

  it("swaps the body's width and height when turned", () => {
    expect(partItem(comp("resistor", { x: 0, y: 0, rotation: 90 })).bounds).toEqual({ x: -10, y: -30, w: 20, h: 60 });
  });

  it("draws an unknown part with no terminals", () => {
    const item = partItem(comp("flux-capacitor"));
    expect(item.spec).toBeUndefined();
    expect(item.terminals.size).toBe(0);
  });

  it("ends a junction on the wire it joins", () => {
    const circuit = {
      components: [comp("resistor", { id: "r1", x: 0, y: 0 }), comp("resistor", { id: "r2", x: 100, y: 40 })],
      wires: [
        { id: "w1", a: { kind: "pin", compId: "r1", pinId: "b" }, b: { kind: "pin", compId: "r2", pinId: "a" }, points: [{ x: 70, y: 0 }, { x: 70, y: 40 }] },
        { id: "w2", a: { kind: "wire", wireId: "w1", x: 74, y: 20 }, b: { kind: "pin", compId: "r2", pinId: "b" }, points: [] },
      ],
    } as const;
    const scene = buildScene(structuredClone(circuit) as never);
    expect(scene.wires.get("w2")!.points[0]).toEqual({ x: 70, y: 20 });
  });
});

describe("store", () => {
  beforeEach(() => useAcsEditor.getState().load({ components: [], wires: [] }));

  it("adds a part, selects it, and undoes and redoes it", () => {
    const s = useAcsEditor.getState();
    const id = s.addComponent("resistor", { x: 20, y: 40 });
    expect(useAcsEditor.getState().selection.comps).toEqual([id]);
    expect(useAcsEditor.getState().circuit.components).toHaveLength(1);
    s.undo();
    expect(useAcsEditor.getState().circuit.components).toHaveLength(0);
    s.redo();
    expect(useAcsEditor.getState().circuit.components[0]).toMatchObject({ id, chipId: "resistor", x: 20, y: 40 });
  });

  it("flips and rotates the selection as single undo steps", () => {
    const s = useAcsEditor.getState();
    s.addComponent("npn-placeholder", { x: 0, y: 0 });
    s.flipSelection();
    s.rotateSelection();
    expect(useAcsEditor.getState().circuit.components[0]).toMatchObject({ flip: true, rotation: 90 });
    s.undo();
    expect(useAcsEditor.getState().circuit.components[0]).toMatchObject({ flip: true, rotation: 0 });
    s.undo();
    expect(useAcsEditor.getState().circuit.components[0].flip).toBeFalsy();
  });

  it("changes a value and the label in one undo step", () => {
    const s = useAcsEditor.getState();
    const id = s.addComponent("resistor", { x: 0, y: 0 });
    s.updateComponent(id, { label: "R1", props: { r: 4700 } });
    expect(useAcsEditor.getState().circuit.components[0]).toMatchObject({ label: "R1", props: { r: 4700 } });
    s.undo();
    expect(useAcsEditor.getState().circuit.components[0]).toMatchObject({ props: {} });
    expect(useAcsEditor.getState().circuit.components[0].label).toBeUndefined();
  });

  it("pastes a copy one grid step further on, with new ids", () => {
    const s = useAcsEditor.getState();
    const id = s.addComponent("resistor", { x: 0, y: 0 });
    s.copySelection();
    s.paste();
    const comps = useAcsEditor.getState().circuit.components;
    expect(comps).toHaveLength(2);
    expect(comps[1].id).not.toBe(id);
    expect(comps[1]).toMatchObject({ x: 2 * GRID, y: 2 * GRID });
  });

  it("clears history when a circuit is loaded", () => {
    const s = useAcsEditor.getState();
    s.addComponent("resistor", { x: 0, y: 0 });
    s.load({ components: [], wires: [] });
    expect(useAcsEditor.getState().past).toEqual([]);
  });
});

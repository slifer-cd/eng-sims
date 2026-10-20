import { beforeEach, describe, expect, it } from "vitest";
import { compile } from "../sim/compile";
import { CircuitBuilder, library } from "../sim/test-utils";
import { GRID, describe as describeChip, layoutChip, pinWorld } from "./layout";
import { copyItems, pasteClip, pruneWires, removeItems } from "./ops";
import { buildScene } from "./scene";
import { useEditor } from "./store";

describe("layout", () => {
  it.each(["and", "not", "input", "tristate", "splitter", "merger", "clock"])(
    "puts every pin of %s on the grid at every rotation",
    (chipId) => {
      const look = describeChip({ chipId, props: { inputs: 5, width: 3 } })!;
      const layout = layoutChip(look);
      for (const rotation of [0, 90, 180, 270] as const) {
        for (const p of layout.pins) {
          const w = pinWorld({ x: 30, y: -50, rotation }, p);
          expect(Math.abs(w.x % GRID)).toBe(0);
          expect(Math.abs(w.y % GRID)).toBe(0);
        }
      }
    },
  );
});

describe("ops", () => {
  function chain() {
    const b = new CircuitBuilder();
    const a = b.add("input"), g = b.add("not"), o = b.add("output"), o2 = b.add("output");
    b.wire([a, "out"], [g, "in0"]);
    const w = b.wire([g, "out"], [o, "in"]);
    b.junction(w, [o2, "in"]);
    return { c: structuredClone(b.circuit), a, g, o, o2 };
  }

  it("deleting a component removes its wires and junctions on them", () => {
    const { c, g } = chain();
    removeItems(c, [g], []);
    expect(c.components).toHaveLength(3);
    expect(c.wires).toHaveLength(0);
  });

  it("removing a gate input prunes the wire on it", () => {
    const b = new CircuitBuilder();
    const a = b.add("input"), g = b.add("and", { inputs: 3 });
    b.wire([a, "out"], [g, "in2"]);
    const c = structuredClone(b.circuit);
    c.components[1].props.inputs = 2;
    pruneWires(c, (comp) => describeChip(comp)?.pins.map((p) => p.id));
    expect(c.wires).toHaveLength(0);
  });

  it("prunes against the pins the caller says each component has", () => {
    const b = new CircuitBuilder();
    const r1 = b.add("resistor"), r2 = b.add("resistor");
    b.wire([r1, "b"], [r2, "a"]);
    const w = b.wire([r2, "b"], [r1, "a"]);
    b.junction(w, [r2, "x"]);
    const c = structuredClone(b.circuit);
    pruneWires(c, () => ["a", "b"]);
    expect(c.wires.map((x) => x.id)).toEqual(["w0", "w1"]);
  });

  it("copy/paste duplicates the connected circuit with fresh ids", () => {
    const { c, a, g } = chain();
    const clip = copyItems(c, new Set([a, g]));
    expect(clip.wires).toHaveLength(1);
    const ids = pasteClip(c, clip, 20, 20);
    expect(c.components).toHaveLength(6);
    expect(ids.compIds.some((id) => id === a || id === g)).toBe(false);
    // The pasted copy is a valid circuit of its own.
    expect(compile(c, library()).errors).toEqual([]);
  });

  it("junctions are drawn on the wire they attach to", () => {
    const { c } = chain();
    const scene = buildScene(c);
    const [, target, junction] = [...scene.wires.values()];
    const at = junction.points[0];
    const [p, q] = target.points;
    // Collinear with the target segment.
    expect((q.x - p.x) * (at.y - p.y) - (q.y - p.y) * (at.x - p.x)).toBeCloseTo(0);
  });
});

describe("store history", () => {
  beforeEach(() => useEditor.getState().load({ components: [], wires: [] }));

  it("undoes and redoes edits", () => {
    const s = () => useEditor.getState();
    s().addComponent("and", { x: 0, y: 0 });
    s().addComponent("or", { x: 100, y: 0 });
    expect(s().circuit.components).toHaveLength(2);
    s().undo();
    expect(s().circuit.components).toHaveLength(1);
    s().redo();
    expect(s().circuit.components).toHaveLength(2);
  });

  it("moves selected parts in one undo step", () => {
    const s = () => useEditor.getState();
    const id = s().addComponent("and", { x: 0, y: 0 });
    s().moveSelection([id], [], 20, 40);
    expect(s().circuit.components[0]).toMatchObject({ x: 20, y: 40 });
    s().undo();
    expect(s().circuit.components[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("drops deleted ids from the selection", () => {
    const s = () => useEditor.getState();
    s().addComponent("and", { x: 0, y: 0 });
    s().deleteSelection();
    expect(s().selection.comps).toEqual([]);
  });
});
